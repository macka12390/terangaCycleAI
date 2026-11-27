from flask import Blueprint, g, request

from app.ai.service import prediction_to_dict
from app.serializers import event_to_dict, mission_to_dict, report_ai, report_to_dict
from app.services import reports as report_service
from app.services.auth import auth_optional, auth_required
from app.utils.responses import json_body, ok

bp = Blueprint("reports", __name__, url_prefix="/api/reports")


@bp.post("")
@auth_optional
def create():
    report, prediction, duplicate = report_service.create_report(request.form, request.files, g.user)
    ai = prediction_to_dict(prediction) if prediction else report_ai(report)
    return ok(201 if not duplicate else 200, report=report_to_dict(report), ai=ai, duplicate=duplicate)


@bp.get("")
@auth_required("admin", "citizen")
def index():
    reports, total = report_service.list_reports(g.user, request.args)
    return ok(reports=[report_to_dict(report) for report in reports], total=total)


@bp.get("/<int:report_id>")
@auth_required("admin", "citizen")
def show(report_id: int):
    report = report_service.get_report_for(g.user, report_id)
    return ok(
        report=report_to_dict(report),
        mission=mission_to_dict(report.mission) if report.mission else None,
        history=[event_to_dict(event) for event in report_service.report_history(report)],
    )


@bp.get("/track/<tracking_number>")
def track(tracking_number: str):
    return ok(tracking=report_service.track(tracking_number))


@bp.patch("/<int:report_id>/moderate")
@auth_required("admin")
def moderate(report_id: int):
    report, mission = report_service.moderate(report_id, g.user, json_body())
    return ok(
        report=report_to_dict(report),
        mission=mission_to_dict(mission) if mission else None,
    )
