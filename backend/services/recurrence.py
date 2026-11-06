"""Recorrência em Contas a pagar (spec baixas-recorrencia-e-anexos, "Repetir / parcelar").

A série gera uma conta por ocorrência, todas na mesma transação. Depois de criada, cada
ocorrência é um título normal: pode ser paga, cancelada ou alterada sozinha. Editar ou cancelar
pela série nunca mexe em ocorrência paga ou parcialmente paga.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_DOWN, Decimal
from typing import Any

from sqlalchemy.orm import Session, selectinload

from core.business_days import is_business_day
from models.payable import Payable, PayableSeries
from models.user import User
from schemas.payable import (
    AllocationIn,
    PayableCreate,
    PayableUpdate,
    RecurrenceIn,
    SeriesCancel,
    SeriesEdit,
)
from services import payable as payables
from services.payable import PayableConflict, PayableInvalid

CENT = Decimal("0.01")
PAID_DETAIL = "Ocorrências pagas não são alteradas pela série"


@dataclass(frozen=True)
class Occurrence:
    index: int
    dueDate: date
    amount: Decimal


def _add_months(start: date, months: int) -> date:
    """Mesmo dia, `months` meses depois; o dia que não existe (31 em fevereiro) vira o último."""
    year, month = divmod(start.month - 1 + months, 12)
    year += start.year
    month += 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def _next_business_day(day: date) -> date:
    """Vencimento em fim de semana ou feriado nacional vai para o próximo dia útil."""
    while not is_business_day(day):
        day += timedelta(days=1)
    return day


def split_amount(total: Decimal, count: int) -> list[Decimal]:
    """Parcelas iguais; a diferença de arredondamento vai na última."""
    base = (total / count).quantize(CENT, rounding=ROUND_DOWN)
    parts = [base] * count
    parts[-1] = total - base * (count - 1)
    return parts


def simulate(kind: str, start: date, count: int, amount: Decimal) -> list[Occurrence]:
    """A tabela de ocorrências, sem gravar nada. O dia do mês vem sempre da data inicial (31/01
    dá 28/02 e volta a 31/03), e só depois o vencimento é ajustado para dia útil."""
    if kind == "parcelado":
        amounts = split_amount(amount, count)
    else:
        amounts = [amount] * count
    occurrences = []
    for index in range(count):
        base = start + timedelta(weeks=index) if kind == "semanal" else _add_months(start, index)
        occurrences.append(Occurrence(index + 1, _next_business_day(base), amounts[index]))
    return occurrences


def _scale(
    allocations: list[AllocationIn], total: Decimal, new_total: Decimal
) -> list[AllocationIn]:
    """Rateio proporcional ao novo valor; a diferença de arredondamento vai no último projeto."""
    if new_total == total:
        return allocations
    scaled = [
        AllocationIn(projectId=a.projectId, amount=(a.amount * new_total / total).quantize(CENT))
        for a in allocations
    ]
    if scaled:
        scaled[-1].amount += new_total - sum((a.amount for a in scaled), Decimal("0"))
    return scaled


def create_series(
    db: Session, data: PayableCreate, recurrence: RecurrenceIn, user: User
) -> tuple[PayableSeries, list[Payable]]:
    """Cria a série e todas as ocorrências, ou nada. A data inicial é o vencimento informado."""
    if data.type != "real":
        raise PayableInvalid("Só conta real se repete: provisão não tem série")
    if data.adjustments and recurrence.kind == "parcelado":
        raise PayableInvalid(
            "Em conta parcelada, lance acréscimos, descontos e impostos em cada parcela depois"
        )
    occurrences = simulate(recurrence.kind, data.dueDate, recurrence.count, data.amount)
    for edit in recurrence.occurrences or []:
        if not 1 <= edit.index <= len(occurrences):
            raise PayableInvalid("Ocorrência fora da série")
        occurrences[edit.index - 1] = Occurrence(
            edit.index,
            edit.dueDate or occurrences[edit.index - 1].dueDate,
            edit.amount or occurrences[edit.index - 1].amount,
        )
    if recurrence.kind == "parcelado" and sum(o.amount for o in occurrences) != data.amount:
        raise PayableInvalid("A soma das parcelas precisa ser igual ao valor total")

    series = PayableSeries(
        kind=recurrence.kind,
        count=recurrence.count,
        startDate=data.dueDate,
        estimated=recurrence.estimated,
        created_by_user_id=user.id,
    )
    db.add(series)
    db.flush()

    created: list[Payable] = []
    first_due = occurrences[0].dueDate
    for occurrence in occurrences:
        first = occurrence.index == 1
        copy = data.model_copy(
            update={
                "dueDate": occurrence.dueDate,
                "amount": occurrence.amount,
                "issueDate": data.issueDate + (occurrence.dueDate - first_due),
                "allocations": _scale(data.allocations, data.amount, occurrence.amount),
                # nota, boleto e competência são de cada mês: só a primeira leva o que veio
                "competence": data.competence if first else None,
                "documentType": data.documentType if first else "Sem documento",
                "documentNumber": data.documentNumber if first else None,
                "documentDate": data.documentDate if first else None,
                "barcode": data.barcode if first else None,
                "docsReceivedOn": data.docsReceivedOn if first else None,
            }
        )
        payable = payables.new_payable(db, copy, user)
        payable.series_id = series.id
        payable.seriesIndex = occurrence.index
        label = "estimada " if recurrence.estimated else ""
        payables.audit(
            db,
            payable,
            user,
            f"Ocorrência {label}{occurrence.index} de {recurrence.count} "
            f"da série {recurrence.kind}",
        )
        created.append(payable)
    db.commit()
    return series, created


def _targets(db: Session, payable: Payable, scope: str) -> list[Payable]:
    """As ocorrências que o escopo alcança. Paga, parcialmente paga ou cancelada fica de fora."""
    if payable.series_id is None:
        raise PayableConflict("Essa conta não faz parte de uma série")
    if scope == "only":
        candidates = [payable]
    else:
        query = db.query(Payable).filter(Payable.series_id == payable.series_id)
        if scope == "following":
            query = query.filter(Payable.seriesIndex >= payable.seriesIndex)
        candidates = query.order_by(Payable.seriesIndex).with_for_update().all()
    return [p for p in candidates if p.canceledAt is None and payables.paid_amount(p) == 0]


def list_series(db: Session, payable_id: int) -> list[dict[str, Any]]:
    """As ocorrências da série da conta, em ordem, inclusive as pagas e as canceladas."""
    payable = payables._get(db, payable_id)
    if payable.series_id is None:
        raise PayableConflict("Essa conta não faz parte de uma série")
    on = payables.today()
    members = (
        db.query(Payable)
        .options(selectinload(Payable.payments), selectinload(Payable.adjustments))
        .filter(Payable.series_id == payable.series_id, Payable.deletedAt.is_(None))
        .order_by(Payable.seriesIndex)
        .all()
    )
    return [
        {
            "id": p.id,
            "index": p.seriesIndex,
            "dueDate": p.dueDate,
            "description": p.description,
            "amount": payables.net_amount(p),
            "situation": payables.situation(p, on),
        }
        for p in members
    ]


def edit_series(db: Session, payable_id: int, data: SeriesEdit, user: User) -> int:
    """Muda valor e/ou descrição de "só esta", "esta e as seguintes" ou "todas em aberto"."""
    payable = payables._get(db, payable_id, lock=True)
    if payable.series_id is None:
        raise PayableConflict("Essa conta não faz parte de uma série")
    if data.scope == "only" and (payable.canceledAt is None and payables.paid_amount(payable) > 0):
        raise PayableConflict(PAID_DETAIL)
    targets = _targets(db, payable, data.scope)
    for target in targets:
        payables.apply_update(
            db,
            target,
            PayableUpdate(
                description=data.description or target.description,
                amount=data.amount or target.amount,
                dueDate=target.dueDate,
            ),
            user,
        )
    db.commit()
    return len(targets)


def cancel_series(db: Session, payable_id: int, data: SeriesCancel, user: User) -> int:
    """Cancela "esta e as seguintes" ou "todas em aberto". Quem já tem baixa continua."""
    payable = payables._get(db, payable_id, lock=True)
    if payable.series_id is None:
        raise PayableConflict("Essa conta não faz parte de uma série")
    targets = _targets(db, payable, data.scope)
    for target in targets:
        payables.apply_cancel(db, target, data.reason, user)
    db.commit()
    return len(targets)
