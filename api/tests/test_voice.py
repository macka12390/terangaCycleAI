"""Note vocale du citoyen (wolof ou français) : reçue, stockée, servie à l'admin."""

import io
from pathlib import Path

WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 400
MP4 = b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 400
OGG = b"OggS" + b"\x00" * 400


def voice(data: bytes, name: str = "note.webm"):
    return (io.BytesIO(data), name)


def test_report_with_voice_note_is_stored_and_served(api, app):
    created = api.create_report(login="citoyen-demo", voice=voice(WEBM))
    assert created.status_code == 201
    url = created.get_json()["report"]["voice_url"]
    assert url.startswith("/api/uploads/voices/") and url.endswith(".webm")

    served = api.client.get(url)
    assert served.status_code == 200
    assert served.mimetype == "audio/webm"
    assert served.data == WEBM
    served.close()

    # L'admin la retrouve dans la file de modération.
    listing = api.client.get("/api/reports?status=pending", headers=api.headers("admin-demo"))
    assert listing.get_json()["reports"][0]["voice_url"] == url


def test_format_comes_from_content_not_filename(api):
    # Safari enregistre du MP4, mais le navigateur l'envoie sous le nom note.webm.
    url = api.create_report(voice=voice(MP4)).get_json()["report"]["voice_url"]
    assert url.endswith(".m4a")
    served = api.client.get(url)
    assert served.mimetype == "audio/mp4"
    served.close()
    assert api.create_report(voice=voice(OGG)).get_json()["report"]["voice_url"].endswith(".ogg")


def test_report_without_voice_has_no_voice_url(api):
    assert api.create_report().get_json()["report"]["voice_url"] is None


def test_invalid_voice_is_refused_and_leaves_no_file(api, app):
    not_audio = api.create_report(voice=voice(b"<html>pas un son</html>"))
    assert not_audio.status_code == 415
    assert not_audio.get_json()["error"]["code"] == "UNSUPPORTED_FILE"

    empty = api.create_report(voice=voice(b""))
    assert empty.status_code == 400
    assert empty.get_json()["error"]["details"]["field"] == "voice"

    too_big = api.create_report(voice=voice(b"\x1a\x45\xdf\xa3" + b"\x00" * (2 * 1024 * 1024)))
    assert too_big.status_code == 413

    uploads = Path(app.config["UPLOAD_FOLDER"])
    assert list((uploads / "reports").iterdir()) == []
    assert list((uploads / "voices").iterdir()) == []
    listing = api.client.get("/api/reports", headers=api.headers("admin-demo")).get_json()
    assert listing["total"] == 0


def test_old_database_gets_the_voice_column(app):
    from sqlalchemy import text

    from app.extensions import db
    from app.schema import upgrade_schema

    with app.app_context():
        db.session.execute(text("ALTER TABLE reports DROP COLUMN voice_path"))
        db.session.commit()
        assert upgrade_schema() == ["reports.voice_path"]
        assert upgrade_schema() == []  # idempotent
        columns = [row[1] for row in db.session.execute(text("PRAGMA table_info(reports)"))]
        assert "voice_path" in columns
