"""série de contas a pagar que se repetem

Revision ID: d3b8e4f9a6c7
Revises: c2a7d3e8f5b6
Create Date: 2026-11-06 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3b8e4f9a6c7"
down_revision: Union[str, Sequence[str], None] = "c2a7d3e8f5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "payable_series",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("startDate", sa.Date(), nullable=False),
        sa.Column("estimated", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payable_series_id"), "payable_series", ["id"])
    op.create_index(
        op.f("ix_payable_series_created_by_user_id"), "payable_series", ["created_by_user_id"]
    )
    op.add_column("payables", sa.Column("series_id", sa.Integer(), nullable=True))
    op.add_column("payables", sa.Column("seriesIndex", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_payables_series_id"), "payables", ["series_id"])
    op.create_foreign_key(
        "fk_payables_series_id", "payables", "payable_series", ["series_id"], ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_payables_series_id", "payables", type_="foreignkey")
    op.drop_index(op.f("ix_payables_series_id"), table_name="payables")
    op.drop_column("payables", "seriesIndex")
    op.drop_column("payables", "series_id")
    op.drop_table("payable_series")
