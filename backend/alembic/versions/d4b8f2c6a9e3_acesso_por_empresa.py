"""acesso por empresa: as empresas que cada conta vê

Revision ID: d4b8f2c6a9e3
Revises: c9f2a7d4e1b6
Create Date: 2026-11-27 17:00:00.000000

Pedido do Bruno em 27/11/2026 (ADR 0029): o admin escolhe quais empresas cada conta vê. Nulo é
todas, então ninguém perde acesso com a atualização.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4b8f2c6a9e3"
down_revision: str | Sequence[str] | None = "c9f2a7d4e1b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("companyAccess", sa.String(1000), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "companyAccess")
