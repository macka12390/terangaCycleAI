"""Représentation JSON des objets, conforme à docs/api-contract.md."""

import json

from app.ai.service import suggested_category
from app.constants import (
    AI_MODE_LABELS,
    MISSION_STATUS_LABELS,
    ORGANISATION_KINDS,
    PROOF_STATUS_LABELS,
    REPORT_STATUS_LABELS,
    ROLES,
)
from app.models import (
    AuditLog,
    CollectionProof,
    Mission,
    Organisation,
    Report,
    StatusEvent,
    User,
)
from app.utils.images import photo_url
from app.utils.time import iso


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "role": user.role,
        "is_verified": user.is_verified,
        "is_demo": user.is_demo,
        "demo_login": user.demo_login,
        "phone": user.phone,
        "role_label": ROLES.get(user.role, user.role),
        "organisation": organisation_summary(user.organisation),
        "is_active": user.is_active,
        "sms_notifications": user.sms_notifications,
        "suspended_at": iso(user.suspended_at),
        "suspended_reason": user.suspended_reason,
        "created_at": iso(user.created_at),
        "last_login_at": iso(user.last_login_at),
    }


AUDIT_ACTION_LABELS = {
    "account.create": "Compte créé",
    "account.update": "Compte modifié",
    "account.suspend": "Compte suspendu",
    "account.reactivate": "Compte réactivé",
    "organisation.create": "Organisation créée",
    "organisation.update": "Organisation modifiée",
    "report.reassign": "Signalement rattaché à une organisation",
}


def audit_to_dict(entry: AuditLog) -> dict:
    return {
        "id": entry.id,
        "action": entry.action,
        "action_label": AUDIT_ACTION_LABELS.get(entry.action, entry.action),
        "actor": user_summary(entry.actor),
        "target": user_summary(entry.target),
        "details": json.loads(entry.details) if entry.details else None,
        "at": iso(entry.created_at),
    }


def organisation_summary(organisation: Organisation | None) -> dict | None:
    if organisation is None:
        return None
    return {"id": organisation.id, "name": organisation.name, "is_demo": organisation.is_demo}


def organisation_to_dict(organisation: Organisation, counts: dict | None = None) -> dict:
    data = {
        "id": organisation.id,
        "name": organisation.name,
        "kind": organisation.kind,
        "kind_label": ORGANISATION_KINDS.get(organisation.kind, organisation.kind),
        "zone": {
            "min_lat": organisation.min_lat,
            "max_lat": organisation.max_lat,
            "min_lng": organisation.min_lng,
            "max_lng": organisation.max_lng,
        },
        "is_active": organisation.is_active,
        "is_demo": organisation.is_demo,
        "created_at": iso(organisation.created_at),
    }
    if counts is not None:
        data["counts"] = counts
    return data


def user_summary(user: User | None) -> dict | None:
    return {"id": user.id, "name": user.name} if user else None


def report_ai(report: Report) -> dict:
    return {
        "mode": report.ai_mode,
        "category": report.ai_category,
        "confidence": report.ai_confidence,
        "suggested_category": suggested_category(report.ai_category, report.ai_confidence),
        "model_version": report.ai_model_version,
        "label": AI_MODE_LABELS[report.ai_mode],
    }


def effective_category(report: Report) -> str | None:
    """Meilleure catégorie connue : décision admin, sinon choix du citoyen, sinon suggestion IA."""
    return (
        report.final_category
        or report.citizen_category
        or suggested_category(report.ai_category, report.ai_confidence)
    )


def report_to_dict(report: Report) -> dict:
    return {
        "id": report.id,
        "tracking_number": report.tracking_number,
        "status": report.status,
        "status_label": REPORT_STATUS_LABELS[report.status],
        "photo_url": photo_url(report.photo_path),
        "latitude": report.latitude,
        "longitude": report.longitude,
        "accuracy_m": report.accuracy_m,
        "comment": report.comment,
        "voice_url": photo_url(report.voice_path),
        "ai": report_ai(report),
        "citizen_category": report.citizen_category,
        "final_category": report.final_category,
        "category": effective_category(report),
        "rejection_reason": report.rejection_reason,
        "moderated_by": user_summary(report.moderator),
        "moderated_at": iso(report.moderated_at),
        "mission_id": report.mission.id if report.mission else None,
        "organisation": organisation_summary(report.organisation),
        "user_id": report.user_id,
        "is_demo": report.is_demo,
        "created_at": iso(report.created_at),
        "updated_at": iso(report.updated_at),
    }


def proof_to_dict(proof: CollectionProof) -> dict:
    report = proof.mission.report
    return {
        "id": proof.id,
        "mission_id": proof.mission_id,
        "status": proof.status,
        "status_label": PROOF_STATUS_LABELS[proof.status],
        "photo_after_url": photo_url(proof.after_photo_path),
        "weight_kg": proof.collected_weight_kg,
        "comment": proof.comment,
        "collector": user_summary(proof.collector),
        "verified_by": user_summary(proof.verifier),
        "verified_at": iso(proof.verified_at),
        "review_note": proof.review_note,
        "created_at": iso(proof.created_at),
        "report": {
            "id": report.id,
            "tracking_number": report.tracking_number,
            "waste_type": report.final_category,
            "photo_before_url": photo_url(report.photo_path),
        },
        "is_demo": report.is_demo,
    }


def mission_to_dict(mission: Mission) -> dict:
    report = mission.report
    latest = mission.latest_proof
    return {
        "id": mission.id,
        "status": mission.status,
        "status_label": MISSION_STATUS_LABELS[mission.status],
        "report_id": report.id,
        "tracking_number": report.tracking_number,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "waste_type": report.final_category,
        "photo_before_url": photo_url(report.photo_path),
        "report_comment": report.comment,
        "collector": user_summary(mission.collector),
        "accepted_at": iso(mission.accepted_at),
        "started_at": iso(mission.started_at),
        "completed_at": iso(mission.completed_at),
        "created_at": iso(mission.created_at),
        "proof": proof_to_dict(latest) if latest else None,
        "organisation": organisation_summary(report.organisation),
        "is_demo": report.is_demo,
    }


ENTITY_LABELS = {"report": "Signalement", "mission": "Mission", "proof": "Preuve"}
STATUS_LABELS_BY_ENTITY = {
    "report": REPORT_STATUS_LABELS,
    "mission": MISSION_STATUS_LABELS,
    "proof": PROOF_STATUS_LABELS,
}


def status_label(entity: str, status: str | None) -> str | None:
    if status is None:
        return None
    return STATUS_LABELS_BY_ENTITY.get(entity, {}).get(status, status)


def event_to_dict(event: StatusEvent) -> dict:
    to_label = status_label(event.entity, event.to_status)
    return {
        "entity": event.entity,
        "entity_label": ENTITY_LABELS.get(event.entity, event.entity),
        "entity_id": event.entity_id,
        "from_status": event.from_status,
        "from_status_label": status_label(event.entity, event.from_status),
        "to_status": event.to_status,
        "to_status_label": to_label,
        # Phrase prête à afficher, ex. « Preuve : Vérifiée ».
        "summary": f"{ENTITY_LABELS.get(event.entity, event.entity)} : {to_label}",
        "actor": event.actor.name if event.actor else None,
        "note": event.note,
        "at": iso(event.created_at),
    }


def notification_to_dict(notification) -> dict:
    from app.services.notifications import KIND_LABELS
    from app.utils.phone import mask_phone

    return {
        "id": notification.id,
        "kind": notification.kind,
        "kind_label": KIND_LABELS.get(notification.kind, notification.kind),
        "recipient": user_summary(notification.user),
        "recipient_role": notification.user.role if notification.user else None,
        # Numéro toujours masqué dans la console.
        "phone": mask_phone(notification.phone) if notification.phone else None,
        "message": notification.message,
        "status": notification.status,
        "detail": notification.detail,
        "attempts": notification.attempts,
        "tracking_number": notification.report.tracking_number if notification.report else None,
        "created_at": iso(notification.created_at),
        "sent_at": iso(notification.sent_at),
    }
