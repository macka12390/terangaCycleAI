"""Erreurs métier et enveloppe JSON unique : {"success": false, "error": {code, message, details}}."""

import logging

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

log = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


def validation_error(message: str, field: str | None = None, **details) -> ApiError:
    if field:
        details["field"] = field
    return ApiError(400, "VALIDATION_ERROR", message, details or None)


def unauthorized(message: str = "Connectez-vous avec un compte de démonstration.") -> ApiError:
    return ApiError(401, "UNAUTHORIZED", message)


def forbidden(message: str = "Votre profil ne permet pas cette action.") -> ApiError:
    return ApiError(403, "FORBIDDEN", message)


def not_found(message: str = "Ressource introuvable.") -> ApiError:
    return ApiError(404, "NOT_FOUND", message)


def invalid_transition(message: str, status: str | None = None) -> ApiError:
    return ApiError(409, "INVALID_TRANSITION", message, {"status": status} if status else None)


def error_response(status: int, code: str, message: str, details: dict | None = None):
    body = {"success": False, "error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return jsonify(body), status


HTTP_CODES = {
    400: ("VALIDATION_ERROR", "Requête invalide."),
    401: ("UNAUTHORIZED", "Authentification requise."),
    403: ("FORBIDDEN", "Accès refusé."),
    404: ("NOT_FOUND", "Ressource introuvable."),
    405: ("METHOD_NOT_ALLOWED", "Méthode non autorisée sur cette route."),
}


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def _api_error(exc: ApiError):
        return error_response(exc.status, exc.code, exc.message, exc.details)

    @app.errorhandler(RequestEntityTooLarge)
    def _too_large(_exc):
        return error_response(413, "FILE_TOO_LARGE", "La photo dépasse la taille maximale (8 Mo).")

    @app.errorhandler(HTTPException)
    def _http_error(exc: HTTPException):
        code, message = HTTP_CODES.get(exc.code or 500, ("HTTP_ERROR", exc.description or ""))
        return error_response(exc.code or 500, code, message)

    @app.errorhandler(Exception)
    def _unexpected(exc: Exception):
        # Type et pile seulement : jamais le corps de la requête (positions GPS).
        log.exception("unexpected_error type=%s", type(exc).__name__)
        from app.extensions import db

        db.session.rollback()
        return error_response(500, "INTERNAL_ERROR", "Erreur interne. Réessayez dans un instant.")
