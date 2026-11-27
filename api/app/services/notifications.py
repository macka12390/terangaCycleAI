"""Notifications SMS (étape 4) : citoyens et collecteurs informés à chaque étape clé.

`notify()` met le SMS en file dans la transaction de l'action (atomique) ; après une
requête réussie, `dispatch_pending()` les envoie par le fournisseur configuré
(SMS_PROVIDER). Un compte sans numéro (démo, anonyme) ou qui a coupé ses SMS reçoit une
ligne « non envoyé » : le journal montre ce qui aurait été envoyé, sans rien envoyer.
"""

from collections.abc import Iterable, Mapping

from flask import current_app, g

from app.constants import CATEGORIES
from app.extensions import db
from app.models import Mission, Notification, Report, User
from app.sms import get_sms
from app.utils.errors import validation_error
from app.utils.time import utcnow
from app.utils.validation import parse_pagination

PREFIX = "TerangaCycle : "
MAX_ATTEMPTS = 3
REASON_MAX = 60

KIND_LABELS = {
    "report.approved": "Signalement validé",
    "report.rejected": "Signalement non retenu",
    "report.completed": "Collecte vérifiée",
    "mission.available": "Nouvelle mission",
    "mission.released": "Mission retirée",
    "mission.cancelled": "Mission annulée",
    "proof.verified": "Preuve vérifiée",
    "proof.rejected": "Preuve refusée",
    "proof.disputed": "Preuve contestée",
    "lot.reserved": "Lot réservé",
    "lot.released": "Réservation annulée",
}


def _reason(text: str | None) -> str:
    if not text:
        return ""
    text = text.strip()
    if len(text) > REASON_MAX:
        text = text[: REASON_MAX - 1].rstrip() + "…"
    return f" Motif : {text}."


def _kg(value: float) -> str:
    return f"{value:g}".replace(".", ",")


def notify(user: User | None, kind: str, message: str, report: Report | None = None) -> None:
    """Met un SMS en file (sans valider la transaction de l'appelant)."""
    if user is None or not user.is_active:
        return
    status, detail = "pending", None
    if not user.phone:
        status, detail = "skipped", "no_phone"
    elif not user.sms_notifications:
        status, detail = "skipped", "opted_out"
    db.session.add(
        Notification(
            user_id=user.id,
            report_id=report.id if report else None,
            kind=kind,
            phone=user.phone,
            message=PREFIX + message,
            status=status,
            detail=detail,
        )
    )
    if status == "pending":
        g.notifications_pending = True


# --- Messages, un par événement -------------------------------------------------------------


def report_approved(report: Report) -> None:
    notify(
        report.user, "report.approved",
        f"votre signalement {report.tracking_number} est validé. "
        "Une mission de collecte est créée. Merci !",
        report,
    )


def report_rejected(report: Report, reason: str | None) -> None:
    notify(
        report.user, "report.rejected",
        f"votre signalement {report.tracking_number} n'a pas été retenu.{_reason(reason)}",
        report,
    )


def report_completed(report: Report, weight_kg: float) -> None:
    notify(
        report.user, "report.completed",
        f"le dépôt {report.tracking_number} a été collecté : {_kg(weight_kg)} kg vérifiés. "
        "Merci pour votre signalement !",
        report,
    )


def collectors_of(report: Report) -> Iterable[User]:
    """Collecteurs vérifiés et actifs de l'organisation du dépôt."""
    if report.organisation_id is None:
        return []
    return User.query.filter_by(
        role="collector", organisation_id=report.organisation_id, is_verified=True, is_active=True
    ).all()


def mission_available(report: Report) -> None:
    category = CATEGORIES.get(report.final_category or "", "déchets")
    for collector in collectors_of(report):
        notify(
            collector, "mission.available",
            f"nouvelle mission ({category.lower()}), dépôt {report.tracking_number}. "
            "Ouvrez l'application pour l'accepter.",
            report,
        )


def mission_released(mission: Mission, collector: User | None, reason: str | None) -> None:
    notify(
        collector, "mission.released",
        f"la mission {mission.report.tracking_number} vous a été retirée.{_reason(reason)}",
        mission.report,
    )


def mission_cancelled(mission: Mission, collector: User | None, reason: str | None) -> None:
    notify(
        collector, "mission.cancelled",
        f"la mission {mission.report.tracking_number} est annulée.{_reason(reason)}",
        mission.report,
    )


def proof_reviewed(mission: Mission, collector: User | None, decision: str, weight_kg: float,
                   note: str | None) -> None:
    number = mission.report.tracking_number
    if decision == "verified":
        notify(collector, "proof.verified",
               f"votre preuve pour {number} est vérifiée : {_kg(weight_kg)} kg comptés. Merci !",
               mission.report)
    elif decision == "rejected":
        notify(collector, "proof.rejected",
               f"votre preuve pour {number} est refusée.{_reason(note)} Envoyez une nouvelle preuve.",
               mission.report)
    elif decision == "disputed":
        notify(collector, "proof.disputed",
               f"votre preuve pour {number} est contestée : un administrateur va l'examiner.",
               mission.report)


# --- Envoi ---------------------------------------------------------------------------------


def dispatch_pending(limit: int = 50, retry_failed: bool = False) -> dict[str, int]:
    """Envoie les SMS en attente (et, si demandé, ceux en échec) ; renvoie le bilan."""
    statuses = ["pending", "failed"] if retry_failed else ["pending"]
    rows = (
        Notification.query.filter(
            Notification.status.in_(statuses), Notification.attempts < MAX_ATTEMPTS
        )
        .order_by(Notification.id)
        .limit(limit)
        .all()
    )
    provider = get_sms()
    result = {"sent": 0, "failed": 0}
    for row in rows:
        row.attempts += 1
        try:
            provider.send(row.phone, row.message)
        except Exception as exc:
            row.status = "failed"
            row.detail = type(exc).__name__[:120]
            result["failed"] += 1
            current_app.logger.warning("sms_failed id=%s provider=%s", row.id, provider.name)
        else:
            row.status = "sent"
            row.detail = None
            row.sent_at = utcnow()
            result["sent"] += 1
    db.session.commit()
    return result


def dispatch_after_request(response):
    """Hook Flask : envoie ce que la requête a mis en file, si elle a réussi."""
    if response.status_code < 400 and g.pop("notifications_pending", False):
        try:
            dispatch_pending()
        except Exception:
            # L'action est déjà validée : un échec d'envoi ne doit pas la faire échouer.
            db.session.rollback()
            current_app.logger.exception("sms_dispatch_failed")
    return response


# --- Journal (console admin) ---------------------------------------------------------------


def list_notifications(user: User, args: Mapping) -> list[Notification]:
    from app.services.organisations import report_scope, sees_all

    query = Notification.query
    if not sees_all(user):
        query = query.join(Report, Notification.report_id == Report.id).filter(*report_scope(user))
    status = args.get("status")
    if status:
        if status not in ("pending", "sent", "failed", "skipped"):
            raise validation_error("Statut inconnu.", "status")
        query = query.filter(Notification.status == status)
    limit, offset = parse_pagination(args)
    return query.order_by(Notification.id.desc()).limit(limit).offset(offset).all()


# --- Marketplace (étape 5) ------------------------------------------------------------------


def _lot_label(lot) -> str:
    return f"{_kg(lot.weight_kg)} kg de {CATEGORIES[lot.category].lower()}"


def lot_reserved(lot, recycler: User) -> None:
    notify(
        lot.collector, "lot.reserved",
        f"{recycler.name} a réservé votre lot ({_lot_label(lot)}). "
        "Ses coordonnées sont dans l'application, rubrique Mes lots.",
    )


def lot_released(lot, recipient: User | None, by_collector: bool) -> None:
    who = "le collecteur" if by_collector else "le recycleur"
    notify(
        recipient, "lot.released",
        f"la réservation du lot ({_lot_label(lot)}) a été annulée par {who}.",
    )
