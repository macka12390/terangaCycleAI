"""Boucle complète du cahier des charges : signalement → validation → mission → preuve → kilos."""

import re


def test_full_loop_counts_kilos_only_after_verification(api):
    created = api.create_report(login="citoyen-demo", comment="Près de la route")
    assert created.status_code == 201
    body = created.get_json()
    report = body["report"]
    assert re.fullmatch(r"TC-\d{4}-[A-HJ-NP-Z2-9]{6}", report["tracking_number"])
    assert report["status"] == "pending"
    assert body["ai"]["mode"] == "manual"
    assert body["ai"]["suggested_category"] is None
    assert body["duplicate"] is False

    moderated = api.moderate(report["id"], action="approve", final_category="plastic")
    assert moderated.status_code == 200
    mission = moderated.get_json()["mission"]
    assert mission["status"] == "available"
    assert mission["waste_type"] == "plastic"

    available = api.client.get("/api/missions", headers=api.headers("collecteur-demo"))
    assert [m["id"] for m in available.get_json()["missions"]] == [mission["id"]]

    accepted = api.accept(mission["id"])
    assert accepted.status_code == 200
    assert accepted.get_json()["mission"]["collector"]["name"] == "Collecteur Démo (vérifié)"

    started = api.client.post(
        f"/api/missions/{mission['id']}/start", headers=api.headers("collecteur-demo")
    )
    assert started.get_json()["mission"]["started_at"] is not None

    submitted = api.proof(mission["id"], weight="23,5", comment="Sacs au point de tri")
    assert submitted.status_code == 201
    proof = submitted.get_json()["proof"]
    assert proof["status"] == "pending"
    assert proof["weight_kg"] == 23.5
    assert submitted.get_json()["mission"]["status"] == "completed"

    # Poids déclaré mais pas encore vérifié : aucun kilo compté.
    stats = api.stats()
    assert stats["verified_kg"] == 0
    assert stats["proofs"]["pending"] == 1

    verified = api.verify(proof["id"], "verified")
    assert verified.status_code == 200
    assert verified.get_json()["report"]["status"] == "completed"

    stats = api.stats()
    assert stats["verified_kg"] == 23.5
    kg = {row["category"]: row["kg"] for row in stats["kg_by_category"]}
    assert kg == {"plastic": 23.5, "metal": 0, "paper": 0, "glass": 0, "organic": 0}
    assert stats["collections"] == {"completed": 1, "verified": 1}
    assert stats["reports"]["validated"] == 1
    assert sum(day["verified_kg"] for day in stats["collections_timeline"]) == 23.5
    assert stats["recent_activity"][0]["to_status"] == "completed"

    tracking = api.client.get(f"/api/reports/track/{report['tracking_number'].lower()}")
    timeline = [step["status"] for step in tracking.get_json()["tracking"]["history"]]
    assert timeline == ["pending", "approved", "assigned", "collected", "completed"]
    assert "latitude" not in tracking.get_json()["tracking"]

    detail = api.client.get(f"/api/reports/{report['id']}", headers=api.headers("admin-demo"))
    entities = [event["entity"] for event in detail.get_json()["history"]]
    assert entities.count("proof") == 2  # dépôt de la preuve, puis vérification


def test_complete_is_an_alias_of_proof(api):
    _, mission = api.approved_mission()
    api.accept(mission["id"])
    response = api.client.post(
        f"/api/missions/{mission['id']}/complete",
        data={"weight_kg": "5", "photo": __import__("conftest").photo()},
        headers=api.headers("collecteur-demo"),
        content_type="multipart/form-data",
    )
    assert response.status_code == 201


def test_rejected_proof_counts_nothing_and_allows_a_new_proof(api):
    _, mission = api.approved_mission(category="metal")
    api.accept(mission["id"])
    first = api.proof(mission["id"], weight="40").get_json()["proof"]

    rejected = api.verify(first["id"], "rejected", note="Dépôt encore visible")
    assert rejected.status_code == 200
    assert rejected.get_json()["mission"]["status"] == "accepted"
    assert rejected.get_json()["report"]["status"] == "assigned"
    assert api.stats()["verified_kg"] == 0

    second = api.proof(mission["id"], weight="12")
    assert second.status_code == 201
    api.verify(second.get_json()["proof"]["id"], "verified")
    assert api.stats()["verified_kg"] == 12  # le poids rejeté n'est jamais compté


def test_disputed_proof_is_not_counted_until_verified(api):
    _, mission = api.approved_mission(category="glass")
    api.accept(mission["id"])
    proof = api.proof(mission["id"], weight="9").get_json()["proof"]

    assert api.verify(proof["id"], "disputed", note="Poids incohérent").status_code == 200
    assert api.stats()["verified_kg"] == 0
    assert api.stats()["proofs"]["disputed"] == 1

    assert api.verify(proof["id"], "disputed").status_code == 409
    assert api.verify(proof["id"], "verified").status_code == 200
    assert api.stats()["verified_kg"] == 9
    assert api.verify(proof["id"], "rejected").status_code == 409
