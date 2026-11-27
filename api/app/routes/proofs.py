from flask import Blueprint, g, request

from app.serializers import mission_to_dict, proof_to_dict, report_to_dict
from app.services import proofs as proof_service
from app.services.auth import auth_required
from app.utils.responses import json_body, ok

bp = Blueprint("proofs", __name__, url_prefix="/api/proofs")


@bp.get("")
@auth_required("admin", "collector")
def index():
    return ok(proofs=[proof_to_dict(proof) for proof in proof_service.list_proofs(g.user, request.args)])


@bp.patch("/<int:proof_id>/verify")
@auth_required("admin")
def verify(proof_id: int):
    proof = proof_service.verify(proof_id, g.user, json_body())
    mission = proof.mission
    return ok(
        proof=proof_to_dict(proof),
        mission=mission_to_dict(mission),
        report=report_to_dict(mission.report),
    )
