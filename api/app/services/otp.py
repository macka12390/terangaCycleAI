"""Connexion par code à usage unique envoyé par SMS (OTP).

Garde-fous : code de 6 chiffres valable 5 min, stocké seulement sous forme d'empreinte HMAC ;
5 essais au plus par code ; 1 envoi par minute et 3 par quart d'heure pour un même numéro ;
un nouveau code annule le précédent. Le premier code vérifié crée un compte citoyen ; les
comptes collecteur et admin sont créés à l'avance (flask create-user).
"""

import hashlib
import hmac
import re
import secrets
from collections.abc import Mapping
from datetime import timedelta

from flask import current_app
from sqlalchemy import update

from app.extensions import db
from app.models import OtpChallenge, User
from app.services.auth import ensure_active, issue_token
from app.sms import get_sms
from app.utils.errors import ApiError, validation_error
from app.utils.phone import normalize_phone
from app.utils.time import utcnow
from app.utils.validation import parse_text

NAME_MAX_LENGTH = 80


def _hash(phone: str, code: str) -> str:
    key = current_app.config["SECRET_KEY"].encode()
    return hmac.new(key, f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def request_code(data: Mapping) -> dict:
    config = current_app.config
    phone = normalize_phone(data.get("phone"))
    now = utcnow()
    window_start = now - timedelta(seconds=config["OTP_WINDOW_SECONDS"])
    recent = (
        OtpChallenge.query.filter(OtpChallenge.phone == phone, OtpChallenge.created_at >= window_start)
        .order_by(OtpChallenge.created_at.desc())
        .all()
    )
    if recent:
        elapsed = (now - recent[0].created_at).total_seconds()
        if elapsed < config["OTP_RESEND_SECONDS"]:
            wait = int(config["OTP_RESEND_SECONDS"] - elapsed) + 1
            raise ApiError(
                429, "OTP_TOO_SOON", f"Patientez {wait} s avant de redemander un code.",
                {"retry_after": wait},
            )
    if len(recent) >= config["OTP_MAX_PER_WINDOW"]:
        oldest = recent[-1].created_at
        wait = int(config["OTP_WINDOW_SECONDS"] - (now - oldest).total_seconds()) + 1
        raise ApiError(
            429, "OTP_RATE_LIMITED",
            "Trop de codes demandés pour ce numéro. Réessayez dans quelques minutes.",
            {"retry_after": wait},
        )

    # Un nouveau code remplace le précédent.
    db.session.execute(
        update(OtpChallenge)
        .where(OtpChallenge.phone == phone, OtpChallenge.consumed_at.is_(None))
        .values(consumed_at=now)
    )
    length = config["OTP_LENGTH"]
    code = f"{secrets.randbelow(10**length):0{length}d}"
    ttl = config["OTP_TTL_SECONDS"]
    challenge = OtpChallenge(
        phone=phone,
        code_hash=_hash(phone, code),
        expires_at=now + timedelta(seconds=ttl),
        created_at=now,
    )
    db.session.add(challenge)
    db.session.commit()

    provider = get_sms()
    try:
        provider.send(
            phone,
            f"TerangaCycle : votre code de connexion est {code}. "
            f"Il expire dans {ttl // 60} minutes. Ne le partagez avec personne.",
        )
    except Exception:
        challenge.consumed_at = utcnow()
        db.session.commit()
        current_app.logger.exception("sms_send_failed provider=%s", provider.name)
        raise ApiError(502, "SMS_FAILED", "Le SMS n'a pas pu être envoyé. Réessayez.") from None

    result = {"phone": phone, "expires_in": ttl, "resend_in": config["OTP_RESEND_SECONDS"]}
    if config["OTP_EXPOSE_CODE"] and provider.name == "console":
        result["dev_code"] = code
    return result


def verify_code(data: Mapping) -> tuple[str, User, bool]:
    """Vérifie le code ; renvoie (jeton, utilisateur, compte créé ?)."""
    config = current_app.config
    phone = normalize_phone(data.get("phone"))
    code = str(data.get("code") or "").strip().replace(" ", "")
    if not re.fullmatch(rf"\d{{{config['OTP_LENGTH']}}}", code):
        raise validation_error(f"Le code contient {config['OTP_LENGTH']} chiffres.", "code")

    now = utcnow()
    challenge = (
        OtpChallenge.query.filter(OtpChallenge.phone == phone, OtpChallenge.consumed_at.is_(None))
        .order_by(OtpChallenge.id.desc())
        .first()
    )
    if challenge is None or challenge.expires_at <= now:
        raise ApiError(400, "OTP_EXPIRED", "Code expiré ou inconnu : demandez un nouveau code.")
    if challenge.attempts >= config["OTP_MAX_ATTEMPTS"]:
        raise ApiError(429, "OTP_LOCKED", "Trop d'essais : demandez un nouveau code.")

    if not hmac.compare_digest(challenge.code_hash, _hash(phone, code)):
        db.session.execute(
            update(OtpChallenge)
            .where(OtpChallenge.id == challenge.id)
            .values(attempts=OtpChallenge.attempts + 1)
        )
        db.session.commit()
        remaining = max(config["OTP_MAX_ATTEMPTS"] - challenge.attempts, 0)
        raise ApiError(
            400, "OTP_INVALID", f"Code incorrect. Essais restants : {remaining}.",
            {"remaining_attempts": remaining},
        )

    # Consommation atomique : un même code ne connecte qu'une fois.
    consumed = db.session.execute(
        update(OtpChallenge)
        .where(OtpChallenge.id == challenge.id, OtpChallenge.consumed_at.is_(None))
        .values(consumed_at=now)
    )
    if consumed.rowcount != 1:
        db.session.rollback()
        raise ApiError(400, "OTP_EXPIRED", "Code déjà utilisé : demandez un nouveau code.")

    user = User.query.filter_by(phone=phone).first()
    if user is not None and not user.is_active:
        db.session.commit()  # le code reste consommé
        ensure_active(user)
    created = user is None
    if created:
        name = parse_text(data, "name", max_length=NAME_MAX_LENGTH) or "Citoyen"
        user = User(name=name, phone=phone, role="citizen", is_verified=False, is_demo=False)
        db.session.add(user)
    user.last_login_at = now
    db.session.commit()
    return issue_token(user), user, created
