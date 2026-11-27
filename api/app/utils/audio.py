"""Notes vocales des citoyens (wolof ou français, 30 s max côté application).

Le format est reconnu par la signature des octets, jamais par le nom du fichier : le
navigateur envoie toujours `note.webm`, alors que Safari enregistre en MP4.
"""

import uuid
from dataclasses import dataclass
from pathlib import Path

from flask import current_app
from werkzeug.datastructures import FileStorage

from app.utils.errors import ApiError, validation_error


@dataclass(frozen=True)
class AudioFormat:
    extension: str
    mimetype: str


WEBM = AudioFormat("webm", "audio/webm")
OGG = AudioFormat("ogg", "audio/ogg")
MP4 = AudioFormat("m4a", "audio/mp4")
WAV = AudioFormat("wav", "audio/wav")
MP3 = AudioFormat("mp3", "audio/mpeg")

MIMETYPES = {fmt.extension: fmt.mimetype for fmt in (WEBM, OGG, MP4, WAV, MP3)}


def detect_format(head: bytes) -> AudioFormat | None:
    if head.startswith(b"\x1a\x45\xdf\xa3"):  # EBML : WebM / Matroska (Chrome, Firefox)
        return WEBM
    if head.startswith(b"OggS"):
        return OGG
    if head[4:8] == b"ftyp":  # conteneur MP4 (Safari)
        return MP4
    if head.startswith(b"RIFF") and head[8:12] == b"WAVE":
        return WAV
    if head.startswith(b"ID3") or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0):
        return MP3
    return None


@dataclass(frozen=True)
class VoiceNote:
    data: bytes
    format: AudioFormat


def read_voice(file: FileStorage | None, field: str = "voice") -> VoiceNote | None:
    """Note vocale facultative : None si absente ; 400, 413 ou 415 si invalide."""
    if file is None:
        return None
    max_bytes = current_app.config["MAX_VOICE_BYTES"]
    data = file.stream.read(max_bytes + 1)
    if not data:
        raise validation_error("La note vocale est vide.", field)
    if len(data) > max_bytes:
        raise ApiError(413, "FILE_TOO_LARGE", "La note vocale est trop longue (2 Mo maximum).")
    audio_format = detect_format(data[:16])
    if audio_format is None:
        raise ApiError(
            415, "UNSUPPORTED_FILE", "La note vocale doit être un enregistrement audio."
        )
    return VoiceNote(data=data, format=audio_format)


def store_voice(note: VoiceNote) -> str:
    folder = Path(current_app.config["UPLOAD_FOLDER"]) / "voices"
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{note.format.extension}"
    (folder / name).write_bytes(note.data)
    return f"voices/{name}"
