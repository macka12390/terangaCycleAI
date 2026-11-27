"""Paiements mobile money (étape 6) : rémunération des collecteurs et paiement des lots.

Règles :
- rémunération = kilos vérifiés × tarif de l'organisation pour la matière, calculée quand
  la preuve est vérifiée (une seule par preuve), versée ensuite par un admin ;
- paiement d'un lot : le recycleur qui l'a réservé paie le prix affiché, une seule fois ;
- aucun double versement : le paiement passe à « processing » (UPDATE conditionnel)
  avant d'appeler le fournisseur ; un second clic reçoit 409 ;
- en mode simulé, aucun argent ne bouge et tout est marqué « simulé ».
"""

import json
from collections.abc import Mapping

from sqlalchemy import func, update

from app.constants import CATEGORIES
from app.extensions import db
from app.models import AuditLog, CollectionProof, Lot, Mission, Payment, Report, Tariff, User
from app.payments_provider import get_payments
from app.services import notifications
from app.services.events import transition
from app.services.organisations import get_organisation, sees_all
from app.utils.errors import ApiError, forbidden, invalid_transition, not_found, validation_error
from app.utils.time import utcnow
from app.utils.validation import parse_category, parse_float, parse_pagination

MAX_TARIFF_FCFA = 100_000


def _audit(actor: User, action: str, **details) -> None:
    db.session.add(
        AuditLog(actor_id=actor.id, action=action, details=json.dumps(details, ensure_ascii=False))
    )


def _scope_organisation(actor: User, requested: object = None) -> int:
    """Organisation sur laquelle l'admin agit : la sienne ; le super admin la choisit."""
    if sees_all(actor):
        if requested in (None, ""):
            raise validation_error("Choisissez une organisation.", "organisation_id")
        try:
            return get_organisation(int(str(requested))).id
        except ValueError:
            raise validation_error("« organisation_id » doit être un nombre.", "organisation_id") from None
    if actor.organisation_id is None:
        raise forbidden("Votre compte n'est rattaché à aucune organisation.")
    return actor.organisation_id


# --- Tarifs ---------------------------------------------------------------------------------


def tariffs_of(organisation_id: int) -> dict[str, int | None]:
    found = {t.category: t.price_per_kg for t in Tariff.query.filter_by(organisation_id=organisation_id)}
    return {category: found.get(category) for category in CATEGORIES}


def set_tariff(actor: User, data: Mapping) -> tuple[int, dict[str, int | None]]:
    organisation_id = _scope_organisation(actor, data.get("organisation_id"))
    category = parse_category(data, "category", required=True)
    price = parse_float(data, "price_per_kg", required=True, minimum=0, maximum=MAX_TARIFF_FCFA,
                        label="tarif (FCFA par kilo)")
    tariff = Tariff.query.filter_by(organisation_id=organisation_id, category=category).first()
    before = tariff.price_per_kg if tariff else None
    if tariff is None:
        tariff = Tariff(organisation_id=organisation_id, category=category, price_per_kg=0)
        db.session.add(tariff)
    tariff.price_per_kg = int(round(price))
    tariff.updated_by = actor.id
    _audit(actor, "tariff.update", organisation_id=organisation_id, category=category,
           price_per_kg=[before, tariff.price_per_kg])
    db.session.commit()
    return organisation_id, tariffs_of(organisation_id)


# --- Rémunération des collecteurs -------------------------------------------------------------


def accrue_reward(proof: CollectionProof) -> Payment | None:
    """Rémunération « à payer » d'une preuve vérifiée (sans commit). None sans tarif."""
    report = proof.mission.report
    if report.organisation_id is None or report.final_category is None:
        return None
    if Payment.query.filter_by(proof_id=proof.id).first() is not None:
        return None
    price = tariffs_of(report.organisation_id)[report.final_category]
    if not price:
        return None
    amount = int(round(proof.collected_weight_kg * price))
    if amount <= 0:
        return None
    payment = Payment(
        kind="collector_reward",
        status="pending",
        amount_fcfa=amount,
        weight_kg=proof.collected_weight_kg,
        price_per_kg=price,
        category=report.final_category,
        payee_id=proof.collector_id,
        organisation_id=report.organisation_id,
        proof_id=proof.id,
        provider=get_payments().name,
        is_simulated=get_payments().simulated,
    )
    db.session.add(payment)
    return payment


def accrue_missing(actor: User, data: Mapping) -> int:
    """Calcule les rémunérations des preuves vérifiées qui n'en ont pas (tarif fixé après coup)."""
    organisation_id = _scope_organisation(actor, data.get("organisation_id"))
    proofs = (
        CollectionProof.query.join(Mission, CollectionProof.mission_id == Mission.id)
        .join(Report, Mission.report_id == Report.id)
        .outerjoin(Payment, Payment.proof_id == CollectionProof.id)
        .filter(
            CollectionProof.status == "verified",
            Report.organisation_id == organisation_id,
            Payment.id.is_(None),
        )
        .all()
    )
    created = sum(1 for proof in proofs if accrue_reward(proof) is not None)
    db.session.commit()
    return created


def _get(payment_id: int) -> Payment:
    payment = db.session.get(Payment, payment_id)
    if payment is None:
        raise not_found("Paiement introuvable.")
    return payment


def _execute(payment: Payment, actor: User) -> Payment:
    """Verse ou prélève via le fournisseur ; jamais deux fois pour le même paiement."""
    if not transition(
        Payment, payment.id, ("pending", "failed"), "processing",
        attempts=Payment.attempts + 1, initiated_by=actor.id, failure_reason=None,
    ):
        db.session.rollback()
        raise ApiError(409, "PAYMENT_IN_PROGRESS", "Ce paiement est déjà en cours ou effectué.",
                       {"status": payment.status})
    db.session.commit()

    provider = get_payments()
    reference = f"TC-PAY-{payment.id}"
    if payment.kind == "collector_reward":
        result = provider.payout(payment.payee.phone, payment.amount_fcfa, reference)
    else:
        result = provider.charge(payment.payer.phone if payment.payer else None, payment.amount_fcfa, reference)

    if result.ok:
        db.session.execute(
            update(Payment).where(Payment.id == payment.id).values(
                status="succeeded", provider_ref=result.reference, completed_at=utcnow(),
                provider=provider.name, is_simulated=provider.simulated,
            )
        )
        notifications.payment_received(payment)
    else:
        db.session.execute(
            update(Payment).where(Payment.id == payment.id).values(
                status="failed", failure_reason=(result.error or "Échec du fournisseur")[:200]
            )
        )
    db.session.commit()
    db.session.refresh(payment)
    return payment


def _ensure_reward_in_scope(actor: User, payment: Payment) -> None:
    if payment.kind != "collector_reward":
        raise forbidden("Seules les rémunérations des collecteurs se versent ici.")
    if not sees_all(actor) and payment.organisation_id != actor.organisation_id:
        raise forbidden("Ce paiement relève d'une autre organisation.")


def pay(payment_id: int, actor: User) -> Payment:
    payment = _get(payment_id)
    _ensure_reward_in_scope(actor, payment)
    if not payment.payee.is_active:
        raise ApiError(409, "ACCOUNT_SUSPENDED", "Ce collecteur est suspendu : versement bloqué.")
    return _execute(payment, actor)


def pay_all(actor: User, data: Mapping) -> dict[str, int]:
    organisation_id = _scope_organisation(actor, data.get("organisation_id"))
    pending = (
        Payment.query.join(User, Payment.payee_id == User.id)
        .filter(
            Payment.kind == "collector_reward",
            Payment.organisation_id == organisation_id,
            Payment.status.in_(("pending", "failed")),
            User.is_active.is_(True),
        )
        .order_by(Payment.id)
        .all()
    )
    result = {"succeeded": 0, "failed": 0, "amount_fcfa": 0}
    for payment in pending:
        done = _execute(payment, actor)
        if done.status == "succeeded":
            result["succeeded"] += 1
            result["amount_fcfa"] += done.amount_fcfa
        else:
            result["failed"] += 1
    return result


# --- Paiement d'un lot -------------------------------------------------------------------------


def pay_lot(lot_id: int, recycler: User) -> Payment:
    lot = db.session.get(Lot, lot_id)
    if lot is None:
        raise not_found("Lot introuvable.")
    if lot.recycler_id != recycler.id:
        raise forbidden("Seul le recycleur qui a réservé ce lot peut le payer.")
    if lot.status not in ("reserved", "handed_over"):
        raise invalid_transition("Ce lot n'est pas réservé.", lot.status)
    if lot.price_per_kg is None or lot.price_per_kg <= 0:
        raise ApiError(409, "LOT_PRICE_MISSING",
                       "Ce lot n'a pas de prix : le paiement se règle directement avec le collecteur.")
    payment = (
        Payment.query.filter_by(lot_id=lot.id)
        .filter(Payment.status != "failed")
        .first()
    )
    if payment is not None:
        raise ApiError(409, "LOT_ALREADY_PAID", "Ce lot est déjà payé.", {"status": payment.status})
    payment = Payment.query.filter_by(lot_id=lot.id, status="failed").first()
    if payment is None:
        payment = Payment(
            kind="lot_payment",
            status="pending",
            amount_fcfa=int(round(lot.price_per_kg * lot.weight_kg)),
            weight_kg=lot.weight_kg,
            price_per_kg=lot.price_per_kg,
            category=lot.category,
            payee_id=lot.collector_id,
            payer_id=recycler.id,
            organisation_id=lot.organisation_id,
            lot_id=lot.id,
            provider=get_payments().name,
            is_simulated=get_payments().simulated,
        )
        db.session.add(payment)
        db.session.commit()
    return _execute(payment, recycler)


def lot_payment(lot: Lot) -> Payment | None:
    return (
        Payment.query.filter_by(lot_id=lot.id)
        .order_by((Payment.status == "failed").asc(), Payment.id.desc())
        .first()
    )


# --- Consultation -------------------------------------------------------------------------------


def list_payments(user: User, args: Mapping) -> list[Payment]:
    query = Payment.query
    if user.role == "collector":
        query = query.filter(Payment.payee_id == user.id)
    elif user.role == "recycler":
        query = query.filter(Payment.payer_id == user.id)
    elif user.role in ("admin", "superadmin"):
        if not sees_all(user):
            if user.organisation_id is None:
                return []
            query = query.filter(Payment.organisation_id == user.organisation_id)
        elif args.get("organisation_id"):
            query = query.filter(Payment.organisation_id == int(str(args.get("organisation_id"))))
    else:
        raise forbidden()
    for field, allowed in (("kind", ("collector_reward", "lot_payment")),
                           ("status", ("pending", "processing", "succeeded", "failed"))):
        value = args.get(field)
        if value:
            if value not in allowed:
                raise validation_error(f"« {field} » inconnu.", field)
            query = query.filter(getattr(Payment, field) == value)
    limit, offset = parse_pagination(args)
    return query.order_by(Payment.id.desc()).limit(limit).offset(offset).all()


def totals(filters: list) -> dict[str, int]:
    rows = (
        db.session.query(Payment.kind, Payment.status, func.sum(Payment.amount_fcfa))
        .filter(*filters)
        .group_by(Payment.kind, Payment.status)
        .all()
    )
    found = {(kind, status): int(amount or 0) for kind, status, amount in rows}
    return {
        "rewards_paid_fcfa": found.get(("collector_reward", "succeeded"), 0),
        "rewards_due_fcfa": found.get(("collector_reward", "pending"), 0)
        + found.get(("collector_reward", "failed"), 0),
        "lot_payments_fcfa": found.get(("lot_payment", "succeeded"), 0),
    }


def summary_for(user: User) -> dict[str, int]:
    if user.role == "collector":
        return totals([Payment.payee_id == user.id])
    if user.role == "recycler":
        return totals([Payment.payer_id == user.id])
    if sees_all(user):
        return totals([])
    return totals([Payment.organisation_id == (user.organisation_id or -1)])


def payment_stats(organisation_id: int | None) -> dict:
    filters = [] if organisation_id is None else [Payment.organisation_id == organisation_id]
    data = totals(filters)
    data["simulated"] = get_payments().simulated
    return data
