"""DRE (PF-76): receitas, despesas e resultado por linha e por mês, por competência.

Só lê. Cada linha do DRE é um **grupo do plano de contas** (decisão do Bruno, 25/11/2026), com as
contas analíticas dele embaixo; a conta sem grupo vai para "Sem grupo". Uma linha nunca mistura
receita e despesa: o grupo que tem as duas aparece uma vez em cada bloco.

- Competência: a do título; a conta a pagar sem competência usa o mês da emissão.
- Valor: o principal do título, sem os acréscimos, descontos e impostos (as linhas de dedução
  ficam para quando a Vivi definir o DRE completo).
- Fora: cancelado, substituído, excluído e as provisões (são estimativa, não fato).
- Projeto: a conta repartida entre projetos entra só com a parte do projeto filtrado.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session, selectinload

from core.text import format_date_br
from core.xlsx import build_xlsx
from models.payable import Payable
from models.receivable import Receivable
from models.reference import (
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    ExpenseCategoryGroup,
    Project,
)
from services.payable import PayableInvalid
from services.period_lock import month_name

ZERO = Decimal("0")
MAX_MONTHS = 24
NO_GROUP = "Sem grupo"
KINDS = (("receita", "Receitas"), ("despesa", "Despesas"))


@dataclass(frozen=True)
class Filters:
    company: int | None = None
    unit: int | None = None
    project: int | None = None
    cost_center: int | None = None


def months(start: date, end: date) -> list[str]:
    """Os meses "AAAA-MM" de `start` a `end`, inclusive."""
    if end < start:
        raise PayableInvalid("A data final vem antes da inicial")
    result = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        result.append(f"{year:04d}-{month:02d}")
        if len(result) > MAX_MONTHS:
            raise PayableInvalid("Escolha até 24 meses")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return result


def _amounts(db: Session, wanted: set[str], filters: Filters) -> dict[int, dict[str, Decimal]]:
    """Por conta analítica e por mês, o que entrou no DRE."""
    totals: dict[int, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))

    payables = (
        db.query(Payable)
        .options(selectinload(Payable.allocations))
        .filter(
            Payable.deletedAt.is_(None),
            Payable.canceledAt.is_(None),
            Payable.replaced_by_id.is_(None),
            Payable.type == "real",
        )
    )
    for field, value in (
        (Payable.company_id, filters.company),
        (Payable.unit_id, filters.unit),
        (Payable.cost_center_id, filters.cost_center),
    ):
        if value is not None:
            payables = payables.filter(field == value)
    for p in payables:
        month = p.competence or p.issueDate.strftime("%Y-%m")
        if month not in wanted:
            continue
        amount = p.amount
        if filters.project is not None:
            amount = sum((a.amount for a in p.allocations if a.project_id == filters.project), ZERO)
            if not amount:
                continue
        totals[p.category_id][month] += amount

    receivables = db.query(Receivable).filter(
        Receivable.deletedAt.is_(None),
        Receivable.canceledAt.is_(None),
        Receivable.competence.in_(wanted),
    )
    for field, value in (
        (Receivable.company_id, filters.company),
        (Receivable.unit_id, filters.unit),
        (Receivable.project_id, filters.project),
        (Receivable.cost_center_id, filters.cost_center),
    ):
        if value is not None:
            receivables = receivables.filter(field == value)
    for r in receivables:
        totals[r.category_id][r.competence] += r.amount
    return totals


def _row(
    label: str, values: dict[str, Decimal], columns: list[str], **extra: Any
) -> dict[str, Any]:
    by_month = [values.get(month, ZERO) for month in columns]
    return {"label": label, "values": by_month, "total": sum(by_month, ZERO), **extra}


def report(db: Session, start: date, end: date, filters: Filters) -> dict[str, Any]:
    columns = months(start, end)
    totals = _amounts(db, set(columns), filters)
    categories = {
        c.id: c for c in db.query(ExpenseCategory).filter(ExpenseCategory.id.in_(totals or [0]))
    }
    groups = {g.id: g for g in db.query(ExpenseCategoryGroup)}

    blocks = []
    block_totals: dict[str, dict[str, Decimal]] = {}
    for kind, title in KINDS:
        # (ordem, nome do grupo) -> contas daquele grupo neste bloco
        lines: dict[tuple[str, str], list[ExpenseCategory]] = defaultdict(list)
        for category_id in totals:
            category = categories[category_id]
            if category.kind != kind:
                continue
            group = groups.get(category.group_id) if category.group_id else None
            key = (f"0 {group.code}", group.name) if group else ("1", NO_GROUP)
            lines[key].append(category)
        block_sum: dict[str, Decimal] = defaultdict(lambda: ZERO)
        rows = []
        for (_, name), members in sorted(lines.items()):
            line_sum: dict[str, Decimal] = defaultdict(lambda: ZERO)
            accounts = []
            for category in sorted(members, key=lambda c: (c.code, c.name)):
                for month, value in totals[category.id].items():
                    line_sum[month] += value
                    block_sum[month] += value
                accounts.append(
                    _row(f"{category.code} {category.name}", totals[category.id], columns)
                )
            rows.append(_row(name, line_sum, columns, accounts=accounts))
        block_totals[kind] = block_sum
        blocks.append({"kind": kind, **_row(title, block_sum, columns, lines=rows)})

    result = {
        month: block_totals["receita"].get(month, ZERO) - block_totals["despesa"].get(month, ZERO)
        for month in columns
    }
    return {
        "months": [{"month": month, "label": month_name(month)} for month in columns],
        "blocks": blocks,
        "result": _row("Resultado", result, columns),
    }


def filter_names(db: Session, filters: Filters) -> list[str]:
    """Os filtros em palavras, para o título da planilha. Cadastro que não existe é 422."""
    names = []
    for model, value, title, text in (
        (Company, filters.company, "empresa", lambda r: r.label),
        (BusinessUnit, filters.unit, "unidade", lambda r: r.name),
        (Project, filters.project, "projeto", lambda r: f"PRJ-{r.code}"),
        (CostCenter, filters.cost_center, "centro de custo", lambda r: r.path),
    ):
        if value is None:
            continue
        record = db.get(model, value)
        if record is None:
            raise PayableInvalid(f"O filtro de {title} não existe mais. Limpe e escolha de novo")
        names.append(f"{title}={text(record)}")
    return names


def export_xlsx(db: Session, start: date, end: date, filters: Filters) -> bytes:
    names = filter_names(db, filters)
    data = report(db, start, end, filters)
    headers = ["Linha", *(m["label"] for m in data["months"]), "Total"]
    rows: list[list[Any]] = []
    for block in data["blocks"]:
        rows.append([block["label"].upper(), *block["values"], block["total"]])
        for line in block["lines"]:
            rows.append([f"  {line['label']}", *line["values"], line["total"]])
            for account in line["accounts"]:
                rows.append([f"      {account['label']}", *account["values"], account["total"]])
    rows.append(
        [data["result"]["label"].upper(), *data["result"]["values"], data["result"]["total"]]
    )
    title = f"DRE por competência · {format_date_br(start)} a {format_date_br(end)} · " + (
        "filtros: " + ", ".join(names) if names else "filtros: nenhum"
    )
    # sem linha de total: as linhas já são subtotais umas das outras
    return build_xlsx(sheet="DRE", title=title, headers=headers, rows=rows)
