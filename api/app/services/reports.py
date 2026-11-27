"""Signalements : création (photo + IA), consultation, suivi public et modération."""

import secrets
from collections.abc import Mapping

from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError

from app.ai.base import Prediction
from app.ai.service import get_ai, suggested_category
from app.constants import (
    CATEGORIES,
    REPORT_STATUS_LABELS,
    MissionStatus,
    ReportStatus,
)
from app.extensions import db
from app.models import Mission, Report, StatusEvent, User
from app.services.auth import is_admin
from app.services.organisations import (
    ensure_report_in_scope,
    report_scope,
    scoped_organisation_id,
    sees_all,
)
from app.services.organisations import resolve as resolve_organisation
from app.services.events import record_event, transition
from app.utils.errors import forbidden, invalid_transition, not_found, validation_error
from app.utils.audio import read_voice, store_voice
from app.utils.images import delete_image, read_photo, store_image
from app.utils.time import utcnow
from app.utils.validation import (
    parse_category,
    parse_choice,
    parse_float,
    parse_pagination,
    parse_text,
    parse_uuid,
)

# Sans 0/O ni 1/I : un numéro de suivi se dicte au téléphone sans ambiguïté.
TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
TRACKING_LENGTH = 6


def generate_tracking_number(year: int) -> str:
    # Aléatoire (et non séquentiel) : on ne devine pas le numéro du signalement d'un autre.
    for _ in range(20):
        suffix = "".join(secrets.choice(TRACKING_ALPHABET) for _ in range(TRACKING_LENGTH))
        candidate = f"TC-{year}-{suffix}"
        if db.session.query(Report.id).filter_by(tracking_number=candidate).first() is None:
            return candidate
    raise RuntimeError("tracking_number_generation_failed")


def _existing_by_client_uuid(client_uuid: str | None) -> Report | None:
    if not client_uuid:
        return None
    return Report.query.filter_by(client_uuid=client_uuid).first()


def create_report(
    form: Mapping, files: Mapping, user: User | None
) -> tuple[Report, Prediction | None, bool]:
    """Crée un signalement. Renvoie (signalement, prédiction, doublon)."""
    client_uuid = parse_uuid(form, "client_uuid")
    existing = _existing_by_client_uuid(client_uuid)
    if existing is not None:
        return existing, None, True

    latitude = parse_float(form, "latitude", required=True, minimum=-90, maximum=90)
    longitude = parse_float(form, "longitude", required=True, minimum=-180, maximum=180)
    accuracy_m = parse_float(form, "accuracy_m", required=False, minimum=0)
    comment = parse_text(form, "comment")
    citizen_category = parse_category(form, "citizen_category")

    processed = read_photo(files.get("photo"))
    # Contrôlée avant tout enregistrement : une note invalide ne laisse aucun fichier.
    voice = read_voice(files.get("voice"))
    prediction = get_ai().classify(processed.image, processed.source_sha256)
    photo_path = store_image(processed, "reports")
    voice_path = store_voice(voice) if voice else None
    organisation = resolve_organisation(latitude, longitude)

    try:
        now = utcnow()
        report = Report(
            tracking_number=generate_tracking_number(now.year),
            client_uuid=client_uuid,
            photo_path=photo_path,
            latitude=latitude,
            longitude=longitude,
            accuracy_m=accuracy_m,
            comment=comment,
            voice_path=voice_path,
            ai_mode=prediction.mode,
            ai_category=prediction.category,
            ai_confidence=prediction.confidence,
            ai_model_version=prediction.model_version,
            citizen_category=citizen_category,
            status=ReportStatus.PENDING,
            user_id=user.id if user else None,
            organisation_id=organisation.id if organisation else None,
            created_at=now,
            updated_at=now,
        )
        db.session.add(report)
        db.session.flush()
        record_event(
            entity="report",
            entity_id=report.id,
            report_id=report.id,
            from_status=None,
            to_status=ReportStatus.PENDING,
            actor=user,
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        delete_image(photo_path)
        delete_image(voice_path)
        # Deux envois simultanés du même client_uuid : le second renvoie le premier.
        existing = _existing_by_client_uuid(client_uuid)
        if existing is not None:
            return existing, None, True
        raise
    except Exception:
        db.session.rollback()
        delete_image(photo_path)
        delete_image(voice_path)
        raise
    return report, prediction, False


def list_reports(user: User, args: Mapping) -> tuple[list[Report], int]:
    query = Report.query
    if user.role == "citizen":
        query = query.filter(Report.user_id == user.id)
    elif is_admin(user):
        query = query.filter(*report_scope(user))
        organisation = args.get("organisation_id")
        if sees_all(user) and organisation:
            if organisation == "none":
                query = query.filter(Report.organisation_id.is_(None))
            else:
                query = query.filter(
                    Report.organisation_id == scoped_organisation_id(user, organisation)
                )
    else:
        raise forbidden()

    status = args.get("status")
    if status:
        if status not in REPORT_STATUS_LABELS:
            raise validation_error("Statut inconnu.", "status", allowed=list(REPORT_STATUS_LABELS))
        query = query.filter(Report.status == status)
    category = parse_category(args, "category")
    if category:
        effective = func.coalesce(Report.final_category, Report.citizen_category, Report.ai_category)
        query = query.filter(effective == category)

    limit, offset = parse_pagination(args)
    total = query.count()
    reports = query.order_by(Report.created_at.desc(), Report.id.desc()).limit(limit).offset(offset)
    return reports.all(), total


def get_report(report_id: int) -> Report:
    report = db.session.get(Report, report_id)
    if report is None:
        raise not_found("Signalement introuvable.")
    return report


def get_report_for(user: User, report_id: int) -> Report:
    report = get_report(report_id)
    if is_admin(user):
        ensure_report_in_scope(user, report)
    elif report.user_id != user.id:
        raise forbidden("Ce signalement ne vous appartient pas.")
    return report


def report_history(report: Report) -> list[StatusEvent]:
    return StatusEvent.query.filter_by(report_id=report.id).order_by(StatusEvent.id).all()


def track(tracking_number: str) -> dict:
    report = Report.query.filter_by(tracking_number=tracking_number.strip().upper()).first()
    if report is None:
        raise not_found("Aucun signalement ne porte ce numéro de suivi.")
    from app.serializers import effective_category
    from app.utils.time import iso

    events = (
        StatusEvent.query.filter_by(report_id=report.id, entity="report")
        .order_by(StatusEvent.id)
        .all()
    )
    history = [
        {"status": e.to_status, "label": REPORT_STATUS_LABELS[e.to_status], "at": iso(e.created_at)}
        for e in events
        if e.from_status != e.to_status
    ]
    return {
        "tracking_number": report.tracking_number,
        "status": report.status,
        "status_label": REPORT_STATUS_LABELS[report.status],
        "category": effective_category(report),
        "rejection_reason": report.rejection_reason,
        "created_at": iso(report.created_at),
        "updated_at": iso(report.updated_at),
        "history": history,
    }


def moderate(report_id: int, admin: User, data: Mapping) -> tuple[Report, Mission | None]:
    action = parse_choice(data, "action", ("approve", "reject", "correct"))
    report = get_report(report_id)
    ensure_report_in_scope(admin, report)
    if action == "approve":
        return _approve(report, admin, data)
    if action == "reject":
        return _reject(report, admin, data), None
    return _correct(report, admin, data), report.mission


def _already_processed(report: Report) -> Exception:
    db.session.rollback()
    return invalid_transition("Ce signalement a déjà été traité.", report.status)


def _approve(report: Report, admin: User, data: Mapping) -> tuple[Report, Mission]:
    category = (
        parse_category(data, "final_category")
        or report.final_category
        or report.citizen_category
        or suggested_category(report.ai_category, report.ai_confidence)
    )
    if category is None:
        raise validation_error(
            "Choisissez la catégorie du déchet avant de valider.", "final_category"
        )
    previous = report.status
    now = utcnow()
    if not transition(
        Report,
        report.id,
        (ReportStatus.PENDING,),
        ReportStatus.APPROVED,
        final_category=category,
        moderated_by=admin.id,
        moderated_at=now,
    ):
        raise _already_processed(report)

    mission = Mission(report_id=report.id, status=MissionStatus.AVAILABLE, created_at=now)
    db.session.add(mission)
    db.session.flush()
    record_event(
        entity="report",
        entity_id=report.id,
        report_id=report.id,
        from_status=previous,
        to_status=ReportStatus.APPROVED,
        actor=admin,
        note=f"Catégorie retenue : {CATEGORIES[category]}",
    )
    record_event(
        entity="mission",
        entity_id=mission.id,
        report_id=report.id,
        from_status=None,
        to_status=MissionStatus.AVAILABLE,
        actor=admin,
    )
    db.session.commit()
    return report, mission


def _reject(report: Report, admin: User, data: Mapping) -> Report:
    reason = parse_text(data, "reason")
    previous = report.status
    if not transition(
        Report,
        report.id,
        (ReportStatus.PENDING,),
        ReportStatus.REJECTED,
        rejection_reason=reason,
        moderated_by=admin.id,
        moderated_at=utcnow(),
    ):
        raise _already_processed(report)
    record_event(
        entity="report",
        entity_id=report.id,
        report_id=report.id,
        from_status=previous,
        to_status=ReportStatus.REJECTED,
        actor=admin,
        note=reason,
    )
    db.session.commit()
    return report


# Tant que les kilos ne sont pas vérifiés, l'admin peut encore corriger la catégorie.
CORRECTABLE_STATUSES = (
    ReportStatus.PENDING,
    ReportStatus.APPROVED,
    ReportStatus.ASSIGNED,
    ReportStatus.COLLECTED,
)


def _correct(report: Report, admin: User, data: Mapping) -> Report:
    category = parse_category(data, "final_category", required=True)
    previous_category = report.final_category
    result = db.session.execute(
        update(Report)
        .where(Report.id == report.id, Report.status.in_(CORRECTABLE_STATUSES))
        .values(final_category=category, updated_at=utcnow())
    )
    if result.rowcount != 1:
        db.session.rollback()
        raise invalid_transition(
            "La catégorie ne peut plus être modifiée (signalement rejeté ou terminé).",
            report.status,
        )
    before = CATEGORIES.get(previous_category, "aucune") if previous_category else "aucune"
    record_event(
        entity="report",
        entity_id=report.id,
        report_id=report.id,
        from_status=report.status,
        to_status=report.status,
        actor=admin,
        note=f"Catégorie corrigée : {before} → {CATEGORIES[category]}",
    )
    db.session.commit()
    return report
