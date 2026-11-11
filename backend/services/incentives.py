"""Agenda dos incentivos: um vencimento por data de pagamento, as pessoas e a situação de cada um.

A importação já cria um lançamento por projeto e data (`origin="incentivo"`), então a agenda só
lê esses lançamentos e os organiza por data. As pessoas continuam sendo itens do lançamento
(decisão N5): aqui só se conta quantas são.
"""

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from models.payable import Payable
from services import payable as payables
from services.payable import _base_query, _item_counts, period_range, today

# O que cada situação conta na agenda. "parcial" ainda vence no futuro; "devolvido" (Pix que voltou)
# precisa de atenção como o vencido. Cancelado e substituído nem entram.
GROUP = {
    "a_vencer": "a_vencer",
    "parcial": "a_vencer",
    "hoje": "hoje",
    "vencido": "vencido",
    "devolvido": "vencido",
    "pago": "pago",
}


def _query(db: Session) -> Any:
    return _base_query(db).filter(
        Payable.origin == "incentivo",
        Payable.canceledAt.is_(None),
        Payable.replaced_by_id.is_(None),
    )


def _row(payable: Payable, on: date, people: int) -> dict[str, Any]:
    return {
        "id": payable.id,
        "dueDate": payable.dueDate,
        "description": payable.description,
        "projectCodes": [a.project.code for a in payable.allocations],
        "people": people,
        "amount": payables.net_amount(payable),
        "paid": payables.paid_amount(payable),
        "pending": payables.pending_amount(payable),
        "situation": payables.situation(payable, on),
    }


def _bucket(rows: list[dict[str, Any]], group: str) -> dict[str, Any]:
    chosen = [r for r in rows if GROUP.get(r["situation"]) == group]
    key = "amount" if group == "pago" else "pending"
    return {
        "count": len(chosen),
        "people": sum(r["people"] for r in chosen),
        "total": sum((r[key] for r in chosen), Decimal("0.00")),
    }


def agenda(
    db: Session, *, mode: str, ref: date | None, custom_range: tuple[date, date] | None
) -> dict[str, Any]:
    """Os incentivos do período, pela data de vencimento. `mode` é o mesmo do Contas a pagar."""
    on = today()
    start, end = (
        custom_range if mode == "periodo" and custom_range else period_range(mode, ref or on)
    )
    query = _query(db)
    if start is not None and end is not None:
        query = query.filter(Payable.dueDate >= start, Payable.dueDate <= end)
    found = query.order_by(None).order_by(Payable.dueDate, Payable.id).all()
    counts = _item_counts(db, [p.id for p in found])
    rows = [_row(p, on, counts.get(p.id, 0)) for p in found]

    late = _query(db).filter(Payable.dueDate < on).all()
    late_counts = _item_counts(db, [p.id for p in late])
    late_rows = [_row(p, on, late_counts.get(p.id, 0)) for p in late]
    return {
        "summary": {
            group: _bucket(rows, group) for group in ("a_vencer", "hoje", "vencido", "pago")
        },
        "overdueAll": _bucket(late_rows, "vencido"),
        "rows": rows,
    }
