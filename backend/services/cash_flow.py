"""Fluxo de caixa (PF-74): previsto × realizado por dia, semana ou mês, e o saldo projetado.

Só lê: nada aqui grava. Spec relatorios-e-analises, regra 2:
- **previsto** é o que está em aberto em Contas a pagar (com as provisões) e a receber, pelo
  vencimento;
- **realizado** são as baixas e os recebimentos que valem (sem os estornados e os Pix devolvidos),
  pela data em que o dinheiro saiu ou entrou.

O saldo parte do saldo inicial das contas bancárias ativas que entram no fluxo de caixa
(`impactsCashFlow`). O que o banco movimentou antes da data do saldo já está dentro dele. A conta
fora do fluxo (cartão, Caixinha) não entra no saldo nem no realizado.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session, selectinload

from core.text import format_brl, format_date_br
from core.xlsx import build_xlsx
from models.payable import Payable, PayablePayment
from models.receivable import Receivable, ReceivablePayment
from models.reference import BankAccount
from services import payable as payable_service
from services import receivable as receivable_service
from services.payable import PayableInvalid
from services.period_lock import month_name

ZERO = Decimal("0")
GROUPS = ("dia", "semana", "mes")
MAX_DAYS = 3 * 366  # três anos por vez: mais que isso a tela não lê
MAX_PERIODS = 400


@dataclass
class _Movement:
    """Uma baixa ou um recebimento que vale."""

    on: date
    amount: Decimal
    account_id: int
    kind: str  # "pagar" | "receber"
    title_id: int
    name: str
    description: str
    account: str


@dataclass
class _Open:
    """Um título em aberto: o que falta pagar ou receber, no vencimento."""

    on: date
    amount: Decimal
    kind: str
    title_id: int
    name: str
    description: str
    provision: bool = False


@dataclass
class _Data:
    accounts: list[BankAccount]
    movements: list[_Movement] = field(default_factory=list)
    open_titles: list[_Open] = field(default_factory=list)


def _check(start: date, end: date, group: str) -> None:
    if group not in GROUPS:
        raise PayableInvalid("Agrupe por dia, semana ou mês")
    if end < start:
        raise PayableInvalid("A data final vem antes da inicial")
    if (end - start).days > MAX_DAYS:
        raise PayableInvalid("Escolha um período de até 3 anos")


def periods(start: date, end: date, group: str) -> list[tuple[date, date, str]]:
    """Os períodos entre `start` e `end`: cada dia, cada semana (de segunda a domingo) ou cada mês,
    cortados nas pontas."""
    _check(start, end, group)
    result: list[tuple[date, date, str]] = []
    first = start
    while first <= end:
        if group == "dia":
            last = first
            label = format_date_br(first)
        elif group == "semana":
            last = min(first + timedelta(days=6 - first.weekday()), end)
            label = f"{first:%d/%m} a {last:%d/%m}"
        else:
            next_month = (first.replace(day=1) + timedelta(days=32)).replace(day=1)
            last = min(next_month - timedelta(days=1), end)
            label = month_name(first.strftime("%Y-%m"))
        result.append((first, last, label))
        if len(result) > MAX_PERIODS:
            raise PayableInvalid("Períodos demais: agrupe por semana ou mês")
        first = last + timedelta(days=1)
    return result


def _load(db: Session, end: date) -> _Data:
    accounts = (
        db.query(BankAccount)
        .filter(BankAccount.active.is_(True), BankAccount.impactsCashFlow.is_(True))
        .order_by(BankAccount.name)
        .all()
    )
    data = _Data(accounts=accounts)
    names = {a.id: a.name for a in accounts}

    undone_out = {
        r
        for (r,) in db.query(PayablePayment.reverses_id).filter(
            PayablePayment.reverses_id.isnot(None)
        )
    }
    paid = (
        db.query(PayablePayment, Payable)
        .join(Payable, PayablePayment.payable_id == Payable.id)
        .filter(
            Payable.deletedAt.is_(None),
            PayablePayment.kind == "pagamento",
            PayablePayment.paidOn <= end,
            PayablePayment.bank_account_id.in_(names),
        )
    )
    for payment, title in paid:
        if payment.id in undone_out:
            continue
        data.movements.append(
            _Movement(
                on=payment.paidOn,
                amount=-payment.amount,
                account_id=payment.bank_account_id,
                kind="pagar",
                title_id=title.id,
                name=payable_service.payee_name(title),
                description=title.description,
                account=names[payment.bank_account_id],
            )
        )

    undone_in = {
        r
        for (r,) in db.query(ReceivablePayment.reverses_id).filter(
            ReceivablePayment.reverses_id.isnot(None)
        )
    }
    received = (
        db.query(ReceivablePayment, Receivable)
        .join(Receivable, ReceivablePayment.receivable_id == Receivable.id)
        .filter(
            Receivable.deletedAt.is_(None),
            ReceivablePayment.kind == "recebimento",
            ReceivablePayment.receivedOn <= end,
            ReceivablePayment.bank_account_id.in_(names),
        )
    )
    for receipt, title in received:
        if receipt.id in undone_in:
            continue
        data.movements.append(
            _Movement(
                on=receipt.receivedOn,
                amount=receipt.amount,
                account_id=receipt.bank_account_id,
                kind="receber",
                title_id=title.id,
                name=title.customer.name,
                description=title.description,
                account=names[receipt.bank_account_id],
            )
        )

    payables = (
        db.query(Payable)
        .options(selectinload(Payable.payments), selectinload(Payable.adjustments))
        .filter(
            Payable.deletedAt.is_(None),
            Payable.canceledAt.is_(None),
            Payable.replaced_by_id.is_(None),
            Payable.dueDate <= end,
        )
    )
    for p in payables:
        pending = payable_service.pending_amount(p)
        if pending > 0:
            data.open_titles.append(
                _Open(
                    on=p.dueDate,
                    amount=-pending,
                    kind="pagar",
                    title_id=p.id,
                    name=payable_service.payee_name(p),
                    description=p.description,
                    provision=p.type == "provisao",
                )
            )
    receivables = (
        db.query(Receivable)
        .options(
            selectinload(Receivable.payments),
            selectinload(Receivable.adjustments),
            selectinload(Receivable.customer),
        )
        .filter(
            Receivable.deletedAt.is_(None),
            Receivable.canceledAt.is_(None),
            Receivable.dueDate <= end,
        )
    )
    for r in receivables:
        pending = receivable_service.pending_amount(r)
        if pending > 0:
            data.open_titles.append(
                _Open(
                    on=r.dueDate,
                    amount=pending,
                    kind="receber",
                    title_id=r.id,
                    name=r.customer.name,
                    description=r.description,
                )
            )
    return data


def _counts(account: BankAccount, movement: _Movement) -> bool:
    """O movimento antes da data do saldo já está dentro dele."""
    return account.openingDate is None or movement.on >= account.openingDate


def _balance(account: BankAccount, movements: Iterable[_Movement], before: date) -> Decimal:
    """O saldo da conta no começo do dia `before`."""
    if account.openingDate is not None and account.openingDate >= before:
        return ZERO  # a conta ainda não tinha saldo nesse dia
    moved = sum(
        (
            m.amount
            for m in movements
            if m.account_id == account.id and m.on < before and _counts(account, m)
        ),
        ZERO,
    )
    return Decimal(account.openingBalance or 0) + moved


def _split(values: Iterable[Decimal]) -> tuple[Decimal, Decimal]:
    """Entradas e saídas (as saídas em positivo)."""
    inflow = outflow = ZERO
    for value in values:
        if value >= 0:
            inflow += value
        else:
            outflow -= value
    return inflow, outflow


def report(db: Session, start: date, end: date, group: str) -> dict[str, Any]:
    spans = periods(start, end, group)
    data = _load(db, end)
    by_id = {a.id: a for a in data.accounts}
    valid = [m for m in data.movements if _counts(by_id[m.account_id], m)]

    opening = sum((_balance(a, data.movements, start) for a in data.accounts), ZERO)
    # a conta que começa dentro do período: o saldo inicial dela entra no dia da data do saldo
    starts_inside = [
        (a.openingDate, Decimal(a.openingBalance or 0))
        for a in data.accounts
        if a.openingDate is not None and start <= a.openingDate <= end
    ]
    late_in, late_out = _split(t.amount for t in data.open_titles if t.on < start)

    running = opening + late_in - late_out
    rows = []
    for first, last, label in spans:
        actual_in, actual_out = _split(m.amount for m in valid if first <= m.on <= last)
        forecast_in, forecast_out = _split(
            t.amount for t in data.open_titles if first <= t.on <= last
        )
        new_accounts = sum((value for on, value in starts_inside if first <= on <= last), ZERO)
        running += new_accounts + actual_in - actual_out + forecast_in - forecast_out
        rows.append(
            {
                "start": first,
                "end": last,
                "label": label,
                "forecastIn": forecast_in,
                "forecastOut": forecast_out,
                "actualIn": actual_in,
                "actualOut": actual_out,
                "balance": running,
            }
        )

    accounts = []
    for a in data.accounts:
        inflow, outflow = _split(
            m.amount for m in valid if m.account_id == a.id and start <= m.on <= end
        )
        account_opening = _balance(a, data.movements, start)
        if a.openingDate is not None and start <= a.openingDate <= end:
            account_opening = Decimal(a.openingBalance or 0)
        accounts.append(
            {
                "id": a.id,
                "name": a.name,
                "opening": account_opening,
                "inflow": inflow,
                "outflow": outflow,
                "closing": account_opening + inflow - outflow,
            }
        )
    return {
        "start": start,
        "end": end,
        "group": group,
        "opening": opening,
        "lateIn": late_in,
        "lateOut": late_out,
        "closing": running,
        "periods": rows,
        "accounts": accounts,
    }


def detail(db: Session, start: date, end: date) -> dict[str, Any]:
    """O que compõe um período: os títulos em aberto que vencem nele e as baixas e os
    recebimentos feitos nele."""
    _check(start, end, "dia")
    data = _load(db, end)
    by_id = {a.id: a for a in data.accounts}
    forecast = sorted(
        (t for t in data.open_titles if start <= t.on <= end), key=lambda t: (t.on, t.name)
    )
    actual = sorted(
        (m for m in data.movements if start <= m.on <= end and _counts(by_id[m.account_id], m)),
        key=lambda m: (m.on, m.name),
    )
    return {
        "forecast": [
            {
                "kind": t.kind,
                "titleId": t.title_id,
                "date": t.on,
                "name": t.name,
                "description": t.description,
                "amount": abs(t.amount),
                "provision": t.provision,
            }
            for t in forecast
        ],
        "actual": [
            {
                "kind": m.kind,
                "titleId": m.title_id,
                "date": m.on,
                "name": m.name,
                "description": m.description,
                "amount": abs(m.amount),
                "account": m.account,
            }
            for m in actual
        ],
    }


GROUP_LABELS = {"dia": "dia", "semana": "semana", "mes": "mês"}
SHEET_HEADERS = [
    "Período",
    "Entradas previstas",
    "Saídas previstas",
    "Entradas realizadas",
    "Saídas realizadas",
    "Saldo projetado",
]


def export_xlsx(db: Session, start: date, end: date, group: str) -> bytes:
    data = report(db, start, end, group)
    title = (
        f"Fluxo de caixa · {format_date_br(start)} a {format_date_br(end)} por "
        f"{GROUP_LABELS[group]} · saldo inicial {format_brl(data['opening'])} · em atraso antes "
        f"do período: a receber {format_brl(data['lateIn'])}, a pagar {format_brl(data['lateOut'])}"
    )
    rows = [
        [
            row["label"],
            row["forecastIn"],
            row["forecastOut"],
            row["actualIn"],
            row["actualOut"],
            row["balance"],
        ]
        for row in data["periods"]
    ]
    # o saldo é acumulado: somar a coluna não faz sentido, então ele fica fora do total
    return build_xlsx(
        sheet="Fluxo de caixa",
        title=title,
        headers=SHEET_HEADERS,
        rows=rows,
        total_columns=(1, 2, 3, 4),
    )
