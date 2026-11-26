"""Principal unique de la requête (AD-9) : seul lecteur de `Authorization` et `X-Device-Id`.

Deux sortes de principal :
- **appareil** (Citoyen anonyme) : `X-Device-Id` = 32 octets aléatoires en base64url
  (43 caractères). Le serveur n'en garde que l'empreinte
  `device_hash = HMAC-SHA256(DEVICE_ID_PEPPER, id)` ; l'identifiant brut n'est jamais
  stocké, journalisé ni renvoyé ;
- **utilisateur** (Personnel connecté) : jeton d'accès JWT Ed25519 (`alg: EdDSA`) signé
  avec `JWT_SIGNING_KEYS`. À chaque requête, l'état du compte (statut, rôle,
  `token_version`) est relu par le chargeur que la racine de composition enregistre
  (`register_user_loader`, fourni par `auth.service`) : le rôle vient de la base, jamais
  du jeton (AD-30).

Un en-tête `Authorization` présent mais invérifiable donne 401 `invalid_token`.
"""

import base64
import binascii
import hashlib
import hmac
import json
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated, Any, Literal

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import Depends, Request

from app.core.clock import now
from app.core.config import Settings
from app.core.enums import Role
from app.core.errors import DomainError, ErrorCode

DEVICE_ID_HEADER = "x-device-id"
_DEVICE_ID_CHARS = re.compile(r"[A-Za-z0-9_-]{43}")
TOKEN_ISSUER = "terangacycle"
TOKEN_AUDIENCE = "terangacycle-api"  # noqa: S105 - audience publique, pas un secret


@dataclass(frozen=True)
class Principal:
    """Auteur d'une requête. `owner_key` est immuable et jamais renvoyé hors du Personnel."""

    kind: Literal["device", "user"]
    owner_key: str
    device_hash: str | None = None
    user_id: uuid.UUID | None = None
    role: Role | None = None


@dataclass(frozen=True)
class UserState:
    """État courant d'un compte, relu à chaque requête."""

    role: Role
    active: bool
    token_version: int


UserLoader = Callable[[uuid.UUID], UserState | None]
_user_loader: UserLoader | None = None


def register_user_loader(loader: UserLoader) -> None:
    """Enregistré par la racine de composition (`app.main`) : `auth.service.user_state`."""
    global _user_loader
    _user_loader = loader


# --- Appareil ---------------------------------------------------------------------------


def is_valid_device_id(raw: str) -> bool:
    """43 caractères base64url qui décodent exactement 32 octets (forme canonique)."""
    if not _DEVICE_ID_CHARS.fullmatch(raw):
        return False
    try:
        decoded = base64.urlsafe_b64decode(raw + "=")
    except (binascii.Error, ValueError):
        return False
    # Forme canonique : les 2 bits de remplissage du dernier caractère sont nuls.
    return len(decoded) == 32 and base64.urlsafe_b64encode(decoded).rstrip(b"=") == raw.encode()


def device_hash(device_id: str, pepper: str) -> str:
    """Empreinte HMAC-SHA256 de l'Identifiant d'appareil, en hexadécimal (64 caractères)."""
    return hmac.new(pepper.encode(), device_id.encode(), hashlib.sha256).hexdigest()


def device_principal(device_id: str | None, settings: Settings) -> Principal:
    if device_id is None or not is_valid_device_id(device_id):
        raise DomainError(ErrorCode.INVALID_DEVICE_ID, 400)
    if settings.device_id_pepper is None:
        raise RuntimeError("DEVICE_ID_PEPPER absent.")
    digest = device_hash(device_id, settings.device_id_pepper.get_secret_value())
    return Principal(kind="device", owner_key=f"device:{digest}", device_hash=digest)


# --- Jetons d'accès ---------------------------------------------------------------------


def _signing_keys(settings: Settings) -> dict[str, Ed25519PrivateKey]:
    """Clés Ed25519 par `kid` : JSON `{kid: graine de 32 octets en base64}` (AD-26)."""
    if settings.jwt_signing_keys is None:
        raise RuntimeError("JWT_SIGNING_KEYS absent.")
    raw: dict[str, str] = json.loads(settings.jwt_signing_keys.get_secret_value())
    return {
        kid: Ed25519PrivateKey.from_private_bytes(base64.b64decode(seed))
        for kid, seed in raw.items()
    }


def issue_access_token(
    user_id: uuid.UUID, token_version: int, settings: Settings
) -> tuple[str, int]:
    """Jeton d'accès signé par la première clé ; renvoie (jeton, durée en secondes)."""
    keys = _signing_keys(settings)
    kid, key = next(iter(keys.items()))
    issued = now()
    ttl = settings.access_token_ttl_s
    claims = {
        "iss": TOKEN_ISSUER,
        "aud": TOKEN_AUDIENCE,
        "sub": str(user_id),
        "tv": token_version,
        "amr": ["otp"],
        "iat": int(issued.timestamp()),
        "exp": int((issued + timedelta(seconds=ttl)).timestamp()),
    }
    return jwt.encode(claims, key, algorithm="EdDSA", headers={"kid": kid}), ttl


def _decode(token: str, settings: Settings) -> dict[str, Any]:
    try:
        kid = jwt.get_unverified_header(token).get("kid")
        key = _signing_keys(settings).get(kid) if isinstance(kid, str) else None
        if key is None:
            raise DomainError(ErrorCode.INVALID_TOKEN, 401)
        return jwt.decode(
            token,
            key.public_key(),
            algorithms=["EdDSA"],
            audience=TOKEN_AUDIENCE,
            issuer=TOKEN_ISSUER,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError:
        raise DomainError(ErrorCode.INVALID_TOKEN, 401) from None


def user_principal(authorization: str, settings: Settings) -> Principal:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise DomainError(ErrorCode.INVALID_TOKEN, 401)
    claims = _decode(token.strip(), settings)
    try:
        user_id = uuid.UUID(str(claims["sub"]))
        token_version = int(claims.get("tv", -1))
    except (ValueError, TypeError):
        raise DomainError(ErrorCode.INVALID_TOKEN, 401) from None
    if _user_loader is None:
        raise RuntimeError("Aucun chargeur d'utilisateur enregistré.")
    state = _user_loader(user_id)
    if state is None or not state.active or state.token_version != token_version:
        raise DomainError(ErrorCode.SESSION_REVOKED, 401)
    return Principal(kind="user", owner_key=f"user:{user_id}", user_id=user_id, role=state.role)


# --- Dépendances FastAPI -------------------------------------------------------------------


def resolve_principal(
    authorization: str | None, device_id: str | None, settings: Settings
) -> Principal:
    """Jeton s'il est présent (et alors valide), sinon Identifiant d'appareil."""
    if authorization is not None:
        return user_principal(authorization, settings)
    return device_principal(device_id, settings)


def principal(request: Request) -> Principal:
    """Dépendance FastAPI : principal de la requête, résolu avant la validation du corps."""
    return resolve_principal(
        request.headers.get("authorization"),
        request.headers.get(DEVICE_ID_HEADER),
        request.app.state.settings,
    )


CurrentPrincipal = Annotated[Principal, Depends(principal)]


def require_role(*allowed: Role) -> Callable[[Principal], Principal]:
    """Dépendance : Utilisateur connecté ayant l'un des rôles donnés, sinon 401 ou 403."""

    def check(current: CurrentPrincipal) -> Principal:
        if current.kind != "user":
            raise DomainError(ErrorCode.INVALID_TOKEN, 401)
        if current.role not in allowed:
            raise DomainError(ErrorCode.FORBIDDEN, 403)
        return current

    return check
