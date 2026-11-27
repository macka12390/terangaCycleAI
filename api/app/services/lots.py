"""Marketplace (étape 5) : les collecteurs vendent leur matière vérifiée aux recycleurs.

Cycle d'un lot : available → reserved (un recycleur) → handed_over (remis par le collecteur).
Un recycleur peut annuler sa réservation (retour à available) ; le collecteur peut retirer
un lot encore disponible (cancelled : son poids revient dans le stock).
Le contact du collecteur n'est montré qu'au recycleur qui a réservé (et aux admins).
"""

from collections.abc import Mapping

from sqlalchemy import func

from app.constants import CATEGORIES, MAX_WEIGHT_KG, ProofStatus
from app.extensions import db
from app.models import CollectionProof, Lot, Mission, Report, User
from app.services import notifications
from app.services.events import transition
from app.services.organisations import sees_all
from app.utils.errors import ApiError, forbidden, invalid_transition, not_found, validation_error
from app.utils.time import utcnow
from app.utils.validation import parse_category, parse_float, parse_pagination, parse_text

LOT_STATUSES = ("available", "reserved", "handed_over", "cancelled")
MAX_PRICE_PER_KG = 100_000


# --- Stock vérifié --------------------------------------------------------------------------


def stock(collector: User) -> dict[str, float]:
    """Kilos disponibles par matière : preuves vérifiées moins lots non annulés."""
    verified = dict(
        db.session.query(Report.final_category, func.sum(CollectionProof.collected_weight_kg))
        .join(Mission, CollectionProof.mission_id == Mission.id)
        .join(Report, Mission.report_id == Report.id)
        .filter(
            CollectionProof.collector_id == collector.id,
            CollectionProof.status == ProofStatus.VERIFIED,
        )
        .group_by(Report.final_category)
        .all()
    )
    listed = dict(
        db.session.query(Lot.category, func.sum(Lot.weight_kg))
        .filter(Lot.collector_id == collector.id, Lot.status != "cancelled")
        .group_by(Lot.category)
        .all()
    )
    return {
        category: round(max(float(verified.get(category) or 0) - float(listed.get(category) or 0), 0), 2)
        for category in CATEGORIES
    }


# --- Consultation ---------------------------------------------------------------------------


def _get(lot_id: int) -> Lot:
    lot = db.session.get(Lot, lot_id)
    if lot is None:
        raise not_found("Lot introuvable.")
    return lot


def list_lots(user: User, args: Mapping) -> list[Lot]:
    query = Lot.query
    if user.role == "recycler":
        scope = (args.get("scope") or "available").strip().lower()
        if scope == "available":
            query = query.filter(Lot.status == "available")
        elif scope == "mine":
            query = query.filter(Lot.recycler_id == user.id)
        else:
            raise validation_error("« scope » doit valoir available ou mine.", "scope")
    elif user.role == "collector":
        query = query.filter(Lot.collector_id == user.id)
    elif user.role in ("admin", "superadmin"):
        if not sees_all(user):
            if user.organisation_id is None:
                return []
            query = query.filter(Lot.organisation_id == user.organisation_id)
    else:
        raise forbidden()
    status = args.get("status")
    if status:
        if status not in LOT_STATUSES:
            raise validation_error("Statut inconnu.", "status")
        query = query.filter(Lot.status == status)
    category = parse_category(args, "category")
    if category:
        query = query.filter(Lot.category == category)
    limit, offset = parse_pagination(args)
    return query.order_by(Lot.id.desc()).limit(limit).offset(offset).all()


def can_see_contact(user: User, lot: Lot) -> bool:
    if user.role in ("admin", "superadmin") or user.id == lot.collector_id:
        return True
    return user.role == "recycler" and lot.recycler_id == user.id


# --- Cycle de vie ----------------------------------------------------------------------------


def create_lot(collector: User, data: Mapping) -> Lot:
    if not collector.is_verified:
        raise ApiError(
            403, "COLLECTOR_NOT_VERIFIED",
            "Votre compte collecteur n'est pas encore vérifié : vous ne pouvez pas vendre de lot.",
        )
    category = parse_category(data, "category", required=True)
    weight = parse_float(
        data, "weight_kg", required=True, minimum=0, exclusive_minimum=True,
        maximum=MAX_WEIGHT_KG, label="poids (kg)",
    )
    price = parse_float(data, "price_per_kg", required=False, minimum=0, maximum=MAX_PRICE_PER_KG,
                        label="prix au kilo (FCFA)")
    description = parse_text(data, "description")
    available = stock(collector)[category]
    if weight > available + 1e-9:
        raise ApiError(
            409, "INSUFFICIENT_STOCK",
            f"Stock vérifié insuffisant : {available:g} kg de {CATEGORIES[category].lower()} disponibles.",
            {"available_kg": available, "field": "weight_kg"},
        )
    lot = Lot(
        collector_id=collector.id,
        organisation_id=collector.organisation_id,
        category=category,
        weight_kg=round(weight, 2),
        price_per_kg=int(round(price)) if price is not None else None,
        description=description,
        status="available",
    )
    db.session.add(lot)
    db.session.commit()
    return lot


def reserve(lot_id: int, recycler: User) -> Lot:
    lot = _get(lot_id)
    # UPDATE … WHERE status = 'available' : deux recycleurs simultanés, un seul gagne.
    if not transition(Lot, lot.id, ("available",), "reserved", recycler_id=recycler.id, reserved_at=utcnow()):
        db.session.rollback()
        if lot.status == "reserved":
            raise ApiError(409, "LOT_ALREADY_RESERVED", "Ce lot vient d'être réservé par un autre recycleur.")
        raise invalid_transition("Ce lot n'est plus disponible.", lot.status)
    notifications.lot_reserved(lot, recycler)
    db.session.commit()
    return lot


def release(lot_id: int, user: User) -> Lot:
    """Annule une réservation : le recycleur qui a réservé, ou le collecteur du lot."""
    lot = _get(lot_id)
    if user.id not in (lot.recycler_id, lot.collector_id):
        raise forbidden("Cette réservation n'est pas la vôtre.")
    recycler = lot.recycler
    if not transition(Lot, lot.id, ("reserved",), "available", recycler_id=None, reserved_at=None):
        db.session.rollback()
        raise invalid_transition("Ce lot n'est pas réservé.", lot.status)
    if user.id == lot.collector_id:
        notifications.lot_released(lot, recipient=recycler, by_collector=True)
    else:
        notifications.lot_released(lot, recipient=lot.collector, by_collector=False)
    db.session.commit()
    return lot


def hand_over(lot_id: int, collector: User) -> Lot:
    lot = _get(lot_id)
    if lot.collector_id != collector.id:
        raise forbidden("Ce lot n'est pas le vôtre.")
    if not transition(Lot, lot.id, ("reserved",), "handed_over", handed_over_at=utcnow()):
        db.session.rollback()
        raise invalid_transition("Seul un lot réservé peut être remis.", lot.status)
    db.session.commit()
    return lot


def cancel(lot_id: int, collector: User) -> Lot:
    lot = _get(lot_id)
    if lot.collector_id != collector.id:
        raise forbidden("Ce lot n'est pas le vôtre.")
    if not transition(Lot, lot.id, ("available",), "cancelled", cancelled_at=utcnow()):
        db.session.rollback()
        raise invalid_transition(
            "Seul un lot encore disponible peut être retiré (annulez d'abord la réservation).",
            lot.status,
        )
    db.session.commit()
    return lot


# --- Indicateurs -----------------------------------------------------------------------------


def lot_stats(organisation_id: int | None) -> dict:
    query = db.session.query(Lot.status, Lot.category, func.sum(Lot.weight_kg), func.count(Lot.id))
    if organisation_id is not None:
        query = query.filter(Lot.organisation_id == organisation_id)
    rows = query.group_by(Lot.status, Lot.category).all()
    counts = {status: 0 for status in LOT_STATUSES}
    kg = {status: 0.0 for status in LOT_STATUSES}
    handed_by_category = {category: 0.0 for category in CATEGORIES}
    for status, category, weight, count in rows:
        counts[status] += count
        kg[status] += float(weight or 0)
        if status == "handed_over":
            handed_by_category[category] += float(weight or 0)
    return {
        "counts": counts,
        "available_kg": round(kg["available"], 2),
        "reserved_kg": round(kg["reserved"], 2),
        # Kilos remis aux recycleurs : la matière effectivement valorisée.
        "handed_over_kg": round(kg["handed_over"], 2),
        "handed_over_by_category": [
            {"category": c, "label": CATEGORIES[c], "kg": round(v, 2)}
            for c, v in handed_by_category.items()
        ],
    }
