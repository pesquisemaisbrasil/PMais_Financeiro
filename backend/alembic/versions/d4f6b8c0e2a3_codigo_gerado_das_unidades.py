"""código gerado das unidades

Revision ID: d4f6b8c0e2a3
Revises: c3e5a7b9d1f2
Create Date: 2026-11-09 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4f6b8c0e2a3"
down_revision: Union[str, Sequence[str], None] = "c3e5a7b9d1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("business_units", sa.Column("code", sa.String(length=20), nullable=True))
    op.create_index("uq_business_units_code", "business_units", ["code"], unique=True)
    op.execute(sa.text("INSERT INTO record_counters (kind, \"lastValue\") VALUES ('units', 0)"))


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(sa.text("DELETE FROM record_counters WHERE kind = 'units'"))
    op.drop_index("uq_business_units_code", table_name="business_units")
    op.drop_column("business_units", "code")
