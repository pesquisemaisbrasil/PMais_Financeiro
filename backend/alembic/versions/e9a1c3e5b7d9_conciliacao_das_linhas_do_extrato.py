"""conciliação das linhas do extrato: ligada a um lançamento ou exceção com motivo

Revision ID: e9a1c3e5b7d9
Revises: d8f0b2c4e6a8
Create Date: 2026-11-12 18:00:00.000000

`bank_reconciliations` é o estado de agora (desfazer apaga a linha), e `bank_reconciliation_events`
guarda quem fez o quê, só de inserção: a role da app não faz UPDATE nem DELETE nela.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e9a1c3e5b7d9"
down_revision: Union[str, Sequence[str], None] = "d8f0b2c4e6a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "bank_reconciliations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bank_transaction_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=12), nullable=False),
        sa.Column("classification", sa.String(length=20), nullable=True),
        sa.Column("payable_id", sa.Integer(), nullable=True),
        sa.Column("payable_item_id", sa.Integer(), nullable=True),
        sa.Column("receivable_id", sa.Integer(), nullable=True),
        sa.Column("nfNumber", sa.String(length=50), nullable=True),
        sa.Column("nfIssuedOn", sa.Date(), nullable=True),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.Column("reconciled_by_id", sa.Integer(), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "(kind = 'excecao' AND payable_id IS NULL AND receivable_id IS NULL)"
            " OR (kind = 'lancamento' AND ((payable_id IS NOT NULL AND receivable_id IS NULL)"
            " OR (payable_id IS NULL AND receivable_id IS NOT NULL)))",
            name="ck_bank_reconciliations_target",
        ),
        sa.ForeignKeyConstraint(["bank_transaction_id"], ["bank_transactions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payable_id"], ["payables.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payable_item_id"], ["payable_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["receivable_id"], ["receivables.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reconciled_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bank_transaction_id"),
        sa.UniqueConstraint("payable_item_id"),
    )
    op.create_index(op.f("ix_bank_reconciliations_id"), "bank_reconciliations", ["id"], unique=False)
    op.create_index(
        op.f("ix_bank_reconciliations_payable_id"), "bank_reconciliations", ["payable_id"], unique=False
    )
    op.create_index(
        op.f("ix_bank_reconciliations_receivable_id"),
        "bank_reconciliations",
        ["receivable_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bank_reconciliations_reconciled_by_id"),
        "bank_reconciliations",
        ["reconciled_by_id"],
        unique=False,
    )

    op.create_table(
        "bank_reconciliation_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bank_transaction_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column(
            "createdAt", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["bank_transaction_id"], ["bank_transactions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bank_reconciliation_events_id"), "bank_reconciliation_events", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_bank_reconciliation_events_bank_transaction_id"),
        "bank_reconciliation_events",
        ["bank_transaction_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_bank_reconciliation_events_user_id"),
        "bank_reconciliation_events",
        ["user_id"],
        unique=False,
    )

    # A role da app só existe onde roles.sql rodou: fora dele (CI antigo, testes), não há o que revogar.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'financeiro_app') THEN
                REVOKE UPDATE, DELETE ON bank_reconciliation_events FROM financeiro_app;
              END IF;
            END $$;
            """
        )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("bank_reconciliation_events")
    op.drop_table("bank_reconciliations")
