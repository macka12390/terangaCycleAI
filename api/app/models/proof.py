from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import PROOF_STATUS_LABELS, ProofStatus
from app.extensions import db
from app.models._sql import in_list
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.mission import Mission
    from app.models.user import User


class CollectionProof(db.Model):
    __tablename__ = "collection_proofs"
    __table_args__ = (
        CheckConstraint(in_list("status", PROOF_STATUS_LABELS), name="ck_proofs_status"),
        CheckConstraint("collected_weight_kg > 0", name="ck_proofs_weight_positive"),
        # Au plus une preuve « vivante » (non rejetée) par mission ; une preuve rejetée
        # peut être remplacée par une nouvelle.
        Index(
            "uq_proofs_active_per_mission",
            "mission_id",
            unique=True,
            sqlite_where=sql_text("status != 'rejected'"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id"), nullable=False)
    collector_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    after_photo_path: Mapped[str] = mapped_column(String(255), nullable=False)
    collected_weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=ProofStatus.PENDING)
    verified_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    mission: Mapped["Mission"] = relationship(back_populates="proofs")
    collector: Mapped["User"] = relationship(foreign_keys=[collector_id])
    verifier: Mapped["User | None"] = relationship(foreign_keys=[verified_by])
