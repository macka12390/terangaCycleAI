"""Classificateur CLIP zéro-shot, 100 % local (mode « prototype »).

CLIP compare l'image à des descriptions textuelles de chaque catégorie, sans entraînement.
Les poids (openai/clip-vit-base-patch32, licence MIT) sont lus sur le disque uniquement
(`local_files_only=True`) : aucune requête réseau à l'exécution, aucune API étrangère.

Résultat présenté comme « prototype » : il n'a pas été évalué sur des photos de dépôts
sénégalais, et son score de confiance n'est pas une probabilité calibrée.
"""

import threading
from pathlib import Path

from PIL import Image

from app.ai.base import Prediction
from app.constants import CATEGORIES, AiMode

MODEL_VERSION = "clip-vit-base-patch32-zeroshot-v2"

# Plusieurs formulations par catégorie : leur moyenne rend le zéro-shot plus stable.
# v2 (27/11/2026) : descriptions qui séparent le plastique transparent (fin, écrasé) du
# verre (épais, vert ou brun). Sur les 55 photos d'évaluation : 82 % → 87 %, plastique
# 8/12 → 11/12. Peu de photos : tendance, pas mesure fiable (scripts/evaluate_model.py).
PROMPTS: dict[str, tuple[str, ...]] = {
    "plastic": (
        "a photo of plastic waste",
        "a pile of plastic bottles and plastic bags",
        "crushed transparent plastic water bottles",
        "plastic packaging, wrappers and containers",
    ),
    "metal": (
        "a photo of metal waste",
        "a pile of scrap metal and rusty cans",
        "discarded aluminium cans and metal pieces",
        "rusty metal cans, tins and scrap iron",
    ),
    "paper": (
        "a photo of paper and cardboard waste",
        "a pile of cardboard boxes and old paper",
        "discarded newspapers and cardboard on the ground",
        "crumpled paper, flattened cardboard boxes and paper bags",
    ),
    "glass": (
        "a photo of glass waste",
        "thick green and brown glass bottles",
        "broken glass shards",
        "empty glass jars and wine bottles",
    ),
    "organic": (
        "a photo of organic waste",
        "a pile of food scraps, fruit peels and plant waste",
        "rotting vegetables and green garden waste",
    ),
}


def dependencies_available() -> bool:
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
    except ImportError:
        return False
    return True


def _as_tensor(features):
    """transformers < 5 renvoie un tenseur ; >= 5 un objet dont pooler_output est projeté."""
    return getattr(features, "pooler_output", features)


def model_files_present(model_dir: str) -> bool:
    path = Path(model_dir)
    return (path / "config.json").is_file() and any(
        (path / name).is_file() for name in ("model.safetensors", "pytorch_model.bin")
    )


class ClipZeroShotClassifier:
    mode = AiMode.PROTOTYPE
    model_version = MODEL_VERSION

    def __init__(self, model_dir: str):
        import torch
        from transformers import CLIPModel, CLIPProcessor

        self._torch = torch
        self._lock = threading.Lock()
        self._model = CLIPModel.from_pretrained(model_dir, local_files_only=True).eval()
        self._processor = CLIPProcessor.from_pretrained(model_dir, local_files_only=True)
        self._categories = list(CATEGORIES)
        self._text_features = self._encode_prompts()

    def _encode_prompts(self):
        torch = self._torch
        features = []
        with torch.no_grad():
            for category in self._categories:
                inputs = self._processor(
                    text=list(PROMPTS[category]), return_tensors="pt", padding=True
                )
                embeddings = _as_tensor(self._model.get_text_features(**inputs))
                embeddings = embeddings / embeddings.norm(dim=-1, keepdim=True)
                mean = embeddings.mean(dim=0)
                features.append(mean / mean.norm())
        return torch.stack(features)

    def classify(self, image: Image.Image) -> Prediction:
        torch = self._torch
        with self._lock, torch.no_grad():
            inputs = self._processor(images=image.convert("RGB"), return_tensors="pt")
            image_features = _as_tensor(self._model.get_image_features(**inputs))
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            logits = self._model.logit_scale.exp() * image_features @ self._text_features.T
            probabilities = logits.softmax(dim=-1)[0].tolist()
        scores = {
            category: round(float(probability), 4)
            for category, probability in zip(self._categories, probabilities, strict=True)
        }
        best = max(scores, key=scores.get)
        return Prediction(
            mode=self.mode,
            category=best,
            confidence=scores[best],
            scores=scores,
            model_version=self.model_version,
        )
