from flask import Blueprint, g

from app.serializers import organisation_to_dict, report_to_dict
from app.services import organisations as organisation_service
from app.services.auth import auth_required
from app.utils.responses import json_body, ok

bp = Blueprint("organisations", __name__, url_prefix="/api")


@bp.get("/organisations")
@auth_required("admin")
def index():
    """Super admin : toutes les organisations ; admin : la sienne."""
    rows = organisation_service.list_organisations(g.user)
    body = {"organisations": [organisation_to_dict(org, counts) for org, counts in rows]}
    if organisation_service.sees_all(g.user):
        body["unassigned_reports"] = organisation_service.unassigned_reports_count()
    return ok(**body)


@bp.post("/organisations")
@auth_required("superadmin")
def create():
    organisation = organisation_service.create_organisation(g.user, json_body())
    return ok(201, organisation=organisation_to_dict(organisation))


@bp.patch("/organisations/<int:organisation_id>")
@auth_required("superadmin")
def update(organisation_id: int):
    organisation = organisation_service.update_organisation(g.user, organisation_id, json_body())
    return ok(organisation=organisation_to_dict(organisation))


@bp.patch("/reports/<int:report_id>/organisation")
@auth_required("superadmin")
def reassign(report_id: int):
    report = organisation_service.reassign_report(g.user, report_id, json_body())
    return ok(report=report_to_dict(report))
