"""unidade opcional: nem toda empresa tem unidade, então a conta a pagar e a receber podem ficar sem ela

Revision ID: c3e5a7b9d1f3
Revises: f1c3e5a7b9d1
Create Date: 2026-11-16 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3e5a7b9d1f3"
down_revision: Union[str, Sequence[str], None] = "f1c3e5a7b9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("payables", "receivables")


def upgrade() -> None:
    for table in TABLES:
        op.alter_column(table, "unit_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    for table in TABLES:
        untied = op.get_bind().execute(
            sa.text(f"SELECT 1 FROM {table} WHERE unit_id IS NULL LIMIT 1")  # noqa: S608
        ).first()
        if untied:
            # não inventa unidade: quem volta a migração decide a que unidade cada lançamento pertence
            raise RuntimeError(
                f"Há lançamentos em {table} sem unidade. Escolha uma unidade para cada um antes de "
                "voltar esta migração."
            )
    for table in TABLES:
        op.alter_column(table, "unit_id", existing_type=sa.Integer(), nullable=False)
