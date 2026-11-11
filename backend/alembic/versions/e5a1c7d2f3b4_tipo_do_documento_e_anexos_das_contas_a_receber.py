"""tipo do documento anexado e anexos das contas a receber

Revision ID: e5a1c7d2f3b4
Revises: d9e4f0a5b3c2
Create Date: 2026-11-06 23:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5a1c7d2f3b4"
down_revision: Union[str, Sequence[str], None] = "d9e4f0a5b3c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Os documentos que já existem ficam como "outro": ninguém disse o que eram.
    op.add_column(
        "payable_attachments",
        sa.Column("kind", sa.String(length=20), server_default="outro", nullable=False),
    )
    op.create_table(
        "receivable_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receivable_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=20), server_default="outro", nullable=False),
        sa.Column("contentType", sa.String(length=100), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("fileKey", sa.String(length=200), nullable=False),
        sa.Column("fileSha256", sa.String(length=64), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deletedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_user_id", sa.Integer(), nullable=True),
        sa.Column("deletedReason", sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(["receivable_id"], ["receivables.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["deleted_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fileKey"),
    )
    op.create_index(op.f("ix_receivable_attachments_id"), "receivable_attachments", ["id"])
    op.create_index(
        op.f("ix_receivable_attachments_receivable_id"), "receivable_attachments", ["receivable_id"]
    )

    # Remover anexo é lógico (UPDATE em deletedAt): a role da app nunca apaga linha. Só existe onde
    # roles.sql rodou; fora dele (testes em SQLite), não há o que revogar.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
                REVOKE DELETE ON receivable_attachments FROM financeiro_app;
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_receivable_attachments_receivable_id"), table_name="receivable_attachments")
    op.drop_index(op.f("ix_receivable_attachments_id"), table_name="receivable_attachments")
    op.drop_table("receivable_attachments")
    op.drop_column("payable_attachments", "kind")
