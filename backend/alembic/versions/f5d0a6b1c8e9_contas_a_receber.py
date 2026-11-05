"""contas a receber: clientes, título, recebimento e tipo de conta do plano de contas

Revision ID: f5d0a6b1c8e9
Revises: e4c9f5a0b7d8
Create Date: 2026-11-06 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f5d0a6b1c8e9"
down_revision: Union[str, Sequence[str], None] = "e4c9f5a0b7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOW = sa.text("now()")


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "expense_categories",
        sa.Column("kind", sa.String(length=10), server_default="despesa", nullable=False),
    )
    op.create_table(
        "customers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nickname", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("document", sa.String(length=14), nullable=True),
        sa.Column("contactName", sa.String(length=120), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customers_id"), "customers", ["id"])
    op.create_index(
        "uq_customers_active_document",
        "customers",
        ["document"],
        unique=True,
        postgresql_where=sa.text("active AND document IS NOT NULL"),
    )

    op.create_table(
        "receivables",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=False),
        sa.Column("cost_center_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("contract", sa.String(length=100), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("documentType", sa.String(length=20), nullable=False),
        sa.Column("documentNumber", sa.String(length=50), nullable=True),
        sa.Column("documentDate", sa.Date(), nullable=True),
        sa.Column("issueDate", sa.Date(), nullable=False),
        sa.Column("dueDate", sa.Date(), nullable=False),
        sa.Column("competence", sa.String(length=7), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("withheld", sa.Numeric(precision=12, scale=2), server_default="0", nullable=False),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("canceledAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["unit_id"], ["business_units.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["cost_center_id"], ["cost_centers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["category_id"], ["expense_categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "id",
        "customer_id",
        "project_id",
        "company_id",
        "unit_id",
        "cost_center_id",
        "category_id",
        "dueDate",
        "deletedAt",
        "created_by_user_id",
    ):
        op.create_index(op.f(f"ix_receivables_{column}"), "receivables", [column])

    op.create_table(
        "receivable_payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receivable_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("reverses_id", sa.Integer(), nullable=True),
        sa.Column("receivedOn", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("bank_account_id", sa.Integer(), nullable=False),
        sa.Column("payment_method_id", sa.Integer(), nullable=False),
        sa.Column("transactionId", sa.String(length=100), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["receivable_id"], ["receivables.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reverses_id"], ["receivable_payments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["bank_account_id"], ["bank_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payment_method_id"], ["payment_methods.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reverses_id"),
    )
    for column in (
        "id",
        "receivable_id",
        "receivedOn",
        "bank_account_id",
        "payment_method_id",
        "created_by_user_id",
    ):
        op.create_index(op.f(f"ix_receivable_payments_{column}"), "receivable_payments", [column])

    op.create_table(
        "receivable_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receivable_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["receivable_id"], ["receivables.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("id", "receivable_id", "user_id"):
        op.create_index(op.f(f"ix_receivable_events_{column}"), "receivable_events", [column])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("receivable_events")
    op.drop_table("receivable_payments")
    op.drop_table("receivables")
    op.drop_index("uq_customers_active_document", table_name="customers")
    op.drop_table("customers")
    op.drop_column("expense_categories", "kind")
