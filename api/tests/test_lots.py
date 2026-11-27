"""Marketplace (étape 5) : stock vérifié, cycle d'un lot, contact, SMS, cloisonnement."""

import re

import pytest

from app.extensions import db
from app.models import User


def otp_token(api, app, phone):
    api.client.post("/api/auth/otp/request", json={"phone": phone})
    code = re.search(r"\b(\d{6})\b", app.extensions["terangacycle_sms"].sent[-1].message).group(1)
    token = api.client.post("/api/auth/otp/verify", json={"phone": phone, "code": code}).get_json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def market(api, app):
    """Collecteur réel avec 23,5 kg de plastique vérifiés, et deux recycleurs réels."""
    from conftest import photo

    api.client.post(
        "/api/accounts",
        json={"phone": "781110002", "name": "Moussa", "role": "collector", "is_verified": True},
        headers=api.headers("admin-demo"),
    )
    with app.app_context():
        for phone, name in (("+221771119001", "Recyclage Dakar"), ("+221771119002", "Plastique Plus")):
            db.session.add(User(name=name, phone=phone, role="recycler", is_demo=False))
        db.session.commit()
    collector = otp_token(api, app, "781110002")
    recycler = otp_token(api, app, "771119001")
    other = otp_token(api, app, "771119002")

    _, mission = api.approved_mission(category="plastic")
    api.client.post(f"/api/missions/{mission['id']}/accept", headers=collector)
    proof = api.client.post(
        f"/api/missions/{mission['id']}/proof", data={"weight_kg": "23.5", "photo": photo()},
        headers=collector, content_type="multipart/form-data",
    ).get_json()["proof"]
    return {"collector": collector, "recycler": recycler, "other": other, "proof": proof}


def stock(api, headers):
    return api.client.get("/api/lots/stock", headers=headers).get_json()["stock"]


def sell(api, headers, **body):
    payload = {"category": "plastic", "weight_kg": 20, "price_per_kg": 150}
    payload.update(body)
    return api.client.post("/api/lots", json=payload, headers=headers)


def test_only_verified_kilos_can_be_sold(api, market):
    assert stock(api, market["collector"])["plastic"] == 0  # preuve pas encore vérifiée
    assert sell(api, market["collector"]).get_json()["error"]["code"] == "INSUFFICIENT_STOCK"

    api.verify(market["proof"]["id"], "verified")
    assert stock(api, market["collector"])["plastic"] == 23.5
    too_much = sell(api, market["collector"], weight_kg=30).get_json()["error"]
    assert too_much["code"] == "INSUFFICIENT_STOCK" and too_much["details"]["available_kg"] == 23.5

    created = sell(api, market["collector"])
    assert created.status_code == 201
    lot = created.get_json()["lot"]
    assert lot["status"] == "available" and lot["total_price"] == 3000
    assert lot["organisation"]["name"] == "Organisation principale (Dakar)"
    assert stock(api, market["collector"])["plastic"] == 3.5
    assert sell(api, market["collector"], weight_kg=0).status_code == 400
    assert sell(api, market["collector"], category="metal", weight_kg=1).status_code == 409


def test_unverified_collectors_and_other_roles_cannot_sell(api, market):
    api.verify(market["proof"]["id"], "verified")
    refused = sell(api, api.headers("collecteur-non-verifie"), weight_kg=1)
    assert refused.get_json()["error"]["code"] == "COLLECTOR_NOT_VERIFIED"
    assert sell(api, market["recycler"]).status_code == 403
    assert sell(api, api.headers("admin-demo")).status_code == 403
    assert api.client.get("/api/reports", headers=market["recycler"]).status_code == 403
    assert api.client.get("/api/missions", headers=market["recycler"]).status_code == 403


def test_reservation_reveals_contact_only_to_the_buyer(api, app, market):
    api.verify(market["proof"]["id"], "verified")
    lot = sell(api, market["collector"]).get_json()["lot"]

    listing = api.client.get("/api/lots", headers=market["recycler"]).get_json()["lots"]
    assert [item["id"] for item in listing] == [lot["id"]]
    assert "phone" not in listing[0]["collector"] and listing[0]["contact_visible"] is False

    reserved = api.client.post(f"/api/lots/{lot['id']}/reserve", headers=market["recycler"])
    assert reserved.status_code == 200
    body = reserved.get_json()["lot"]
    assert body["status"] == "reserved" and body["collector"]["phone"] == "+221781110002"
    assert body["recycler"]["name"] == "Recyclage Dakar"

    taken = api.client.post(f"/api/lots/{lot['id']}/reserve", headers=market["other"])
    assert taken.get_json()["error"]["code"] == "LOT_ALREADY_RESERVED"
    assert api.client.get("/api/lots", headers=market["other"]).get_json()["lots"] == []

    provider = app.extensions["terangacycle_sms"]
    to_collector = [s.message for s in provider.sent if s.to == "+221781110002"]
    assert any("Recyclage Dakar a réservé votre lot (20 kg de plastique)" in m for m in to_collector)

    mine = api.client.get("/api/lots?scope=mine", headers=market["recycler"]).get_json()["lots"]
    assert mine[0]["collector"]["phone"] == "+221781110002"
    own = api.client.get("/api/lots", headers=market["collector"]).get_json()["lots"]
    assert own[0]["recycler"]["phone"] == "+221771119001"


def test_release_handover_and_cancel(api, app, market):
    api.verify(market["proof"]["id"], "verified")
    lot = sell(api, market["collector"]).get_json()["lot"]
    path = f"/api/lots/{lot['id']}"

    api.client.post(f"{path}/reserve", headers=market["recycler"])
    assert api.client.post(f"{path}/release", headers=market["other"]).status_code == 403
    assert api.client.post(f"{path}/cancel", headers=market["collector"]).status_code == 409
    released = api.client.post(f"{path}/release", headers=market["recycler"])
    assert released.get_json()["lot"]["status"] == "available"
    provider = app.extensions["terangacycle_sms"]
    assert any("annulée par le recycleur" in s.message for s in provider.sent if s.to == "+221781110002")

    assert api.client.post(f"{path}/handover", headers=market["collector"]).status_code == 409
    api.client.post(f"{path}/reserve", headers=market["other"])
    handed = api.client.post(f"{path}/handover", headers=market["collector"])
    assert handed.get_json()["lot"]["status"] == "handed_over"
    assert handed.get_json()["lot"]["handed_over_at"] is not None

    stats = api.stats()["marketplace"]
    assert stats["handed_over_kg"] == 20
    assert {r["category"]: r["kg"] for r in stats["handed_over_by_category"]}["plastic"] == 20

    second = sell(api, market["collector"], weight_kg=3.5).get_json()["lot"]
    assert stock(api, market["collector"])["plastic"] == 0
    cancelled = api.client.post(f"/api/lots/{second['id']}/cancel", headers=market["collector"])
    assert cancelled.get_json()["lot"]["status"] == "cancelled"
    assert stock(api, market["collector"])["plastic"] == 3.5


def test_admins_see_lots_of_their_organisation(api, market):
    api.verify(market["proof"]["id"], "verified")
    lot = sell(api, market["collector"]).get_json()["lot"]
    dakar = api.client.get("/api/lots", headers=api.headers("admin-demo")).get_json()["lots"]
    assert [item["id"] for item in dakar] == [lot["id"]]
    assert dakar[0]["collector"]["phone"] == "+221781110002"  # contact visible des admins
    assert api.client.get("/api/lots", headers=api.headers("admin-pikine-demo")).get_json()["lots"] == []
    assert len(api.client.get("/api/lots", headers=api.headers("superadmin-demo")).get_json()["lots"]) == 1


def test_demo_marketplace_shows_the_whole_chain(api, app):
    from app.seed import clear_demo, seed_demo

    with app.app_context():
        seed_demo()
    stats = api.client.get("/api/dashboard/stats", headers=api.headers("superadmin-demo")).get_json()["stats"]
    market = stats["marketplace"]
    assert market["handed_over_kg"] == 25 and market["reserved_kg"] == 18 and market["available_kg"] == 40
    lots = api.client.get("/api/lots", headers=api.headers("recycleur-demo")).get_json()["lots"]
    assert [lot["category"] for lot in lots] == ["plastic"]
    with app.app_context():
        clear_demo()
    assert api.client.get("/api/lots", headers=api.headers("superadmin-demo")).get_json()["lots"] == []
