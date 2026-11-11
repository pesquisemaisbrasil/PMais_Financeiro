"""cadastro de feriados: os nacionais da BrasilAPI e os locais do financeiro, que contam como dia
não útil

Revision ID: b6d8f0a2c4e6
Revises: a4c6e8f0b2d4
Create Date: 2026-11-11 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6d8f0a2c4e6"
down_revision: Union[str, Sequence[str], None] = "a4c6e8f0b2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "holidays",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("scope", sa.String(length=12), nullable=False),
        sa.Column("uf", sa.String(length=2), nullable=True),
        sa.Column("city", sa.String(length=80), nullable=True),
        sa.Column("source", sa.String(length=12), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("day", "name", name="uq_holidays_day_name"),
    )
    op.create_index(op.f("ix_holidays_id"), "holidays", ["id"], unique=False)
    op.create_index(op.f("ix_holidays_day"), "holidays", ["day"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_holidays_day"), table_name="holidays")
    op.drop_index(op.f("ix_holidays_id"), table_name="holidays")
    op.drop_table("holidays")
