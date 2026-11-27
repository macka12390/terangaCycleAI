"""Numéros de téléphone sénégalais : normalisation en E.164 et masquage pour les journaux."""

import re

from app.utils.errors import validation_error

# Mobiles sénégalais : 9 chiffres commençant par 70, 71, 75, 76, 77 ou 78.
MOBILE = re.compile(r"7[015678]\d{7}")


def normalize_phone(raw: object, field: str = "phone") -> str:
    """« 77 123 45 67 », « +221771234567 », « 00221 77… » → « +221771234567 »."""
    if not isinstance(raw, str) or not raw.strip():
        raise validation_error("Saisissez votre numéro de téléphone.", field)
    digits = re.sub(r"[\s.\-()]", "", raw.strip())
    if digits.startswith("+"):
        digits = digits[1:]
    elif digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 12 and digits.startswith("221"):
        digits = digits[3:]
    if not MOBILE.fullmatch(digits):
        raise validation_error(
            "Numéro invalide : un mobile sénégalais à 9 chiffres (ex. 77 123 45 67).", field
        )
    return f"+221{digits}"


def mask_phone(phone: str) -> str:
    """« +221771234567 » → « +221 77 *** ** 67 » (jamais le numéro complet dans un journal)."""
    local = phone.removeprefix("+221")
    return f"+221 {local[:2]} *** ** {local[-2:]}"
