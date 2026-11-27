"""Commandes `flask --app run …` : données de démonstration et remise à zéro."""

import shutil
from pathlib import Path

import click
from flask import Flask, current_app

from app.extensions import db


def register_commands(app: Flask) -> None:
    @app.cli.command("seed-demo")
    def seed_demo_command():
        """Charge des signalements de démonstration (marqués is_demo) à Dakar."""
        from app.seed import seed_demo

        created = seed_demo()
        if created:
            click.echo(f"{created} signalements de démonstration créés (badge « Démo »).")
        else:
            click.echo("Données de démonstration déjà présentes : rien à faire.")

    @app.cli.command("clear-demo")
    def clear_demo_command():
        """Retire toutes les données de démonstration (et leurs photos)."""
        from app.seed import clear_demo

        click.echo(f"{clear_demo()} signalements de démonstration retirés.")

    @app.cli.command("reset-db")
    @click.confirmation_option(prompt="Effacer TOUTE la base locale et les photos ?")
    def reset_db_command():
        """Efface la base SQLite et les photos, puis recrée les tables et les comptes démo."""
        from app.services.auth import ensure_demo_users

        db.drop_all()
        uploads = Path(current_app.config["UPLOAD_FOLDER"])
        for sub in ("reports", "proofs", "voices"):
            shutil.rmtree(uploads / sub, ignore_errors=True)
            (uploads / sub).mkdir(parents=True, exist_ok=True)
        db.create_all()
        ensure_demo_users()
        click.echo("Base réinitialisée.")
