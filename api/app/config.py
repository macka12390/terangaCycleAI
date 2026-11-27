"""Configuration lue dans l'environnement (fichier `.env` facultatif, jamais versionné)."""

import os
import secrets
from pathlib import Path

API_DIR = Path(__file__).resolve().parent.parent


def _env_list(name: str, default: str) -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


class Config:
    # Vide : clé générée une fois dans instance/secret_key (voir load_secret_key).
    SECRET_KEY = os.environ.get("SECRET_KEY") or None
    # Vide : SQLite dans instance/terangacycle.db.
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL") or None
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER") or str(API_DIR / "uploads")
    # Limite de la requête entière (photo + champs) ; la photo seule est limitée à 8 Mo.
    MAX_CONTENT_LENGTH = 12 * 1024 * 1024
    MAX_IMAGE_BYTES = 8 * 1024 * 1024
    # Note vocale : 30 s d'Opus pèsent ~100 Ko ; 2 Mo laissent de la marge (WAV, MP4).
    MAX_VOICE_BYTES = 2 * 1024 * 1024
    IMAGE_MAX_SIDE = 1600
    IMAGE_JPEG_QUALITY = 82

    CORS_ORIGINS = _env_list("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")

    # auto : CLIP si les dépendances et le modèle local sont présents, sinon manuel.
    AI_BACKEND = os.environ.get("AI_BACKEND", "auto").strip().lower()
    AI_MODEL_DIR = os.environ.get("AI_MODEL_DIR") or str(
        API_DIR / "instance" / "models" / "clip-vit-base-patch32"
    )
    AI_CONFIDENCE_THRESHOLD = float(os.environ.get("AI_CONFIDENCE_THRESHOLD", "0.6"))

    AUTH_TOKEN_MAX_AGE = 7 * 24 * 3600


class TestConfig(Config):
    TESTING = True
    SECRET_KEY = "test-secret-key"  # noqa: S105  (clé de test, jamais utilisée hors pytest)
    AI_BACKEND = "manual"


def load_secret_key(instance_path: str) -> str:
    """Clé de signature persistée dans instance/secret_key (créée au premier démarrage).

    Persistée pour que les jetons de démo survivent au rechargement du serveur ; le dossier
    instance/ est hors Git.
    """
    path = Path(instance_path) / "secret_key"
    if path.is_file():
        key = path.read_text(encoding="utf-8").strip()
        if key:
            return key
    key = secrets.token_urlsafe(48)
    path.write_text(key, encoding="utf-8")
    return key
