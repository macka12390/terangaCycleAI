"""Preuves de collecte : consultation et vérification par l'administrateur.

Règle fondamentale : seule une preuve `verified` fait entrer des kilos dans les statistiques.
"""

from collections.abc import Mapping

from app.constants import PROOF_STATUS_LABELS, MissionStatus, ProofStatus, ReportStatus
from app.extensions import db
from app.models import CollectionProof, Mission, Report, User
from app.services import notifications
from app.services.auth import is_admin
from app.services.organisations import ensure_report_in_scope, report_scope
from app.services.events import record_event, transition
from app.utils.errors import forbidden, invalid_transition, not_found, validation_error
from app.utils.time import utcnow
from app.utils.validation import parse_choice, parse_pagination, parse_text

# Décision → statuts de départ autorisés.
ALLOWED_FROM = {
    ProofStatus.VERIFIED: (ProofStatus.PENDING, ProofStatus.DISPUTED),
    ProofStatus.REJECTED: (ProofStatus.PENDING, ProofStatus.DISPUTED),
    ProofStatus.DISPUTED: (ProofStatus.PENDING,),
}


def list_proofs(user: User, args: Mapping) -> list[CollectionProof]:
    query = CollectionProof.query
    if user.role == "collector":
        query = query.filter(CollectionProof.collector_id == user.id)
    elif is_admin(user):
        query = (
            query.join(Mission, CollectionProof.mission_id == Mission.id)
            .join(Report, Mission.report_id == Report.id)
            .filter(*report_scope(user))
        )
    else:
        raise forbidden()
    status = args.get("status")
    if status:
        if status not in PROOF_STATUS_LABELS:
            raise validation_error("Statut inconnu.", "status")
        query = query.filter(CollectionProof.status == status)
    limit, offset = parse_pagination(args)
    return query.order_by(CollectionProof.id.desc()).limit(limit).offset(offset).all()


def verify(proof_id: int, admin: User, data: Mapping) -> CollectionProof:
    decision = parse_choice(data, "decision", tuple(ALLOWED_FROM))
    note = parse_text(data, "note")
    proof = db.session.get(CollectionProof, proof_id)
    if proof is None:
        raise not_found("Preuve introuvable.")
    previous = proof.status
    mission = proof.mission
    ensure_report_in_scope(admin, mission.report)

    if not transition(
        CollectionProof,
        proof.id,
        ALLOWED_FROM[decision],
        decision,
        verified_by=admin.id,
        verified_at=utcnow(),
        review_note=note,
    ):
        db.session.rollback()
        raise invalid_transition("Cette preuve a déjà été traitée.", proof.status)

    record_event(
        entity="proof",
        entity_id=proof.id,
        report_id=mission.report_id,
        from_status=previous,
        to_status=decision,
        actor=admin,
        note=note,
    )

    if decision == ProofStatus.VERIFIED:
        _move_report(mission, ReportStatus.COLLECTED, ReportStatus.COMPLETED, admin)
    elif decision == ProofStatus.REJECTED:
        # Le collecteur doit renvoyer une preuve : la mission redevient « acceptée ».
        if not transition(
            Mission,
            mission.id,
            (MissionStatus.COMPLETED,),
            MissionStatus.ACCEPTED,
            completed_at=None,
        ):
            db.session.rollback()
            raise invalid_transition("La mission de cette preuve n'est pas terminée.")
        record_event(
            entity="mission",
            entity_id=mission.id,
            report_id=mission.report_id,
            from_status=MissionStatus.COMPLETED,
            to_status=MissionStatus.ACCEPTED,
            actor=admin,
            note="Preuve rejetée : nouvelle preuve attendue",
        )
        _move_report(mission, ReportStatus.COLLECTED, ReportStatus.ASSIGNED, admin)

    notifications.proof_reviewed(mission, proof.collector, decision, proof.collected_weight_kg, note)
    if decision == ProofStatus.VERIFIED:
        notifications.report_completed(mission.report, proof.collected_weight_kg)
    db.session.commit()
    return proof


def _move_report(mission: Mission, from_status: str, to_status: str, actor: User) -> None:
    if not transition(Report, mission.report_id, (from_status,), to_status):
        db.session.rollback()
        raise invalid_transition("Le signalement de cette preuve n'est pas en vérification.")
    record_event(
        entity="report",
        entity_id=mission.report_id,
        report_id=mission.report_id,
        from_status=from_status,
        to_status=to_status,
        actor=actor,
    )
