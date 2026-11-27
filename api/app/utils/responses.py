from flask import jsonify


def ok(http_status: int = 200, /, **payload):
    """Réponse de succès : {"success": true, ...payload} (code HTTP en premier argument)."""
    return jsonify({"success": True, **payload}), http_status


def json_body() -> dict:
    from flask import request

    from app.utils.errors import validation_error

    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise validation_error("Le corps de la requête doit être un objet JSON.")
    return data
