"""importar planilha: prazo de incentivo no projeto, bruto do RPA e resumo do arquivo

Revision ID: d52e8b3f1a20
Revises: c41d7a2e9b10
Create Date: 2026-11-04 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d52e8b3f1a20"
down_revision: Union[str, Sequence[str], None] = "c41d7a2e9b10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("projects", sa.Column("projectType", sa.String(length=40), nullable=True))
    op.add_column(
        "projects",
        sa.Column("hasIncentive", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("projects", sa.Column("incentiveDays", sa.Integer(), nullable=True))
    op.add_column("payables", sa.Column("importHash", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_payables_importHash"), "payables", ["importHash"], unique=False)
    op.add_column("payable_items", sa.Column("grossAmount", sa.Numeric(10, 2), nullable=True))
    op.add_column("payable_items", sa.Column("invoiceDate", sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("payable_items", "invoiceDate")
    op.drop_column("payable_items", "grossAmount")
    op.drop_index(op.f("ix_payables_importHash"), table_name="payables")
    op.drop_column("payables", "importHash")
    op.drop_column("projects", "incentiveDays")
    op.drop_column("projects", "hasIncentive")
    op.drop_column("projects", "projectType")
