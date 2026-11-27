"""TerangaCycle AI — backend Flask du MVP hackathon.

`create_app()` assemble configuration, base SQLite, CORS, gestion d'erreurs, service IA et
routes `/api/*`. Les tables sont créées au démarrage (pas de migrations pour le MVP) et les
comptes de démonstration sont garantis présents.
"""

import logging
from pathlib import Path

from flask import Flask
from flask_cors import CORS

__version__ = "0.1.0"


def create_app(config_object: type | None = None, overrides: dict | None = None) -> Flask:
    from app.ai.service import init_ai
    from app.cli import register_commands
    from app.config import Config, load_secret_key
    from app.extensions import db
    from app.routes import register_blueprints
    from app.services.auth import ensure_demo_users
    from app.utils.errors import register_error_handlers

    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_object or Config)
    if overrides:
        app.config.update(overrides)
    app.json.sort_keys = False

    instance = Path(app.instance_path)
    instance.mkdir(parents=True, exist_ok=True)
    if not app.config.get("SECRET_KEY"):
        app.config["SECRET_KEY"] = load_secret_key(app.instance_path)
    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{(instance / 'terangacycle.db').as_posix()}"
    for sub in ("reports", "proofs", "voices"):
        (Path(app.config["UPLOAD_FOLDER"]) / sub).mkdir(parents=True, exist_ok=True)

    if not app.logger.handlers or app.logger.level == logging.NOTSET:
        app.logger.setLevel(logging.INFO)

    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    register_error_handlers(app)
    register_blueprints(app)
    register_commands(app)

    with app.app_context():
        from app import models  # noqa: F401  (enregistre les tables)

        db.create_all()
        from app.schema import upgrade_schema

        for column in upgrade_schema():
            app.logger.info("schema_column_added %s", column)
        from app.schema import run_data_migrations
        from app.services.organisations import (
            backfill_organisations,
            ensure_default_organisation,
            ensure_demo_organisations,
        )

        # Toutes les zones existent avant le rattachement des anciennes données.
        ensure_default_organisation()
        ensure_demo_organisations()
        # Version 3 : rattachement des données d'avant le multi-organisations (une seule fois).
        for version in run_data_migrations({3: backfill_organisations}):
            app.logger.info("data_migration_applied %s", version)
        ensure_demo_users()
    init_ai(app)
    from app.sms import init_sms

    init_sms(app)
    return app
