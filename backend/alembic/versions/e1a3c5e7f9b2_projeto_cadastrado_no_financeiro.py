"""projeto cadastrado no Financeiro: cliente, unidade e centro de custo padrão do lançamento

Revision ID: e1a3c5e7f9b2
Revises: d5f7b9e1a3c4
Create Date: 2026-11-17 10:00:00.000000

Testes com o financeiro de 16/11 (A2, A22; ADR 0021). Tudo opcional: os projetos que já existem
ficam como estão, e o lançamento só preenche sozinho a unidade e o centro de custo de quem tiver.
A ligação com o projeto do Connect ficou para depois (plano futuro, pedido do Bruno em 17/11).
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e1a3c5e7f9b2"
down_revision: str | Sequence[str] | None = "d5f7b9e1a3c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = (
    ("customer_id", "customers", "RESTRICT"),
    ("unit_id", "business_units", "RESTRICT"),
    ("cost_center_id", "cost_centers", "RESTRICT"),
)


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        for column, table, on_delete in COLUMNS:
            batch.add_column(sa.Column(column, sa.Integer(), nullable=True))
            batch.create_foreign_key(
                f"fk_projects_{column}", table, [column], ["id"], ondelete=on_delete
            )
    for column, _, _ in COLUMNS:
        op.create_index(f"ix_projects_{column}", "projects", [column])


def downgrade() -> None:
    for column, _, _ in COLUMNS:
        op.drop_index(f"ix_projects_{column}", table_name="projects")
    with op.batch_alter_table("projects") as batch:
        for column, _, _ in reversed(COLUMNS):
            batch.drop_constraint(f"fk_projects_{column}", type_="foreignkey")
            batch.drop_column(column)
