"""cliente com ficha completa: inscrição estadual, mais telefones e e-mail, observações, endereço
e documentos

Revision ID: b8e0a2c4d6f1
Revises: f6c8e0a2b4d6
Create Date: 2026-11-11 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8e0a2c4d6f1"
down_revision: Union[str, Sequence[str], None] = "f6c8e0a2b4d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_COLUMNS = [
    ("stateRegistration", 30),
    ("phone2", 30),
    ("phone3", 30),
    ("emailAlt", 200),
    ("notes", 1000),
    ("addressCountry", 60),
    ("addressZip", 8),
    ("addressStreet", 150),
    ("addressNumber", 20),
    ("addressComplement", 100),
    ("addressDistrict", 80),
    ("addressCity", 80),
    ("addressState", 2),
]


def upgrade() -> None:
    """Upgrade schema."""
    for name, length in NEW_COLUMNS:
        op.add_column("customers", sa.Column(name, sa.String(length=length), nullable=True))
    op.create_table(
        "customer_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
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
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["deleted_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fileKey"),
    )
    op.create_index(op.f("ix_customer_attachments_id"), "customer_attachments", ["id"])
    op.create_index(
        op.f("ix_customer_attachments_customer_id"), "customer_attachments", ["customer_id"]
    )

    # Remover anexo é lógico (UPDATE em deletedAt): a role da app nunca apaga linha. Só existe onde
    # roles.sql rodou; fora dele (testes em SQLite), não há o que revogar.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
                REVOKE DELETE ON customer_attachments FROM financeiro_app;
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_customer_attachments_customer_id"), table_name="customer_attachments")
    op.drop_index(op.f("ix_customer_attachments_id"), table_name="customer_attachments")
    op.drop_table("customer_attachments")
    for name, _ in reversed(NEW_COLUMNS):
        op.drop_column("customers", name)
