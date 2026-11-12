"""contas bancárias com banco, agência, conta, tipo e saldo inicial; e o extrato importado

Revision ID: d8f0b2c4e6a8
Revises: c7e9a1b3d5f7
Create Date: 2026-11-12 16:00:00.000000

A transação do extrato é imutável: a role da app não faz UPDATE nem DELETE nelas (o mesmo que o
a pagar já faz com as baixas e o histórico).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d8f0b2c4e6a8"
down_revision: Union[str, Sequence[str], None] = "c7e9a1b3d5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("bank_accounts", sa.Column("bankName", sa.String(length=60), nullable=True))
    op.add_column("bank_accounts", sa.Column("agency", sa.String(length=20), nullable=True))
    op.add_column("bank_accounts", sa.Column("accountNumber", sa.String(length=30), nullable=True))
    op.add_column("bank_accounts", sa.Column("accountType", sa.String(length=20), nullable=True))
    op.add_column(
        "bank_accounts",
        sa.Column(
            "openingBalance", sa.Numeric(precision=14, scale=2), server_default="0", nullable=False
        ),
    )
    op.add_column("bank_accounts", sa.Column("openingDate", sa.Date(), nullable=True))

    op.create_table(
        "bank_statements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bank_account_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("fileHash", sa.String(length=64), nullable=False),
        sa.Column("fileFormat", sa.String(length=10), nullable=False),
        sa.Column("periodStart", sa.Date(), nullable=False),
        sa.Column("periodEnd", sa.Date(), nullable=False),
        sa.Column("newLines", sa.Integer(), nullable=False),
        sa.Column("duplicateLines", sa.Integer(), nullable=False),
        sa.Column("imported_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["bank_account_id"], ["bank_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["imported_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bank_statements_id"), "bank_statements", ["id"], unique=False)
    op.create_index(
        op.f("ix_bank_statements_bank_account_id"),
        "bank_statements",
        ["bank_account_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bank_statements_fileHash"), "bank_statements", ["fileHash"], unique=False
    )

    op.create_table(
        "bank_transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bank_account_id", sa.Integer(), nullable=False),
        sa.Column("statement_id", sa.Integer(), nullable=False),
        sa.Column("postedOn", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("description_enc", sa.Text(), nullable=False),
        sa.Column("externalId", sa.String(length=100), nullable=True),
        sa.Column("dedupeKey", sa.String(length=64), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["bank_account_id"], ["bank_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["statement_id"], ["bank_statements.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "bank_account_id", "dedupeKey", name="uq_bank_transactions_account_key"
        ),
    )
    op.create_index(op.f("ix_bank_transactions_id"), "bank_transactions", ["id"], unique=False)
    op.create_index(
        op.f("ix_bank_transactions_bank_account_id"),
        "bank_transactions",
        ["bank_account_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bank_transactions_statement_id"),
        "bank_transactions",
        ["statement_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bank_transactions_postedOn"), "bank_transactions", ["postedOn"], unique=False
    )

    # A role da app só existe onde roles.sql rodou: fora dele (CI antigo, testes), não há o que revogar.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
                REVOKE UPDATE, DELETE ON bank_transactions, bank_statements FROM financeiro_app;
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("bank_transactions")
    op.drop_table("bank_statements")
    op.drop_column("bank_accounts", "openingDate")
    op.drop_column("bank_accounts", "openingBalance")
    op.drop_column("bank_accounts", "accountType")
    op.drop_column("bank_accounts", "accountNumber")
    op.drop_column("bank_accounts", "agency")
    op.drop_column("bank_accounts", "bankName")
