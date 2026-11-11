"""provisão substituída pelo lançamento real

Revision ID: c41d7a2e9b10
Revises: 9947141b77e5
Create Date: 2026-11-04 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c41d7a2e9b10"
down_revision: Union[str, Sequence[str], None] = "9947141b77e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("payables", sa.Column("replaced_by_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_payables_replaced_by_id"), "payables", ["replaced_by_id"], unique=False)
    op.create_foreign_key(
        op.f("payables_replaced_by_id_fkey"),
        "payables",
        "payables",
        ["replaced_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("payables_replaced_by_id_fkey"), "payables", type_="foreignkey")
    op.drop_index(op.f("ix_payables_replaced_by_id"), table_name="payables")
    op.drop_column("payables", "replaced_by_id")
