"""Multi-organisations (étape 3) : rattachement par zone, cloisonnement, gestion, migration."""

from sqlalchemy import text

from app.extensions import db
from app.models import Report, User

DAKAR = {"latitude": "14.7167", "longitude": "-17.4677"}  # Organisation principale
PIKINE = {"latitude": "14.7540", "longitude": "-17.3920"}  # UCG Pikine-Guédiawaye (démo)
SAINT_LOUIS = {"latitude": "16.0300", "longitude": "-16.4900"}  # hors de toute zone


def headers(api, login):
    return api.headers(login)


def org_id(app, name_part):
    from app.models import Organisation

    with app.app_context():
        return Organisation.query.filter(Organisation.name.contains(name_part)).one().id


def test_reports_go_to_the_most_precise_zone(api, app):
    dakar = api.create_report(**DAKAR).get_json()["report"]
    pikine = api.create_report(**PIKINE).get_json()["report"]
    away = api.create_report(**SAINT_LOUIS).get_json()["report"]
    assert dakar["organisation"]["name"] == "Organisation principale (Dakar)"
    assert pikine["organisation"]["name"] == "UCG Pikine-Guédiawaye (démo)"
    assert away["organisation"] is None


def test_admins_only_see_their_organisation(api):
    dakar = api.create_report(**DAKAR).get_json()["report"]
    pikine = api.create_report(**PIKINE).get_json()["report"]
    away = api.create_report(**SAINT_LOUIS).get_json()["report"]

    def visible(login):
        body = api.client.get("/api/reports", headers=headers(api, login)).get_json()
        return {report["id"] for report in body["reports"]}

    assert visible("admin-demo") == {dakar["id"]}
    assert visible("admin-pikine-demo") == {pikine["id"]}
    assert visible("superadmin-demo") == {dakar["id"], pikine["id"], away["id"]}

    other = api.client.get(f"/api/reports/{pikine['id']}", headers=headers(api, "admin-demo"))
    assert other.status_code == 403
    refused = api.moderate(pikine["id"], login="admin-demo", action="approve", final_category="organic")
    assert refused.status_code == 403
    allowed = api.moderate(pikine["id"], login="admin-pikine-demo", action="approve",
                           final_category="organic")
    assert allowed.status_code == 200

    only_unassigned = api.client.get("/api/reports?organisation_id=none",
                                     headers=headers(api, "superadmin-demo")).get_json()
    assert [r["id"] for r in only_unassigned["reports"]] == [away["id"]]


def test_collectors_only_get_missions_of_their_organisation(api):
    pikine = api.create_report(**PIKINE).get_json()["report"]
    mission = api.moderate(pikine["id"], login="admin-pikine-demo", action="approve",
                           final_category="organic").get_json()["mission"]
    available = api.client.get("/api/missions", headers=headers(api, "collecteur-demo")).get_json()
    assert mission["id"] not in [m["id"] for m in available["missions"]]
    assert api.accept(mission["id"]).status_code == 403
    detail = api.client.get(f"/api/missions/{mission['id']}", headers=headers(api, "collecteur-demo"))
    assert detail.status_code == 403
    assert api.client.get("/api/missions", headers=headers(api, "admin-demo")).get_json()["missions"] == []


def test_proofs_and_stats_are_scoped(api, app):
    _, mission = api.approved_mission()  # organisation principale
    api.accept(mission["id"])
    proof = api.proof(mission["id"], weight="10").get_json()["proof"]
    pikine_view = api.client.get("/api/proofs", headers=headers(api, "admin-pikine-demo"))
    assert pikine_view.get_json()["proofs"] == []
    assert api.verify(proof["id"], "verified", login="admin-pikine-demo").status_code == 403
    assert api.verify(proof["id"], "verified").status_code == 200

    assert api.stats()["verified_kg"] == 10
    pikine_stats = api.client.get("/api/dashboard/stats", headers=headers(api, "admin-pikine-demo"))
    assert pikine_stats.get_json()["stats"]["verified_kg"] == 0
    # Un admin ne peut pas regarder les chiffres d'une autre organisation.
    forced = api.client.get(f"/api/dashboard/stats?organisation_id={org_id(app, 'Dakar')}",
                            headers=headers(api, "admin-pikine-demo"))
    assert forced.get_json()["stats"]["verified_kg"] == 0
    chosen = api.client.get(f"/api/dashboard/stats?organisation_id={org_id(app, 'Pikine')}",
                            headers=headers(api, "superadmin-demo"))
    assert chosen.get_json()["stats"]["verified_kg"] == 0
    assert api.client.get("/api/dashboard/stats", headers=headers(api, "superadmin-demo")).get_json()["stats"]["verified_kg"] == 10


def test_superadmin_creates_updates_and_deactivates_organisations(api, app):
    superadmin = headers(api, "superadmin-demo")
    body = {"name": "Commune de Yoff", "kind": "commune",
            "min_lat": 14.74, "max_lat": 14.77, "min_lng": -17.50, "max_lng": -17.46}
    assert api.client.post("/api/organisations", json=body, headers=headers(api, "admin-demo")).status_code == 403
    created = api.client.post("/api/organisations", json=body, headers=superadmin)
    assert created.status_code == 201
    yoff = created.get_json()["organisation"]
    assert yoff["kind_label"] == "Commune"
    assert api.client.post("/api/organisations", json=body, headers=superadmin).get_json()["error"]["code"] == "NAME_TAKEN"
    bad = api.client.post("/api/organisations", json={**body, "name": "X", "min_lat": 15}, headers=superadmin)
    assert bad.get_json()["error"]["details"]["field"] == "min_lat"

    in_yoff = {"latitude": "14.7560", "longitude": "-17.4840"}
    assert api.create_report(**in_yoff).get_json()["report"]["organisation"]["id"] == yoff["id"]

    off = api.client.patch(f"/api/organisations/{yoff['id']}", json={"is_active": False}, headers=superadmin)
    assert off.get_json()["organisation"]["is_active"] is False
    fallback = api.create_report(**in_yoff).get_json()["report"]["organisation"]
    assert fallback["name"] == "Organisation principale (Dakar)"

    listing = api.client.get("/api/organisations", headers=superadmin).get_json()
    counts = {o["name"]: o["counts"] for o in listing["organisations"]}
    assert counts["Commune de Yoff"]["reports"] == 1
    assert counts["Organisation principale (Dakar)"]["admins"] >= 1
    assert "unassigned_reports" in listing
    own = api.client.get("/api/organisations", headers=headers(api, "admin-pikine-demo")).get_json()
    assert [o["name"] for o in own["organisations"]] == ["UCG Pikine-Guédiawaye (démo)"]


def test_superadmin_reassigns_an_unassigned_report(api, app):
    away = api.create_report(**SAINT_LOUIS).get_json()["report"]
    target = org_id(app, "Pikine")
    path = f"/api/reports/{away['id']}/organisation"
    assert api.client.patch(path, json={"organisation_id": target}, headers=headers(api, "admin-demo")).status_code == 403
    moved = api.client.patch(path, json={"organisation_id": target}, headers=headers(api, "superadmin-demo"))
    assert moved.get_json()["report"]["organisation"]["id"] == target
    seen = api.client.get(f"/api/reports/{away['id']}", headers=headers(api, "admin-pikine-demo"))
    assert seen.status_code == 200

    _, mission = api.approved_mission()
    api.accept(mission["id"])
    busy = api.client.patch(f"/api/reports/{mission['report_id']}/organisation",
                            json={"organisation_id": target}, headers=headers(api, "superadmin-demo"))
    assert busy.status_code == 409


def test_accounts_are_scoped_to_the_organisation(api, app):
    created = api.client.post(
        "/api/accounts",
        json={"phone": "77 400 00 01", "name": "Collecteur Pikine", "role": "collector", "is_verified": True},
        headers=headers(api, "admin-pikine-demo"),
    ).get_json()["account"]
    assert created["organisation"]["name"] == "UCG Pikine-Guédiawaye (démo)"

    dakar_view = api.client.get("/api/accounts", headers=headers(api, "admin-demo")).get_json()
    names = {a["name"] for a in dakar_view["accounts"]}
    assert "Collecteur Pikine" not in names and "Admin UCG Pikine (démo)" not in names
    assert "Citoyen Démo" in names  # les citoyens n'appartiennent à aucune organisation
    refused = api.client.patch(f"/api/accounts/{created['id']}", json={"is_verified": False},
                               headers=headers(api, "admin-demo"))
    assert refused.status_code == 403

    moved = api.client.patch(f"/api/accounts/{created['id']}",
                             json={"organisation_id": org_id(app, "Dakar")},
                             headers=headers(api, "superadmin-demo"))
    assert moved.get_json()["account"]["organisation"]["name"] == "Organisation principale (Dakar)"


def test_existing_data_is_attached_once(app, api):
    """Données d'avant l'étape 3 : signalements rattachés par position, comptes au défaut."""
    from app.schema import run_data_migrations
    from app.services.organisations import backfill_organisations

    dakar = api.create_report(**DAKAR).get_json()["report"]
    pikine = api.create_report(**PIKINE).get_json()["report"]
    with app.app_context():
        db.session.execute(text("UPDATE reports SET organisation_id = NULL"))
        db.session.execute(text("UPDATE users SET organisation_id = NULL WHERE demo_login = 'collecteur-demo'"))
        db.session.execute(text("PRAGMA user_version = 0"))
        db.session.commit()
        assert run_data_migrations({3: backfill_organisations}) == [3]
        assert run_data_migrations({3: backfill_organisations}) == []
        assert db.session.get(Report, dakar["id"]).organisation.name.startswith("Organisation principale")
        assert db.session.get(Report, pikine["id"]).organisation.name.startswith("UCG Pikine")
        collector = User.query.filter_by(demo_login="collecteur-demo").one()
        assert collector.organisation.name.startswith("Organisation principale")
