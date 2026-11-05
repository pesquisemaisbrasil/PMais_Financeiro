"""Conciliação do comprovante com o que há a pagar (spec comprovantes-e-baixa, regra 3).

Puro, sem banco: recebe os comprovantes pendentes e a fila de itens a pagar de cada pessoa
e devolve o resultado de cada um. Nada é gravado aqui; quem grava é a confirmação da baixa.
Dinheiro é sempre `Decimal`.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Literal

Status = Literal["bate", "pago_a_mais", "nao_fecha"]

PAID_TOO_MUCH = "Valor maior que o a pagar. Lance a produção antes de dar baixa"
NOT_CLOSING = "Nenhuma soma dos itens a pagar dá o valor do comprovante"


@dataclass(frozen=True)
class PendingReceipt:
    id: int
    person_id: int
    amount: Decimal
    paid_on: date | None
    page: int


@dataclass(frozen=True)
class QueueItem:
    """Item a pagar da pessoa. A fila já chega do mais antigo para o mais novo."""

    id: int
    amount: Decimal


@dataclass(frozen=True)
class Reconciliation:
    status: Status
    item_ids: list[int] = field(default_factory=list)
    message: str | None = None


def reconcile(
    receipts: Iterable[PendingReceipt], queues: Mapping[int, Sequence[QueueItem]]
) -> dict[int, Reconciliation]:
    """FIFO por pessoa; comprovantes por data do Pix, depois página, depois id; usa o menor
    prefixo da fila cuja soma é exatamente o valor. Comprovante que não fecha não consome."""
    result: dict[int, Reconciliation] = {}
    cursor: dict[int, int] = {}
    for receipt in sorted(receipts, key=lambda r: (r.paid_on or date.min, r.page, r.id)):
        queue = queues.get(receipt.person_id, [])
        start = cursor.get(receipt.person_id, 0)
        remaining = queue[start:]
        if receipt.amount > sum((item.amount for item in remaining), Decimal("0")):
            result[receipt.id] = Reconciliation("pago_a_mais", message=PAID_TOO_MUCH)
            continue
        running = Decimal("0")
        matched: list[int] = []
        for item in remaining:
            running += item.amount
            matched.append(item.id)
            if running >= receipt.amount:
                break
        if running == receipt.amount:
            cursor[receipt.person_id] = start + len(matched)
            result[receipt.id] = Reconciliation("bate", item_ids=matched)
        else:
            result[receipt.id] = Reconciliation("nao_fecha", message=NOT_CLOSING)
    return result
