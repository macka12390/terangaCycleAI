"""Missions de collecte : consultation, acceptation exclusive, début d'intervention, preuve."""

from collections.abc import Mapping

from sqlalchemy import update

from app.constants import (
    MAX_WEIGHT_KG,
    MISSION_STATUS_LABELS,
    MissionStatus,
    ProofStatus,
    ReportStatus,
)
from app.extensions import db
from app.models import CollectionProof, Mission, Report, User
from app.services.auth import is_admin
from app.services.organisations import ensure_report_in_scope, report_scope
from app.services.events import record_event, transition
from app.utils.errors import ApiError, forbidden, invalid_transition, not_found, validation_error
from app.utils.images import delete_image, read_photo, store_image
from app.utils.time import utcnow
from app.utils.validation import parse_float, parse_pagination, parse_text


def list_missions(user: User, args: Mapping) -> list[Mission]:
    query = Mission.query.join(Report, Mission.report_id == Report.id)
    if user.role == "collector":
        scope = (args.get("scope") or "available").strip().lower()
        if scope == "available":
            # Seules les missions de son organisation.
            query = query.filter(Mission.status == MissionStatus.AVAILABLE, *report_scope(user))
        elif scope == "mine":
            query = query.filter(Mission.collector_id == user.id)
        else:
            raise validation_error("« scope » doit valoir available ou mine.", "scope")
    elif is_admin(user):
        query = query.filter(*report_scope(user))
        status = args.get("status")
        if status:
            if status not in MISSION_STATUS_LABELS:
                raise validation_error("Statut inconnu.", "status")
            query = query.filter(Mission.status == status)
    else:
        raise forbidden()
    limit, offset = parse_pagination(args)
    return query.order_by(Mission.id.desc()).limit(limit).offset(offset).all()


def get_mission(mission_id: int) -> Mission:
    mission = db.session.get(Mission, mission_id)
    if mission is None:
        raise not_found("Mission introuvable.")
    return mission


def get_mission_for(user: User, mission_id: int) -> Mission:
    mission = get_mission(mission_id)
    if user.role == "collector":
        if mission.collector_id == user.id:
            return mission
        if mission.status != MissionStatus.AVAILABLE:
            raise forbidden("Cette mission est attribuée à un autre collecteur.")
        ensure_report_in_scope(user, mission.report)
    else:
        ensure_report_in_scope(user, mission.report)
    return mission


def accept(mission_id: int, collector: User) -> Mission:
    mission = get_mission(mission_id)
    ensure_report_in_scope(collector, mission.report)
    if not collector.is_verified:
        raise ApiError(
            403,
            "COLLECTOR_NOT_VERIFIED",
            "Votre compte collecteur n'est pas encore vérifié : vous ne pouvez pas accepter "
            "de mission.",
        )
    now = utcnow()
    # UPDATE … WHERE status = 'available' : deux collecteurs simultanés, un seul gagne.
    if not transition(
        Mission,
        mission.id,
        (MissionStatus.AVAILABLE,),
        MissionStatus.ACCEPTED,
        collector_id=collector.id,
        accepted_at=now,
    ):
        db.session.rollback()
        if mission.collector_id == collector.id:
            raise invalid_transition("Vous avez déjà accepté cette mission.", mission.status)
        if mission.status in (MissionStatus.ACCEPTED, MissionStatus.COMPLETED):
            raise ApiError(
                409,
                "MISSION_ALREADY_TAKEN",
                "Cette mission a déjà été acceptée par un autre collecteur.",
            )
        raise invalid_transition("Cette mission n'est plus disponible.", mission.status)

    if not transition(
        Report,
        mission.report_id,
        (ReportStatus.APPROVED,),
        ReportStatus.ASSIGNED,
    ):
        db.session.rollback()
        raise invalid_transition("Le signalement de cette mission n'est plus validé.")

    record_event(
        entity="mission",
        entity_id=mission.id,
        report_id=mission.report_id,
        from_status=MissionStatus.AVAILABLE,
        to_status=MissionStatus.ACCEPTED,
        actor=collector,
    )
    record_event(
        entity="report",
        entity_id=mission.report_id,
        report_id=mission.report_id,
        from_status=ReportStatus.APPROVED,
        to_status=ReportStatus.ASSIGNED,
        actor=collector,
    )
    db.session.commit()
    return mission


def _ensure_owner(mission: Mission, collector: User) -> None:
    if mission.collector_id != collector.id:
        raise forbidden("Cette mission n'est pas la vôtre.")


def start(mission_id: int, collector: User) -> Mission:
    mission = get_mission(mission_id)
    _ensure_owner(mission, collector)
    result = db.session.execute(
        update(Mission)
        .where(
            Mission.id == mission.id,
            Mission.status == MissionStatus.ACCEPTED,
            Mission.started_at.is_(None),
        )
        .values(started_at=utcnow(), updated_at=utcnow())
    )
    if result.rowcount != 1:
        db.session.rollback()
        if mission.started_at is not None:
            raise invalid_transition("L'intervention a déjà démarré.", mission.status)
        raise invalid_transition("Cette mission n'est pas en cours.", mission.status)
    record_event(
        entity="mission",
        entity_id=mission.id,
        report_id=mission.report_id,
        from_status=MissionStatus.ACCEPTED,
        to_status=MissionStatus.ACCEPTED,
        actor=collector,
        note="Intervention démarrée",
    )
    db.session.commit()
    return mission


def _release(mission: Mission, user: User, note: str | None) -> None:
    """Remet une mission acceptée en « disponible », sans valider la transaction."""
    previous_collector = mission.collector.name if mission.collector else None
    if not transition(
        Mission,
        mission.id,
        (MissionStatus.ACCEPTED,),
        MissionStatus.AVAILABLE,
        collector_id=None,
        accepted_at=None,
        started_at=None,
    ):
        db.session.rollback()
        raise invalid_transition(
            "Seule une mission acceptée, sans preuve en attente, peut être libérée.",
            mission.status,
        )
    if not transition(Report, mission.report_id, (ReportStatus.ASSIGNED,), ReportStatus.APPROVED):
        db.session.rollback()
        raise invalid_transition("Le signalement de cette mission n'est pas en collecte.")
    detail = f"Mission libérée par {user.name}"
    if is_admin(user) and previous_collector:
        detail += f" (retirée à {previous_collector})"
    record_event(
        entity="mission",
        entity_id=mission.id,
        report_id=mission.report_id,
        from_status=MissionStatus.ACCEPTED,
        to_status=MissionStatus.AVAILABLE,
        actor=user,
        note=f"{detail} : {note}" if note else detail,
    )
    record_event(
        entity="report",
        entity_id=mission.report_id,
        report_id=mission.report_id,
        from_status=ReportStatus.ASSIGNED,
        to_status=ReportStatus.APPROVED,
        actor=user,
    )


def release(mission_id: int, user: User, data: Mapping) -> Mission:
    """Libère une mission acceptée : elle redevient disponible pour les autres collecteurs.

    Le collecteur titulaire (acceptée par erreur, empêchement) ou un admin (mission bloquée).
    """
    mission = get_mission(mission_id)
    if is_admin(user):
        ensure_report_in_scope(user, mission.report)
    else:
        _ensure_owner(mission, user)
    _release(mission, user, parse_text(data, "reason"))
    db.session.commit()
    return mission


def release_all_of(collector: User, actor: User, note: str) -> int:
    """Libère toutes les missions acceptées d'un collecteur (suspension) ; sans commit.

    Les missions dont la preuve attend une vérification ne sont pas touchées.
    """
    missions = Mission.query.filter_by(
        collector_id=collector.id, status=MissionStatus.ACCEPTED
    ).all()
    for mission in missions:
        _release(mission, actor, note)
    return len(missions)


def cancel(mission_id: int, admin: User, data: Mapping) -> Mission:
    """Annule une mission qui n'a plus lieu d'être (dépôt déjà enlevé, doublon…).

    Le signalement passe à « Rejeté » avec le motif : il ne sera jamais compté en kilos.
    Impossible une fois la preuve envoyée : vérifier ou rejeter la preuve d'abord.
    """
    mission = get_mission(mission_id)
    ensure_report_in_scope(admin, mission.report)
    reason = parse_text(data, "reason")
    previous = mission.status
    report_previous = mission.report.status
    now = utcnow()
    if not transition(
        Mission,
        mission.id,
        (MissionStatus.AVAILABLE, MissionStatus.ACCEPTED),
        MissionStatus.CANCELLED,
        cancelled_at=now,
    ):
        db.session.rollback()
        raise invalid_transition(
            "Cette mission ne peut plus être annulée (preuve envoyée ou déjà annulée).",
            mission.status,
        )
    rejection = f"Mission annulée : {reason}" if reason else "Mission annulée"
    if not transition(
        Report,
        mission.report_id,
        (ReportStatus.APPROVED, ReportStatus.ASSIGNED),
        ReportStatus.REJECTED,
        rejection_reason=rejection,
        moderated_by=admin.id,
        moderated_at=now,
    ):
        db.session.rollback()
        raise invalid_transition("Le signalement de cette mission n'est plus annulable.")
    record_event(
        entity="mission",
        entity_id=mission.id,
        report_id=mission.report_id,
        from_status=previous,
        to_status=MissionStatus.CANCELLED,
        actor=admin,
        note=reason,
    )
    record_event(
        entity="report",
        entity_id=mission.report_id,
        report_id=mission.report_id,
        from_status=report_previous,
        to_status=ReportStatus.REJECTED,
        actor=admin,
        note=rejection,
    )
    db.session.commit()
    return mission


def submit_proof(
    mission_id: int, collector: User, form: Mapping, files: Mapping
) -> tuple[CollectionProof, Mission]:
    mission = get_mission(mission_id)
    _ensure_owner(mission, collector)
    if mission.status != MissionStatus.ACCEPTED:
        raise invalid_transition("Cette mission n'attend pas de preuve de collecte.", mission.status)

    weight = parse_float(
        form,
        "weight_kg",
        required=True,
        minimum=0,
        exclusive_minimum=True,
        maximum=MAX_WEIGHT_KG,
        label="poids (kg)",
    )
    comment = parse_text(form, "comment")
    processed = read_photo(files.get("photo"))
    photo_path = store_image(processed, "proofs")

    try:
        now = utcnow()
        if not transition(
            Mission,
            mission.id,
            (MissionStatus.ACCEPTED,),
            MissionStatus.COMPLETED,
            completed_at=now,
        ):
            raise invalid_transition("Cette mission n'attend pas de preuve de collecte.")
        if not transition(
            Report,
            mission.report_id,
            (ReportStatus.ASSIGNED,),
            ReportStatus.COLLECTED,
        ):
            raise invalid_transition("Le signalement n'est pas en cours de collecte.")

        proof = CollectionProof(
            mission_id=mission.id,
            collector_id=collector.id,
            after_photo_path=photo_path,
            collected_weight_kg=round(weight, 2),
            comment=comment,
            status=ProofStatus.PENDING,
            created_at=now,
        )
        db.session.add(proof)
        db.session.flush()
        record_event(
            entity="mission",
            entity_id=mission.id,
            report_id=mission.report_id,
            from_status=MissionStatus.ACCEPTED,
            to_status=MissionStatus.COMPLETED,
            actor=collector,
        )
        record_event(
            entity="report",
            entity_id=mission.report_id,
            report_id=mission.report_id,
            from_status=ReportStatus.ASSIGNED,
            to_status=ReportStatus.COLLECTED,
            actor=collector,
        )
        record_event(
            entity="proof",
            entity_id=proof.id,
            report_id=mission.report_id,
            from_status=None,
            to_status=ProofStatus.PENDING,
            actor=collector,
            note=f"{proof.collected_weight_kg:g} kg déclarés",
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
        delete_image(photo_path)
        raise
    return proof, mission
