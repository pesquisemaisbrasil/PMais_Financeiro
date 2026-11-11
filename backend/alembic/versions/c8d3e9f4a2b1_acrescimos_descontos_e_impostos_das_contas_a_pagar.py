"""acréscimos, descontos e impostos das contas a pagar

Revision ID: c8d3e9f4a2b1
Revises: b7a2d8e3f1c9
Create Date: 2026-11-06 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8d3e9f4a2b1"
down_revision: Union[str, Sequence[str], None] = "b7a2d8e3f1c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "payable_adjustments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("payable_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("description", sa.String(length=120), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["payable_id"], ["payables.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payable_adjustments_id"), "payable_adjustments", ["id"])
    op.create_index(op.f("ix_payable_adjustments_payable_id"), "payable_adjustments", ["payable_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_payable_adjustments_payable_id"), table_name="payable_adjustments")
    op.drop_index(op.f("ix_payable_adjustments_id"), table_name="payable_adjustments")
    op.drop_table("payable_adjustments")
