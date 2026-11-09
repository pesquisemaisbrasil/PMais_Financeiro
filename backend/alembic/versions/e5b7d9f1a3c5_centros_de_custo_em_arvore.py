"""centros de custo em árvore: código, superior e nome único por superior

Revision ID: e5b7d9f1a3c5
Revises: d4f6b8c0e2a3
Create Date: 2026-11-09 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5b7d9f1a3c5"
down_revision: Union[str, Sequence[str], None] = "d4f6b8c0e2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("cost_centers", sa.Column("code", sa.String(length=20), nullable=True))
    op.add_column("cost_centers", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_cost_centers_parent_id", "cost_centers", "cost_centers", ["parent_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index("ix_cost_centers_parent_id", "cost_centers", ["parent_id"])
    # O nome deixa de ser único no cadastro todo: vale por superior.
    op.drop_constraint("cost_centers_name_key", "cost_centers", type_="unique")
    # Os centros que já existem viram principais, 001, 002... na ordem em que foram criados.
    op.execute(
        sa.text(
            "UPDATE cost_centers c SET code = lpad(s.rn::text, 3, '0') "
            "FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM cost_centers) s "
            "WHERE c.id = s.id"
        )
    )
    # Contador dos principais e um contador de sub-centros para cada principal (record_counters).
    op.execute(
        sa.text(
            'INSERT INTO record_counters (kind, "lastValue") SELECT \'costCenters\', count(*) FROM cost_centers'
        )
    )
    op.execute(
        sa.text(
            'INSERT INTO record_counters (kind, "lastValue") '
            "SELECT 'costCenters:' || id, 0 FROM cost_centers"
        )
    )
    op.create_index("uq_cost_centers_code", "cost_centers", ["code"], unique=True)
    op.create_index(
        "uq_cost_centers_name_root",
        "cost_centers",
        ["name"],
        unique=True,
        postgresql_where=sa.text("parent_id IS NULL"),
    )
    op.create_index(
        "uq_cost_centers_name_parent",
        "cost_centers",
        ["parent_id", "name"],
        unique=True,
        postgresql_where=sa.text("parent_id IS NOT NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_cost_centers_name_parent", table_name="cost_centers")
    op.drop_index("uq_cost_centers_name_root", table_name="cost_centers")
    op.drop_index("uq_cost_centers_code", table_name="cost_centers")
    op.execute(sa.text("DELETE FROM record_counters WHERE kind = 'costCenters' OR kind LIKE 'costCenters:%'"))
    # Falha se dois centros tiverem o mesmo nome (permitido só com a árvore): resolva antes de voltar.
    op.create_unique_constraint("cost_centers_name_key", "cost_centers", ["name"])
    op.drop_index("ix_cost_centers_parent_id", table_name="cost_centers")
    op.drop_constraint("fk_cost_centers_parent_id", "cost_centers", type_="foreignkey")
    op.drop_column("cost_centers", "parent_id")
    op.drop_column("cost_centers", "code")
