"""fechamento do mês por empresa (período fechado bloqueia baixa, estorno e lançamento)

Revision ID: f1c3e5a7b9d1
Revises: e9a1c3e5b7d9
Create Date: 2026-11-12 20:00:00.000000

`period_closings` é o estado de agora (reabrir apaga a linha), e `period_closing_events` guarda quem
fechou, quem reabriu e por quê, só de inserção: a role da app não faz UPDATE nem DELETE nela.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f1c3e5a7b9d1"
down_revision: Union[str, Sequence[str], None] = "e9a1c3e5b7d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "period_closings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("closed_by_id", sa.Integer(), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["closed_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", "month", name="uq_period_closings_company_month"),
    )
    op.create_index(op.f("ix_period_closings_id"), "period_closings", ["id"], unique=False)
    op.create_index(
        op.f("ix_period_closings_company_id"), "period_closings", ["company_id"], unique=False
    )
    op.create_index(
        op.f("ix_period_closings_closed_by_id"), "period_closings", ["closed_by_id"], unique=False
    )

    op.create_table(
        "period_closing_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_period_closing_events_id"), "period_closing_events", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_period_closing_events_company_id"),
        "period_closing_events",
        ["company_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_period_closing_events_user_id"), "period_closing_events", ["user_id"], unique=False
    )

    # A role da app só existe onde roles.sql rodou: fora dele (CI antigo, testes), não há o que revogar.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
                REVOKE UPDATE, DELETE ON period_closing_events FROM financeiro_app;
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("period_closing_events")
    op.drop_table("period_closings")
