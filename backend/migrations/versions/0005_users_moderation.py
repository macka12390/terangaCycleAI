"""Comptes du Personnel et modération (stories 2.2 à 2.5, 4.1 à 4.4, version démo).

- `users` (propriété `auth`) : numéro gardé seulement en empreinte HMAC (`phone_hash`),
  rôle, statut, `token_version` (révocation, AD-30), `is_demo`.
- `report_status_events` (propriété `reports`) : unique historique des Statuts (AD-3).
- `reports` : Type de déchet retenu, motif de rejet, date de modération.

Revision ID: 0005_users_moderation
Revises: 0004_report_voice
Create Date: 2026-11-26
"""

from collections.abc import Sequence
from enum import StrEnum

from alembic import op

from app.core.enums import RejectionReason, ReportStatus, Role, WasteType

revision: str = "0005_users_moderation"
down_revision: str | Sequence[str] | None = "0004_report_voice"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _values(enum: type[StrEnum]) -> str:
    return ", ".join(f"'{member.value}'" for member in enum)


def upgrade() -> None:
    op.execute(
        f"""
        CREATE TABLE users (
            id uuid PRIMARY KEY,
            phone_hash text NOT NULL,
            role text NOT NULL,
            status text NOT NULL DEFAULT 'active',
            display_name text NOT NULL,
            token_version integer NOT NULL DEFAULT 0,
            is_demo boolean NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL,
            CONSTRAINT uq_users_phone_hash UNIQUE (phone_hash),
            CONSTRAINT ck_users_phone_hash CHECK (phone_hash ~ '^[0-9a-f]{{64}}$'),
            CONSTRAINT ck_users_role CHECK (role IN ({_values(Role)})),
            CONSTRAINT ck_users_status CHECK (status IN ('active', 'suspended'))
        )
        """  # noqa: S608 - valeurs des énumérations de l'épine
    )
    op.execute(
        f"""
        CREATE TABLE report_status_events (
            id bigserial PRIMARY KEY,
            report_id uuid NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
            from_status text NOT NULL,
            to_status text NOT NULL,
            reason text,
            actor_kind text NOT NULL,
            actor_id uuid,
            occurred_at timestamptz NOT NULL,
            CONSTRAINT ck_report_status_events_from CHECK (from_status IN ({_values(ReportStatus)})),
            CONSTRAINT ck_report_status_events_to CHECK (to_status IN ({_values(ReportStatus)}))
        )
        """  # noqa: S608 - valeurs des énumérations de l'épine
    )
    op.execute(
        "CREATE INDEX ix_report_status_events_report_id ON report_status_events (report_id)"
    )
    op.execute(
        f"""
        ALTER TABLE reports
            ADD COLUMN retained_type text,
            ADD COLUMN rejection_reason text,
            ADD COLUMN moderated_at timestamptz,
            ADD CONSTRAINT ck_reports_retained_type
                CHECK (retained_type IS NULL OR retained_type IN ({_values(WasteType)})),
            ADD CONSTRAINT ck_reports_rejection_reason
                CHECK (rejection_reason IS NULL OR rejection_reason IN ({_values(RejectionReason)})),
            ADD CONSTRAINT ck_reports_validated_has_type
                CHECK (status <> 'validated' OR retained_type IS NOT NULL),
            ADD CONSTRAINT ck_reports_rejected_has_reason
                CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
        """  # noqa: S608 - valeurs des énumérations de l'épine
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE reports
            DROP COLUMN retained_type,
            DROP COLUMN rejection_reason,
            DROP COLUMN moderated_at
        """
    )
    op.execute("DROP TABLE report_status_events")
    op.execute("DROP TABLE users")
