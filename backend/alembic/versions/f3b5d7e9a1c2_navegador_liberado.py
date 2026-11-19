"""navegador liberado: a conta só entra pelos navegadores que um admin liberou

Revision ID: f3b5d7e9a1c2
Revises: e1a3c5e7f9b2
Create Date: 2026-11-17 18:00:00.000000

Pedido do Bruno em 17/11/2026 (spec acesso-e-auditoria, ADR 0022). Guarda o hash do cookie do
navegador (nunca o valor), o nome do navegador, o IP mascarado e quem liberou. As contas que já
existem não têm navegador: o primeiro login depois desta migração libera o navegador dele.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f3b5d7e9a1c2"
down_revision: str | Sequence[str] | None = "e1a3c5e7f9b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "trusted_browsers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tokenHash", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("ipMasked", sa.String(length=45), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column(
            "requestedAt",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("decidedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "decided_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("lastSeenAt", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tokenHash", name="trusted_browsers_tokenHash_key"),
    )
    op.create_index("ix_trusted_browsers_id", "trusted_browsers", ["id"])
    op.create_index("ix_trusted_browsers_user_id", "trusted_browsers", ["user_id"])
    op.create_index("ix_trusted_browsers_status", "trusted_browsers", ["status"])
    # Liberar, recusar e revogar mudam a linha; nenhuma some: quem decidiu fica guardado. Só existe
    # onde roles.sql rodou; fora dele (testes em SQLite), não há o que revogar.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
                REVOKE DELETE ON trusted_browsers FROM financeiro_app;
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    op.drop_index("ix_trusted_browsers_status", table_name="trusted_browsers")
    op.drop_index("ix_trusted_browsers_user_id", table_name="trusted_browsers")
    op.drop_index("ix_trusted_browsers_id", table_name="trusted_browsers")
    op.drop_table("trusted_browsers")
