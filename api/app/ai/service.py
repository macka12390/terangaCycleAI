"""Point d'entrée de la classification pour le reste de l'application.

Choix du classificateur (AI_BACKEND) : `manual`, `clip`, ou `auto` (CLIP si les dépendances
de requirements-ai.txt et les poids locaux sont présents, sinon manuel). Toute panne de
l'IA retombe sur le mode manuel, jamais sur une prédiction inventée.
"""

import logging
import threading
from collections import OrderedDict

from flask import Flask, current_app
from PIL import Image

from app.ai.base import Classifier, ManualClassifier, Prediction
from app.constants import AI_MODE_LABELS, AiMode

log = logging.getLogger(__name__)

_CACHE_SIZE = 64
_EXTENSION_KEY = "terangacycle_ai"


class AiService:
    def __init__(self, classifier: Classifier, status: str):
        self.classifier = classifier
        # Raison lisible du mode retenu (exposée par /api/health).
        self.status = status
        self._cache: OrderedDict[str, Prediction] = OrderedDict()
        self._lock = threading.Lock()

    @property
    def mode(self) -> str:
        return self.classifier.mode

    def classify(self, image: Image.Image, cache_key: str | None = None) -> Prediction:
        if cache_key:
            with self._lock:
                cached = self._cache.get(cache_key)
                if cached is not None:
                    self._cache.move_to_end(cache_key)
                    return cached
        try:
            prediction = self.classifier.classify(image)
        except Exception:
            log.exception("ai_classification_failed")
            return Prediction.manual()
        if cache_key:
            with self._lock:
                self._cache[cache_key] = prediction
                while len(self._cache) > _CACHE_SIZE:
                    self._cache.popitem(last=False)
        return prediction


def _build_classifier(app: Flask) -> tuple[Classifier, str]:
    backend = app.config["AI_BACKEND"]
    if backend == "manual":
        return ManualClassifier(), "mode manuel demandé (AI_BACKEND=manual)"

    from app.ai import clip_zero_shot as clip

    model_dir = app.config["AI_MODEL_DIR"]
    if not clip.dependencies_available():
        reason = "dépendances IA absentes (pip install -r requirements-ai.txt)"
    elif not clip.model_files_present(model_dir):
        reason = "poids du modèle absents (python scripts/download_model.py)"
    else:
        try:
            return clip.ClipZeroShotClassifier(model_dir), f"CLIP zéro-shot chargé ({model_dir})"
        except Exception as exc:
            log.exception("ai_model_load_failed")
            reason = f"échec du chargement du modèle ({type(exc).__name__})"

    if backend == "clip":
        log.error("ai_backend_unavailable reason=%s", reason)
    return ManualClassifier(), f"mode manuel : {reason}"


def init_ai(app: Flask) -> None:
    classifier, status = _build_classifier(app)
    app.extensions[_EXTENSION_KEY] = AiService(classifier, status)
    app.logger.info("ai_ready mode=%s status=%s", classifier.mode, status)


def get_ai() -> AiService:
    return current_app.extensions[_EXTENSION_KEY]


def suggested_category(category: str | None, confidence: float | None) -> str | None:
    """La catégorie n'est présélectionnée que si la confiance atteint le seuil (60 %)."""
    if category is None or confidence is None:
        return None
    threshold = current_app.config["AI_CONFIDENCE_THRESHOLD"]
    return category if confidence >= threshold else None


def prediction_to_dict(prediction: Prediction, *, include_scores: bool = True) -> dict:
    data = {
        "mode": prediction.mode,
        "category": prediction.category,
        "confidence": prediction.confidence,
        "suggested_category": suggested_category(prediction.category, prediction.confidence),
        "model_version": prediction.model_version,
        "label": AI_MODE_LABELS[prediction.mode],
    }
    if include_scores:
        data["threshold"] = current_app.config["AI_CONFIDENCE_THRESHOLD"]
        data["scores"] = prediction.scores
    return data


def is_ai_mode(mode: str) -> bool:
    """Seuls ces modes comptent dans les statistiques de performance de l'IA."""
    return mode in (AiMode.MODEL, AiMode.PROTOTYPE)
