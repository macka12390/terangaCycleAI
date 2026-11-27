from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, Integer, String, false, true
from sqlalchemy.orm import Mapped, mapped_column

from app.constants import ORGANISATION_KINDS
from app.extensions import db
from app.models._sql import in_list
from app.utils.time import utcnow


class Organisation(db.Model):
    """Structure qui traite les signalements d'une zone : commune, UCG, ONG, entreprise.

    La zone est un rectangle (latitudes et longitudes min/max) : simple à saisir et à
    vérifier. Un signalement va à l'organisation active dont la zone le contient ; si
    plusieurs zones se chevauchent, la plus petite (la plus précise) l'emporte.
    """

    __tablename__ = "organisations"
    __table_args__ = (
        CheckConstraint(in_list("kind", ORGANISATION_KINDS), name="ck_orgs_kind"),
        CheckConstraint("min_lat >= -90 AND max_lat <= 90 AND min_lat < max_lat", name="ck_orgs_lat"),
        CheckConstraint(
            "min_lng >= -180 AND max_lng <= 180 AND min_lng < max_lng", name="ck_orgs_lng"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    min_lat: Mapped[float] = mapped_column(Float, nullable=False)
    max_lat: Mapped[float] = mapped_column(Float, nullable=False)
    min_lng: Mapped[float] = mapped_column(Float, nullable=False)
    max_lng: Mapped[float] = mapped_column(Float, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utcnow)

    def contains(self, latitude: float, longitude: float) -> bool:
        return (
            self.min_lat <= latitude <= self.max_lat and self.min_lng <= longitude <= self.max_lng
        )

    @property
    def area(self) -> float:
        return (self.max_lat - self.min_lat) * (self.max_lng - self.min_lng)
