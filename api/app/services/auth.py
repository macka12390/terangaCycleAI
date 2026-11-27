"""Authentification de démonstration : choisir un compte fictif, recevoir un jeton signé.

Ce n'est PAS une sécurité de production : aucun secret n'est demandé à l'utilisateur. Le jeton
sert seulement à porter l'identité du profil choisi pour que le backend applique les règles
de rôle (admin, collecteur vérifié…).
"""

from collections.abc import Callable
from functools import wraps

from flask import current_app, g, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.constants import ADMIN_ROLES
from app.extensions import db
from app.models import User
from app.utils.errors import ApiError, forbidden, not_found, unauthorized
from app.utils.time import utcnow

# Comptes fictifs, clairement identifiés : aucun nom, téléphone ni e-mail réel.
DEMO_ACCOUNTS = (
    {"demo_login": "citoyen-demo", "name": "Citoyen Démo", "role": "citizen", "is_verified": True},
    {
        "demo_login": "admin-demo",
        "name": "Admin Démo",
        "role": "admin",
        "is_verified": True,
        "organisation": "default",
    },
    {
        "demo_login": "admin-pikine-demo",
        "name": "Admin UCG Pikine (démo)",
        "role": "admin",
        "is_verified": True,
        "organisation": "pikine",
    },
    {
        "demo_login": "superadmin-demo",
        "name": "Super Admin Démo",
        "role": "superadmin",
        "is_verified": True,
    },
    {
        "demo_login": "recycleur-demo",
        "name": "Recycleur Démo",
        "role": "recycler",
        "is_verified": True,
    },
    {
        "demo_login": "collecteur-demo",
        "name": "Collecteur Démo (vérifié)",
        "role": "collector",
        "is_verified": True,
        "organisation": "default",
    },
    {
        "demo_login": "collecteur-non-verifie",
        "name": "Collecteur Démo (non vérifié)",
        "role": "collector",
        "is_verified": False,
        "organisation": "default",
    },
)

_SALT = "terangacycle-demo-auth"


def is_admin(user: User | None) -> bool:
    """Accès à la console d'administration : admin ou super admin."""
    return user is not None and user.role in ADMIN_ROLES


def ensure_active(user: User) -> None:
    if not user.is_active:
        raise ApiError(
            403, "ACCOUNT_SUSPENDED", "Ce compte est suspendu. Contactez l'équipe TerangaCycle."
        )


def ensure_demo_users() -> None:
    """Crée les comptes de démonstration manquants et leurs organisations (idempotent)."""
    from app.services.organisations import ensure_default_organisation, ensure_demo_organisations

    organisations = {"default": ensure_default_organisation(), **ensure_demo_organisations()}
    existing = {user.demo_login: user for user in User.query.filter(User.demo_login.isnot(None))}
    for account in DEMO_ACCOUNTS:
        values = dict(account)
        key = values.pop("organisation", None)
        organisation_id = organisations[key].id if key else None
        user = existing.get(values["demo_login"])
        if user is None:
            db.session.add(User(is_demo=True, organisation_id=organisation_id, **values))
        elif user.organisation_id is None and organisation_id is not None:
            user.organisation_id = organisation_id
    db.session.commit()


def list_demo_accounts() -> list[User]:
    logins = [account["demo_login"] for account in DEMO_ACCOUNTS]
    users = User.query.filter(User.demo_login.in_(logins)).all()
    order = {login: index for index, login in enumerate(logins)}
    return sorted(users, key=lambda user: order[user.demo_login])


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=_SALT)


def issue_token(user: User) -> str:
    return _serializer().dumps({"uid": user.id})


def ensure_demo_auth_enabled() -> None:
    if not current_app.config["DEMO_AUTH_ENABLED"]:
        raise ApiError(
            403, "DEMO_DISABLED", "Les comptes de démonstration sont désactivés : connectez-vous par SMS."
        )


def login_demo(login: str) -> tuple[str, User]:
    ensure_demo_auth_enabled()
    user = User.query.filter_by(demo_login=login).first()
    if user is None:
        raise not_found("Compte de démonstration inconnu.")
    ensure_active(user)
    user.last_login_at = utcnow()
    db.session.commit()
    return issue_token(user), user


def user_from_request() -> User | None:
    """Utilisateur du jeton `Authorization: Bearer …`, None sans jeton ; 401 si jeton invalide."""
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise unauthorized("En-tête Authorization invalide (attendu : Bearer <jeton>).")
    try:
        payload = _serializer().loads(
            token.strip(), max_age=current_app.config["AUTH_TOKEN_MAX_AGE"]
        )
    except SignatureExpired:
        raise unauthorized("Session expirée : reconnectez-vous.") from None
    except BadSignature:
        raise unauthorized("Jeton invalide : reconnectez-vous.") from None
    user = db.session.get(User, payload.get("uid"))
    if user is None:
        raise unauthorized("Compte introuvable : reconnectez-vous.")
    # Démo désactivée : les jetons déjà émis pour les comptes de démo ne valent plus rien.
    if user.demo_login and not current_app.config["DEMO_AUTH_ENABLED"]:
        raise unauthorized("Les comptes de démonstration sont désactivés : connectez-vous par SMS.")
    # Compte suspendu : ses jetons déjà émis sont refusés immédiatement.
    ensure_active(user)
    return user


def update_profile(user: User, data) -> User:
    """La personne connectée modifie son nom ou coupe ses notifications SMS."""
    from app.utils.errors import validation_error
    from app.utils.validation import parse_text

    if user.demo_login:
        raise ApiError(403, "DEMO_ACCOUNT_LOCKED", "Les comptes de démonstration ne sont pas modifiables.")
    if "name" in data:
        name = parse_text(data, "name", max_length=80)
        if not name:
            raise validation_error("Le nom est obligatoire.", "name")
        user.name = name
    if "sms_notifications" in data:
        value = data["sms_notifications"]
        if not isinstance(value, bool):
            raise validation_error("« sms_notifications » doit valoir true ou false.", "sms_notifications")
        user.sms_notifications = value
    db.session.commit()
    return user


def auth_required(*roles: str) -> Callable:
    """Exige un jeton valide (et un des rôles donnés s'il y en a). Pose `g.user`."""

    def decorator(view: Callable) -> Callable:
        @wraps(view)
        def wrapper(*args, **kwargs):
            user = user_from_request()
            if user is None:
                raise unauthorized()
            # Le super admin a tous les droits de l'admin.
            allowed = user.role in roles or ("admin" in roles and user.role == "superadmin")
            if roles and not allowed:
                raise forbidden()
            g.user = user
            return view(*args, **kwargs)

        return wrapper

    return decorator


def auth_optional(view: Callable) -> Callable:
    """Jeton facultatif : `g.user` vaut l'utilisateur ou None."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        g.user = user_from_request()
        return view(*args, **kwargs)

    return wrapper
