"""demanda concluída: quando e por quem, para avisar quem abriu

Revision ID: d5f9b3a7c1e4
Revises: c4e8a2f6b913
Create Date: 2026-11-19 17:00:00.000000

Pedido do Bruno em 19/11/2026 (spec demandas): o super admin clica em Concluído e quem abriu a
demanda recebe um aviso no sino.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d5f9b3a7c1e4"
down_revision: str | Sequence[str] | None = "c4e8a2f6b913"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("demands") as batch:
        batch.add_column(sa.Column("doneAt", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("done_by_user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_demands_done_by_user_id", "users", ["done_by_user_id"], ["id"], ondelete="RESTRICT"
        )


def downgrade() -> None:
    with op.batch_alter_table("demands") as batch:
        batch.drop_constraint("fk_demands_done_by_user_id", type_="foreignkey")
        batch.drop_column("done_by_user_id")
        batch.drop_column("doneAt")
