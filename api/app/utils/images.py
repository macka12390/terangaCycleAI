"""Contrôle et enregistrement des photos.

Chaque photo est ouverte par Pillow (le type réel compte, pas l'extension), redressée selon
son orientation EXIF, réduite (1600 px max) puis ré-encodée en JPEG **sans aucune
métadonnée** : le GPS et le modèle d'appareil du téléphone ne sont jamais conservés.
"""

import hashlib
import io
import uuid
from dataclasses import dataclass
from pathlib import Path

from flask import current_app
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.datastructures import FileStorage

from app.utils.errors import ApiError, validation_error

ALLOWED_FORMATS = {"JPEG", "MPO", "PNG", "WEBP"}
# Garde contre les « bombes de décompression » (images minuscules en octets, géantes en pixels).
MAX_PIXELS = 50_000_000


@dataclass
class ProcessedImage:
    image: Image.Image  # image RGB normalisée, prête pour la classification
    jpeg_bytes: bytes  # ré-encodage JPEG sans métadonnées
    source_sha256: str  # empreinte des octets reçus (clé du cache de classification)


def _unsupported() -> ApiError:
    return ApiError(415, "UNSUPPORTED_FILE", "Le fichier doit être une photo JPEG, PNG ou WebP.")


def read_photo(file: FileStorage | None, field: str = "photo") -> ProcessedImage:
    if file is None:
        raise validation_error("La photo est obligatoire.", field)
    max_bytes = current_app.config["MAX_IMAGE_BYTES"]
    raw = file.stream.read(max_bytes + 1)
    if not raw:
        raise validation_error("La photo est vide.", field)
    if len(raw) > max_bytes:
        raise ApiError(413, "FILE_TOO_LARGE", "La photo dépasse la taille maximale (8 Mo).")

    try:
        with Image.open(io.BytesIO(raw)) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise _unsupported()
            width, height = probe.size
            if width * height > MAX_PIXELS:
                raise _unsupported()
            probe.load()
            image = ImageOps.exif_transpose(probe)
            image = image.convert("RGB")
    except ApiError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise _unsupported() from None

    max_side = current_app.config["IMAGE_MAX_SIDE"]
    image.thumbnail((max_side, max_side))

    buffer = io.BytesIO()
    # Aucun paramètre exif= : le JPEG écrit ne contient aucune métadonnée.
    image.save(buffer, "JPEG", quality=current_app.config["IMAGE_JPEG_QUALITY"], optimize=True)
    return ProcessedImage(
        image=image,
        jpeg_bytes=buffer.getvalue(),
        source_sha256=hashlib.sha256(raw).hexdigest(),
    )


def store_image(processed: ProcessedImage, subdir: str) -> str:
    """Écrit la photo sous UPLOAD_FOLDER/<subdir>/ ; renvoie le chemin relatif (`reports/x.jpg`)."""
    folder = Path(current_app.config["UPLOAD_FOLDER"]) / subdir
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.jpg"
    (folder / name).write_bytes(processed.jpeg_bytes)
    return f"{subdir}/{name}"


def delete_image(relative_path: str | None) -> None:
    if not relative_path:
        return
    path = Path(current_app.config["UPLOAD_FOLDER"]) / relative_path
    try:
        path.unlink(missing_ok=True)
    except OSError:
        current_app.logger.warning("image_delete_failed")


def photo_url(relative_path: str | None) -> str | None:
    if not relative_path:
        return None
    return f"/api/uploads/{relative_path}"
