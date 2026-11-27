from flask import Blueprint, current_app, send_from_directory

from app.utils.audio import MIMETYPES as AUDIO_MIMETYPES
from app.utils.errors import not_found

bp = Blueprint("uploads", __name__, url_prefix="/api/uploads")

ALLOWED_DIRS = ("reports", "proofs", "voices")


@bp.get("/<folder>/<filename>")
def serve(folder: str, filename: str):
    if folder not in ALLOWED_DIRS:
        raise not_found("Fichier introuvable.")
    # Type audio explicite : Windows associe parfois .webm à de la vidéo, ou rien à .m4a.
    mimetype = None
    if folder == "voices":
        mimetype = AUDIO_MIMETYPES.get(filename.rsplit(".", 1)[-1].lower())
    # send_from_directory refuse tout chemin qui sortirait du dossier (« ../ »).
    return send_from_directory(
        f"{current_app.config['UPLOAD_FOLDER']}/{folder}",
        filename,
        max_age=3600,
        mimetype=mimetype,
    )
