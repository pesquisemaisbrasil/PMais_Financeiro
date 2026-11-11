"""tela de cadastros: ficha do fornecedor e histórico dos cadastros

Revision ID: e63f9c4a2b31
Revises: d52e8b3f1a20
Create Date: 2026-11-04 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e63f9c4a2b31"
down_revision: Union[str, Sequence[str], None] = "d52e8b3f1a20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("suppliers", sa.Column("document", sa.String(length=14), nullable=True))
    op.add_column("suppliers", sa.Column("contactName", sa.String(length=120), nullable=True))
    op.add_column("suppliers", sa.Column("phone", sa.String(length=30), nullable=True))
    op.add_column("suppliers", sa.Column("email", sa.String(length=200), nullable=True))
    op.add_column("suppliers", sa.Column("paymentTerms", sa.String(length=200), nullable=True))
    op.create_index(
        "uq_suppliers_active_document",
        "suppliers",
        ["document"],
        unique=True,
        postgresql_where=sa.text("active AND document IS NOT NULL"),
    )
    op.create_table(
        "record_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("record_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_record_events_id"), "record_events", ["id"], unique=False)
    op.create_index(op.f("ix_record_events_kind"), "record_events", ["kind"], unique=False)
    op.create_index(op.f("ix_record_events_record_id"), "record_events", ["record_id"], unique=False)
    op.create_index(op.f("ix_record_events_user_id"), "record_events", ["user_id"], unique=False)
    # O histórico só recebe linhas novas, nem o sistema apaga.
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
            REVOKE UPDATE, DELETE ON record_events FROM financeiro_app;
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_record_events_user_id"), table_name="record_events")
    op.drop_index(op.f("ix_record_events_record_id"), table_name="record_events")
    op.drop_index(op.f("ix_record_events_kind"), table_name="record_events")
    op.drop_index(op.f("ix_record_events_id"), table_name="record_events")
    op.drop_table("record_events")
    op.drop_index("uq_suppliers_active_document", table_name="suppliers")
    op.drop_column("suppliers", "paymentTerms")
    op.drop_column("suppliers", "email")
    op.drop_column("suppliers", "phone")
    op.drop_column("suppliers", "contactName")
    op.drop_column("suppliers", "document")
