"""pagar em: data prevista de pagamento da conta

Revision ID: f6b2d8e3a1c5
Revises: e5a1c7d2f3b4
Create Date: 2026-11-09 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6b2d8e3a1c5"
down_revision: Union[str, Sequence[str], None] = "e5a1c7d2f3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("payables", sa.Column("payOn", sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("payables", "payOn")
