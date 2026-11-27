from flask import Flask

from app.routes.accounts import bp as accounts_bp
from app.routes.ai import bp as ai_bp
from app.routes.auth import bp as auth_bp
from app.routes.dashboard import bp as dashboard_bp
from app.routes.lots import bp as lots_bp
from app.routes.missions import bp as missions_bp
from app.routes.notifications import bp as notifications_bp
from app.routes.organisations import bp as organisations_bp
from app.routes.payments import bp as payments_bp
from app.routes.proofs import bp as proofs_bp
from app.routes.reports import bp as reports_bp
from app.routes.system import bp as system_bp
from app.routes.uploads import bp as uploads_bp

BLUEPRINTS = (
    system_bp,
    auth_bp,
    ai_bp,
    reports_bp,
    missions_bp,
    proofs_bp,
    dashboard_bp,
    accounts_bp,
    organisations_bp,
    notifications_bp,
    lots_bp,
    payments_bp,
    uploads_bp,
)


def register_blueprints(app: Flask) -> None:
    for blueprint in BLUEPRINTS:
        app.register_blueprint(blueprint)
