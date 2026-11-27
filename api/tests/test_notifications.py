"""Notifications SMS (étape 4), en mode test : le fournisseur « console » garde les SMS."""

import re

import pytest

from app.extensions import db
from app.models import Notification

CITIZEN = "771110001"
COLLECTOR = "781110002"


def sms_to(app, phone_digits):
    provider = app.extensions["terangacycle_sms"]
    return [s.message for s in provider.sent if s.to.endswith(phone_digits) and "code" not in s.message]


def otp_token(api, app, phone):
    api.client.post("/api/auth/otp/request", json={"phone": phone})
    code = re.search(r"\b(\d{6})\b", app.extensions["terangacycle_sms"].sent[-1].message).group(1)
    return api.client.post("/api/auth/otp/verify", json={"phone": phone, "code": code}).get_json()["token"]


@pytest.fixture()
def people(api, app):
    """Un citoyen réel et un collecteur réel vérifié de l'organisation principale."""
    citizen = otp_token(api, app, CITIZEN)
    api.client.post(
        "/api/accounts",
        json={"phone": COLLECTOR, "name": "Moussa", "role": "collector", "is_verified": True},
        headers=api.headers("admin-demo"),
    )
    collector = otp_token(api, app, COLLECTOR)
    return {
        "citizen": {"Authorization": f"Bearer {citizen}"},
        "collector": {"Authorization": f"Bearer {collector}"},
    }


def citizen_report(api, people):
    from conftest import photo

    return api.client.post(
        "/api/reports",
        data={"latitude": "14.7167", "longitude": "-17.4677", "photo": photo()},
        headers=people["citizen"],
        content_type="multipart/form-data",
    ).get_json()["report"]


def test_citizen_and_collector_are_told_at_each_step(api, app, people):
    report = citizen_report(api, people)
    mission = api.moderate(report["id"], action="approve", final_category="plastic").get_json()["mission"]
    assert any("est validé" in m and report["tracking_number"] in m for m in sms_to(app, CITIZEN))
    assert any("nouvelle mission (plastique)" in m for m in sms_to(app, COLLECTOR))

    headers = people["collector"]
    api.client.post(f"/api/missions/{mission['id']}/accept", headers=headers)
    from conftest import photo

    proof = api.client.post(
        f"/api/missions/{mission['id']}/proof",
        data={"weight_kg": "23.5", "photo": photo()},
        headers=headers,
        content_type="multipart/form-data",
    ).get_json()["proof"]
    api.verify(proof["id"], "verified")
    assert any("23,5 kg comptés" in m for m in sms_to(app, COLLECTOR))
    assert any("a été collecté : 23,5 kg vérifiés" in m for m in sms_to(app, CITIZEN))
    assert all(m.startswith("TerangaCycle : ") for m in sms_to(app, CITIZEN))


def test_rejection_is_explained_to_the_citizen(api, app, people):
    report = citizen_report(api, people)
    api.moderate(report["id"], action="reject", reason="Photo floue, dépôt non identifiable")
    messages = sms_to(app, CITIZEN)
    assert any("n'a pas été retenu. Motif : Photo floue" in m for m in messages)


def test_collector_is_told_about_rejected_proofs_released_and_cancelled_missions(api, app, people):
    from conftest import photo

    _, mission = api.approved_mission()
    headers = people["collector"]
    api.client.post(f"/api/missions/{mission['id']}/accept", headers=headers)
    proof = api.client.post(
        f"/api/missions/{mission['id']}/proof", data={"weight_kg": "5", "photo": photo()},
        headers=headers, content_type="multipart/form-data",
    ).get_json()["proof"]
    api.verify(proof["id"], "rejected", note="Dépôt encore visible")
    assert any("est refusée. Motif : Dépôt encore visible" in m for m in sms_to(app, COLLECTOR))

    api.client.post(f"/api/missions/{mission['id']}/release", json={"reason": "Trop loin"},
                    headers=api.headers("admin-demo"))
    assert any("vous a été retirée. Motif : Trop loin" in m for m in sms_to(app, COLLECTOR))

    _, other = api.approved_mission()
    api.client.post(f"/api/missions/{other['id']}/accept", headers=headers)
    api.client.post(f"/api/missions/{other['id']}/cancel", json={"reason": "Déjà enlevé"},
                    headers=api.headers("admin-demo"))
    assert any("est annulée. Motif : Déjà enlevé" in m for m in sms_to(app, COLLECTOR))


def test_no_sms_for_accounts_without_phone_or_opted_out(api, app, people):
    # Collecteur de démo (sans numéro) : ligne « non envoyée » dans le journal.
    api.approved_mission()
    with app.app_context():
        skipped = Notification.query.filter_by(kind="mission.available", status="skipped").all()
        assert {n.detail for n in skipped} == {"no_phone"}

    off = api.client.patch("/api/auth/me", json={"sms_notifications": False}, headers=people["citizen"])
    assert off.get_json()["user"]["sms_notifications"] is False
    before = len(sms_to(app, CITIZEN))
    report = citizen_report(api, people)
    api.moderate(report["id"], action="approve", final_category="metal")
    assert len(sms_to(app, CITIZEN)) == before
    with app.app_context():
        assert Notification.query.filter_by(kind="report.approved", detail="opted_out").count() == 1

    demo = api.client.patch("/api/auth/me", json={"sms_notifications": False},
                            headers=api.headers("citoyen-demo"))
    assert demo.status_code == 403


def test_other_organisations_collectors_are_not_told(api, app, people):
    api.client.post(
        "/api/accounts",
        json={"phone": "761110003", "name": "Pikine", "role": "collector", "is_verified": True},
        headers=api.headers("admin-pikine-demo"),
    )
    api.approved_mission()  # dépôt à Dakar
    assert sms_to(app, "761110003") == []


def test_failed_action_sends_nothing(api, app, people):
    report = citizen_report(api, people)
    api.moderate(report["id"], action="approve", final_category="glass")
    count = len(sms_to(app, CITIZEN))
    assert api.moderate(report["id"], action="approve", final_category="glass").status_code == 409
    assert len(sms_to(app, CITIZEN)) == count


def test_provider_failure_does_not_break_the_action_and_can_be_retried(api, app, people, monkeypatch):
    provider = app.extensions["terangacycle_sms"]

    def broken(to, message):
        raise ConnectionError("réseau")

    monkeypatch.setattr(provider, "send", broken)
    report = citizen_report(api, people)
    approved = api.moderate(report["id"], action="approve", final_category="paper")
    assert approved.status_code == 200
    with app.app_context():
        failed = Notification.query.filter_by(status="failed").all()
        assert failed and failed[0].detail == "ConnectionError"

    monkeypatch.undo()
    result = app.test_cli_runner().invoke(args=["send-notifications"])
    assert "en échec : 0" in result.output
    with app.app_context():
        assert Notification.query.filter_by(status="failed").count() == 0


def test_sms_log_is_scoped_and_masks_numbers(api, app, people):
    report = citizen_report(api, people)
    api.moderate(report["id"], action="approve", final_category="plastic")
    body = api.client.get("/api/notifications", headers=api.headers("admin-demo")).get_json()
    assert body["provider"] == "console"
    approved = [n for n in body["notifications"] if n["kind"] == "report.approved"][0]
    assert approved["phone"] == "+221 77 *** ** 01" and approved["status"] == "sent"
    assert approved["kind_label"] == "Signalement validé"
    assert approved["tracking_number"] == report["tracking_number"]

    pikine = api.client.get("/api/notifications", headers=api.headers("admin-pikine-demo")).get_json()
    assert pikine["notifications"] == []
    everything = api.client.get("/api/notifications", headers=api.headers("superadmin-demo")).get_json()
    assert len(everything["notifications"]) >= len(body["notifications"])
    assert api.client.get("/api/notifications", headers=people["collector"]).status_code == 403
    with app.app_context():
        assert db.session.query(Notification).count() >= 1
