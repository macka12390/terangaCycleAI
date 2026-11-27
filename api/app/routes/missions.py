from flask import Blueprint, g, request

from app.serializers import mission_to_dict, proof_to_dict
from app.services import missions as mission_service
from app.services.auth import auth_required
from app.utils.responses import json_body, ok

bp = Blueprint("missions", __name__, url_prefix="/api/missions")


@bp.get("")
@auth_required("collector", "admin")
def index():
    missions = mission_service.list_missions(g.user, request.args)
    return ok(missions=[mission_to_dict(mission) for mission in missions])


@bp.get("/<int:mission_id>")
@auth_required("collector", "admin")
def show(mission_id: int):
    return ok(mission=mission_to_dict(mission_service.get_mission_for(g.user, mission_id)))


@bp.post("/<int:mission_id>/accept")
@auth_required("collector")
def accept(mission_id: int):
    return ok(mission=mission_to_dict(mission_service.accept(mission_id, g.user)))


@bp.post("/<int:mission_id>/start")
@auth_required("collector")
def start(mission_id: int):
    return ok(mission=mission_to_dict(mission_service.start(mission_id, g.user)))


@bp.post("/<int:mission_id>/release")
@auth_required("collector", "admin")
def release(mission_id: int):
    """Remet une mission acceptée dans les missions disponibles."""
    return ok(mission=mission_to_dict(mission_service.release(mission_id, g.user, json_body())))


@bp.post("/<int:mission_id>/cancel")
@auth_required("admin")
def cancel(mission_id: int):
    """Annule définitivement une mission (le signalement passe à « Rejeté »)."""
    return ok(mission=mission_to_dict(mission_service.cancel(mission_id, g.user, json_body())))


@bp.post("/<int:mission_id>/proof")
@bp.post("/<int:mission_id>/complete", endpoint="complete")
@auth_required("collector")
def proof(mission_id: int):
    """Fin d'intervention : photo après collecte + poids. `/complete` est un alias."""
    created, mission = mission_service.submit_proof(mission_id, g.user, request.form, request.files)
    return ok(201, proof=proof_to_dict(created), mission=mission_to_dict(mission))
