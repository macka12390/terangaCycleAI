from flask import Blueprint, request

from app.ai.service import get_ai, prediction_to_dict
from app.utils.images import read_photo
from app.utils.responses import ok

bp = Blueprint("ai", __name__, url_prefix="/api/ai")


@bp.post("/classify")
def classify():
    """Aperçu de la classification avant l'envoi du signalement (rien n'est enregistré)."""
    processed = read_photo(request.files.get("photo"))
    prediction = get_ai().classify(processed.image, processed.source_sha256)
    return ok(ai=prediction_to_dict(prediction))
