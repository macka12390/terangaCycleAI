from flask import Blueprint, g, request

from app.services.auth import auth_required
from app.services.organisations import scoped_organisation_id
from app.services.stats import compute_stats
from app.utils.responses import ok
from app.utils.validation import parse_bool

bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@bp.get("/stats")
@auth_required("admin")
def stats():
    include_demo = parse_bool(request.args.get("include_demo"), default=True)
    organisation_id = scoped_organisation_id(g.user, request.args.get("organisation_id"))
    return ok(stats=compute_stats(include_demo=include_demo, organisation_id=organisation_id))
