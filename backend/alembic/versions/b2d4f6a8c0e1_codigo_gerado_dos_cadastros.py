"""código gerado dos cadastros: contador por cadastro e código único

Revision ID: b2d4f6a8c0e1
Revises: a1c3e5f7b9d2
Create Date: 2026-11-09 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2d4f6a8c0e1"
down_revision: Union[str, Sequence[str], None] = "a1c3e5f7b9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = {"suppliers": "suppliers", "customers": "customers", "companies": "companies"}


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "record_counters",
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("lastValue", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("kind"),
    )
    for kind, table in TABLES.items():
        op.execute(sa.text("INSERT INTO record_counters (kind, \"lastValue\") VALUES (:kind, 0)").bindparams(kind=kind))
        # O código digitado à mão nos primeiros dias pode ter se repetido: fica o do cadastro mais
        # antigo, e os outros voltam a ficar sem código (os novos ganham o seu pelo sistema).
        op.execute(
            sa.text(
                f"UPDATE {table} SET code = NULL WHERE code IS NOT NULL AND id NOT IN "
                f"(SELECT MIN(id) FROM {table} WHERE code IS NOT NULL GROUP BY code)"
            )
        )
        op.create_index(f"uq_{table}_code", table, ["code"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    for table in TABLES.values():
        op.drop_index(f"uq_{table}_code", table_name=table)
    op.drop_table("record_counters")
