from dataclasses import dataclass
from typing import Protocol

from PIL import Image

from app.constants import AiMode


@dataclass(frozen=True)
class Prediction:
    mode: str
    category: str | None
    confidence: float | None
    scores: dict[str, float] | None
    model_version: str | None

    @classmethod
    def manual(cls) -> "Prediction":
        return cls(mode=AiMode.MANUAL, category=None, confidence=None, scores=None, model_version=None)


class Classifier(Protocol):
    mode: str
    model_version: str | None

    def classify(self, image: Image.Image) -> Prediction: ...


class ManualClassifier:
    """Aucune IA : renvoie une prédiction vide, explicitement marquée « manuel »."""

    mode = AiMode.MANUAL
    model_version = None

    def classify(self, image: Image.Image) -> Prediction:
        return Prediction.manual()
