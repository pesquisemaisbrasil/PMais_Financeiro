"""data da pesquisa de cada pessoa do lançamento

Revision ID: f74a0d5b3c42
Revises: e63f9c4a2b31
Create Date: 2026-11-04 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f74a0d5b3c42"
down_revision: Union[str, Sequence[str], None] = "e63f9c4a2b31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("payable_items", sa.Column("surveyDate", sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("payable_items", "surveyDate")
