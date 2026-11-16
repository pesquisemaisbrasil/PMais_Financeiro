"""importação do relatório do sistema antigo: chave de cada linha, para não repetir a conta

Revision ID: d5f7b9e1a3c4
Revises: c3e5a7b9d1f3
Create Date: 2026-11-16 15:00:00.000000

`payables.importKey` é o HMAC da linha do relatório "Lançamentos a Pagar" do SGE4B. É único (NULL repete,
nas contas de outra origem): reenviar o relatório, ou um mais novo, só cria o que ainda não existe, e dois
pedidos ao mesmo tempo não criam a mesma conta duas vezes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5f7b9e1a3c4"
down_revision: Union[str, Sequence[str], None] = "c3e5a7b9d1f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payables", sa.Column("importKey", sa.String(length=64), nullable=True))
    op.create_index("uq_payables_import_key", "payables", ["importKey"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_payables_import_key", table_name="payables")
    op.drop_column("payables", "importKey")
