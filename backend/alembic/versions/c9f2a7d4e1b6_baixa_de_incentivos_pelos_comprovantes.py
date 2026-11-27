"""baixa de incentivos pelos comprovantes Pix: hash da chave na pessoa e o Pix ligado a ela

Revision ID: c9f2a7d4e1b6
Revises: b8e4f1a2c3d5
Create Date: 2026-11-27 15:00:00.000000

Pedido do Bruno em 27/11/2026: a planilha de incentivos vira um lançamento só, com as pessoas
dentro, e a baixa sai pelos comprovantes Pix, cada um casado com a pessoa pela chave e anexado nela.
- `payable_items.pix_hash`: o HMAC da chave normalizada (core/pix.hash_pix), para casar sem guardar a
  chave;
- `payables.paidByReceipts`: o lançamento só é baixado pelos comprovantes;
- `payable_payments.item_id` e `payable_attachments.item_id`: o Pix e o comprovante de cada pessoa.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c9f2a7d4e1b6"
down_revision: str | Sequence[str] | None = "b8e4f1a2c3d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payable_items", sa.Column("pix_hash", sa.String(64), nullable=True))
    op.create_index("ix_payable_items_pix_hash", "payable_items", ["pix_hash"])
    op.add_column(
        "payables",
        sa.Column("paidByReceipts", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    for table in ("payable_payments", "payable_attachments"):
        op.add_column(table, sa.Column("item_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_item_id",
            table,
            "payable_items",
            ["item_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(f"ix_{table}_item_id", table, ["item_id"])


def downgrade() -> None:
    for table in ("payable_attachments", "payable_payments"):
        op.drop_index(f"ix_{table}_item_id", table_name=table)
        op.drop_constraint(f"fk_{table}_item_id", table, type_="foreignkey")
        op.drop_column(table, "item_id")
    op.drop_column("payables", "paidByReceipts")
    op.drop_index("ix_payable_items_pix_hash", table_name="payable_items")
    op.drop_column("payable_items", "pix_hash")
