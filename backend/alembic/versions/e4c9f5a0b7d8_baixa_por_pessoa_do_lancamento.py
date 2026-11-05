"""pessoa do lançamento sabe quem do Connect é e quando foi paga

Revision ID: e4c9f5a0b7d8
Revises: d3b8e4f9a6c7
Create Date: 2026-11-06 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4c9f5a0b7d8"
down_revision: Union[str, Sequence[str], None] = "d3b8e4f9a6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("payable_items", sa.Column("connect_interviewer_id", sa.Integer(), nullable=True))
    op.add_column("payable_items", sa.Column("paidOn", sa.Date(), nullable=True))
    op.create_index(
        op.f("ix_payable_items_connect_interviewer_id"), "payable_items", ["connect_interviewer_id"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_payable_items_connect_interviewer_id"), table_name="payable_items")
    op.drop_column("payable_items", "paidOn")
    op.drop_column("payable_items", "connect_interviewer_id")
