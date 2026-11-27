from flask import Blueprint, g, request

from app.serializers import notification_to_dict
from app.services import notifications as notification_service
from app.services.auth import auth_required
from app.sms import get_sms
from app.utils.responses import ok

bp = Blueprint("notifications", __name__, url_prefix="/api")


@bp.get("/notifications")
@auth_required("admin")
def index():
    """Journal des SMS (admin : son organisation ; super admin : tout)."""
    rows = notification_service.list_notifications(g.user, request.args)
    return ok(
        notifications=[notification_to_dict(row) for row in rows],
        provider=get_sms().name,
    )
