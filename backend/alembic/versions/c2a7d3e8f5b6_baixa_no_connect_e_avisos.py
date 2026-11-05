"""pedidos de baixa ao Connect, lote ligado ao lançamento e avisos

Revision ID: c2a7d3e8f5b6
Revises: b196f2d7e5a4
Create Date: 2026-11-05 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2a7d3e8f5b6"
down_revision: Union[str, Sequence[str], None] = "b196f2d7e5a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOW = sa.text("now()")


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("receipt_batches", sa.Column("payable_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_receipt_batches_payable_id"), "receipt_batches", ["payable_id"])
    op.create_foreign_key(
        "fk_receipt_batches_payable_id", "receipt_batches", "payables", ["payable_id"], ["id"],
        ondelete="RESTRICT",
    )

    op.create_table(
        "payment_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receipt_id", sa.Integer(), nullable=False),
        sa.Column("paymentRef", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("lastError", sa.String(length=255), nullable=True),
        sa.Column("sentAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("appliedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["receipt_id"], ["payment_receipts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("receipt_id"),
        sa.UniqueConstraint("paymentRef"),
    )
    op.create_index(op.f("ix_payment_requests_id"), "payment_requests", ["id"])
    op.create_index(op.f("ix_payment_requests_status"), "payment_requests", ["status"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.String(length=500), nullable=True),
        sa.Column("link", sa.String(length=255), nullable=True),
        sa.Column("readAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notifications_id"), "notifications", ["id"])
    op.create_index(op.f("ix_notifications_user_id"), "notifications", ["user_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("notifications")
    op.drop_table("payment_requests")
    op.drop_constraint("fk_receipt_batches_payable_id", "receipt_batches", type_="foreignkey")
    op.drop_index(op.f("ix_receipt_batches_payable_id"), table_name="receipt_batches")
    op.drop_column("receipt_batches", "payable_id")
