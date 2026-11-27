import io

import pytest
from PIL import Image

from app import create_app
from app.config import TestConfig


@pytest.fixture()
def app(tmp_path):
    app = create_app(
        TestConfig,
        {
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
            "UPLOAD_FOLDER": str(tmp_path / "uploads"),
        },
    )
    yield app
    from app.extensions import db

    with app.app_context():
        db.session.remove()
        db.engine.dispose()


@pytest.fixture()
def default_org(app):
    """Id de l'organisation principale (Dakar), créée au démarrage."""
    from app.services.organisations import ensure_default_organisation

    with app.app_context():
        return ensure_default_organisation().id


@pytest.fixture()
def client(app):
    return app.test_client()


def jpeg_bytes(color=(200, 30, 30), size=(64, 48), exif: bytes | None = None) -> bytes:
    buffer = io.BytesIO()
    image = Image.new("RGB", size, color)
    if exif is not None:
        image.save(buffer, "JPEG", exif=exif)
    else:
        image.save(buffer, "JPEG")
    return buffer.getvalue()


def photo(data: bytes | None = None, name="photo.jpg"):
    return (io.BytesIO(data or jpeg_bytes()), name)


class Api:
    """Petit client : connexion aux comptes de démo et en-têtes."""

    def __init__(self, client):
        self.client = client
        self._tokens = {}

    def token(self, login):
        if login not in self._tokens:
            response = self.client.post("/api/auth/demo", json={"login": login})
            assert response.status_code == 200, response.get_json()
            self._tokens[login] = response.get_json()["token"]
        return self._tokens[login]

    def headers(self, login):
        return {"Authorization": f"Bearer {self.token(login)}"}

    def create_report(self, login=None, **fields):
        data = {"latitude": "14.7167", "longitude": "-17.4677", "photo": photo()}
        data.update(fields)
        headers = self.headers(login) if login else {}
        return self.client.post(
            "/api/reports", data=data, headers=headers, content_type="multipart/form-data"
        )

    def moderate(self, report_id, login="admin-demo", **body):
        return self.client.patch(
            f"/api/reports/{report_id}/moderate", json=body, headers=self.headers(login)
        )

    def accept(self, mission_id, login="collecteur-demo"):
        return self.client.post(f"/api/missions/{mission_id}/accept", headers=self.headers(login))

    def proof(self, mission_id, login="collecteur-demo", weight="23.5", **fields):
        data = {"weight_kg": weight, "photo": photo()}
        data.update(fields)
        return self.client.post(
            f"/api/missions/{mission_id}/proof",
            data=data,
            headers=self.headers(login),
            content_type="multipart/form-data",
        )

    def verify(self, proof_id, decision, login="admin-demo", **body):
        return self.client.patch(
            f"/api/proofs/{proof_id}/verify",
            json={"decision": decision, **body},
            headers=self.headers(login),
        )

    def stats(self):
        response = self.client.get("/api/dashboard/stats", headers=self.headers("admin-demo"))
        assert response.status_code == 200
        return response.get_json()["stats"]

    def approved_mission(self, category="plastic"):
        report = self.create_report().get_json()["report"]
        body = self.moderate(report["id"], action="approve", final_category=category).get_json()
        return report, body["mission"]


@pytest.fixture()
def api(client):
    return Api(client)
