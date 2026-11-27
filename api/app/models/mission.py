from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import MISSION_STATUS_LABELS, MissionStatus
from app.extensions import db
from app.models._sql import in_list
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.proof import CollectionProof
    from app.models.report import Report
    from app.models.user import User


class Mission(db.Model):
    __tablename__ = "missions"
    __table_args__ = (
        CheckConstraint(in_list("status", MISSION_STATUS_LABELS), name="ck_missions_status"),
        # Une mission acceptée ou terminée a toujours un collecteur.
        CheckConstraint(
            "status IN ('available', 'cancelled') OR collector_id IS NOT NULL",
            name="ck_missions_collector",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # unique : un signalement validé ne produit qu'une seule mission.
    report_id: Mapped[int] = mapped_column(ForeignKey("reports.id"), unique=True, nullable=False)
    collector_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=MissionStatus.AVAILABLE
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    report: Mapped["Report"] = relationship(back_populates="mission")
    collector: Mapped["User | None"] = relationship()
    proofs: Mapped[list["CollectionProof"]] = relationship(
        back_populates="mission", order_by="CollectionProof.id"
    )

    @property
    def latest_proof(self) -> "CollectionProof | None":
        return self.proofs[-1] if self.proofs else None
