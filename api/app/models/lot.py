from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import CATEGORIES, LOT_STATUS_LABELS
from app.extensions import db
from app.models._sql import in_list
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.organisation import Organisation
    from app.models.user import User


class Lot(db.Model):
    """Lot de matière mis en vente par un collecteur (étape 5, marketplace).

    Son poids est prélevé sur le stock vérifié du collecteur : kilos de ses preuves
    vérifiées par un admin, pour cette matière, moins ses lots non annulés. Un recycleur
    le réserve, puis le collecteur le remet : la matière est tracée jusqu'au recyclage.
    """

    __tablename__ = "lots"
    __table_args__ = (
        CheckConstraint(in_list("status", LOT_STATUS_LABELS), name="ck_lots_status"),
        CheckConstraint(in_list("category", CATEGORIES), name="ck_lots_category"),
        CheckConstraint("weight_kg > 0", name="ck_lots_weight"),
        CheckConstraint("price_per_kg IS NULL OR price_per_kg >= 0", name="ck_lots_price"),
        CheckConstraint(
            "status = 'available' OR status = 'cancelled' OR recycler_id IS NOT NULL",
            name="ck_lots_recycler",
        ),
        Index("ix_lots_status", "status", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    collector_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    organisation_id: Mapped[int | None] = mapped_column(ForeignKey("organisations.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    # Prix indicatif en francs CFA par kilo (facultatif : à négocier).
    price_per_kg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="available")
    recycler_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reserved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    handed_over_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    collector: Mapped["User"] = relationship(foreign_keys=[collector_id])
    recycler: Mapped["User | None"] = relationship(foreign_keys=[recycler_id])
    organisation: Mapped["Organisation | None"] = relationship()
