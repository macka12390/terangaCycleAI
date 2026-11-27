"""Connexion par code SMS (OTP), en mode test (SMS_PROVIDER=console)."""

import logging
import re
from datetime import timedelta

import pytest
from sqlalchemy import text

from app.extensions import db
from app.models import OtpChallenge, User
from app.utils.errors import ApiError
from app.utils.phone import mask_phone, normalize_phone
from app.utils.time import utcnow

PHONE = "77 123 45 67"
E164 = "+221771234567"


def sms_codes(app) -> list[str]:
    provider = app.extensions["terangacycle_sms"]
    return [re.search(r"\b(\d{6})\b", sms.message).group(1) for sms in provider.sent]


def request_code(client, phone=PHONE):
    return client.post("/api/auth/otp/request", json={"phone": phone})


def verify(client, code, phone=PHONE, **extra):
    return client.post("/api/auth/otp/verify", json={"phone": phone, "code": code, **extra})


def age_challenges(app, seconds: int) -> None:
    """Fait comme si les codes avaient été demandés `seconds` secondes plus tôt."""
    with app.app_context():
        for challenge in OtpChallenge.query.all():
            challenge.created_at -= timedelta(seconds=seconds)
        db.session.commit()


@pytest.mark.parametrize(
    "raw", ["77 123 45 67", "771234567", "+221 77 123 45 67", "00221771234567", "221-77-123-45-67"]
)
def test_phone_normalization(raw):
    assert normalize_phone(raw) == E164


@pytest.mark.parametrize("raw", ["", "12345", "33 823 45 67", "+33612345678", "7712345678", None])
def test_invalid_phone_is_refused(raw):
    with pytest.raises(ApiError) as error:
        normalize_phone(raw)
    assert error.value.code == "VALIDATION_ERROR"


def test_mask_phone():
    assert mask_phone(E164) == "+221 77 *** ** 67"


def test_first_code_creates_a_citizen_then_logs_in_again(client, app):
    sent = request_code(client)
    assert sent.status_code == 200
    assert sent.get_json()["phone"] == E164
    assert "dev_code" not in sent.get_json()
    code = sms_codes(app)[-1]

    created = verify(client, code, name="Awa")
    assert created.status_code == 201
    body = created.get_json()
    assert body["created"] is True
    assert body["user"]["role"] == "citizen" and body["user"]["is_demo"] is False
    assert body["user"]["name"] == "Awa" and body["user"]["phone"] == E164

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.get_json()["user"]["id"] == body["user"]["id"]

    age_challenges(app, 120)
    request_code(client, "+221771234567")
    again = verify(client, sms_codes(app)[-1])
    assert again.status_code == 200
    assert again.get_json()["created"] is False
    assert again.get_json()["user"]["id"] == body["user"]["id"]


def test_wrong_codes_lock_the_challenge(client, app):
    request_code(client)
    good = sms_codes(app)[-1]
    wrong = "000000" if good != "000000" else "111111"
    first = verify(client, wrong)
    assert first.status_code == 400
    assert first.get_json()["error"]["code"] == "OTP_INVALID"
    assert first.get_json()["error"]["details"]["remaining_attempts"] == 4
    for _ in range(4):
        verify(client, wrong)
    locked = verify(client, good)
    assert locked.status_code == 429
    assert locked.get_json()["error"]["code"] == "OTP_LOCKED"


def test_expired_and_reused_codes_are_refused(client, app):
    request_code(client)
    code = sms_codes(app)[-1]
    assert verify(client, code).status_code == 201
    reused = verify(client, code)
    assert reused.get_json()["error"]["code"] == "OTP_EXPIRED"

    age_challenges(app, 120)
    request_code(client)
    with app.app_context():
        challenge = OtpChallenge.query.filter_by(consumed_at=None).one()
        challenge.expires_at = utcnow() - timedelta(seconds=1)
        db.session.commit()
    expired = verify(client, sms_codes(app)[-1])
    assert expired.get_json()["error"]["code"] == "OTP_EXPIRED"
    assert verify(client, "12345").get_json()["error"]["details"]["field"] == "code"


def test_resend_cooldown_and_rate_limit(client, app):
    assert request_code(client).status_code == 200
    too_soon = request_code(client)
    assert too_soon.status_code == 429
    assert too_soon.get_json()["error"]["code"] == "OTP_TOO_SOON"
    assert too_soon.get_json()["error"]["details"]["retry_after"] > 0

    for _ in range(2):
        age_challenges(app, 90)
        assert request_code(client).status_code == 200
    age_challenges(app, 90)
    limited = request_code(client)
    assert limited.status_code == 429
    assert limited.get_json()["error"]["code"] == "OTP_RATE_LIMITED"


def test_new_code_replaces_the_previous_one(client, app):
    request_code(client)
    old = sms_codes(app)[-1]
    age_challenges(app, 90)
    request_code(client)
    new = sms_codes(app)[-1]
    if old != new:
        assert verify(client, old).status_code == 400
    assert verify(client, new).status_code == 201


def test_code_is_stored_hashed_and_phone_masked_in_logs(client, app, caplog):
    with caplog.at_level(logging.WARNING):
        request_code(client)
    code = sms_codes(app)[-1]
    with app.app_context():
        challenge = OtpChallenge.query.one()
        assert code not in challenge.code_hash and len(challenge.code_hash) == 64
    assert E164 not in caplog.text and "771234567" not in caplog.text
    assert "+221 77 *** ** 67" in caplog.text


def test_dev_code_only_when_explicitly_enabled(client, app):
    app.config["OTP_EXPOSE_CODE"] = True
    body = request_code(client).get_json()
    assert body["dev_code"] == sms_codes(app)[-1]


def test_collector_created_by_admin_logs_in_and_accepts(client, app, api):
    result = app.test_cli_runner().invoke(
        args=["create-user", "--phone", "78 000 11 22", "--name", "Moussa", "--verified"]
    )
    assert result.exit_code == 0, result.output
    assert "+221 78 *** ** 22" in result.output and "780001122" not in result.output
    duplicate = app.test_cli_runner().invoke(
        args=["create-user", "--phone", "780001122", "--name", "Autre"]
    )
    assert duplicate.exit_code != 0

    request_code(client, "780001122")
    login = verify(client, sms_codes(app)[-1], phone="780001122")
    assert login.status_code == 200
    user = login.get_json()["user"]
    assert user["role"] == "collector" and user["is_verified"] is True

    _, mission = api.approved_mission()
    headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
    accepted = client.post(f"/api/missions/{mission['id']}/accept", headers=headers)
    assert accepted.status_code == 200
    assert accepted.get_json()["mission"]["collector"]["name"] == "Moussa"


def test_demo_accounts_can_be_disabled(client, app, api):
    demo_token = api.token("admin-demo")
    app.config["DEMO_AUTH_ENABLED"] = False
    assert client.get("/api/auth/demo-accounts").get_json() == {
        "success": True, "accounts": [], "demo_enabled": False
    }
    refused = client.post("/api/auth/demo", json={"login": "admin-demo"})
    assert refused.status_code == 403
    assert refused.get_json()["error"]["code"] == "DEMO_DISABLED"
    stale = client.get("/api/auth/me", headers={"Authorization": f"Bearer {demo_token}"})
    assert stale.status_code == 401

    request_code(client)
    assert verify(client, sms_codes(app)[-1]).status_code == 201


def test_old_users_table_is_rebuilt_without_losing_data(app):
    from app.schema import upgrade_schema

    old_users = """CREATE TABLE users_old (
        id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(120) NOT NULL,
        demo_login VARCHAR(64) NOT NULL UNIQUE, role VARCHAR(20) NOT NULL,
        is_verified BOOLEAN NOT NULL, is_demo BOOLEAN NOT NULL, created_at DATETIME NOT NULL)"""
    with app.app_context(), db.engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.exec_driver_sql(old_users)
        connection.exec_driver_sql(
            "INSERT INTO users_old SELECT id, name, demo_login, role, is_verified, is_demo, "
            "created_at FROM users"
        )
        connection.exec_driver_sql("DROP TABLE users")
        connection.exec_driver_sql("ALTER TABLE users_old RENAME TO users")
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")

    with app.app_context():
        before = [u.demo_login for u in db.session.execute(text("SELECT demo_login FROM users"))]
        assert upgrade_schema() == ["users (reconstruite)"]
        assert upgrade_schema() == []
        after = [u.demo_login for u in db.session.execute(text("SELECT demo_login FROM users"))]
        assert after == before
        db.session.add(User(name="Réel", phone=E164, role="citizen", is_demo=False))
        db.session.commit()
        assert User.query.filter_by(phone=E164).one().demo_login is None
