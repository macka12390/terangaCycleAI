from flask import Blueprint, current_app

from app import __version__
from app.ai.service import get_ai
from app.constants import (
    AI_MODE_LABELS,
    CATEGORIES,
    MISSION_STATUS_LABELS,
    PROOF_STATUS_LABELS,
    REPORT_STATUS_LABELS,
)
from app.utils.responses import ok

bp = Blueprint("system", __name__, url_prefix="/api")


def _choices(labels: dict[str, str]) -> list[dict]:
    return [{"value": value, "label": label} for value, label in labels.items()]


@bp.get("/health")
def health():
    ai = get_ai()
    return ok(status="ok", version=__version__, ai_mode=ai.mode, ai_status=ai.status)


@bp.get("/config")
def config():
    ai = get_ai()
    return ok(
        config={
            "categories": _choices(CATEGORIES),
            "report_statuses": _choices(REPORT_STATUS_LABELS),
            "mission_statuses": _choices(MISSION_STATUS_LABELS),
            "proof_statuses": _choices(PROOF_STATUS_LABELS),
            "ai": {
                "mode": ai.mode,
                "model_version": ai.classifier.model_version,
                "threshold": current_app.config["AI_CONFIDENCE_THRESHOLD"],
                "label": AI_MODE_LABELS[ai.mode],
            },
            "demo_mode": True,
            "max_upload_mb": current_app.config["MAX_IMAGE_BYTES"] // (1024 * 1024),
        }
    )
