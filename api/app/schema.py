"""Mise à niveau légère des bases SQLite existantes (pas d'Alembic pour le MVP).

`db.create_all()` crée les tables manquantes mais n'ajoute jamais de colonne à une table
existante : une base créée avant l'ajout d'une colonne planterait (« no such column »).
On ajoute donc ici, au démarrage, les colonnes facultatives apparues depuis.
"""

from app.extensions import db

# table → {colonne: définition SQL} ; uniquement des colonnes facultatives (NULL permis).
ADDED_COLUMNS: dict[str, dict[str, str]] = {
    "reports": {"voice_path": "VARCHAR(255)"},
}


def upgrade_schema() -> list[str]:
    """Ajoute les colonnes manquantes ; renvoie la liste `table.colonne` ajoutées."""
    if db.engine.dialect.name != "sqlite":
        return []
    added = []
    with db.engine.begin() as connection:
        for table, columns in ADDED_COLUMNS.items():
            existing = {row[1] for row in connection.exec_driver_sql(f"PRAGMA table_info({table})")}
            for name, definition in columns.items():
                if name not in existing:
                    connection.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
                    added.append(f"{table}.{name}")
    return added
