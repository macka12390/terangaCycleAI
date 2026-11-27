"""Lecture et validation des champs reçus (formulaire multipart ou JSON)."""

import uuid
from collections.abc import Mapping

from app.constants import CATEGORIES, TEXT_MAX_LENGTH
from app.utils.errors import validation_error


def parse_float(
    data: Mapping,
    field: str,
    *,
    required: bool,
    minimum: float | None = None,
    maximum: float | None = None,
    exclusive_minimum: bool = False,
    label: str | None = None,
) -> float | None:
    label = label or field
    raw = data.get(field)
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        if required:
            raise validation_error(f"Le champ « {label} » est obligatoire.", field)
        return None
    try:
        # La virgule décimale est courante sur les claviers francophones.
        value = float(str(raw).strip().replace(",", "."))
    except ValueError:
        raise validation_error(f"« {label} » doit être un nombre.", field) from None
    if value != value or value in (float("inf"), float("-inf")):
        raise validation_error(f"« {label} » doit être un nombre.", field)
    if minimum is not None:
        if exclusive_minimum and value <= minimum:
            raise validation_error(f"« {label} » doit être supérieur à {minimum:g}.", field)
        if not exclusive_minimum and value < minimum:
            raise validation_error(f"« {label} » doit être au moins {minimum:g}.", field)
    if maximum is not None and value > maximum:
        raise validation_error(f"« {label} » doit être au plus {maximum:g}.", field)
    return value


def parse_text(data: Mapping, field: str, *, max_length: int = TEXT_MAX_LENGTH) -> str | None:
    raw = data.get(field)
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise validation_error(f"« {field} » doit être du texte.", field)
    value = raw.strip()
    if not value:
        return None
    if len(value) > max_length:
        raise validation_error(f"« {field} » ne doit pas dépasser {max_length} caractères.", field)
    return value


def parse_category(data: Mapping, field: str, *, required: bool = False) -> str | None:
    raw = data.get(field)
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        if required:
            raise validation_error("Choisissez une catégorie de déchet.", field)
        return None
    value = str(raw).strip().lower()
    if value not in CATEGORIES:
        raise validation_error(
            "Catégorie inconnue.", field, allowed=list(CATEGORIES.keys())
        )
    return value


def parse_uuid(data: Mapping, field: str) -> str | None:
    raw = data.get(field)
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        return None
    try:
        return str(uuid.UUID(str(raw).strip()))
    except ValueError:
        raise validation_error(f"« {field} » doit être un UUID.", field) from None


def parse_choice(data: Mapping, field: str, choices: tuple[str, ...]) -> str:
    raw = data.get(field)
    value = str(raw).strip().lower() if raw is not None else ""
    if value not in choices:
        raise validation_error(
            f"« {field} » doit valoir : {', '.join(choices)}.", field, allowed=list(choices)
        )
    return value


def parse_bool(raw: str | None, default: bool) -> bool:
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "oui", "on")


def parse_pagination(args: Mapping) -> tuple[int, int]:
    limit = parse_float(args, "limit", required=False, minimum=1, maximum=200)
    offset = parse_float(args, "offset", required=False, minimum=0)
    return int(limit or 50), int(offset or 0)
