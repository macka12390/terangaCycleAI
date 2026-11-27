"""Dates en UTC : stockées naïves (SQLite ne garde pas le fuseau), exposées en ISO 8601 « Z »."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.replace(microsecond=0).isoformat() + "Z"
