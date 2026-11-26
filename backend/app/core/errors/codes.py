"""Codes d'erreur de l'API (AD-11) : énumération unique, exportée dans l'OpenAPI.

Chaque code a un message par défaut en français ; la PWA affiche sa propre
traduction (`errors.<code>` dans `web/src/i18n/fr.json` et `wo.json`, exigée par
`tests/unit/test_error_messages.py`). Les stories ajoutent leurs codes ici, jamais
ailleurs.
"""

from enum import StrEnum


class ErrorCode(StrEnum):
    NOT_FOUND = "not_found"
    METHOD_NOT_ALLOWED = "method_not_allowed"
    VALIDATION_ERROR = "validation_error"
    INTERNAL_ERROR = "internal_error"
    # Photo reçue (core.storage, story 1.10).
    PHOTO_TOO_LARGE = "photo_too_large"
    UNSUPPORTED_MEDIA_TYPE = "unsupported_media_type"
    PHOTO_TOO_MANY_PIXELS = "photo_too_many_pixels"
    PHOTO_UNREADABLE = "photo_unreadable"
    # Identité et Signalement (story 1.11).
    INVALID_DEVICE_ID = "invalid_device_id"
    INVALID_TOKEN = "invalid_token"  # noqa: S105 - code d'erreur, pas un secret
    CONSENT_REQUIRED = "consent_required"
    OUTSIDE_ACTIVE_ZONE = "outside_active_zone"
    # Note vocale (story 1.13).
    VOICE_TOO_LARGE = "voice_too_large"
    UNSUPPORTED_VOICE_TYPE = "unsupported_voice_type"
    # Connexion du Personnel et modération (version démo, epics 2 et 4).
    INVALID_PHONE = "invalid_phone"
    INVALID_CODE = "invalid_code"
    SMS_UNAVAILABLE = "sms_unavailable"
    SESSION_REVOKED = "session_revoked"
    FORBIDDEN = "forbidden"
    INVALID_TRANSITION = "invalid_transition"
    RETAINED_TYPE_REQUIRED = "retained_type_required"
    REJECTION_REASON_REQUIRED = "rejection_reason_required"


DEFAULT_MESSAGES: dict[ErrorCode, str] = {
    ErrorCode.NOT_FOUND: "Ressource introuvable.",
    ErrorCode.METHOD_NOT_ALLOWED: "Méthode non autorisée pour cette ressource.",
    ErrorCode.VALIDATION_ERROR: "La requête est invalide. Vérifiez les champs envoyés.",
    ErrorCode.INTERNAL_ERROR: "Erreur interne. Réessayez dans quelques instants.",
    ErrorCode.PHOTO_TOO_LARGE: (
        "Cette photo est trop lourde. Reprenez-la depuis l'application, qui l'allège avant l'envoi."
    ),
    ErrorCode.UNSUPPORTED_MEDIA_TYPE: (
        "Ce fichier n'est pas une photo acceptée. "
        "Reprenez la photo avec l'appareil photo de l'application."
    ),
    ErrorCode.PHOTO_TOO_MANY_PIXELS: (
        "Cette photo est trop grande. "
        "Reprenez-la depuis l'application, qui la réduit avant l'envoi."
    ),
    ErrorCode.PHOTO_UNREADABLE: "Cette photo n'a pas pu être lue. Reprenez-la.",
    ErrorCode.INVALID_DEVICE_ID: (
        "Cet appareil n'a pas pu être reconnu. Fermez puis rouvrez l'application, puis réessayez."
    ),
    ErrorCode.INVALID_TOKEN: "Votre session n'est plus valable. Reconnectez-vous, puis réessayez.",
    ErrorCode.CONSENT_REQUIRED: (
        "Pour envoyer un signalement, acceptez d'abord les conditions "
        "d'utilisation de votre position et de votre photo."
    ),
    ErrorCode.OUTSIDE_ACTIVE_ZONE: "TerangaCycle n'est pas encore actif ici.",
    ErrorCode.VOICE_TOO_LARGE: (
        "Votre message vocal est trop long. Réenregistrez-le en moins de 30 secondes."
    ),
    ErrorCode.UNSUPPORTED_VOICE_TYPE: "Ce message vocal n'a pas pu être lu. Réenregistrez-le.",
    ErrorCode.INVALID_PHONE: (
        "Saisissez un numéro sénégalais à 9 chiffres, par exemple 77 123 45 67."
    ),
    ErrorCode.INVALID_CODE: (
        "Ce code n'est pas valable. Vérifiez-le, ou demandez un nouveau code."
    ),
    ErrorCode.SMS_UNAVAILABLE: (
        "L'envoi de codes par SMS n'est pas encore ouvert. Réessayez plus tard."
    ),
    ErrorCode.SESSION_REVOKED: ("Votre session a pris fin. Reconnectez-vous."),
    ErrorCode.FORBIDDEN: ("Cet espace est réservé à un autre rôle. Revenez à l'accueil."),
    ErrorCode.INVALID_TRANSITION: ("Ce signalement a déjà été traité. Actualisez la liste."),
    ErrorCode.RETAINED_TYPE_REQUIRED: ("Choisissez le type de déchet avant de valider."),
    ErrorCode.REJECTION_REASON_REQUIRED: ("Choisissez un motif avant de rejeter."),
}


def default_message(code: str) -> str:
    """Message par défaut d'un code ; le code lui-même s'il n'en a pas."""
    try:
        return DEFAULT_MESSAGES[ErrorCode(code)]
    except ValueError:
        return code
