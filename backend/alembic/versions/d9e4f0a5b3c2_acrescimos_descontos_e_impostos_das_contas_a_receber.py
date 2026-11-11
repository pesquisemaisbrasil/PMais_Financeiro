"""acréscimos, descontos e impostos das contas a receber

Os abatimentos que já estavam lançados viram impostos, para o líquido de cada título continuar o mesmo.

Revision ID: d9e4f0a5b3c2
Revises: c8d3e9f4a2b1
Create Date: 2026-11-06 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9e4f0a5b3c2"
down_revision: Union[str, Sequence[str], None] = "c8d3e9f4a2b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "receivable_adjustments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receivable_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("description", sa.String(length=120), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["receivable_id"], ["receivables.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_receivable_adjustments_id"), "receivable_adjustments", ["id"])
    op.create_index(
        op.f("ix_receivable_adjustments_receivable_id"), "receivable_adjustments", ["receivable_id"]
    )
    # A coluna `withheld` fica como está (legado, já sem uso): é o que o downgrade devolve.
    op.execute(
        """
        INSERT INTO receivable_adjustments (receivable_id, kind, description, amount)
        SELECT id, 'imposto', 'Abatimento lançado antes', withheld FROM receivables WHERE withheld > 0
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        """
        UPDATE receivables SET withheld = COALESCE(
            (SELECT SUM(a.amount) FROM receivable_adjustments a
             WHERE a.receivable_id = receivables.id AND a.kind = 'imposto'), 0)
        """
    )
    op.drop_index(
        op.f("ix_receivable_adjustments_receivable_id"), table_name="receivable_adjustments"
    )
    op.drop_index(op.f("ix_receivable_adjustments_id"), table_name="receivable_adjustments")
    op.drop_table("receivable_adjustments")
