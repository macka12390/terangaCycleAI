"""Indicateurs d'impact, recalculés à chaque appel depuis la base (aucune valeur statique)."""

from datetime import timedelta

from flask import current_app
from sqlalchemy import func

from app.ai.service import is_ai_mode
from app.constants import (
    AI_MODE_LABELS,
    CATEGORIES,
    MISSION_STATUS_LABELS,
    PROOF_STATUS_LABELS,
    REPORT_STATUS_LABELS,
    VALIDATED_REPORT_STATUSES,
    ProofStatus,
    ReportStatus,
)
from app.extensions import db
from app.models import CollectionProof, Mission, Report, StatusEvent
from app.serializers import event_to_dict
from app.utils.time import utcnow

TIMELINE_DAYS = 14
RECENT_ACTIVITY = 15


def _counts(rows, keys) -> dict[str, int]:
    found = {key: count for key, count in rows}
    return {key: int(found.get(key, 0)) for key in keys}


def compute_stats(include_demo: bool = True, organisation_id: int | None = None) -> dict:
    """`organisation_id` None : toutes les organisations (super admin) ; sinon une seule."""
    demo_filter = [] if include_demo else [Report.is_demo.is_(False)]
    if organisation_id is not None:
        demo_filter.append(Report.organisation_id == organisation_id)

    report_counts = _counts(
        db.session.query(Report.status, func.count(Report.id))
        .filter(*demo_filter)
        .group_by(Report.status)
        .all(),
        REPORT_STATUS_LABELS,
    )
    mission_counts = _counts(
        db.session.query(Mission.status, func.count(Mission.id))
        .join(Report, Mission.report_id == Report.id)
        .filter(*demo_filter)
        .group_by(Mission.status)
        .all(),
        MISSION_STATUS_LABELS,
    )
    proof_counts = _counts(
        db.session.query(CollectionProof.status, func.count(CollectionProof.id))
        .join(Mission, CollectionProof.mission_id == Mission.id)
        .join(Report, Mission.report_id == Report.id)
        .filter(*demo_filter)
        .group_by(CollectionProof.status)
        .all(),
        PROOF_STATUS_LABELS,
    )

    # Kilos : uniquement les preuves vérifiées par un administrateur.
    verified = (
        db.session.query(CollectionProof, Report)
        .join(Mission, CollectionProof.mission_id == Mission.id)
        .join(Report, Mission.report_id == Report.id)
        .filter(CollectionProof.status == ProofStatus.VERIFIED, *demo_filter)
        .all()
    )
    kg_by_category = {category: 0.0 for category in CATEGORIES}
    for proof, report in verified:
        if report.final_category in kg_by_category:
            kg_by_category[report.final_category] += proof.collected_weight_kg
    verified_kg = round(sum(proof.collected_weight_kg for proof, _ in verified), 2)

    today = utcnow().date()
    first_day = today - timedelta(days=TIMELINE_DAYS - 1)
    timeline = {
        (first_day + timedelta(days=offset)).isoformat(): {"verified_kg": 0.0, "collections": 0}
        for offset in range(TIMELINE_DAYS)
    }
    for proof, _ in verified:
        if proof.verified_at is None:
            continue
        day = proof.verified_at.date().isoformat()
        if day in timeline:
            timeline[day]["verified_kg"] += proof.collected_weight_kg
            timeline[day]["collections"] += 1

    reports = db.session.query(Report).filter(*demo_filter).all()
    category_counts = {category: 0 for category in CATEGORIES}
    unclassified = 0
    for report in reports:
        category = report.final_category or report.citizen_category
        if category in category_counts:
            category_counts[category] += 1
        else:
            unclassified += 1

    return {
        "reports": {
            "total": len(reports),
            "pending": report_counts[ReportStatus.PENDING],
            "validated": sum(report_counts[s] for s in VALIDATED_REPORT_STATUSES),
            "rejected": report_counts[ReportStatus.REJECTED],
            "by_status": report_counts,
        },
        "missions": mission_counts,
        "collections": {
            "completed": mission_counts["completed"],
            "verified": proof_counts[ProofStatus.VERIFIED],
        },
        "proofs": proof_counts,
        "verified_kg": verified_kg,
        "kg_by_category": [
            {"category": c, "label": CATEGORIES[c], "kg": round(kg, 2)}
            for c, kg in kg_by_category.items()
        ],
        "reports_by_category": [
            {"category": c, "label": CATEGORIES[c], "count": n} for c, n in category_counts.items()
        ],
        "unclassified_reports": unclassified,
        "collections_timeline": [
            {"date": day, "verified_kg": round(v["verified_kg"], 2), "collections": v["collections"]}
            for day, v in timeline.items()
        ],
        "recent_activity": _recent_activity(demo_filter),
        "ai": _ai_stats(reports),
        "organisation_id": organisation_id,
        "demo": {
            "included": include_demo,
            "demo_reports": db.session.query(func.count(Report.id))
            .filter(Report.is_demo.is_(True), *demo_filter)
            .scalar(),
        },
    }


def _recent_activity(demo_filter) -> list[dict]:
    rows = (
        db.session.query(StatusEvent, Report.tracking_number, Report.is_demo)
        .join(Report, StatusEvent.report_id == Report.id)
        .filter(*demo_filter)
        .order_by(StatusEvent.id.desc())
        .limit(RECENT_ACTIVITY)
        .all()
    )
    activity = []
    for event, tracking_number, is_demo in rows:
        item = event_to_dict(event)
        item.update(report_id=event.report_id, tracking_number=tracking_number, is_demo=is_demo)
        activity.append(item)
    return activity


def _ai_stats(reports: list[Report]) -> dict:
    """Performance de l'IA, calculée uniquement sur les modes IA (jamais sur le manuel)."""
    threshold = current_app.config["AI_CONFIDENCE_THRESHOLD"]
    by_mode = {mode: 0 for mode in AI_MODE_LABELS}
    evaluated = agreed = top1 = 0
    for report in reports:
        by_mode[report.ai_mode] += 1
        if not is_ai_mode(report.ai_mode) or report.status not in VALIDATED_REPORT_STATUSES:
            continue
        if report.final_category is None or report.ai_category is None:
            continue
        evaluated += 1
        if report.ai_category == report.final_category:
            top1 += 1
            if (report.ai_confidence or 0) >= threshold:
                agreed += 1
    return {
        "by_mode": by_mode,
        "evaluated": evaluated,
        # Proposition présélectionnée (≥ seuil) confirmée par l'admin.
        "agreement_rate": round(agreed / evaluated, 3) if evaluated else None,
        # Meilleure catégorie de l'IA égale à la décision, quel que soit le score.
        "top1_match_rate": round(top1 / evaluated, 3) if evaluated else None,
    }
