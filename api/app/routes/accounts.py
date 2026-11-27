from flask import Blueprint, g, request

from app.serializers import audit_to_dict, user_to_dict
from app.services import accounts as account_service
from app.services.auth import auth_required
from app.utils.responses import json_body, ok

bp = Blueprint("accounts", __name__, url_prefix="/api")


@bp.get("/accounts")
@auth_required("admin")
def index():
    users, total = account_service.list_accounts(g.user, request.args)
    return ok(
        accounts=[user_to_dict(user) for user in users],
        total=total,
        manageable_roles=list(account_service.manageable_roles(g.user)),
    )


@bp.post("/accounts")
@auth_required("admin")
def create():
    return ok(201, account=user_to_dict(account_service.create_account(g.user, json_body())))


@bp.patch("/accounts/<int:user_id>")
@auth_required("admin")
def update(user_id: int):
    return ok(account=user_to_dict(account_service.update_account(g.user, user_id, json_body())))


@bp.post("/accounts/<int:user_id>/suspend")
@auth_required("admin")
def suspend(user_id: int):
    user, released = account_service.suspend(g.user, user_id, json_body())
    return ok(account=user_to_dict(user), released_missions=released)


@bp.post("/accounts/<int:user_id>/reactivate")
@auth_required("admin")
def reactivate(user_id: int):
    return ok(account=user_to_dict(account_service.reactivate(g.user, user_id)))


@bp.get("/audit")
@auth_required("superadmin")
def audit():
    return ok(entries=[audit_to_dict(entry) for entry in account_service.list_audit(request.args)])
