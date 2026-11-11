"""tipo de pessoa (física ou jurídica) nos cadastros

Revision ID: c3e5a7b9d1f2
Revises: b2d4f6a8c0e1
Create Date: 2026-11-09 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3e5a7b9d1f2"
down_revision: Union[str, Sequence[str], None] = "b2d4f6a8c0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("suppliers", "customers", "companies")


def upgrade() -> None:
    """Upgrade schema."""
    for table in TABLES:
        op.add_column(table, sa.Column("personType", sa.String(length=2), nullable=True))
        # Quem tem CNPJ é pessoa jurídica. Os demais ficam sem tipo: ninguém disse o que são.
        op.execute(sa.text(f'UPDATE {table} SET "personType" = \'PJ\' WHERE document IS NOT NULL'))


def downgrade() -> None:
    """Downgrade schema."""
    for table in TABLES:
        op.drop_column(table, "personType")
