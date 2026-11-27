"""DRE (PF-76) e fluxo mensal: o resultado por mês, pelo plano de contas.

Só lê. O **DRE** (Bruno, 27/11/2026; ADR 0030) tem linhas fixas e subtotais (`LINES`): receita
operacional, impostos, **receita líquida**, custos, **lucro bruto**, despesas com pessoal e
administrativas, **resultado operacional**, despesas bancárias, outras receitas e **resultado do
período**. Cada conta entra na linha dela ou, sem linha própria, na do grupo; "fora" não entra no
resultado e aparece à parte (ativo, empréstimo, aporte). Conta sem linha nenhuma entra no
resultado numa linha própria, para o dinheiro não sumir.

- Competência: a do título; a conta a pagar sem competência usa o mês da emissão.
- Valor: o principal do título, sem os acréscimos, descontos e impostos retidos.
- Fora do quadro: cancelado, substituído, excluído e as provisões (são estimativa, não fato).
- Projeto: a conta repartida entre projetos entra só com a parte do projeto filtrado.

O **fluxo mensal** (`basis="caixa"`) mostra o dinheiro, com receitas e despesas por grupo do plano
de contas: o mês em que saiu ou entrou, com o valor das baixas e dos recebimentos que valem (sem
estornados nem Pix devolvidos), só nas contas bancárias que entram no fluxo de caixa, como o
realizado do fluxo de caixa. Nele nada fica de fora: ativo e empréstimo são dinheiro que anda.
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
# as linhas do DRE, na ordem: (chave, nome, sinal com que entra no resultado)
LINES = (
    ("receita", "Receita operacional", "+"),
    ("impostos", "Impostos", "-"),
    ("custos", "Custos dos serviços", "-"),
    ("pessoal", "Despesas com pessoal", "-"),
    ("administrativas", "Despesas administrativas", "-"),
    ("bancarias", "Despesas bancárias", "-"),
    ("outras_receitas", "Outras receitas", "+"),
)
# o subtotal que vem depois de cada uma destas linhas
SUBTOTALS = {
    "impostos": ("receita_liquida", "Receita líquida"),
    "custos": ("lucro_bruto", "Lucro bruto"),
    "administrativas": ("resultado_operacional", "Resultado operacional"),
}
OUTSIDE = "fora"
UNMAPPED = "sem_linha"
SIGNS = {"+": "(+)", "-": "(−)", "±": "(±)", "=": "(=)"}


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


def _groups(
    members: list[ExpenseCategory],
    groups: dict[int, ExpenseCategoryGroup],
    values: dict[int, dict[str, Decimal]],
    columns: list[str],
) -> list[dict[str, Any]]:
    """Os grupos das contas de uma linha, na ordem do código; as sem grupo no fim."""
    by_group: dict[tuple[str, str], list[ExpenseCategory]] = defaultdict(list)
    for category in members:
        group = groups.get(category.group_id) if category.group_id else None
        key = (f"0 {group.code}", f"{group.code} {group.name}") if group else ("1", NO_GROUP)
        by_group[key].append(category)
    result = []
    for (_, name), accounts in sorted(by_group.items()):
        total: dict[str, Decimal] = defaultdict(lambda: ZERO)
        rows = []
        for category in sorted(accounts, key=lambda c: (c.code, c.name)):
            for month, value in values[category.id].items():
                total[month] += value
            rows.append(_row(f"{category.code} {category.name}", values[category.id], columns))
        result.append(_row(name, total, columns, accounts=rows))
    return result


def statement(db: Session, start: date, end: date, filters: Filters) -> dict[str, Any]:
    """O DRE por competência, com as linhas, os subtotais e o que fica fora do resultado."""
    columns = months(start, end)
    totals = _amounts(db, set(columns), filters)
    categories = db.query(ExpenseCategory).filter(ExpenseCategory.id.in_(totals or [0])).all()
    groups = {g.id: g for g in db.query(ExpenseCategoryGroup)}
    # receita soma, despesa subtrai
    signed = {
        c.id: {m: v if c.kind == "receita" else -v for m, v in totals[c.id].items()}
        for c in categories
    }
    members: dict[str, list[ExpenseCategory]] = defaultdict(list)
    for category in categories:
        group = groups.get(category.group_id) if category.group_id else None
        line = category.dreLine or (group.dreLine if group else None) or UNMAPPED
        members[line].append(category)

    running: dict[str, Decimal] = defaultdict(lambda: ZERO)

    def line_row(key: str, label: str, sign: str) -> dict[str, Any]:
        # a linha que subtrai mostra a despesa como número positivo
        shown = {
            c.id: {m: -v if sign == "-" else v for m, v in signed[c.id].items()}
            for c in members[key]
        }
        inside = _groups(members[key], groups, shown, columns)
        total: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for category in members[key]:
            for month, value in shown[category.id].items():
                total[month] += value
            if key != OUTSIDE:
                for month, value in signed[category.id].items():
                    running[month] += value
        return _row(label, total, columns, key=key, kind="linha", sign=sign, groups=inside)

    def subtotal(key: str, label: str, kind: str = "subtotal") -> dict[str, Any]:
        return _row(label, dict(running), columns, key=key, kind=kind, sign="=", groups=[])

    rows = []
    for key, label, sign in LINES:
        rows.append(line_row(key, label, sign))
        if key in SUBTOTALS:
            rows.append(subtotal(*SUBTOTALS[key]))
    if members[UNMAPPED]:
        rows.append(line_row(UNMAPPED, "Sem linha do DRE", "±"))
    rows.append(subtotal("resultado", "Resultado do período", "resultado"))
    return {
        "months": [{"month": month, "label": month_name(month)} for month in columns],
        "rows": rows,
        "outside": line_row(OUTSIDE, "Fora do resultado", "±") if members[OUTSIDE] else None,
        "unmapped": len(members[UNMAPPED]),
    }


def report(db: Session, start: date, end: date, filters: Filters) -> dict[str, Any]:
    """O fluxo mensal: receitas e despesas por grupo do plano de contas, pelo pagamento."""
    columns = months(start, end)
    totals = _cash_amounts(db, columns, filters)
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


def _sheet_row(row: dict[str, Any], label: str) -> list[Any]:
    return [label, *row["values"], row["total"]]


def _sheet_groups(groups: list[dict[str, Any]]) -> list[list[Any]]:
    rows = []
    for group in groups:
        rows.append(_sheet_row(group, f"  {group['label']}"))
        rows += [_sheet_row(a, f"      {a['label']}") for a in group["accounts"]]
    return rows


def export_xlsx(
    db: Session, start: date, end: date, filters: Filters, basis: str = "competencia"
) -> bytes:
    names = filter_names(db, filters)
    rows: list[list[Any]] = []
    if basis == "competencia":
        data = statement(db, start, end, filters)
        for row in data["rows"]:
            rows.append(_sheet_row(row, f"{SIGNS[row['sign']]} {row['label']}"))
            rows += _sheet_groups(row["groups"])
        outside = data["outside"]
        if outside:
            rows.append(_sheet_row(outside, "FORA DO RESULTADO (não soma)"))
            rows += _sheet_groups(outside["groups"])
    else:
        data = report(db, start, end, filters)
        for block in data["blocks"]:
            rows.append(_sheet_row(block, block["label"].upper()))
            rows += _sheet_groups(block["lines"])
        rows.append(_sheet_row(data["result"], data["result"]["label"].upper()))
    headers = ["Linha", *(m["label"] for m in data["months"]), "Total"]
    title = f"{BASES[basis]} · {format_date_br(start)} a {format_date_br(end)} · " + (
        "filtros: " + ", ".join(names) if names else "filtros: nenhum"
    )
    # sem linha de total: as linhas já são subtotais umas das outras
    sheet = "DRE" if basis == "competencia" else "Fluxo mensal"
    return build_xlsx(sheet=sheet, title=title, headers=headers, rows=rows)
