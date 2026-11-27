"""Gestion des comptes (étape 2) : super admin, vérification, suspension, rôles, audit."""

import re

from app.extensions import db
from app.models import Mission, User


def create(api, login="admin-demo", **body):
    payload = {"phone": "78 000 11 22", "name": "Moussa", "role": "collector"}
    payload.update(body)
    return api.client.post("/api/accounts", json=payload, headers=api.headers(login))


def patch(api, user_id, login="admin-demo", **body):
    return api.client.patch(f"/api/accounts/{user_id}", json=body, headers=api.headers(login))


def suspend(api, user_id, login="admin-demo", **body):
    return api.client.post(
        f"/api/accounts/{user_id}/suspend", json=body, headers=api.headers(login)
    )


def otp_login(api, app, phone):
    api.client.post("/api/auth/otp/request", json={"phone": phone})
    sms = app.extensions["terangacycle_sms"].sent[-1]
    code = re.search(r"\b(\d{6})\b", sms.message).group(1)
    return api.client.post("/api/auth/otp/verify", json={"phone": phone, "code": code})


def real_user(app, phone, role, name="Réel", **extra):
    with app.app_context():
        user = User(name=name, phone=phone, role=role, is_demo=False, **extra)
        db.session.add(user)
        db.session.commit()
        return user.id


def test_admin_creates_and_verifies_a_collector(api, app):
    created = create(api)
    assert created.status_code == 201
    account = created.get_json()["account"]
    assert account["role"] == "collector" and account["is_verified"] is False
    assert account["is_active"] is True and account["phone"] == "+221780001122"
    assert create(api).get_json()["error"]["code"] == "PHONE_TAKEN"

    listing = api.client.get("/api/accounts?role=collector&q=Mous", headers=api.headers("admin-demo"))
    body = listing.get_json()
    assert [a["name"] for a in body["accounts"]] == ["Moussa"]
    assert body["manageable_roles"] == ["citizen", "collector"]
    by_phone = api.client.get("/api/accounts?q=780001", headers=api.headers("admin-demo"))
    assert by_phone.get_json()["total"] == 1

    # Non vérifié : ne peut pas accepter de mission.
    token = otp_login(api, app, "780001122").get_json()["token"]
    _, mission = api.approved_mission()
    headers = {"Authorization": f"Bearer {token}"}
    refused = api.client.post(f"/api/missions/{mission['id']}/accept", headers=headers)
    assert refused.get_json()["error"]["code"] == "COLLECTOR_NOT_VERIFIED"

    verified = patch(api, account["id"], is_verified=True)
    assert verified.get_json()["account"]["is_verified"] is True
    assert api.client.post(f"/api/missions/{mission['id']}/accept", headers=headers).status_code == 200


def test_admin_cannot_create_or_manage_admins(api, app):
    assert create(api, role="admin").status_code == 403
    admin_id = real_user(app, "+221770000002", "admin")
    assert patch(api, admin_id, name="Pirate").status_code == 403
    assert suspend(api, admin_id).status_code == 403
    collector_id = create(api).get_json()["account"]["id"]
    assert patch(api, collector_id, role="admin").status_code == 403


def test_superadmin_manages_everyone_and_inherits_admin_rights(api, app, default_org):
    missing = create(api, login="superadmin-demo", role="admin", phone="770000003")
    assert missing.get_json()["error"]["details"]["field"] == "organisation_id"
    created = create(api, login="superadmin-demo", role="admin", phone="770000003",
                     organisation_id=default_org)
    assert created.status_code == 201
    listing = api.client.get("/api/accounts", headers=api.headers("superadmin-demo")).get_json()
    assert listing["manageable_roles"] == ["citizen", "admin", "collector", "superadmin", "recycler"]

    # Le super admin passe partout où l'admin passe.
    report = api.create_report().get_json()["report"]
    approved = api.moderate(report["id"], login="superadmin-demo", action="approve",
                            final_category="plastic")
    assert approved.status_code == 200
    stats = api.client.get("/api/dashboard/stats", headers=api.headers("superadmin-demo"))
    assert stats.status_code == 200
    assert api.client.get("/api/audit", headers=api.headers("superadmin-demo")).status_code == 200
    assert api.client.get("/api/audit", headers=api.headers("admin-demo")).status_code == 403


def test_nobody_edits_own_account_or_demo_accounts(api, app):
    with app.app_context():
        admin_demo = User.query.filter_by(demo_login="admin-demo").one().id
        collector_demo = User.query.filter_by(demo_login="collecteur-demo").one().id
    own = patch(api, admin_demo, login="admin-demo", name="Moi")
    assert own.status_code == 403
    locked = patch(api, collector_demo, is_verified=False)
    assert locked.get_json()["error"]["code"] == "DEMO_ACCOUNT_LOCKED"


def test_last_real_superadmin_is_protected(api, app, default_org):
    boss = real_user(app, "+221770000010", "superadmin", name="Chef")
    demoted = patch(api, boss, login="superadmin-demo", role="admin", organisation_id=default_org)
    assert demoted.status_code == 409
    assert demoted.get_json()["error"]["code"] == "LAST_SUPERADMIN"
    assert suspend(api, boss, login="superadmin-demo").get_json()["error"]["code"] == "LAST_SUPERADMIN"

    real_user(app, "+221770000011", "superadmin", name="Adjoint")
    demoted = patch(api, boss, login="superadmin-demo", role="admin", organisation_id=default_org)
    assert demoted.status_code == 200
    assert demoted.get_json()["account"]["organisation"]["id"] == default_org


def test_suspension_blocks_access_and_frees_missions(api, app):
    collector_id = create(api, is_verified=True).get_json()["account"]["id"]
    token = otp_login(api, app, "780001122").get_json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    report, mission = api.approved_mission()
    assert api.client.post(f"/api/missions/{mission['id']}/accept", headers=headers).status_code == 200

    suspended = suspend(api, collector_id, reason="Fausses preuves")
    assert suspended.status_code == 200
    body = suspended.get_json()
    assert body["account"]["is_active"] is False
    assert body["account"]["suspended_reason"] == "Fausses preuves"
    assert body["released_missions"] == 1
    with app.app_context():
        assert db.session.get(Mission, mission["id"]).status == "available"
    detail = api.client.get(f"/api/reports/{report['id']}", headers=api.headers("admin-demo"))
    assert detail.get_json()["report"]["status"] == "approved"

    # Jeton déjà émis refusé, et plus de connexion par SMS.
    me = api.client.get("/api/auth/me", headers=headers)
    assert me.status_code == 403 and me.get_json()["error"]["code"] == "ACCOUNT_SUSPENDED"
    api.client.post("/api/auth/otp/request", json={"phone": "780001122"})  # trop tôt : ignoré
    with app.app_context():
        from app.models import OtpChallenge

        for challenge in OtpChallenge.query.all():
            challenge.created_at = challenge.created_at.replace(year=2000)
        db.session.commit()
    relogin = otp_login(api, app, "780001122")
    assert relogin.status_code == 403
    assert relogin.get_json()["error"]["code"] == "ACCOUNT_SUSPENDED"
    assert suspend(api, collector_id).status_code == 409

    reactivated = api.client.post(
        f"/api/accounts/{collector_id}/reactivate", headers=api.headers("admin-demo")
    )
    assert reactivated.get_json()["account"]["is_active"] is True
    assert api.client.get("/api/auth/me", headers=headers).status_code == 200


def test_audit_log_records_sensitive_actions(api, app):
    account = create(api, is_verified=False).get_json()["account"]
    patch(api, account["id"], is_verified=True)
    suspend(api, account["id"], reason="Test")
    entries = api.client.get("/api/audit", headers=api.headers("superadmin-demo")).get_json()["entries"]
    actions = [entry["action"] for entry in entries]
    assert actions == ["account.suspend", "account.update", "account.create"]
    assert entries[0]["actor"]["name"] == "Admin Démo"
    assert entries[0]["target"]["name"] == "Moussa"
    assert entries[1]["details"] == {"changes": {"is_verified": [False, True]}}
    assert entries[2]["details"]["phone"] == "+221 78 *** ** 22"  # jamais le numéro complet


def test_step1_database_gets_account_columns(app):
    """Une base de l'étape 1 (sans is_active, rôle superadmin refusé) est mise à niveau."""
    from app.schema import upgrade_schema

    step1_users = """CREATE TABLE users_step1 (
        id INTEGER NOT NULL PRIMARY KEY, name VARCHAR(120) NOT NULL,
        demo_login VARCHAR(64) UNIQUE, phone VARCHAR(20),
        role VARCHAR(20) NOT NULL CHECK (role IN ('citizen', 'admin', 'collector')),
        is_verified BOOLEAN NOT NULL, is_demo BOOLEAN NOT NULL, created_at DATETIME NOT NULL,
        last_login_at DATETIME)"""
    with app.app_context(), db.engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.exec_driver_sql(step1_users)
        connection.exec_driver_sql(
            "INSERT INTO users_step1 SELECT id, name, demo_login, phone, role, is_verified, "
            "is_demo, created_at, last_login_at FROM users "
            "WHERE role IN ('citizen', 'admin', 'collector')"
        )
        connection.exec_driver_sql("DROP TABLE users")
        connection.exec_driver_sql("ALTER TABLE users_step1 RENAME TO users")
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")

    with app.app_context():
        assert upgrade_schema() == ["users (reconstruite)"]
        assert all(user.is_active for user in User.query.all())
        db.session.add(User(name="Chef", phone="+221770000099", role="superadmin", is_demo=False))
        db.session.commit()
