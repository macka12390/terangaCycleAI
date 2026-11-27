"""Mise à niveau légère des bases SQLite existantes (pas d'Alembic pour le MVP).

`db.create_all()` crée les tables manquantes, mais ne touche jamais à une table existante.
Une base créée avec une version précédente planterait donc (« no such column ») :
- une colonne facultative apparue depuis est ajoutée par ALTER TABLE ADD COLUMN ;
- une table dont une contrainte a changé (SQLite ne sait pas la modifier) est reconstruite :
  nouvelle table au bon format, copie des lignes, échange. Les données sont conservées.
"""

import logging

from sqlalchemy import Table
from sqlalchemy.engine import Connection
from sqlalchemy.schema import CreateTable

from app.extensions import db

log = logging.getLogger(__name__)

# table → {colonne: définition SQL} ; uniquement des colonnes facultatives (NULL permis).
ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "reports": {"voice_path": "VARCHAR(255)"},
}

# Tables reconstruites si leur structure diffère du modèle (colonne manquante ou
# NOT NULL devenu facultatif). users : comptes réels par téléphone (étape OTP).
REBUILT_TABLES = ("users",)


def _columns(connection: Connection, table: str) -> dict[str, bool]:
    """{colonne: NOT NULL ?} de la table telle qu'elle existe dans la base."""
    rows = connection.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return {row[1]: bool(row[3]) for row in rows}


def _needs_rebuild(connection: Connection, table: Table) -> bool:
    existing = _columns(connection, table.name)
    if not existing:
        return False
    for column in table.columns:
        if column.name not in existing:
            return True
        if column.nullable and existing[column.name] and not column.primary_key:
            return True
    return False


def _rebuild(connection: Connection, table: Table) -> None:
    temporary = f"{table.name}__new"
    ddl = str(CreateTable(table).compile(dialect=connection.dialect)).strip()
    ddl = ddl.replace(f"CREATE TABLE {table.name} ", f"CREATE TABLE {temporary} ", 1)
    kept = [c.name for c in table.columns if c.name in _columns(connection, table.name)]
    columns = ", ".join(kept)
    connection.exec_driver_sql(ddl)
    connection.exec_driver_sql(
        f"INSERT INTO {temporary} ({columns}) SELECT {columns} FROM {table.name}"
    )
    connection.exec_driver_sql(f"DROP TABLE {table.name}")
    connection.exec_driver_sql(f"ALTER TABLE {temporary} RENAME TO {table.name}")
    for index in table.indexes:
        index.create(connection, checkfirst=True)


def upgrade_schema() -> list[str]:
    """Met la base au niveau des modèles ; renvoie la liste des changements appliqués."""
    if db.engine.dialect.name != "sqlite":
        return []
    changes = []
    with db.engine.connect() as connection:
        # Les autres tables référencent celles qu'on reconstruit : clés étrangères suspendues
        # le temps de l'échange (PRAGMA hors transaction), puis vérifiées.
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            for name in REBUILT_TABLES:
                table = db.metadata.tables[name]
                if _needs_rebuild(connection, table):
                    _rebuild(connection, table)
                    changes.append(f"{name} (reconstruite)")
            for table, columns in ADDED_COLUMNS.items():
                existing = _columns(connection, table)
                for column, definition in columns.items():
                    if existing and column not in existing:
                        connection.exec_driver_sql(
                            f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
                        )
                        changes.append(f"{table}.{column}")
            violations = connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
            if violations:
                connection.rollback()
                raise RuntimeError(f"schema_upgrade_fk_violations: {len(violations)}")
            connection.commit()
        finally:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    return changes
