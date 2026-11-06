"""Contas a receber (spec contas-a-receber): simétrico ao Contas a pagar, com cliente no lugar de
fornecedor e recebimento no lugar de baixa.

Situação e pendente nunca são gravados: saem dos recebimentos, dos abatimentos e do vencimento.
Os erros de regra reaproveitam `PayableConflict` (409) e `PayableInvalid` (422), que a API já
traduz.
"""

import csv
import io
from collections.abc import Callable, Iterable
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, selectinload

from core.query_lists import as_list
from core.text import format_brl, format_brl_plain, format_date_br
from core.xlsx import build_xlsx
from models.receivable import (
    Receivable,
    ReceivableAdjustment,
    ReceivableEvent,
    ReceivablePayment,
)
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    PaymentMethod,
    Project,
)
from models.user import User
from schemas.receivable import ReceiptCreate, ReceiptReverse, ReceivableCreate, ReceivableUpdate
from services import adjustments as adj
from services.payable import (
    PayableConflict,
    PayableInvalid,
    PayableNotFound,
    _active,
    period_range,
    today,
)

PAGE_SIZE = 12
ZERO = Decimal("0")
PROJECT_CLOSED = "Projeto fechado — peça a reabertura a um administrador"


class ReceivableNotFound(PayableNotFound):
    pass


# ---- Valores e situação: sempre calculados, nunca gravados ----


def reversed_ids(receivable: Receivable) -> set[int]:
    return {p.reverses_id for p in receivable.payments if p.reverses_id is not None}


def _active_receipts(receivable: Receivable) -> list[ReceivablePayment]:
    undone = reversed_ids(receivable)
    return [p for p in receivable.payments if p.kind == "recebimento" and p.id not in undone]


def received_amount(receivable: Receivable) -> Decimal:
    return sum((p.amount for p in _active_receipts(receivable)), ZERO)


def net_amount(receivable: Receivable) -> Decimal:
    """O que de fato se recebe: o valor principal + acréscimos − descontos − impostos."""
    return adj.net(receivable.amount, receivable.adjustments)


def pending_amount(receivable: Receivable) -> Decimal:
    if receivable.canceledAt is not None:
        return ZERO
    return net_amount(receivable) - received_amount(receivable)


def situation(receivable: Receivable, on: date) -> str:
    if receivable.canceledAt is not None:
        return "cancelado"
    if pending_amount(receivable) <= 0:
        return "recebido"
    if receivable.dueDate < on:
        return "vencido"
    if receivable.dueDate == on:
        return "hoje"
    return "parcial" if received_amount(receivable) > 0 else "a_vencer"


def days_late(receivable: Receivable, on: date) -> int | None:
    """Dias corridos desde o dia seguinte ao vencimento. Só título vencido tem atraso."""
    if situation(receivable, on) != "vencido":
        return None
    return (on - receivable.dueDate).days


# ---- Lista ----

Predicate = Callable[[Receivable, date], bool]

INDICATORS: dict[str, Predicate] = {
    "total": lambda r, on: r.canceledAt is None,
    "recebidos": lambda r, on: situation(r, on) == "recebido",
    "pendentes": lambda r, on: pending_amount(r) > 0,
    "vencidos": lambda r, on: situation(r, on) == "vencido",
    "hoje": lambda r, on: situation(r, on) == "hoje",
    "avencer": lambda r, on: situation(r, on) in ("a_vencer", "parcial"),
    "cancelados": lambda r, on: r.canceledAt is not None,
}


def _indicator_value(key: str, receivables: list[Receivable]) -> Decimal:
    if key == "recebidos":
        return sum((received_amount(r) for r in receivables), ZERO)
    if key in ("total", "cancelados"):
        return sum((net_amount(r) for r in receivables), ZERO)
    return sum((pending_amount(r) for r in receivables), ZERO)


def _base_query(db: Session) -> Any:
    return (
        db.query(Receivable)
        .filter(Receivable.deletedAt.is_(None))
        # Ordem fixa: títulos com o mesmo vencimento não trocam de página entre duas leituras.
        .order_by(Receivable.id)
        .options(
            selectinload(Receivable.customer),
            selectinload(Receivable.project),
            selectinload(Receivable.category),
            selectinload(Receivable.company),
            selectinload(Receivable.payments),
            selectinload(Receivable.adjustments),
        )
    )


def _sort_key(column: str, on: date) -> Callable[[Receivable], Any]:
    keys: dict[str, Callable[[Receivable], Any]] = {
        "vencimento": lambda r: r.dueDate,
        "cliente": lambda r: r.customer.name.casefold(),
        "categoria": lambda r: r.category.name.casefold(),
        "situacao": lambda r: situation(r, on),
        "valor": net_amount,
        "recebido": received_amount,
        "pendente": pending_amount,
    }
    return keys[column]


def row(receivable: Receivable, on: date) -> dict[str, Any]:
    return {
        "id": receivable.id,
        "situation": situation(receivable, on),
        "dueDate": receivable.dueDate,
        "customer": receivable.customer.name,
        "projectCode": receivable.project.code,
        "projectTitle": receivable.project.title,
        "description": receivable.description,
        "contract": receivable.contract,
        "documentType": receivable.documentType,
        "documentNumber": receivable.documentNumber,
        "categoryName": receivable.category.name,
        "companyName": receivable.company.name,
        "amount": receivable.amount,
        "net": net_amount(receivable),
        "received": received_amount(receivable),
        "pending": pending_amount(receivable),
        "daysLate": days_late(receivable, on),
        "canReceive": pending_amount(receivable) > 0,
        "series": (
            {
                "id": receivable.series.id,
                "index": receivable.seriesIndex,
                "count": receivable.series.count,
                "kind": receivable.series.kind,
                "estimated": receivable.series.estimated,
            }
            if receivable.series
            else None
        ),
    }


def _filtered(
    db: Session,
    *,
    mode: str,
    ref: date | None,
    custom_range: tuple[date, date] | None,
    date_field: str,
    filters: dict[str, Any],
    search: str | None,
) -> tuple[date, date | None, date | None, list[Receivable]]:
    on = today()
    start, end = custom_range or period_range(mode, ref or on)
    query = _base_query(db)
    if start and end:
        if date_field == "recebimento":
            undone = db.query(ReceivablePayment.reverses_id).filter(
                ReceivablePayment.reverses_id.isnot(None)
            )
            query = query.filter(
                Receivable.payments.any(
                    and_(
                        ReceivablePayment.kind == "recebimento",
                        ReceivablePayment.receivedOn >= start,
                        ReceivablePayment.receivedOn <= end,
                        ReceivablePayment.id.notin_(undone),
                    )
                )
            )
        elif date_field == "competencia":
            query = query.filter(
                Receivable.competence >= start.strftime("%Y-%m"),
                Receivable.competence <= end.strftime("%Y-%m"),
            )
        else:
            query = query.filter(Receivable.dueDate >= start, Receivable.dueDate <= end)
    columns = {
        "customer": Receivable.customer_id,
        "project": Receivable.project_id,
        "category": Receivable.category_id,
        "company": Receivable.company_id,
        "unit": Receivable.unit_id,
        "costCenter": Receivable.cost_center_id,
    }
    # Cada filtro aceita mais de uma opção: dentro do filtro vale "ou", entre filtros vale "e".
    for key, column in columns.items():
        chosen = as_list(filters.get(key))
        if chosen:
            query = query.filter(column.in_(chosen))
    term = (search or "").strip().lower()
    if term:
        like = lambda column: func.lower(column).contains(term, autoescape=True)  # noqa: E731
        query = query.join(Customer, Receivable.customer_id == Customer.id).filter(
            or_(
                like(Receivable.description),
                like(Receivable.contract),
                like(Receivable.documentNumber),
                like(Customer.name),
                like(Customer.nickname),
            )
        )
    # shortcut: situação calculada em Python, com tudo do período em memória; mover para SQL
    # quando um período passar de dezenas de milhares de títulos.
    receivables: list[Receivable] = query.all()
    wanted = as_list(filters.get("situation"))
    if wanted:
        receivables = [r for r in receivables if situation(r, on) in wanted]
    return on, start, end, receivables


def list_receivables(
    db: Session,
    *,
    mode: str,
    ref: date | None,
    custom_range: tuple[date, date] | None = None,
    date_field: str = "vencimento",
    indicator: str,
    filters: dict[str, Any],
    search: str | None,
    sort: str,
    descending: bool,
    page: int,
) -> dict[str, Any]:
    on, start, end, receivables = _filtered(
        db,
        mode=mode,
        ref=ref,
        custom_range=custom_range,
        date_field=date_field,
        filters=filters,
        search=search,
    )
    selected = [r for r in receivables if INDICATORS[indicator](r, on)]
    selected.sort(key=_sort_key(sort, on), reverse=descending)

    indicators = {}
    for key, predicate in INDICATORS.items():
        matching = [r for r in receivables if predicate(r, on)]
        indicators[key] = {"value": _indicator_value(key, matching), "count": len(matching)}

    first = (page - 1) * PAGE_SIZE
    return {
        "today": on,
        "rangeStart": start,
        "rangeEnd": end,
        "items": [row(r, on) for r in selected[first : first + PAGE_SIZE]],
        "total": len(selected),
        "page": page,
        "pageSize": PAGE_SIZE,
        "filteredNet": sum((net_amount(r) for r in selected), ZERO),
        "filteredReceived": sum((received_amount(r) for r in selected), ZERO),
        "filteredPending": sum((pending_amount(r) for r in selected), ZERO),
        "indicators": indicators,
    }


# Faixas de atraso da inadimplência: (id, primeiro dia, último dia). A última não tem teto.
# shortcut: faixas-padrão de cobrança, limites a validar com a Vivi (spec contas-a-receber).
DELINQUENCY_BANDS: tuple[tuple[str, int, int | None], ...] = (
    ("1-30", 1, 30),
    ("31-60", 31, 60),
    ("61-90", 61, 90),
    ("90+", 91, None),
)


def delinquency_band(days: int) -> str:
    for band_id, first, last in DELINQUENCY_BANDS:
        if days >= first and (last is None or days <= last):
            return band_id
    return DELINQUENCY_BANDS[0][0]


def delinquency(db: Session) -> list[dict[str, Any]]:
    """Títulos vencidos por cliente, com os dias de atraso, a faixa e o total. O maior devedor
    primeiro."""
    on = today()
    receivables = _base_query(db).all()
    by_customer: dict[int, list[Receivable]] = {}
    for receivable in receivables:
        if situation(receivable, on) == "vencido":
            by_customer.setdefault(receivable.customer_id, []).append(receivable)
    result = []
    for customer_id, titles in by_customer.items():
        titles.sort(key=lambda r: r.dueDate)
        rows = [
            {
                "id": t.id,
                "description": t.description,
                "dueDate": t.dueDate,
                "daysLate": days_late(t, on) or 0,
                "band": delinquency_band(days_late(t, on) or 0),
                "pending": pending_amount(t),
            }
            for t in titles
        ]
        result.append(
            {
                "customerId": customer_id,
                "customer": titles[0].customer.name,
                "count": len(titles),
                "maxDaysLate": max(row["daysLate"] for row in rows),
                "total": sum((pending_amount(t) for t in titles), ZERO),
                # todas as faixas, mesmo vazias, na ordem: a tela não precisa conhecer os limites
                "bands": [
                    {
                        "id": band_id,
                        "count": sum(1 for row in rows if row["band"] == band_id),
                        "total": sum((r["pending"] for r in rows if r["band"] == band_id), ZERO),
                    }
                    for band_id, _, _ in DELINQUENCY_BANDS
                ],
                "titles": rows,
            }
        )
    result.sort(key=lambda c: (-c["total"], c["customer"].casefold()))
    return result


SITUATION_NAMES = {
    "recebido": "Recebida",
    "parcial": "Parcial",
    "vencido": "Vencida",
    "hoje": "Vence hoje",
    "a_vencer": "A vencer",
    "cancelado": "Cancelada",
}
INDICATOR_NAMES = {
    "total": "Total",
    "recebidos": "Recebidos",
    "pendentes": "Pendentes",
    "vencidos": "Vencidos",
    "hoje": "Hoje",
    "avencer": "A vencer",
    "cancelados": "Canceladas",
}
DATE_FIELD_NAMES = {
    "vencimento": "vencimento",
    "competencia": "competência",
    "recebimento": "recebimento",
}


def _csv_cell(value: str) -> str:
    """Célula que começa com = + - @ vira texto, para a planilha não executar fórmula."""
    return f"'{value}" if value[:1] in ("=", "+", "-", "@") else value


def _filter_names(db: Session, filters: dict[str, Any]) -> list[str]:
    named: list[tuple[str, type[Any], str]] = [
        ("customer", Customer, "cliente"),
        ("project", Project, "projeto"),
        ("category", ExpenseCategory, "conta de receita"),
        ("company", Company, "empresa"),
        ("unit", BusinessUnit, "unidade"),
        ("costCenter", CostCenter, "centro de custo"),
    ]
    names = []
    for key, model, label in named:
        chosen = as_list(filters.get(key))
        if chosen:
            shown: list[str] = []
            for record_id in chosen:
                record = db.get(model, record_id)
                shown.append(str(getattr(record, "name", None) or getattr(record, "code", "—")))
            names.append(f"{label}={' ou '.join(shown)}")
    if filters.get("situation"):
        shown_situations = [SITUATION_NAMES[s] for s in as_list(filters["situation"])]
        names.append(f"situação={' ou '.join(shown_situations)}")
    return names


def _export_table(
    db: Session,
    *,
    mode: str,
    ref: date | None,
    custom_range: tuple[date, date] | None = None,
    date_field: str = "vencimento",
    indicator: str,
    filters: dict[str, Any],
    search: str | None,
    sort: str,
    descending: bool,
) -> tuple[str, list[str], list[list[Any]]]:
    """O que as exportações levam: título com os filtros, cabeçalhos e uma linha por título, com
    data, dinheiro e texto nos tipos de verdade (cada formato decide como escrever)."""
    on, start, end, receivables = _filtered(
        db,
        mode=mode,
        ref=ref,
        custom_range=custom_range,
        date_field=date_field,
        filters=filters,
        search=search,
    )
    selected = [r for r in receivables if INDICATORS[indicator](r, on)]
    selected.sort(key=_sort_key(sort, on), reverse=descending)

    period = (
        f"{format_date_br(start)} a {format_date_br(end)}" if start and end else "todo o período"
    )
    header = [
        f"Contas a receber · {period} por {DATE_FIELD_NAMES[date_field]}",
        INDICATOR_NAMES[indicator],
        "filtros: " + (", ".join(_filter_names(db, filters)) or "nenhum"),
    ]
    if (search or "").strip():
        header.append(f"busca: {search}")

    headers = [
        "Vencimento",
        "Cliente",
        "Descrição",
        "Contrato",
        "Documento",
        "Projeto",
        "Conta de receita",
        "Empresa",
        "Situação",
        "Dias de atraso",
        "Valor principal",
        "Acréscimos",
        "Descontos",
        "Impostos",
        "Líquido",
        "Recebido",
        "Pendente",
    ]
    rows: list[list[Any]] = []
    for r in selected:
        document = (
            f"{r.documentType} {r.documentNumber or ''}".strip()
            if r.documentType != "Sem documento"
            else r.documentType
        )
        rows.append(
            [
                r.dueDate,
                r.customer.name,
                r.description,
                r.contract or "",
                document,
                f"PRJ-{r.project.code}",
                r.category.name,
                r.company.name,
                SITUATION_NAMES[situation(r, on)],
                days_late(r, on),
                r.amount,
                adj.total(r.adjustments, "acrescimo"),
                adj.total(r.adjustments, "desconto"),
                adj.total(r.adjustments, "imposto"),
                net_amount(r),
                received_amount(r),
                pending_amount(r),
            ]
        )
    return " · ".join(header), headers, rows


EXPORT_MONEY_COLUMNS = (10, 11, 12, 13, 14, 15, 16)


def _csv_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, date):
        return format_date_br(value)
    if isinstance(value, Decimal):
        return format_brl_plain(value)
    if isinstance(value, int):
        return value
    return _csv_cell(str(value))


def export_csv(db: Session, **query: Any) -> str:
    """Tudo o que os filtros trazem, sem paginar, com os filtros na primeira linha."""
    title, headers, rows = _export_table(db, **query)
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
    writer.writerow([_csv_cell(title)])
    writer.writerow(headers)
    for row in rows:
        writer.writerow([_csv_value(value) for value in row])
    # BOM: o Excel só lê os acentos com ele.
    return "\ufeff" + output.getvalue()


def export_xlsx(db: Session, **query: Any) -> bytes:
    """O mesmo da exportação em CSV, em .xlsx, com os totais no fim."""
    title, headers, rows = _export_table(db, **query)
    return build_xlsx(
        sheet="Contas a receber",
        title=title,
        headers=headers,
        rows=rows,
        total_columns=EXPORT_MONEY_COLUMNS,
    )


# ---- Detalhe ----


def _get(db: Session, receivable_id: int, lock: bool = False) -> Receivable:
    query = db.query(Receivable).filter(
        Receivable.id == receivable_id, Receivable.deletedAt.is_(None)
    )
    if lock:
        # Dois pedidos ao mesmo tempo não podem receber o mesmo saldo duas vezes.
        query = query.with_for_update()
    receivable = query.first()
    if receivable is None:
        raise ReceivableNotFound
    return receivable


def detail(db: Session, receivable_id: int) -> dict[str, Any]:
    receivable = _get(db, receivable_id)
    undone = reversed_ids(receivable)
    return {
        **row(receivable, today()),
        "company_id": receivable.company_id,
        "unitName": receivable.unit.name,
        "costCenterName": receivable.cost_center.name,
        "issueDate": receivable.issueDate,
        "competence": receivable.competence,
        "documentDate": receivable.documentDate,
        "notes": receivable.notes,
        "payments": [
            {
                "id": p.id,
                "kind": p.kind,
                "reversesId": p.reverses_id,
                "reversed": p.id in undone,
                "receivedOn": p.receivedOn,
                "amount": p.amount,
                "bankAccountName": p.bank_account.name,
                "paymentMethodName": p.payment_method.name,
                "transactionId": p.transactionId,
                "note": p.note,
            }
            for p in receivable.payments
        ],
        "adjustments": [
            {"id": a.id, "kind": a.kind, "description": a.description, "amount": a.amount}
            for a in receivable.adjustments
        ],
        "events": [
            {"userName": e.user.name, "text": e.text, "createdAt": e.createdAt}
            for e in reversed(receivable.events)
        ],
    }


# ---- Escrita ----


def audit(db: Session, receivable: Receivable, user: User, text: str) -> None:
    db.add(ReceivableEvent(receivable_id=receivable.id, user_id=user.id, text=text[:500]))


def _check_net(amount: Decimal, rows: Iterable[Any]) -> None:
    if adj.net(amount, rows) <= 0:
        raise PayableInvalid(adj.NET_ZERO)


def _adjustment_rows(items: Iterable[Any]) -> list[ReceivableAdjustment]:
    return [
        ReceivableAdjustment(kind=a.kind, description=a.description, amount=a.amount) for a in items
    ]


def _check_project(db: Session, project_id: int | None) -> Project:
    if project_id is None:
        raise PayableInvalid("Informe o projeto da receita")
    project = db.get(Project, project_id)
    if project is None:
        raise PayableInvalid("Projeto não encontrado")
    if project.status == "encerrado":
        raise PayableConflict(PROJECT_CLOSED)
    return project


def create(db: Session, data: ReceivableCreate, user: User) -> Receivable:
    receivable = new_receivable(db, data, user)
    db.commit()
    return receivable


def new_receivable(db: Session, data: ReceivableCreate, user: User) -> Receivable:
    """Valida e grava o título na transação aberta, sem commit: quem chama decide quando fechar."""
    _check_project(db, data.projectId)
    _active(db, Customer, data.customerId, "Cliente")
    category = _active(db, ExpenseCategory, data.categoryId, "Conta")
    if category.kind != "receita":
        raise PayableInvalid("Contas a receber usam conta de receita")
    _active(db, Company, data.companyId, "Empresa")
    _active(db, CostCenter, data.costCenterId, "Centro de custo")
    unit = _active(db, BusinessUnit, data.unitId, "Unidade")
    if unit.company_id != data.companyId:
        raise PayableInvalid("A unidade não é dessa empresa")
    if data.documentType == "NF" and (not data.documentNumber or not data.documentDate):
        raise PayableInvalid("Informe o número e a data de emissão da nota")
    _check_net(data.amount, data.adjustments)

    receivable = Receivable(
        customer_id=data.customerId,
        project_id=data.projectId,
        company_id=data.companyId,
        unit_id=data.unitId,
        cost_center_id=data.costCenterId,
        category_id=data.categoryId,
        contract=data.contract or None,
        description=data.description,
        documentType=data.documentType,
        documentNumber=data.documentNumber or None,
        documentDate=data.documentDate,
        issueDate=data.issueDate,
        dueDate=data.dueDate,
        competence=data.competence or data.dueDate.strftime("%Y-%m"),
        amount=data.amount,
        adjustments=_adjustment_rows(data.adjustments),
        notes=data.notes or None,
        created_by_user_id=user.id,
    )
    db.add(receivable)
    db.flush()
    audit(
        db,
        receivable,
        user,
        f"Lançada: {receivable.description} · {format_brl(net_amount(receivable))} líquido · "
        f"vence {format_date_br(receivable.dueDate)}",
    )
    return receivable


def update(db: Session, receivable_id: int, data: ReceivableUpdate, user: User) -> None:
    apply_update(db, _get(db, receivable_id, lock=True), data, user)
    db.commit()


def apply_update(db: Session, receivable: Receivable, data: ReceivableUpdate, user: User) -> None:
    """Altera valor, acréscimos, descontos, impostos, vencimento e descrição na transação aberta."""
    if receivable.canceledAt is not None:
        raise PayableConflict("Título cancelado não pode ser alterado")
    rows = receivable.adjustments if data.adjustments is None else data.adjustments
    _check_net(data.amount, rows)
    amount_changed = data.amount != receivable.amount
    adjustments_changed = data.adjustments is not None and adj.lines(
        receivable.adjustments
    ) != adj.lines(data.adjustments)
    changes = []
    if amount_changed or adjustments_changed:
        if receivable.project.status == "encerrado":
            raise PayableConflict(PROJECT_CLOSED)
        if adj.net(data.amount, rows) < received_amount(receivable):
            raise PayableConflict("O novo valor é menor do que já foi recebido")
    if amount_changed:
        changes.append(f"valor {format_brl(receivable.amount)} → {format_brl(data.amount)}")
        receivable.amount = data.amount
    if adjustments_changed and data.adjustments is not None:
        changes += adj.describe_changes(receivable.adjustments, data.adjustments)
        receivable.adjustments = _adjustment_rows(data.adjustments)
    if data.dueDate != receivable.dueDate:
        changes.append(
            f"vencimento {format_date_br(receivable.dueDate)} → {format_date_br(data.dueDate)}"
        )
        receivable.dueDate = data.dueDate
    if data.description != receivable.description:
        changes.append(f"descrição {receivable.description} → {data.description}")
        receivable.description = data.description
    if changes:
        audit(db, receivable, user, "Alterada: " + "; ".join(changes))


def _bank_account(db: Session, account_id: int, company_id: int) -> BankAccount:
    account = _active(db, BankAccount, account_id, "Conta bancária")
    if account.company_id != company_id:
        raise PayableInvalid("A conta bancária não é da empresa desse título")
    return account


def _transaction_used(db: Session, transaction_id: str) -> bool:
    """O mesmo ID bancário não vale para dois recebimentos. Depois de um estorno, vale de novo."""
    undone = db.query(ReceivablePayment.reverses_id).filter(
        ReceivablePayment.reverses_id.isnot(None)
    )
    return (
        db.query(ReceivablePayment.id)
        .filter(
            ReceivablePayment.transactionId == transaction_id,
            ReceivablePayment.kind == "recebimento",
            ReceivablePayment.id.notin_(undone),
        )
        .first()
        is not None
    )


def receive(db: Session, receivable_id: int, data: ReceiptCreate, user: User) -> Decimal:
    """Recebe, total ou parcial. Devolve o que ainda falta."""
    receivable = _get(db, receivable_id, lock=True)
    if receivable.canceledAt is not None:
        raise PayableConflict("Título cancelado não recebe")
    on = today()
    if data.receivedOn > on:
        raise PayableInvalid(
            "O recebimento é o dia em que o dinheiro entrou: não pode ser no futuro"
        )
    if data.receivedOn < on and not (data.note or "").strip():
        raise PayableInvalid("Recebimento com data no passado precisa de observação")
    account = _bank_account(db, data.bankAccountId, receivable.company_id)
    _active(db, PaymentMethod, data.paymentMethodId, "Forma de recebimento")
    pending = pending_amount(receivable)
    if pending <= 0:
        raise PayableConflict("Esse título já foi recebido")
    if data.amount > pending:
        raise PayableConflict(f"O valor recebido passa do saldo pendente ({format_brl(pending)})")
    if data.transactionId and _transaction_used(db, data.transactionId):
        raise PayableConflict("Esse ID de transação já foi usado em outro recebimento")
    db.add(
        ReceivablePayment(
            receivable_id=receivable.id,
            receivedOn=data.receivedOn,
            amount=data.amount,
            bank_account_id=account.id,
            payment_method_id=data.paymentMethodId,
            transactionId=data.transactionId or None,
            note=data.note or None,
            created_by_user_id=user.id,
        )
    )
    audit(
        db,
        receivable,
        user,
        f"Recebimento de {format_brl(data.amount)} em {format_date_br(data.receivedOn)} "
        f"({account.name})",
    )
    db.commit()
    db.refresh(receivable)
    return pending_amount(receivable)


def reverse(
    db: Session, receivable_id: int, payment_id: int, data: ReceiptReverse, user: User
) -> None:
    """Estorno: uma linha nova que anula o recebimento. O original nunca some."""
    receivable = _get(db, receivable_id, lock=True)
    original = next((p for p in receivable.payments if p.id == payment_id), None)
    if original is None or original.kind != "recebimento":
        raise ReceivableNotFound
    if original.id in reversed_ids(receivable):
        raise PayableConflict("Esse recebimento já foi estornado")
    on = today()
    db.add(
        ReceivablePayment(
            receivable_id=receivable.id,
            kind="estorno",
            reverses_id=original.id,
            receivedOn=on,
            amount=original.amount,
            bank_account_id=original.bank_account_id,
            payment_method_id=original.payment_method_id,
            note=data.reason,
            created_by_user_id=user.id,
        )
    )
    audit(
        db,
        receivable,
        user,
        f"Estorno do recebimento de {format_date_br(original.receivedOn)} "
        f"({format_brl(original.amount)}): {data.reason}",
    )
    db.commit()


def cancel(db: Session, receivable_id: int, reason: str, user: User) -> None:
    apply_cancel(db, _get(db, receivable_id, lock=True), reason, user)
    db.commit()


def apply_cancel(db: Session, receivable: Receivable, reason: str, user: User) -> None:
    """Cancela na transação aberta, sem commit."""
    if receivable.canceledAt is not None:
        raise PayableConflict("Esse título já está cancelado")
    if received_amount(receivable) > 0:
        raise PayableConflict("Esse título tem recebimentos — estorne antes de cancelar")
    receivable.canceledAt = datetime.now(UTC)
    audit(db, receivable, user, f"Cancelado: {reason}")


def delete(db: Session, receivable_id: int, user: User) -> None:
    receivable = _get(db, receivable_id, lock=True)
    if received_amount(receivable) > 0:
        raise PayableConflict("Esse título tem recebimentos — estorne antes de excluir ou cancele")
    receivable.deletedAt = datetime.now(UTC)
    audit(
        db,
        receivable,
        user,
        f"Excluído: {receivable.description} ({format_brl(net_amount(receivable))})",
    )
    db.commit()
