from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    true,
)
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import CATEGORIES
from app.extensions import db
from app.models._sql import in_list
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.lot import Lot
    from app.models.organisation import Organisation
    from app.models.proof import CollectionProof
    from app.models.user import User

PAYMENT_KINDS = ("collector_reward", "lot_payment")
PAYMENT_STATUSES = ("pending", "processing", "succeeded", "failed")


class Tariff(db.Model):
    """Rémunération des collecteurs d'une organisation, en francs CFA par kilo vérifié."""

    __tablename__ = "tariffs"
    __table_args__ = (
        UniqueConstraint("organisation_id", "category", name="uq_tariffs_org_category"),
        CheckConstraint(in_list("category", CATEGORIES), name="ck_tariffs_category"),
        CheckConstraint("price_per_kg >= 0", name="ck_tariffs_price"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organisation_id: Mapped[int] = mapped_column(ForeignKey("organisations.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    price_per_kg: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )


class Payment(db.Model):
    """Paiement mobile money (étape 6), simulé tant qu'aucun vrai fournisseur n'est branché.

    - collector_reward : l'organisation rémunère un collecteur pour une preuve vérifiée ;
    - lot_payment : un recycleur paie un collecteur pour un lot.
    Cycle : pending → processing → succeeded | failed (un échec peut être relancé).
    """

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(in_list("kind", PAYMENT_KINDS), name="ck_payments_kind"),
        CheckConstraint(in_list("status", PAYMENT_STATUSES), name="ck_payments_status"),
        CheckConstraint("amount_fcfa > 0", name="ck_payments_amount"),
        CheckConstraint(
            "(kind = 'collector_reward' AND proof_id IS NOT NULL) "
            "OR (kind = 'lot_payment' AND lot_id IS NOT NULL)",
            name="ck_payments_source",
        ),
        # Une seule rémunération par preuve vérifiée.
        Index("uq_payments_proof", "proof_id", unique=True, sqlite_where=sql_text("proof_id IS NOT NULL")),
        # Un seul paiement vivant par lot (un échec peut être suivi d'un nouvel essai).
        Index(
            "uq_payments_lot_active", "lot_id", unique=True,
            sqlite_where=sql_text("lot_id IS NOT NULL AND status != 'failed'"),
        ),
        Index("ix_payments_status", "status", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    amount_fcfa: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    price_per_kg: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    # Bénéficiaire : toujours un collecteur.
    payee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    # Payeur : une organisation (rémunération) ou un recycleur (lot).
    organisation_id: Mapped[int | None] = mapped_column(ForeignKey("organisations.id"), nullable=True)
    payer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    proof_id: Mapped[int | None] = mapped_column(ForeignKey("collection_proofs.id"), nullable=True)
    lot_id: Mapped[int | None] = mapped_column(ForeignKey("lots.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    is_simulated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    provider_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Admin qui a déclenché le versement, ou recycleur qui a payé.
    initiated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    payee: Mapped["User"] = relationship(foreign_keys=[payee_id])
    payer: Mapped["User | None"] = relationship(foreign_keys=[payer_id])
    initiator: Mapped["User | None"] = relationship(foreign_keys=[initiated_by])
    organisation: Mapped["Organisation | None"] = relationship()
    proof: Mapped["CollectionProof | None"] = relationship()
    lot: Mapped["Lot | None"] = relationship()
