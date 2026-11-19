"""projeto inativo: some das escolhas de lançamento novo, e as contas já lançadas continuam

Revision ID: bfbdd899da05
Revises: f3b5d7e9a1c2
Create Date: 2026-11-18 12:00:00.000000

Pedido do Bruno em 18/11/2026, com o print da tela antiga "Alteração da Projeto" (spec
projetos-financeiros, Ajustes): o projeto ganha "Inativo", como os outros cadastros. Todos os
projetos que já existem continuam ativos.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "bfbdd899da05"
down_revision: str | Sequence[str] | None = "f3b5d7e9a1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.add_column(
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true())
        )


def downgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.drop_column("active")
