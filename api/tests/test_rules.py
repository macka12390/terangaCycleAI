"""Règles métier et de sécurité du cahier des charges (section 7), vérifiées côté backend."""

import io
import uuid
from pathlib import Path

from conftest import jpeg_bytes, photo
from PIL import Image


def test_health_and_config(client):
    assert client.get("/api/health").get_json()["status"] == "ok"
    config = client.get("/api/config").get_json()["config"]
    assert [c["value"] for c in config["categories"]] == [
        "plastic",
        "metal",
        "paper",
        "glass",
        "organic",
    ]
    assert config["ai"]["threshold"] == 0.6


def test_demo_auth(api, client):
    accounts = client.get("/api/auth/demo-accounts").get_json()["accounts"]
    assert {a["demo_login"] for a in accounts} >= {"admin-demo", "collecteur-non-verifie"}
    assert all(a["is_demo"] for a in accounts)

    me = client.get("/api/auth/me", headers=api.headers("admin-demo")).get_json()["user"]
    assert me["role"] == "admin"
    assert me["last_login_at"] is not None
    assert client.get("/api/auth/me").status_code == 401
    bad = client.get("/api/auth/me", headers={"Authorization": "Bearer faux"})
    assert bad.get_json()["error"]["code"] == "UNAUTHORIZED"
    assert client.post("/api/auth/demo", json={"login": "inconnu"}).status_code == 404


def test_report_validation(api):
    missing = api.client.post(
        "/api/reports", data={"latitude": "14.7", "longitude": "-17.4"},
        content_type="multipart/form-data",
    )
    assert missing.status_code == 400
    assert missing.get_json()["error"]["details"]["field"] == "photo"

    assert api.create_report(latitude="200").get_json()["error"]["details"]["field"] == "latitude"
    assert api.create_report(longitude="").status_code == 400
    assert api.create_report(citizen_category="sable").status_code == 400
    assert api.create_report(comment="x" * 501).status_code == 400

    not_image = api.create_report(photo=(io.BytesIO(b"%PDF-1.4 pas une photo"), "x.jpg"))
    assert not_image.status_code == 415
    assert not_image.get_json()["error"]["code"] == "UNSUPPORTED_FILE"


def test_photo_is_reencoded_without_exif(api, app):
    exif = Image.Exif()
    exif[0x010F] = "MarqueTelephone"  # Make
    exif[0x8825] = {2: (14.0, 42.0, 0.0)}  # GPS
    response = api.create_report(photo=photo(jpeg_bytes(exif=exif.tobytes())))
    assert response.status_code == 201
    relative = response.get_json()["report"]["photo_url"].removeprefix("/api/uploads/")
    stored = Path(app.config["UPLOAD_FOLDER"]) / relative
    with Image.open(stored) as image:
        assert image.format == "JPEG"
        assert len(image.getexif()) == 0
    served = api.client.get(response.get_json()["report"]["photo_url"])
    assert served.status_code == 200
    served.close()
    assert api.client.get("/api/uploads/../tests/conftest.py").status_code == 404


def test_client_uuid_prevents_duplicates(api):
    key = str(uuid.uuid4())
    first = api.create_report(client_uuid=key)
    second = api.create_report(client_uuid=key)
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.get_json()["duplicate"] is True
    assert second.get_json()["report"]["id"] == first.get_json()["report"]["id"]
    listing = api.client.get("/api/reports", headers=api.headers("admin-demo")).get_json()
    assert listing["total"] == 1


def test_only_admin_moderates_and_rejected_never_becomes_a_mission(api):
    report = api.create_report().get_json()["report"]
    assert api.moderate(report["id"], login="citoyen-demo", action="approve").status_code == 403
    assert api.moderate(report["id"], login="collecteur-demo", action="approve").status_code == 403

    rejected = api.moderate(report["id"], action="reject", reason="Photo floue")
    assert rejected.get_json()["report"]["status"] == "rejected"
    assert rejected.get_json()["mission"] is None

    again = api.moderate(report["id"], action="approve", final_category="plastic")
    assert again.status_code == 409
    assert again.get_json()["error"]["code"] == "INVALID_TRANSITION"
    assert api.moderate(report["id"], action="correct", final_category="metal").status_code == 409
    missions = api.client.get("/api/missions", headers=api.headers("collecteur-demo"))
    assert missions.get_json()["missions"] == []


def test_approve_needs_a_category_and_cannot_be_done_twice(api):
    report = api.create_report().get_json()["report"]
    missing = api.moderate(report["id"], action="approve")
    assert missing.status_code == 400
    assert missing.get_json()["error"]["details"]["field"] == "final_category"

    assert api.moderate(report["id"], action="approve", final_category="paper").status_code == 200
    assert api.moderate(report["id"], action="approve", final_category="paper").status_code == 409


def test_citizen_category_is_used_when_admin_does_not_override(api):
    report = api.create_report(citizen_category="organic").get_json()["report"]
    assert report["category"] == "organic"
    corrected = api.moderate(report["id"], action="correct", final_category="glass")
    assert corrected.get_json()["report"]["final_category"] == "glass"
    approved = api.moderate(report["id"], action="approve").get_json()
    assert approved["mission"]["waste_type"] == "glass"


def test_unverified_collector_cannot_accept(api):
    _, mission = api.approved_mission()
    refused = api.accept(mission["id"], login="collecteur-non-verifie")
    assert refused.status_code == 403
    assert refused.get_json()["error"]["code"] == "COLLECTOR_NOT_VERIFIED"
    assert api.accept(mission["id"], login="citoyen-demo").status_code == 403


def test_mission_cannot_be_accepted_twice(api, app):
    from app.extensions import db
    from app.models import User

    with app.app_context():
        db.session.add(
            User(name="Collecteur 2 (démo)", demo_login="collecteur-2", role="collector",
                 is_verified=True)
        )
        db.session.commit()
    _, mission = api.approved_mission()
    assert api.accept(mission["id"]).status_code == 200
    taken = api.accept(mission["id"], login="collecteur-2")
    assert taken.status_code == 409
    assert taken.get_json()["error"]["code"] == "MISSION_ALREADY_TAKEN"

    other = api.client.get(f"/api/missions/{mission['id']}", headers=api.headers("collecteur-2"))
    assert other.status_code == 403
    assert api.proof(mission["id"], login="collecteur-2").status_code == 403


def test_proof_weight_must_be_positive(api):
    _, mission = api.approved_mission()
    assert api.proof(mission["id"]).status_code == 403  # mission pas encore acceptée par lui
    api.accept(mission["id"])
    for weight in ("0", "-3", "abc", "", "20000"):
        response = api.proof(mission["id"], weight=weight)
        assert response.status_code == 400, weight
        assert response.get_json()["error"]["details"]["field"] == "weight_kg"
    assert api.proof(mission["id"]).status_code == 201
    assert api.proof(mission["id"]).status_code == 409  # une seule preuve en attente


def test_citizen_sees_only_own_reports(api):
    mine = api.create_report(login="citoyen-demo").get_json()["report"]
    other = api.create_report().get_json()["report"]
    listing = api.client.get("/api/reports", headers=api.headers("citoyen-demo")).get_json()
    assert [r["id"] for r in listing["reports"]] == [mine["id"]]
    assert api.client.get(f"/api/reports/{other['id']}",
                          headers=api.headers("citoyen-demo")).status_code == 403
    assert api.client.get("/api/reports").status_code == 401


def test_stats_require_admin_and_handle_demo_filter(api, app):
    assert api.client.get("/api/dashboard/stats",
                          headers=api.headers("citoyen-demo")).status_code == 403
    from app.seed import clear_demo, seed_demo

    with app.app_context():
        assert seed_demo() == 10
        assert seed_demo() == 0  # idempotent
    stats = api.stats()
    assert stats["demo"] == {"included": True, "demo_reports": 10}
    assert stats["verified_kg"] == 85.5
    assert stats["reports"]["rejected"] == 1
    assert stats["ai"]["by_mode"]["manual"] == 10
    assert stats["ai"]["agreement_rate"] is None  # aucune IA évaluée sur du manuel

    real = api.client.get("/api/dashboard/stats?include_demo=false",
                          headers=api.headers("admin-demo")).get_json()["stats"]
    assert real["reports"]["total"] == 0
    assert real["verified_kg"] == 0

    with app.app_context():
        assert clear_demo() == 10
    assert api.stats()["reports"]["total"] == 0


def test_ai_classify_preview_in_manual_mode(client):
    response = client.post("/api/ai/classify", data={"photo": photo()},
                           content_type="multipart/form-data")
    ai = response.get_json()["ai"]
    assert ai["mode"] == "manual"
    assert ai["category"] is None and ai["suggested_category"] is None
    assert "aucun modèle" in ai["label"]


def test_collector_can_release_and_another_can_take_over(api, app):
    from app.extensions import db
    from app.models import User

    with app.app_context():
        db.session.add(
            User(name="Collecteur 2 (démo)", demo_login="collecteur-2", role="collector",
                 is_verified=True)
        )
        db.session.commit()
    report, mission = api.approved_mission()
    api.accept(mission["id"])
    path = f"/api/missions/{mission['id']}/release"
    assert api.client.post(path, headers=api.headers("collecteur-2")).status_code == 403

    released = api.client.post(path, json={"reason": "Acceptée par erreur"},
                               headers=api.headers("collecteur-demo"))
    assert released.status_code == 200
    assert released.get_json()["mission"]["status"] == "available"
    assert released.get_json()["mission"]["collector"] is None
    # Plus titulaire après libération : refus.
    assert api.client.post(path, headers=api.headers("collecteur-demo")).status_code == 403

    assert api.accept(mission["id"], login="collecteur-2").status_code == 200
    detail = api.client.get(f"/api/reports/{report['id']}", headers=api.headers("admin-demo"))
    assert detail.get_json()["report"]["status"] == "assigned"


def test_admin_cancels_a_mission_and_it_never_counts(api):
    report, mission = api.approved_mission()
    api.accept(mission["id"])
    path = f"/api/missions/{mission['id']}/cancel"
    assert api.client.post(path, headers=api.headers("collecteur-demo")).status_code == 403

    cancelled = api.client.post(path, json={"reason": "Dépôt déjà enlevé"},
                                headers=api.headers("admin-demo"))
    assert cancelled.status_code == 200
    assert cancelled.get_json()["mission"]["status"] == "cancelled"
    assert api.client.post(path, headers=api.headers("admin-demo")).status_code == 409
    assert api.accept(mission["id"]).status_code == 409
    assert api.proof(mission["id"]).status_code == 409

    tracking = api.client.get(f"/api/reports/track/{report['tracking_number']}").get_json()
    assert tracking["tracking"]["status"] == "rejected"
    assert tracking["tracking"]["rejection_reason"] == "Mission annulée : Dépôt déjà enlevé"
    stats = api.stats()
    assert stats["missions"]["cancelled"] == 1
    assert stats["verified_kg"] == 0


def test_mission_with_pending_proof_cannot_be_released_or_cancelled(api):
    _, mission = api.approved_mission()
    api.accept(mission["id"])
    api.proof(mission["id"])
    admin = api.headers("admin-demo")
    assert api.client.post(f"/api/missions/{mission['id']}/release", headers=admin).status_code == 409
    assert api.client.post(f"/api/missions/{mission['id']}/cancel", headers=admin).status_code == 409


def test_activity_has_french_labels(api):
    _, mission = api.approved_mission()
    api.accept(mission["id"])
    proof = api.proof(mission["id"]).get_json()["proof"]
    api.verify(proof["id"], "verified")
    latest = api.stats()["recent_activity"]
    labels = {(a["entity"], a["to_status"]): a for a in latest}
    verified = labels[("proof", "verified")]
    assert verified["to_status_label"] == "Vérifiée"
    assert verified["from_status_label"] == "En attente de vérification"
    assert verified["summary"] == "Preuve : Vérifiée"
    assert labels[("report", "completed")]["to_status_label"] == "Terminé — kilos vérifiés"
    assert labels[("mission", "accepted")]["summary"] == "Mission : Acceptée"
