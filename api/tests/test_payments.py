"""Paiements mobile money simulés (étape 6) : tarifs, rémunérations, versements, lots."""

import re

import pytest

from app.extensions import db
from app.models import Payment, User
from app.payments_provider import ProviderResult

COLLECTOR = "781110002"


def otp_token(api, app, phone):
    api.client.post("/api/auth/otp/request", json={"phone": phone})
    code = re.search(r"\b(\d{6})\b", app.extensions["terangacycle_sms"].sent[-1].message).group(1)
    token = api.client.post("/api/auth/otp/verify", json={"phone": phone, "code": code}).get_json()["token"]
    return {"Authorization": f"Bearer {token}"}


def set_tariff(api, category="plastic", price=100, login="admin-demo", **extra):
    return api.client.put("/api/tariffs", json={"category": category, "price_per_kg": price, **extra},
                          headers=api.headers(login))


@pytest.fixture()
def flow(api, app):
    """Collecteur réel avec une preuve de 23,5 kg de plastique (pas encore vérifiée)."""
    from conftest import photo

    api.client.post(
        "/api/accounts",
        json={"phone": COLLECTOR, "name": "Moussa", "role": "collector", "is_verified": True},
        headers=api.headers("admin-demo"),
    )
    collector = otp_token(api, app, COLLECTOR)

    def collect(weight="23.5", category="plastic"):
        _, mission = api.approved_mission(category=category)
        api.client.post(f"/api/missions/{mission['id']}/accept", headers=collector)
        return api.client.post(
            f"/api/missions/{mission['id']}/proof", data={"weight_kg": weight, "photo": photo()},
            headers=collector, content_type="multipart/form-data",
        ).get_json()["proof"]

    return {"collector": collector, "collect": collect}


def payments(api, login="admin-demo", headers=None, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return api.client.get(f"/api/payments?{query}", headers=headers or api.headers(login)).get_json()


def test_tariffs_are_set_per_organisation(api):
    body = set_tariff(api).get_json()
    assert body["tariffs"]["plastic"] == 100 and body["tariffs"]["metal"] is None
    pikine = api.client.get("/api/tariffs", headers=api.headers("admin-pikine-demo")).get_json()
    assert pikine["tariffs"]["plastic"] is None
    assert set_tariff(api, login="superadmin-demo").get_json()["error"]["details"]["field"] == "organisation_id"
    assert set_tariff(api, price=-5).status_code == 400
    assert set_tariff(api, login="collecteur-demo").status_code == 403


def test_verified_kilos_become_a_reward_paid_once(api, app, flow):
    set_tariff(api)
    proof = flow["collect"]()
    assert payments(api)["payments"] == []  # pas encore vérifiée
    api.verify(proof["id"], "verified")
    due = payments(api)["payments"]
    assert len(due) == 1
    reward = due[0]
    assert reward["status"] == "pending" and reward["amount_fcfa"] == 2350
    assert reward["payee"]["name"] == "Moussa" and reward["is_simulated"] is True

    assert api.client.post(f"/api/payments/{reward['id']}/pay", headers=api.headers("admin-pikine-demo")).status_code == 403
    paid = api.client.post(f"/api/payments/{reward['id']}/pay", headers=api.headers("admin-demo")).get_json()
    assert paid["payment"]["status"] == "succeeded"
    assert paid["payment"]["provider_ref"].startswith("SIM-")
    assert paid["provider"] == {"name": "simulated", "simulated": True}
    again = api.client.post(f"/api/payments/{reward['id']}/pay", headers=api.headers("admin-demo"))
    assert again.status_code == 409 and again.get_json()["error"]["code"] == "PAYMENT_IN_PROGRESS"

    sms = [s.message for s in app.extensions["terangacycle_sms"].sent if s.to.endswith(COLLECTOR)]
    assert any("vous avez reçu 2 350 FCFA" in m and "Paiement simulé" in m for m in sms)
    mine = payments(api, headers=flow["collector"])
    assert mine["summary"]["rewards_paid_fcfa"] == 2350


def test_rewards_can_be_computed_after_the_tariff_is_set(api, flow):
    proof = flow["collect"]()
    api.verify(proof["id"], "verified")
    assert payments(api)["payments"] == []  # aucun tarif au moment de la vérification
    set_tariff(api, price=80)
    created = api.client.post("/api/payments/rewards/accrue", json={}, headers=api.headers("admin-demo"))
    assert created.get_json()["created"] == 1
    assert api.client.post("/api/payments/rewards/accrue", json={}, headers=api.headers("admin-demo")).get_json()["created"] == 0
    assert payments(api)["payments"][0]["amount_fcfa"] == 1880


def test_pay_all_skips_suspended_collectors(api, app, flow):
    set_tariff(api)
    set_tariff(api, category="metal", price=150)
    for weight, category in (("10", "plastic"), ("4", "metal")):
        api.verify(flow["collect"](weight, category)["id"], "verified")
    result = api.client.post("/api/payments/rewards/pay-all", json={}, headers=api.headers("admin-demo")).get_json()
    assert result["result"] == {"succeeded": 2, "failed": 0, "amount_fcfa": 1600}

    api.verify(flow["collect"]("5")["id"], "verified")
    with app.app_context():
        moussa = User.query.filter_by(phone="+221" + COLLECTOR).one()
        moussa_id = moussa.id
    api.client.post(f"/api/accounts/{moussa_id}/suspend", json={}, headers=api.headers("admin-demo"))
    pending = [p for p in payments(api)["payments"] if p["status"] == "pending"][0]
    blocked = api.client.post(f"/api/payments/{pending['id']}/pay", headers=api.headers("admin-demo"))
    assert blocked.get_json()["error"]["code"] == "ACCOUNT_SUSPENDED"
    none = api.client.post("/api/payments/rewards/pay-all", json={}, headers=api.headers("admin-demo")).get_json()
    assert none["result"]["succeeded"] == 0


def test_provider_failure_can_be_retried(api, app, flow, monkeypatch):
    set_tariff(api)
    api.verify(flow["collect"]()["id"], "verified")
    reward = payments(api)["payments"][0]
    provider = app.extensions["terangacycle_payments"]
    monkeypatch.setattr(provider, "payout", lambda phone, amount, ref: ProviderResult(ok=False, error="Réseau indisponible"))
    failed = api.client.post(f"/api/payments/{reward['id']}/pay", headers=api.headers("admin-demo")).get_json()["payment"]
    assert failed["status"] == "failed" and failed["failure_reason"] == "Réseau indisponible"
    monkeypatch.undo()
    retried = api.client.post(f"/api/payments/{reward['id']}/pay", headers=api.headers("admin-demo")).get_json()["payment"]
    assert retried["status"] == "succeeded" and retried["attempts"] == 2


def test_recycler_pays_a_reserved_lot_once(api, app, flow):
    set_tariff(api)
    api.verify(flow["collect"]()["id"], "verified")
    with app.app_context():
        for phone, name in (("+221771119001", "Recyclage Dakar"), ("+221771119002", "Plastique Plus")):
            db.session.add(User(name=name, phone=phone, role="recycler", is_demo=False))
        db.session.commit()
    recycler = otp_token(api, app, "771119001")
    other = otp_token(api, app, "771119002")
    lot = api.client.post("/api/lots", json={"category": "plastic", "weight_kg": 20, "price_per_kg": 150},
                          headers=flow["collector"]).get_json()["lot"]
    unpriced = api.client.post("/api/lots", json={"category": "plastic", "weight_kg": 3},
                               headers=flow["collector"]).get_json()["lot"]

    assert api.client.post(f"/api/lots/{lot['id']}/pay", headers=recycler).status_code == 403  # pas réservé par lui
    api.client.post(f"/api/lots/{lot['id']}/reserve", headers=recycler)
    assert api.client.post(f"/api/lots/{lot['id']}/pay", headers=other).status_code == 403
    paid = api.client.post(f"/api/lots/{lot['id']}/pay", headers=recycler).get_json()["payment"]
    assert paid["status"] == "succeeded" and paid["amount_fcfa"] == 3000 and paid["payer"]["name"] == "Recyclage Dakar"
    twice = api.client.post(f"/api/lots/{lot['id']}/pay", headers=recycler)
    assert twice.get_json()["error"]["code"] == "LOT_ALREADY_PAID"
    locked = api.client.post(f"/api/lots/{lot['id']}/release", headers=recycler)
    assert locked.get_json()["error"]["code"] == "LOT_ALREADY_PAID"
    listed = api.client.get("/api/lots?scope=mine", headers=recycler).get_json()["lots"][0]
    assert listed["payment"]["status"] == "succeeded"

    api.client.post(f"/api/lots/{unpriced['id']}/reserve", headers=recycler)
    assert api.client.post(f"/api/lots/{unpriced['id']}/pay", headers=recycler).get_json()["error"]["code"] == "LOT_PRICE_MISSING"

    assert payments(api, headers=recycler)["summary"]["lot_payments_fcfa"] == 3000
    stats = api.stats()["payments"]
    assert stats["lot_payments_fcfa"] == 3000 and stats["rewards_due_fcfa"] == 2350 and stats["simulated"] is True
    assert api.client.get("/api/payments", headers=api.headers("citoyen-demo")).status_code == 403


def test_demo_payments(api, app):
    from app.seed import clear_demo, seed_demo

    with app.app_context():
        seed_demo()
        assert Payment.query.filter_by(kind="lot_payment", status="succeeded").count() == 1
    stats = api.client.get("/api/dashboard/stats", headers=api.headers("superadmin-demo")).get_json()["stats"]["payments"]
    # Papier 25 kg × 60 FCFA ; une rémunération versée (Médina, 42,5 kg × 100 FCFA).
    assert stats["lot_payments_fcfa"] == 1500
    assert stats["rewards_paid_fcfa"] == 4250
    assert stats["rewards_due_fcfa"] > 0
    with app.app_context():
        clear_demo()
        assert Payment.query.count() == 0
