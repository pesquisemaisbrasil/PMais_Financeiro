"""unidade opcional no título a receber: nem toda empresa tem unidade

Revision ID: c3e5a7b9d1f3
Revises: f1c3e5a7b9d1
Create Date: 2026-11-16 10:30:00.000000

Só `receivables.unit_id`. No Contas a pagar a unidade continua obrigatória, como no sistema antigo
(decisão do Bruno em 16/11/2026): a Nova conta a pagar não tem campo Empresa, a empresa vem da unidade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3e5a7b9d1f3"
down_revision: Union[str, Sequence[str], None] = "f1c3e5a7b9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("receivables", "unit_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    untied = op.get_bind().execute(
        sa.text("SELECT 1 FROM receivables WHERE unit_id IS NULL LIMIT 1")
    ).first()
    if untied:
        # não inventa unidade: quem volta a migração decide a que unidade cada título pertence
        raise RuntimeError(
            "Há títulos a receber sem unidade. Escolha uma unidade para cada um antes de voltar esta migração."
        )
    op.alter_column("receivables", "unit_id", existing_type=sa.Integer(), nullable=False)
