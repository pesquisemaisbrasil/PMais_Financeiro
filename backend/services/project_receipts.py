"""Recebimentos de projetos × ano (PF-76): o que entrou de cada projeto, mês a mês, num ano.

Só lê. Conta os recebimentos que valem (sem estornados nem Pix devolvidos), pelo dia em que o
dinheiro entrou, nas contas bancárias que entram no fluxo de caixa: a mesma regra do realizado do
fluxo de caixa e do fluxo mensal. O título sem projeto vai para "Sem projeto", no fim.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from core.xlsx import build_xlsx
from models.receivable import Receivable
from models.reference import Project
from services.dre import ZERO, Filters, filter_names, valid_receipts
from services.payable import PayableInvalid
from services.period_lock import month_name

NO_PROJECT = "Sem projeto"
FIRST_YEAR, LAST_YEAR = 2000, 2100


def _row(
    label: str, values: dict[str, Decimal], columns: list[str], project_id: int | None
) -> dict[str, Any]:
    by_month = [values.get(month, ZERO) for month in columns]
    return {
        "projectId": project_id,
        "label": label,
        "values": by_month,
        "total": sum(by_month, ZERO),
    }


def report(db: Session, year: int, company: int | None = None) -> dict[str, Any]:
    if not FIRST_YEAR <= year <= LAST_YEAR:
        raise PayableInvalid(f"Escolha um ano entre {FIRST_YEAR} e {LAST_YEAR}")
    columns = [f"{year:04d}-{month:02d}" for month in range(1, 13)]
    totals: dict[int | None, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    receipts = valid_receipts(db, date(year, 1, 1), date(year + 1, 1, 1))
    if company is not None:
        receipts = receipts.filter(Receivable.company_id == company)
    for receipt, title in receipts:
        totals[title.project_id][receipt.receivedOn.strftime("%Y-%m")] += receipt.amount

    ids = [project_id for project_id in totals if project_id is not None]
    projects = {p.id: p for p in db.query(Project).filter(Project.id.in_(ids or [0]))}
    # o código do projeto é número em texto: "999" vem antes de "1804"
    ordered = sorted(ids, key=lambda pid: (len(projects[pid].code), projects[pid].code))
    rows = [
        _row(f"PRJ-{projects[pid].code} · {projects[pid].title}", totals[pid], columns, pid)
        for pid in ordered
    ]
    if None in totals:
        rows.append(_row(NO_PROJECT, totals[None], columns, None))
    month_sum = {
        month: sum((row["values"][index] for row in rows), ZERO)
        for index, month in enumerate(columns)
    }
    return {
        "year": year,
        "months": [{"month": month, "label": month_name(month)} for month in columns],
        "rows": rows,
        "total": _row("Total", month_sum, columns, None),
    }


def export_xlsx(db: Session, year: int, company: int | None = None) -> bytes:
    names = filter_names(db, Filters(company=company))
    data = report(db, year, company)
    headers = ["Projeto", *(month["label"] for month in data["months"]), "Total"]
    rows = [[row["label"], *row["values"], row["total"]] for row in data["rows"]]
    title = f"Recebimentos de projetos · {year} · " + (
        "filtros: " + ", ".join(names) if names else "filtros: nenhum"
    )
    return build_xlsx(
        sheet="Recebimentos", title=title, headers=headers, rows=rows, total_columns=range(1, 14)
    )
