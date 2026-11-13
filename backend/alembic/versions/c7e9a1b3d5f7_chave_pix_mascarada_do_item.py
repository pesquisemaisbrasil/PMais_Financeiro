"""chave Pix mascarada de cada pessoa do lançamento de incentivo (nunca a chave completa)

Revision ID: c7e9a1b3d5f7
Revises: b6d8f0a2c4e6
Create Date: 2026-11-12 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7e9a1b3d5f7"
down_revision: Union[str, Sequence[str], None] = "b6d8f0a2c4e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payable_items", sa.Column("pix_masked", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("payable_items", "pix_masked")
