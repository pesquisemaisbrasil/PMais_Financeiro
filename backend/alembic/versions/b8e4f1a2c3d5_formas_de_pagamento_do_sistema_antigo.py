"""formas de pagamento da baixa do sistema antigo (PIX, TED, Boleto, cartões e as outras)

Revision ID: b8e4f1a2c3d5
Revises: a7d3e5f9c2b4
Create Date: 2026-11-27 12:00:00.000000

Pedido do Bruno em 27/11/2026, depois da reunião de testes de 26/11: as contas importadas vieram com
"Não informada (sistema antigo)", e o Pix não existia para escolher na baixa nem no Carregar
incentivos. Entram as 16 formas da baixa do SGE4B, com os nomes de lá (print do Bruno). Só entra a
que ainda não existe (sem diferença de maiúscula), então o banco que já tem alguma não ganha
repetida.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError

from alembic import op

revision: str = "b8e4f1a2c3d5"
down_revision: str | Sequence[str] | None = "a7d3e5f9c2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NAMES = (
    "Agendamento de Pagamento",
    "Boleto",
    "Cartão de Crédito (à vista)",
    "Cartão de Crédito (parcelado)",
    "Cartão de Débito",
    "Carteira Digital",
    "Cheque",
    "Crédito em Conta",
    "Débito Automático",
    "Débito em Conta",
    "Dinheiro (espécie)",
    "DOC",
    "PIX",
    "PIX QR Code",
    "TED",
    "Transferência entre Contas",
)


def upgrade() -> None:
    bind = op.get_bind()
    for name in NAMES:
        bind.execute(
            sa.text(
                "INSERT INTO payment_methods (name, active) SELECT :name, true "
                "WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE lower(name) = lower(:name))"
            ),
            {"name": name},
        )


def downgrade() -> None:
    # Só sai a forma que nada usa: a que já está numa conta, baixa ou título fica (a chave
    # estrangeira recusa, e o ponto de salvamento desfaz só aquela tentativa).
    bind = op.get_bind()
    for name in NAMES:
        nested = bind.begin_nested()
        try:
            bind.execute(sa.text("DELETE FROM payment_methods WHERE name = :name"), {"name": name})
            nested.commit()
        except IntegrityError:
            nested.rollback()
