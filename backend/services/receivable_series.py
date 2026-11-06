"""Parcelamento e recorrência da receita (spec contas-a-receber, "Parcelamento/recorrência").

Usa a mesma série e a mesma simulação do Contas a pagar (`services/recurrence.py`): dia que não
existe vira o último do mês, fim de semana e feriado vão para o próximo dia útil, e a diferença de
arredondamento do parcelado fica na última parcela. Cada ocorrência é um título normal, que pode
ser recebido, cancelado ou alterado sozinho; editar ou cancelar pela série nunca mexe em título
com recebimento.
"""

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session, selectinload

from core.text import format_brl
from models.payable import PayableSeries
from models.receivable import Receivable
from models.user import User
from schemas.payable import RecurrenceIn, SeriesCancel, SeriesEdit
from schemas.receivable import ReceivableCreate, ReceivableUpdate
from services import payable as payables
from services import receivable as receivables
from services.payable import PayableConflict, PayableInvalid
from services.recurrence import Occurrence, simulate

RECEIVED_DETAIL = "Títulos com recebimento não são alterados pela série"


def create_series(
    db: Session, data: ReceivableCreate, recurrence: RecurrenceIn, user: User
) -> tuple[PayableSeries, list[Receivable]]:
    """Cria a série e todas as ocorrências, ou nada. A data inicial é o vencimento informado."""
    occurrences = simulate(recurrence.kind, data.dueDate, recurrence.count, data.amount)
    for edit in recurrence.occurrences or []:
        if not 1 <= edit.index <= len(occurrences):
            raise PayableInvalid("Ocorrência fora da série")
        current = occurrences[edit.index - 1]
        occurrences[edit.index - 1] = Occurrence(
            edit.index, edit.dueDate or current.dueDate, edit.amount or current.amount
        )
    if recurrence.kind == "parcelado":
        total = sum((o.amount for o in occurrences), Decimal("0"))
        if total != data.amount:
            raise PayableInvalid(
                f"As parcelas somam {format_brl(total)}, "
                f"mas o título é de {format_brl(data.amount)}"
            )
        if data.adjustments:
            raise PayableInvalid(
                "Em título parcelado, lance acréscimos, descontos e impostos em cada parcela depois"
            )

    series = PayableSeries(
        kind=recurrence.kind,
        count=recurrence.count,
        startDate=data.dueDate,
        estimated=recurrence.estimated,
        created_by_user_id=user.id,
    )
    db.add(series)
    db.flush()

    created: list[Receivable] = []
    first_due = occurrences[0].dueDate
    for occurrence in occurrences:
        first = occurrence.index == 1
        copy = data.model_copy(
            update={
                "dueDate": occurrence.dueDate,
                "amount": occurrence.amount,
                "issueDate": data.issueDate + (occurrence.dueDate - first_due),
                # nota e competência são de cada mês: só a primeira leva o que veio
                "competence": data.competence if first else None,
                "documentType": data.documentType if first else "Sem documento",
                "documentNumber": data.documentNumber if first else None,
                "documentDate": data.documentDate if first else None,
            }
        )
        receivable = receivables.new_receivable(db, copy, user)
        receivable.series_id = series.id
        receivable.seriesIndex = occurrence.index
        label = "estimada " if recurrence.estimated else ""
        receivables.audit(
            db,
            receivable,
            user,
            f"Ocorrência {label}{occurrence.index} de {recurrence.count} "
            f"da série {recurrence.kind}",
        )
        created.append(receivable)
    db.commit()
    return series, created


def _targets(db: Session, receivable: Receivable, scope: str) -> list[Receivable]:
    """As ocorrências que o escopo alcança. Com recebimento ou cancelada fica de fora."""
    if receivable.series_id is None:
        raise PayableConflict("Esse título não faz parte de uma série")
    if scope == "only":
        candidates = [receivable]
    else:
        query = db.query(Receivable).filter(
            Receivable.series_id == receivable.series_id, Receivable.deletedAt.is_(None)
        )
        if scope == "following":
            query = query.filter(Receivable.seriesIndex >= receivable.seriesIndex)
        candidates = query.order_by(Receivable.seriesIndex).with_for_update().all()
    return [r for r in candidates if r.canceledAt is None and receivables.received_amount(r) == 0]


def list_series(db: Session, receivable_id: int) -> list[dict[str, Any]]:
    """As ocorrências da série do título, em ordem, inclusive as recebidas e as canceladas."""
    receivable = receivables._get(db, receivable_id)
    if receivable.series_id is None:
        raise PayableConflict("Esse título não faz parte de uma série")
    on = payables.today()
    members = (
        db.query(Receivable)
        .options(selectinload(Receivable.payments), selectinload(Receivable.adjustments))
        .filter(Receivable.series_id == receivable.series_id, Receivable.deletedAt.is_(None))
        .order_by(Receivable.seriesIndex)
        .all()
    )
    return [
        {
            "id": r.id,
            "index": r.seriesIndex,
            "dueDate": r.dueDate,
            "description": r.description,
            "amount": receivables.net_amount(r),
            "situation": receivables.situation(r, on),
        }
        for r in members
    ]


def edit_series(db: Session, receivable_id: int, data: SeriesEdit, user: User) -> int:
    """Muda valor e/ou descrição de "só esta", "esta e as seguintes" ou "todas em aberto"."""
    receivable = receivables._get(db, receivable_id, lock=True)
    if receivable.series_id is None:
        raise PayableConflict("Esse título não faz parte de uma série")
    if (
        data.scope == "only"
        and receivable.canceledAt is None
        and receivables.received_amount(receivable) > 0
    ):
        raise PayableConflict(RECEIVED_DETAIL)
    targets = _targets(db, receivable, data.scope)
    for target in targets:
        receivables.apply_update(
            db,
            target,
            ReceivableUpdate(
                description=data.description or target.description,
                amount=data.amount or target.amount,
                dueDate=target.dueDate,
            ),
            user,
        )
    db.commit()
    return len(targets)


def cancel_series(db: Session, receivable_id: int, data: SeriesCancel, user: User) -> int:
    """Cancela "esta e as seguintes" ou "todas em aberto". Quem já tem recebimento continua."""
    receivable = receivables._get(db, receivable_id, lock=True)
    if receivable.series_id is None:
        raise PayableConflict("Esse título não faz parte de uma série")
    targets = _targets(db, receivable, data.scope)
    for target in targets:
        receivables.apply_cancel(db, target, data.reason, user)
    db.commit()
    return len(targets)
