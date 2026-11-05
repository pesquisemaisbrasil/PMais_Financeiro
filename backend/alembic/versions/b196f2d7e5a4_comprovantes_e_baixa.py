"""lotes de comprovantes, comprovantes, baixa e espelhos do Connect

Revision ID: b196f2d7e5a4
Revises: a085e1c6d4f3
Create Date: 2026-11-05 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b196f2d7e5a4"
down_revision: Union[str, Sequence[str], None] = "a085e1c6d4f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOW = sa.text("now()")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "project_refs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("connect_project_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("paymentTermDays", sa.Integer(), nullable=True),
        sa.Column("syncedAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("connect_project_id"),
    )
    op.create_index(op.f("ix_project_refs_id"), "project_refs", ["id"], unique=False)

    op.create_table(
        "connect_payable_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("connect_interview_id", sa.Integer(), nullable=False),
        sa.Column("project_ref_id", sa.Integer(), nullable=False),
        sa.Column("connect_interviewer_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("launchedAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dueOn", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("paidOn", sa.Date(), nullable=True),
        sa.Column("connectUpdatedAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("syncedAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["project_ref_id"], ["project_refs.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("connect_interview_id"),
    )
    op.create_index(op.f("ix_connect_payable_items_id"), "connect_payable_items", ["id"])
    op.create_index(
        op.f("ix_connect_payable_items_project_ref_id"), "connect_payable_items", ["project_ref_id"]
    )
    op.create_index(
        op.f("ix_connect_payable_items_connect_interviewer_id"),
        "connect_payable_items",
        ["connect_interviewer_id"],
    )
    op.create_index(op.f("ix_connect_payable_items_status"), "connect_payable_items", ["status"])

    op.create_table(
        "receipt_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_ref_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("confirmed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("partsExpected", sa.Integer(), nullable=False),
        sa.Column("confirmedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["project_ref_id"], ["project_refs.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["confirmed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("id", "project_ref_id", "uploaded_by_user_id", "confirmed_by_user_id", "status"):
        op.create_index(op.f(f"ix_receipt_batches_{column}"), "receipt_batches", [column])

    op.create_table(
        "receipt_batch_parts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("partIndex", sa.Integer(), nullable=False),
        sa.Column("pageOffset", sa.Integer(), nullable=False),
        sa.Column("receiptsCount", sa.Integer(), nullable=False),
        sa.Column("error", sa.String(length=255), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["receipt_batches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "partIndex"),
    )
    op.create_index(op.f("ix_receipt_batch_parts_id"), "receipt_batch_parts", ["id"])
    op.create_index(op.f("ix_receipt_batch_parts_batch_id"), "receipt_batch_parts", ["batch_id"])

    op.create_table(
        "payment_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("payeeNameEncrypted", sa.String(), nullable=True),
        sa.Column("payeeKeyHash", sa.String(length=64), nullable=True),
        sa.Column("payeeKeyMasked", sa.String(length=255), nullable=True),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("paidOn", sa.Date(), nullable=True),
        sa.Column("e2eId", sa.String(length=64), nullable=True),
        sa.Column("group", sa.String(length=30), nullable=False),
        sa.Column("connect_interviewer_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error", sa.String(length=255), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["receipt_batches.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("id", "batch_id", "payeeKeyHash", "e2eId", "status"):
        op.create_index(op.f(f"ix_payment_receipts_{column}"), "payment_receipts", [column])
    op.create_index(
        "uq_payment_receipts_e2e_paid",
        "payment_receipts",
        ["e2eId"],
        unique=True,
        postgresql_where=sa.text("status = 'pago'"),
    )

    op.create_table(
        "receipt_allocations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receipt_id", sa.Integer(), nullable=False),
        sa.Column("payable_item_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("connectAckAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["receipt_id"], ["payment_receipts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["payable_item_id"], ["connect_payable_items.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payable_item_id"),
    )
    op.create_index(op.f("ix_receipt_allocations_id"), "receipt_allocations", ["id"])
    op.create_index(op.f("ix_receipt_allocations_receipt_id"), "receipt_allocations", ["receipt_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("receipt_allocations")
    op.drop_index("uq_payment_receipts_e2e_paid", table_name="payment_receipts")
    op.drop_table("payment_receipts")
    op.drop_table("receipt_batch_parts")
    op.drop_table("receipt_batches")
    op.drop_table("connect_payable_items")
    op.drop_table("project_refs")
