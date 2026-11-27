from flask import Blueprint, g

from app.serializers import user_to_dict
from app.services import auth as auth_service
from app.utils.errors import validation_error
from app.utils.responses import json_body, ok

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.get("/demo-accounts")
def demo_accounts():
    return ok(accounts=[user_to_dict(user) for user in auth_service.list_demo_accounts()])


@bp.post("/demo")
def demo_login():
    login = json_body().get("login")
    if not isinstance(login, str) or not login.strip():
        raise validation_error("Choisissez un compte de démonstration.", "login")
    token, user = auth_service.login_demo(login.strip())
    return ok(token=token, user=user_to_dict(user))


@bp.get("/me")
@auth_service.auth_required()
def me():
    return ok(user=user_to_dict(g.user))
