"""Aides pour écrire les contraintes CHECK à partir des constantes métier."""

from collections.abc import Iterable


def in_list(column: str, values: Iterable[str], *, nullable: bool = False) -> str:
    quoted = ", ".join(f"'{value}'" for value in values)
    clause = f"{column} IN ({quoted})"
    return f"({column} IS NULL OR {clause})" if nullable else clause
