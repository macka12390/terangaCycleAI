from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.user import User

ENTITIES = ("report", "mission", "proof")


class StatusEvent(db.Model):
    """Journal append-only : chaque décision et chaque changement de statut y est inscrit."""

    __tablename__ = "status_events"
    __table_args__ = (
        CheckConstraint("entity IN ('report', 'mission', 'proof')", name="ck_events_entity"),
        Index("ix_events_report", "report_id", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # Signalement d'origine, pour reconstituer la frise de suivi d'un dépôt.
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    actor: Mapped["User | None"] = relationship()
