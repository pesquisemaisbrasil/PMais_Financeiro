"""níveis de acesso: telas bloqueadas por pessoa e demandas para o super admin

Revision ID: c4e8a2f6b913
Revises: a7c3e9d15b42
Create Date: 2026-11-19 15:00:00.000000

Pedido do Bruno em 19/11/2026 (spec acesso-e-auditoria e demandas): o admin bloqueia telas de cada
usuário (`users.blockedScreens`, os códigos separados por vírgula), e qualquer pessoa abre uma
demanda com anexo que só o super admin lê. O papel `superadmin` cabe na coluna `role` de hoje.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c4e8a2f6b913"
down_revision: str | Sequence[str] | None = "a7c3e9d15b42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("blockedScreens", sa.String(300), nullable=False, server_default=""),
    )
    op.create_table(
        "demands",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("page", sa.String(200), nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("fileName", sa.String(200), nullable=False),
        sa.Column("contentType", sa.String(100), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("fileKey", sa.String(200), nullable=False, unique=True),
        sa.Column("fileSha256", sa.String(64), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_demands_id", "demands", ["id"])


def downgrade() -> None:
    op.drop_index("ix_demands_id", table_name="demands")
    op.drop_table("demands")
    op.drop_column("users", "blockedScreens")
