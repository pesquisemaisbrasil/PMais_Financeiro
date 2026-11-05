"""parcelas e recorrência também nas contas a receber

Revision ID: a6f1c7d2e0b8
Revises: f5d0a6b1c8e9
Create Date: 2026-11-06 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a6f1c7d2e0b8"
down_revision: Union[str, Sequence[str], None] = "f5d0a6b1c8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("receivables", sa.Column("series_id", sa.Integer(), nullable=True))
    op.add_column("receivables", sa.Column("seriesIndex", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_receivables_series_id"), "receivables", ["series_id"])
    op.create_foreign_key(
        "fk_receivables_series_id", "receivables", "payable_series", ["series_id"], ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_receivables_series_id", "receivables", type_="foreignkey")
    op.drop_index(op.f("ix_receivables_series_id"), table_name="receivables")
    op.drop_column("receivables", "seriesIndex")
    op.drop_column("receivables", "series_id")
