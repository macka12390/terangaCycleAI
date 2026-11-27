from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import AI_MODE_LABELS, CATEGORIES, REPORT_STATUS_LABELS, ReportStatus
from app.extensions import db
from app.models._sql import in_list
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.mission import Mission
    from app.models.user import User


class Report(db.Model):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(in_list("status", REPORT_STATUS_LABELS), name="ck_reports_status"),
        CheckConstraint(in_list("ai_mode", AI_MODE_LABELS), name="ck_reports_ai_mode"),
        CheckConstraint(in_list("ai_category", CATEGORIES, nullable=True), name="ck_reports_ai_cat"),
        CheckConstraint(
            in_list("citizen_category", CATEGORIES, nullable=True), name="ck_reports_citizen_cat"
        ),
        CheckConstraint(
            in_list("final_category", CATEGORIES, nullable=True), name="ck_reports_final_cat"
        ),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="ck_reports_latitude"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="ck_reports_longitude"),
        CheckConstraint(
            "ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)",
            name="ck_reports_ai_confidence",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tracking_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    # Identifiant généré par le client : un renvoi (hors ligne) ne crée pas de doublon.
    client_uuid: Mapped[str | None] = mapped_column(String(36), unique=True, nullable=True)

    photo_path: Mapped[str] = mapped_column(String(255), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Note vocale facultative du citoyen (wolof ou français), chemin sous UPLOAD_FOLDER.
    voice_path: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Proposition de l'IA, telle que calculée par le serveur (mode toujours renseigné).
    ai_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    ai_category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_model_version: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # Choix ou correction du citoyen, puis décision humaine définitive (admin).
    citizen_category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    final_category: Mapped[str | None] = mapped_column(String(20), nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default=ReportStatus.PENDING)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    moderated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    moderated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    user: Mapped["User | None"] = relationship(foreign_keys=[user_id])
    moderator: Mapped["User | None"] = relationship(foreign_keys=[moderated_by])
    mission: Mapped["Mission | None"] = relationship(back_populates="report", uselist=False)
