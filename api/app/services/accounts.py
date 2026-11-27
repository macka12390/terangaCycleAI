"""Gestion des comptes (étape 2 post-MVP) : création, vérification, rôles, suspension, audit.

Qui gère quoi :
- un admin gère les citoyens et les collecteurs (créer, vérifier, suspendre) ;
- un super admin gère tous les comptes, y compris les admins et les autres super admins.
Personne ne modifie son propre compte ici, les comptes de démo ne sont pas modifiables, et le
dernier super admin réel actif ne peut être ni rétrogradé ni suspendu.
"""

import json
from collections.abc import Mapping

from sqlalchemy import func, or_

from app.constants import ROLES
from app.extensions import db
from app.models import AuditLog, User
from app.services import missions as mission_service
from app.utils.errors import ApiError, forbidden, not_found, validation_error
from app.utils.phone import mask_phone, normalize_phone
from app.utils.time import utcnow
from app.utils.validation import parse_choice, parse_pagination, parse_text

NAME_MAX_LENGTH = 80

# Rôles qu'un acteur peut créer ou gérer, selon son propre rôle.
MANAGEABLE_ROLES: dict[str, tuple[str, ...]] = {
    "admin": ("citizen", "collector"),
    "superadmin": tuple(ROLES),
}


def manageable_roles(actor: User) -> tuple[str, ...]:
    return MANAGEABLE_ROLES.get(actor.role, ())


def _audit(actor: User, action: str, target: User | None, **details) -> None:
    db.session.add(
        AuditLog(
            actor_id=actor.id,
            action=action,
            target_user_id=target.id if target else None,
            details=json.dumps(details, ensure_ascii=False) if details else None,
        )
    )


def _get(user_id: int) -> User:
    user = db.session.get(User, user_id)
    if user is None:
        raise not_found("Compte introuvable.")
    return user


def _ensure_can_manage(actor: User, target: User) -> None:
    if target.id == actor.id:
        raise forbidden("Vous ne pouvez pas modifier votre propre compte depuis cette page.")
    if target.demo_login:
        raise ApiError(
            403, "DEMO_ACCOUNT_LOCKED", "Les comptes de démonstration ne sont pas modifiables."
        )
    if target.role not in manageable_roles(actor):
        raise forbidden("Seul un super administrateur peut gérer ce compte.")


def _ensure_role_allowed(actor: User, role: str) -> None:
    if role not in manageable_roles(actor):
        raise forbidden("Seul un super administrateur peut attribuer ce rôle.")


def _ensure_not_last_superadmin(target: User) -> None:
    """Le dernier super admin réel actif ne peut pas perdre ses droits."""
    if target.role != "superadmin" or not target.is_active:
        return
    others = (
        db.session.query(func.count(User.id))
        .filter(
            User.role == "superadmin",
            User.is_active.is_(True),
            User.demo_login.is_(None),
            User.id != target.id,
        )
        .scalar()
    )
    if not others:
        raise ApiError(
            409, "LAST_SUPERADMIN",
            "C'est le dernier super administrateur actif : nommez-en un autre d'abord.",
        )


def _parse_bool(data: Mapping, field: str) -> bool | None:
    if field not in data:
        return None
    value = data[field]
    if not isinstance(value, bool):
        raise validation_error(f"« {field} » doit valoir true ou false.", field)
    return value


def list_accounts(actor: User, args: Mapping) -> tuple[list[User], int]:
    query = User.query
    role = args.get("role")
    if role:
        if role not in ROLES:
            raise validation_error("Rôle inconnu.", "role", allowed=list(ROLES))
        query = query.filter(User.role == role)
    status = args.get("status")
    if status == "active":
        query = query.filter(User.is_active.is_(True))
    elif status == "suspended":
        query = query.filter(User.is_active.is_(False))
    elif status:
        raise validation_error("« status » doit valoir active ou suspended.", "status")
    search = (args.get("q") or "").strip()
    if search:
        digits = "".join(ch for ch in search if ch.isdigit())
        conditions = [User.name.ilike(f"%{search}%")]
        if len(digits) >= 3:
            conditions.append(User.phone.contains(digits))
        query = query.filter(or_(*conditions))
    limit, offset = parse_pagination(args)
    total = query.count()
    users = query.order_by(User.is_demo.asc(), User.role, User.name).limit(limit).offset(offset)
    return users.all(), total


def create_account(actor: User, data: Mapping) -> User:
    phone = normalize_phone(data.get("phone"))
    name = parse_text(data, "name", max_length=NAME_MAX_LENGTH)
    if not name:
        raise validation_error("Le nom est obligatoire.", "name")
    role = parse_choice(data, "role", tuple(ROLES))
    _ensure_role_allowed(actor, role)
    verified = _parse_bool(data, "is_verified") or False
    if User.query.filter_by(phone=phone).first() is not None:
        raise ApiError(409, "PHONE_TAKEN", "Un compte existe déjà avec ce numéro.", {"field": "phone"})
    user = User(name=name, phone=phone, role=role, is_verified=verified, is_demo=False)
    db.session.add(user)
    db.session.flush()
    _audit(actor, "account.create", user, role=role, verified=verified, phone=mask_phone(phone))
    db.session.commit()
    return user


def update_account(actor: User, user_id: int, data: Mapping) -> User:
    target = _get(user_id)
    _ensure_can_manage(actor, target)
    changes: dict[str, list] = {}

    if "name" in data:
        name = parse_text(data, "name", max_length=NAME_MAX_LENGTH)
        if not name:
            raise validation_error("Le nom est obligatoire.", "name")
        if name != target.name:
            changes["name"] = [target.name, name]
            target.name = name

    if "role" in data:
        role = parse_choice(data, "role", tuple(ROLES))
        if role != target.role:
            _ensure_role_allowed(actor, role)
            _ensure_not_last_superadmin(target)
            changes["role"] = [target.role, role]
            target.role = role

    verified = _parse_bool(data, "is_verified")
    if verified is not None and verified != target.is_verified:
        changes["is_verified"] = [target.is_verified, verified]
        target.is_verified = verified

    if changes:
        _audit(actor, "account.update", target, changes=changes)
        db.session.commit()
    return target


def suspend(actor: User, user_id: int, data: Mapping) -> tuple[User, int]:
    """Suspend un compte ; renvoie (compte, nombre de missions libérées)."""
    target = _get(user_id)
    _ensure_can_manage(actor, target)
    if not target.is_active:
        raise ApiError(409, "INVALID_TRANSITION", "Ce compte est déjà suspendu.")
    _ensure_not_last_superadmin(target)
    reason = parse_text(data, "reason")
    target.is_active = False
    target.suspended_at = utcnow()
    target.suspended_reason = reason
    released = mission_service.release_all_of(
        target, actor, f"Collecteur suspendu{f' : {reason}' if reason else ''}"
    )
    _audit(actor, "account.suspend", target, reason=reason, released_missions=released)
    db.session.commit()
    return target, released


def reactivate(actor: User, user_id: int) -> User:
    target = _get(user_id)
    _ensure_can_manage(actor, target)
    if target.is_active:
        raise ApiError(409, "INVALID_TRANSITION", "Ce compte est déjà actif.")
    target.is_active = True
    target.suspended_at = None
    target.suspended_reason = None
    _audit(actor, "account.reactivate", target)
    db.session.commit()
    return target


def list_audit(args: Mapping) -> list[AuditLog]:
    limit, offset = parse_pagination(args)
    return AuditLog.query.order_by(AuditLog.id.desc()).limit(limit).offset(offset).all()
