"""senha inicial de primeiro acesso: a pessoa troca por uma só dela antes do autenticador

Revision ID: a7d3e5f9c2b4
Revises: e6a1c9d3b7f2
Create Date: 2026-11-25 11:00:00.000000

Pedido do Bruno em 25/11/2026 (spec acesso-e-auditoria): as contas da equipe nascem com uma senha
inicial, que vale só para o primeiro acesso. Com `mustChangePassword`, o login pede a senha nova
antes do cadastro do autenticador, e o autenticador e a sessão não abrem antes disso. As contas que
já existem ficam como estão (falso).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7d3e5f9c2b4"
down_revision: str | Sequence[str] | None = "e6a1c9d3b7f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("mustChangePassword", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "mustChangePassword")
