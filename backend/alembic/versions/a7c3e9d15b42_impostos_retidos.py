"""impostos retidos: os percentuais que toda conta a pagar nova já traz

Revision ID: a7c3e9d15b42
Revises: bfbdd899da05
Create Date: 2026-11-19 12:00:00.000000

Pedido do Bruno em 19/11/2026 (spec contas-a-pagar, Ajustes): PIS 0,65%, COFINS 3%, CSLL 1% e IR 1,5%,
calculados sobre o valor principal e trocados em Cadastros. Sem linha na tabela, vale o padrão do
sistema (services/tax_rates.py), então a migration não grava nenhuma.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7c3e9d15b42"
down_revision: str | Sequence[str] | None = "bfbdd899da05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tax_rates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(20), nullable=False, unique=True),
        sa.Column("rate", sa.Numeric(5, 2), nullable=False),
        sa.Column(
            "updatedAt", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_tax_rates_id", "tax_rates", ["id"])


def downgrade() -> None:
    op.drop_index("ix_tax_rates_id", table_name="tax_rates")
    op.drop_table("tax_rates")
