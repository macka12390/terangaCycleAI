from flask import Blueprint, current_app, g

from app.serializers import user_to_dict
from app.services import auth as auth_service
from app.services import otp as otp_service
from app.utils.errors import validation_error
from app.utils.responses import json_body, ok

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.get("/demo-accounts")
def demo_accounts():
    if not current_app.config["DEMO_AUTH_ENABLED"]:
        return ok(accounts=[], demo_enabled=False)
    accounts = [user_to_dict(user) for user in auth_service.list_demo_accounts()]
    return ok(accounts=accounts, demo_enabled=True)


@bp.post("/demo")
def demo_login():
    login = json_body().get("login")
    if not isinstance(login, str) or not login.strip():
        raise validation_error("Choisissez un compte de démonstration.", "login")
    token, user = auth_service.login_demo(login.strip())
    return ok(token=token, user=user_to_dict(user))


@bp.post("/otp/request")
def otp_request():
    """Envoie un code de connexion par SMS au numéro donné."""
    return ok(**otp_service.request_code(json_body()))


@bp.post("/otp/verify")
def otp_verify():
    """Vérifie le code ; crée un compte citoyen au premier passage."""
    token, user, created = otp_service.verify_code(json_body())
    return ok(201 if created else 200, token=token, user=user_to_dict(user), created=created)


@bp.get("/me")
@auth_service.auth_required()
def me():
    return ok(user=user_to_dict(g.user))


@bp.patch("/me")
@auth_service.auth_required()
def update_me():
    """Mon compte : nom et notifications SMS (oui ou non)."""
    return ok(user=user_to_dict(auth_service.update_profile(g.user, json_body())))
