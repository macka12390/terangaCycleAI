"""Données de démonstration, clairement identifiées (`is_demo = True`, badge « Démo »).

Les signalements passent par les vrais services métier (création, validation, acceptation,
preuve, vérification) : le journal et les statuts sont donc cohérents. Les photos sont des
images de substitution portant la mention « PHOTO DE DÉMONSTRATION ». Aucune prédiction IA
n'est simulée : les signalements de démo sont en mode « manuel ».
"""

import io
import unicodedata
from datetime import timedelta

from PIL import Image, ImageDraw, ImageFont
from werkzeug.datastructures import FileStorage

from app.constants import CATEGORIES, AiMode
from app.extensions import db
from app.models import CollectionProof, Mission, Report, StatusEvent, User
from app.services import missions as mission_service
from app.services import proofs as proof_service
from app.services import reports as report_service
from app.utils.images import delete_image

COLORS = {
    "plastic": (37, 99, 235),
    "metal": (100, 116, 139),
    "paper": (180, 83, 9),
    "glass": (13, 148, 136),
    "organic": (22, 101, 52),
}

# (quartier, latitude, longitude, catégorie, étape finale, poids kg, jours écoulés)
DEMO_SITES = (
    ("Médina", 14.6845, -17.4530, "plastic", "verified", 42.5, 6),
    ("Grand Yoff", 14.7362, -17.4610, "metal", "verified", 18.0, 4),
    ("Parcelles Assainies", 14.7660, -17.4430, "paper", "verified", 25.0, 2),
    ("HLM", 14.7115, -17.4450, "glass", "proof", 30.0, 1),
    ("Ouakam", 14.7240, -17.4900, "plastic", "accepted", None, 1),
    # Pikine et Guédiawaye : zone de l'UCG Pikine-Guédiawaye (démo), autre organisation.
    ("Pikine", 14.7540, -17.3920, "organic", "approved", None, 0),
    ("Yoff", 14.7560, -17.4840, "plastic", "pending", None, 0),
    ("Guédiawaye", 14.7790, -17.3960, "organic", "pending", None, 0),
    ("Liberté 6", 14.7270, -17.4630, None, "pending", None, 0),
    ("Plateau", 14.6700, -17.4380, "paper", "rejected", None, 3),
)


# Polices système avec accents (Windows, macOS, Linux) ; sinon texte sans accents.
FONT_CANDIDATES = ("arialbd.ttf", "arial.ttf", "Arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf")


def _font(size: int) -> tuple[ImageFont.ImageFont, bool]:
    """Police et indicateur « gère les accents » (la police par défaut de Pillow ne les a pas)."""
    for name in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(name, size), True
        except OSError:
            continue
    return ImageFont.load_default(size=size), False


def _ascii(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def _placeholder(title: str, subtitle: str, category: str | None) -> FileStorage:
    image = Image.new("RGB", (960, 720), COLORS.get(category, (71, 85, 105)))
    draw = ImageDraw.Draw(image)
    big, accents = _font(56)
    small, _ = _font(34)
    text = (lambda value: value) if accents else _ascii
    draw.rectangle((40, 40, 920, 680), outline=(255, 255, 255), width=6)
    draw.text((80, 250), text("PHOTO DE DÉMONSTRATION"), fill=(255, 255, 255), font=big)
    draw.text((80, 340), text(title), fill=(255, 255, 255), font=small)
    draw.text((80, 395), text(subtitle), fill=(230, 230, 230), font=small)
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=85)
    buffer.seek(0)
    return FileStorage(stream=buffer, filename="demo.jpg", content_type="image/jpeg")


def _user(login: str) -> User:
    return User.query.filter_by(demo_login=login).one()


def _shift_back(report: Report, days: int) -> None:
    """Recule les dates d'un signalement de démo pour donner une frise sur plusieurs jours."""
    if days <= 0:
        return
    delta = timedelta(days=days)
    for obj, fields in (
        (report, ("created_at", "updated_at", "moderated_at")),
        (report.mission, ("created_at", "updated_at", "accepted_at", "started_at", "completed_at")),
    ):
        if obj is None:
            continue
        for field in fields:
            value = getattr(obj, field)
            if value is not None:
                setattr(obj, field, value - delta)
    if report.mission:
        for proof in report.mission.proofs:
            proof.created_at -= delta
            if proof.verified_at:
                proof.verified_at -= delta
    for event in StatusEvent.query.filter_by(report_id=report.id):
        event.created_at -= delta


def seed_demo() -> int:
    if Report.query.filter_by(is_demo=True).first() is not None:
        return 0
    citizen = _user("citoyen-demo")
    # Le super admin modère toutes les organisations ; le collecteur de démo n'intervient
    # que dans l'organisation principale.
    admin = _user("superadmin-demo")
    collector = _user("collecteur-demo")

    for district, lat, lng, category, stage, weight, days in DEMO_SITES:
        label = CATEGORIES.get(category, "Non classé")
        form = {
            "latitude": str(lat),
            "longitude": str(lng),
            "comment": f"[DÉMO] Dépôt sauvage — {district}",
        }
        if category:
            form["citizen_category"] = category
        photo = _placeholder(f"Dépôt — {district}", f"Catégorie : {label}", category)
        report, _, _ = report_service.create_report(form, {"photo": photo}, citizen)

        # Démo : aucune prédiction IA simulée.
        report.is_demo = True
        report.ai_mode = AiMode.MANUAL
        report.ai_category = None
        report.ai_confidence = None
        report.ai_model_version = None
        db.session.commit()

        if stage == "rejected":
            report_service.moderate(
                report.id, admin, {"action": "reject", "reason": "[DÉMO] Photo floue"}
            )
        elif stage != "pending":
            _, mission = report_service.moderate(
                report.id, admin, {"action": "approve", "final_category": category}
            )
            if stage in ("accepted", "proof", "verified"):
                mission_service.accept(mission.id, collector)
                mission_service.start(mission.id, collector)
            if stage in ("proof", "verified"):
                after = _placeholder(f"Après collecte — {district}", f"{weight:g} kg", category)
                proof, _ = mission_service.submit_proof(
                    mission.id,
                    collector,
                    {"weight_kg": str(weight), "comment": "[DÉMO] Sacs déposés au point de tri"},
                    {"photo": after},
                )
                if stage == "verified":
                    proof_service.verify(proof.id, admin, {"decision": "verified"})

        _shift_back(db.session.get(Report, report.id), days)
        db.session.commit()
    return len(DEMO_SITES)


def clear_demo() -> int:
    reports = Report.query.filter_by(is_demo=True).all()
    for report in reports:
        StatusEvent.query.filter_by(report_id=report.id).delete()
        if report.mission:
            for proof in report.mission.proofs:
                delete_image(proof.after_photo_path)
            CollectionProof.query.filter_by(mission_id=report.mission.id).delete()
            Mission.query.filter_by(id=report.mission.id).delete()
        delete_image(report.photo_path)
        delete_image(report.voice_path)
        db.session.delete(report)
    db.session.commit()
    return len(reports)
