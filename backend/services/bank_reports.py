"""Conferência bancária: extrato × sistema e saldo do mês (PF-71).

Só lê: nada aqui grava. A diferença compara as **saídas** do extrato com as **baixas** do sistema na
mesma conta e no mesmo mês, e explica o que sobra (saída sem par, baixa sem linha e volta de Pix).
"""

import calendar
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from models.bank_reconciliation import BankReconciliation
from models.bank_statement import BankTransaction
from models.payable import Payable, PayablePayment
from models.reference import BankAccount, Company
from services.bank_reconciliation import description_of
from services.payable import PayableInvalid
from services.records import RecordNotFound

ZERO = Decimal("0")
SHOWN = 20  # quantos itens de cada explicação a tela mostra


def month_bounds(month: str) -> tuple[date, date]:
    """O primeiro e o último dia de um mês "AAAA-MM"."""
    try:
        year, number = (int(part) for part in month.split("-"))
        first = date(year, number, 1)
    except ValueError as exc:
        raise PayableInvalid("Mês inválido: use AAAA-MM") from exc
    return first, date(year, number, calendar.monthrange(year, number)[1])


def _cents(value: Any) -> Decimal:
    """A soma do banco (que vem como float no SQLite) sempre em centavos."""
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _group(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "count": len(items),
        "total": _cents(sum((item["amount"] for item in items), ZERO)),
        "items": items[:SHOWN],
    }


def difference(db: Session, account_id: int, month: str) -> dict[str, Any]:
    """As saídas do extrato contra as baixas do sistema (pagamentos), dia a dia, e o que explica."""
    account = db.get(BankAccount, account_id)
    if account is None:
        raise RecordNotFound
    first, last = month_bounds(month)
    lines = (
        db.query(BankTransaction)
        .filter(
            BankTransaction.bank_account_id == account.id,
            BankTransaction.postedOn.between(first, last),
        )
        .order_by(BankTransaction.postedOn, BankTransaction.id)
        .all()
    )
    kinds = {
        row.bank_transaction_id: row.kind
        for row in db.query(BankReconciliation).filter(
            BankReconciliation.bank_transaction_id.in_([line.id for line in lines] or [0])
        )
    }
    exits = [line for line in lines if line.amount < 0]

    month_payments = (
        db.query(PayablePayment, Payable.description)
        .join(Payable, Payable.id == PayablePayment.payable_id)
        .filter(
            PayablePayment.bank_account_id == account.id,
            PayablePayment.paidOn.between(first, last),
            Payable.deletedAt.is_(None),
        )
        .order_by(PayablePayment.paidOn, PayablePayment.id)
        .all()
    )
    reversed_ids = {
        reversed_id
        for (reversed_id,) in db.query(PayablePayment.reverses_id).filter(
            PayablePayment.reverses_id.in_([p.id for p, _ in month_payments] or [0])
        )
    }
    # Baixa anulada (estornada ou com Pix devolvido) não conta como saída do sistema: o que o
    # extrato mostra dela é a saída e a volta, e a diferença é explicada como volta.
    system = [
        (p, text)
        for p, text in month_payments
        if p.kind == "pagamento" and p.id not in reversed_ids
    ]
    returns = [
        {"on": p.paidOn, "description": text, "amount": p.amount}
        for p, text in month_payments
        if p.kind == "devolucao"
    ]

    per_day: dict[date, list[Decimal]] = defaultdict(lambda: [ZERO, ZERO])
    for line in exits:
        per_day[line.postedOn][0] += -line.amount
    for payment, _ in system:
        per_day[payment.paidOn][1] += payment.amount
    by_day = [
        {"day": day, "extract": e, "system": s, "difference": e - s}
        for day, (e, s) in sorted(per_day.items())
    ]
    extract_total = sum((e for e, _ in per_day.values()), ZERO)
    system_total = sum((s for _, s in per_day.values()), ZERO)

    without_pair = [
        {
            "on": line.postedOn,
            "description": description_of(line),
            "amount": -line.amount,
            "note": "exceção" if kinds.get(line.id) == "excecao" else "pendente",
        }
        for line in exits
        if kinds.get(line.id) != "lancamento"
    ]
    return {
        "month": month,
        "imported": bool(lines),
        "extractTotal": _cents(extract_total),
        "systemTotal": _cents(system_total),
        "difference": _cents(extract_total - system_total),
        "byDay": [
            {
                key: (_cents(value) if isinstance(value, Decimal) else value)
                for key, value in d.items()
            }
            for d in by_day
        ],
        "linesWithoutPair": _group(without_pair),
        "paymentsWithoutLine": _group(_payments_without_line(db, account, system)),
        "returns": _group(returns),
    }


def _payments_without_line(
    db: Session, account: BankAccount, system: list[tuple[PayablePayment, str]]
) -> list[dict[str, Any]]:
    """Lançamentos pagos nesta conta cuja baixa ainda não tem linha conciliada no extrato: o pago na
    conta (em qualquer mês) menos o que as linhas conciliadas com o lançamento somam."""
    ids = {p.payable_id for p, _ in system}
    if not ids:
        return []
    paid_rows = (
        db.query(PayablePayment)
        .filter(
            PayablePayment.bank_account_id == account.id,
            PayablePayment.kind == "pagamento",
            PayablePayment.payable_id.in_(ids),
        )
        .all()
    )
    undone = {
        reversed_id
        for (reversed_id,) in db.query(PayablePayment.reverses_id).filter(
            PayablePayment.reverses_id.in_([p.id for p in paid_rows] or [0])
        )
    }
    paid: dict[int, Decimal] = defaultdict(lambda: ZERO)
    for payment in paid_rows:
        if payment.id not in undone:
            paid[payment.payable_id] += payment.amount
    linked = {
        payable_id: Decimal(str(total))
        for payable_id, total in db.query(
            BankReconciliation.payable_id, func.sum(func.abs(BankTransaction.amount))
        )
        .join(BankTransaction, BankTransaction.id == BankReconciliation.bank_transaction_id)
        .filter(
            BankReconciliation.payable_id.in_(ids), BankTransaction.bank_account_id == account.id
        )
        .group_by(BankReconciliation.payable_id)
    }
    found: list[dict[str, Any]] = []
    for payable_id in sorted(ids):
        missing = paid[payable_id] - linked.get(payable_id, ZERO)
        if missing <= 0:
            continue
        mine = [(p, text) for p, text in system if p.payable_id == payable_id]
        in_month = sum((p.amount for p, _ in mine), ZERO)
        found.append(
            {
                "on": max(p.paidOn for p, _ in mine),
                "description": mine[0][1],
                "amount": min(missing, in_month),
            }
        )
    return sorted(found, key=lambda item: item["on"])


def balances(db: Session, month: str) -> dict[str, Any]:
    """O saldo do mês de cada conta e o consolidado. O saldo inicial vale a partir da data dele: o
    que o extrato trouxe antes dessa data já está dentro dele e não conta de novo."""
    first, last = month_bounds(month)
    result: list[dict[str, Any]] = []
    for account in db.query(BankAccount).order_by(BankAccount.name).all():
        floor = account.openingDate or date.min
        lines = db.query(BankTransaction).filter(BankTransaction.bank_account_id == account.id)
        in_month = lines.filter(BankTransaction.postedOn.between(first, last))
        imported = in_month.count() > 0
        if not account.active and not imported:
            continue
        counted = in_month.filter(BankTransaction.postedOn >= floor)
        before = (
            lines.filter(BankTransaction.postedOn >= floor, BankTransaction.postedOn < first)
            .with_entities(func.coalesce(func.sum(BankTransaction.amount), 0))
            .scalar()
        )
        income, expense = counted.with_entities(
            func.coalesce(
                func.sum(case((BankTransaction.amount > 0, BankTransaction.amount), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((BankTransaction.amount < 0, -BankTransaction.amount), else_=0)), 0
            ),
        ).one()
        checked = (
            counted.join(
                BankReconciliation, BankReconciliation.bank_transaction_id == BankTransaction.id
            )
            .with_entities(func.coalesce(func.sum(BankTransaction.amount), 0))
            .scalar()
        )
        opening = _cents(account.openingBalance) + _cents(before)
        closing = opening + _cents(income) - _cents(expense)
        by_system = opening + _cents(checked)
        company = db.get(Company, account.company_id)
        result.append(
            {
                "id": account.id,
                "name": account.name,
                "company": company.name if company else "",
                "accountType": account.accountType,
                "opening": opening,
                "income": _cents(income),
                "expense": _cents(expense),
                "closing": closing,
                "bySystem": by_system,
                "toCheck": closing - by_system,
                "imported": imported,
            }
        )

    def total(key: str) -> Decimal:
        return sum((row[key] for row in result), ZERO)

    keys = ("opening", "income", "expense", "closing", "bySystem", "toCheck")
    return {"month": month, "accounts": result, "total": {key: total(key) for key in keys}}
