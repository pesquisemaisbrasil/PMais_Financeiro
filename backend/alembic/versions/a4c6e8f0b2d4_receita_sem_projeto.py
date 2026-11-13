"""receita sem projeto: o projeto do título a receber passa a ser opcional

Revision ID: a4c6e8f0b2d4
Revises: b8e0a2c4d6f1
Create Date: 2026-11-11 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4c6e8f0b2d4"
down_revision: Union[str, Sequence[str], None] = "b8e0a2c4d6f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("receivables", "project_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    untied = op.get_bind().execute(
        sa.text("SELECT 1 FROM receivables WHERE project_id IS NULL LIMIT 1")
    ).first()
    if untied:
        # não inventa projeto: quem volta a migração decide a que projeto cada título pertence
        raise RuntimeError(
            "Há títulos a receber sem projeto. Ligue cada um a um projeto antes de voltar esta migração."
        )
    op.alter_column("receivables", "project_id", existing_type=sa.Integer(), nullable=False)
