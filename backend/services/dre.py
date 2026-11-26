"""DRE (PF-76): receitas, despesas e resultado por linha e por mês, por competência.

Só lê. Cada linha do DRE é um **grupo do plano de contas** (decisão do Bruno, 25/11/2026), com as
contas analíticas dele embaixo; a conta sem grupo vai para "Sem grupo". Uma linha nunca mistura
receita e despesa: o grupo que tem as duas aparece uma vez em cada bloco.

- Competência: a do título; a conta a pagar sem competência usa o mês da emissão.
- Valor: o principal do título, sem os acréscimos, descontos e impostos (as linhas de dedução
  ficam para quando a Vivi definir o DRE completo).
- Fora: cancelado, substituído, excluído e as provisões (são estimativa, não fato).
- Projeto: a conta repartida entre projetos entra só com a parte do projeto filtrado.

O **fluxo mensal** (`basis="caixa"`) é o mesmo quadro pelo regime de caixa: em vez da competência,
o mês em que o dinheiro saiu ou entrou, com o valor das baixas e dos recebimentos que valem (sem
estornados nem Pix devolvidos), só nas contas bancárias que entram no fluxo de caixa, como o
realizado do fluxo de caixa.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from core.text import format_date_br
from core.xlsx import build_xlsx
from models.payable import Payable, PayablePayment
from models.receivable import Receivable, ReceivablePayment
from models.reference import (
    BankAccount,
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
CENT = Decimal("0.01")
# o título de cada quadro, na planilha
BASES = {"competencia": "DRE por competência", "caixa": "Fluxo mensal pelo pagamento"}


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


def _by_title(query: Any, model: Any, filters: Filters, project: bool) -> Any:
    """Empresa, unidade e centro de custo (e o projeto, se o título tem um só) do título."""
    pairs = [
        (model.company_id, filters.company),
        (model.unit_id, filters.unit),
        (model.cost_center_id, filters.cost_center),
    ]
    if project:
        pairs.append((model.project_id, filters.project))
    for field, value in pairs:
        if value is not None:
            query = query.filter(field == value)
    return query


def month_bounds(columns: list[str]) -> tuple[date, date]:
    """O primeiro dia do primeiro mês e o primeiro dia depois do último."""
    year, month = (int(part) for part in columns[-1].split("-"))
    after = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return date.fromisoformat(f"{columns[0]}-01"), after


def valid_payments(db: Session, start: date, before: date) -> Any:
    """As baixas que valem de `start` até antes de `before`, com a conta a pagar de cada uma."""
    undone = select(PayablePayment.reverses_id).where(PayablePayment.reverses_id.isnot(None))
    in_flow = select(BankAccount.id).where(BankAccount.impactsCashFlow.is_(True))
    return (
        db.query(PayablePayment, Payable)
        .join(Payable, PayablePayment.payable_id == Payable.id)
        .options(selectinload(Payable.allocations))
        .filter(
            Payable.deletedAt.is_(None),
            PayablePayment.kind == "pagamento",
            PayablePayment.id.not_in(undone),
            PayablePayment.bank_account_id.in_(in_flow),
            PayablePayment.paidOn >= start,
            PayablePayment.paidOn < before,
        )
    )


def valid_receipts(db: Session, start: date, before: date) -> Any:
    """Os recebimentos que valem de `start` até antes de `before`, com o título de cada um."""
    undone = select(ReceivablePayment.reverses_id).where(ReceivablePayment.reverses_id.isnot(None))
    in_flow = select(BankAccount.id).where(BankAccount.impactsCashFlow.is_(True))
    return (
        db.query(ReceivablePayment, Receivable)
        .join(Receivable, ReceivablePayment.receivable_id == Receivable.id)
        .filter(
            Receivable.deletedAt.is_(None),
            ReceivablePayment.kind == "recebimento",
            ReceivablePayment.id.not_in(undone),
            ReceivablePayment.bank_account_id.in_(in_flow),
            ReceivablePayment.receivedOn >= start,
            ReceivablePayment.receivedOn < before,
        )
    )


def _cash_amounts(
    db: Session, columns: list[str], filters: Filters
) -> dict[int, dict[str, Decimal]]:
    """Por conta analítica e por mês do pagamento, o dinheiro que saiu e entrou."""
    totals: dict[int, dict[str, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    start, before = month_bounds(columns)
    for payment, title in _by_title(valid_payments(db, start, before), Payable, filters, False):
        amount = payment.amount
        if filters.project is not None:
            share = sum(
                (a.amount for a in title.allocations if a.project_id == filters.project), ZERO
            )
            if not share or not title.amount:
                continue
            # a baixa entra na proporção da parte do projeto no título
            amount = (payment.amount * share / title.amount).quantize(CENT)
        totals[title.category_id][payment.paidOn.strftime("%Y-%m")] += amount
    for receipt, title in _by_title(valid_receipts(db, start, before), Receivable, filters, True):
        totals[title.category_id][receipt.receivedOn.strftime("%Y-%m")] += receipt.amount
    return totals


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
    for p in _by_title(payables, Payable, filters, False):
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
    for r in _by_title(receivables, Receivable, filters, True):
        totals[r.category_id][r.competence] += r.amount
    return totals


def _row(
    label: str, values: dict[str, Decimal], columns: list[str], **extra: Any
) -> dict[str, Any]:
    by_month = [values.get(month, ZERO) for month in columns]
    return {"label": label, "values": by_month, "total": sum(by_month, ZERO), **extra}


def report(
    db: Session, start: date, end: date, filters: Filters, basis: str = "competencia"
) -> dict[str, Any]:
    columns = months(start, end)
    if basis == "caixa":
        totals = _cash_amounts(db, columns, filters)
    else:
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


def export_xlsx(
    db: Session, start: date, end: date, filters: Filters, basis: str = "competencia"
) -> bytes:
    names = filter_names(db, filters)
    data = report(db, start, end, filters, basis)
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
    title = f"{BASES[basis]} · {format_date_br(start)} a {format_date_br(end)} · " + (
        "filtros: " + ", ".join(names) if names else "filtros: nenhum"
    )
    # sem linha de total: as linhas já são subtotais umas das outras
    sheet = "DRE" if basis == "competencia" else "Fluxo mensal"
    return build_xlsx(sheet=sheet, title=title, headers=headers, rows=rows)
