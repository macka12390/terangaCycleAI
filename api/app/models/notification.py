from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.extensions import db
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.report import Report
    from app.models.user import User

NOTIFICATION_STATUSES = ("pending", "sent", "failed", "skipped")


class Notification(db.Model):
    """SMS à envoyer (file d'attente) puis journal des envois.

    Enregistré dans la même transaction que l'action qui le déclenche : si l'action est
    annulée, aucun SMS ne part. Envoyé juste après la requête ; relancé par
    `flask --app run send-notifications` en cas d'échec du fournisseur.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'sent', 'failed', 'skipped')", name="ck_notifications_status"
        ),
        Index("ix_notifications_status", "status", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    report_id: Mapped[int | None] = mapped_column(ForeignKey("reports.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    # Numéro au moment de l'envoi (NULL : compte sans numéro, SMS non envoyé).
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    # Raison d'un SMS non envoyé (no_phone, opted_out) ou type d'erreur du fournisseur.
    detail: Mapped[str | None] = mapped_column(String(120), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship()
    report: Mapped["Report | None"] = relationship()
