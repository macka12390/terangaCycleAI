from datetime import datetime

from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import ROLES
from app.extensions import db
from app.models._sql import in_list
from app.utils.time import utcnow

if TYPE_CHECKING:
    from app.models.organisation import Organisation


class User(db.Model):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(in_list("role", ROLES), name="ck_users_role"),
        # Un compte réel a un téléphone, un compte de démo un identifiant : au moins l'un des deux.
        CheckConstraint(
            "phone IS NOT NULL OR demo_login IS NOT NULL", name="ck_users_identity"
        ),
        Index("uq_users_phone", "phone", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Comptes de démonstration seulement (sélection sans code) ; NULL pour un compte réel.
    demo_login: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    # Comptes réels : numéro au format E.164 (+2217XXXXXXXX), connexion par code SMS.
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # Admins et collecteurs : organisation dont ils traitent les signalements.
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisations.id"), nullable=True
    )
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Compte suspendu : plus de connexion, jetons refusés, missions en cours libérées.
    # server_default : les lignes existantes sont actives lors de la mise à niveau.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    suspended_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    organisation: Mapped["Organisation | None"] = relationship()
