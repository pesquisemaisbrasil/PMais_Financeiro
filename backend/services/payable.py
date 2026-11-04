import csv
import io
from collections.abc import Callable, Iterable
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, selectinload

from core.text import format_brl, format_brl_plain, format_date_br, launch_date
from models.payable import (
    Payable,
    PayableAllocation,
    PayableEvent,
    PayableItem,
    PayablePayment,
)
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Project,
    Supplier,
)
from models.user import User
from schemas.payable import (
    AllocationIn,
    BatchPaymentCreate,
    BatchReclassify,
    PayableCreate,
    PayableUpdate,
    PaymentCreate,
    PaymentReverse,
    ProvisionReplace,
)

PAGE_SIZE = 12
ZERO = Decimal("0")
OVERDUE_SITUATIONS = ("vencido", "devolvido")
BADGE_SITUATIONS = ("vencido", "hoje", "devolvido")
CONNECT_PAYMENT_DETAIL = (
    "Lançamento do Connect se paga pelo PDF de comprovantes: abra os itens e envie o PDF"
)


class PayableNotFound(Exception):
    pass


class PayableConflict(Exception):
    """Regra de negócio que impede a ação (HTTP 409)."""


class PayableInvalid(Exception):
    """Dado que não fecha (HTTP 422), com a mensagem da regra."""


def today() -> date:
    return launch_date(datetime.now(UTC))


# ---- Valores e situação: sempre calculados, nunca gravados ----


def reversed_ids(payable: Payable) -> set[int]:
    return {p.reverses_id for p in payable.payments if p.reverses_id is not None}


def _active_payments(payable: Payable) -> list[PayablePayment]:
    undone = reversed_ids(payable)
    return [p for p in payable.payments if p.kind == "pagamento" and p.id not in undone]


def paid_amount(payable: Payable) -> Decimal:
    return sum((p.amount for p in _active_payments(payable)), ZERO)


def pending_amount(payable: Payable) -> Decimal:
    """Pendente = valor + juros e multa − desconto − baixas (regra 2 da spec)."""
    if payable.canceledAt is not None or payable.replaced_by_id is not None:
        return ZERO
    active = _active_payments(payable)
    surcharge = sum((p.surcharge for p in active), ZERO)
    discount = sum((p.discount for p in active), ZERO)
    return payable.amount + surcharge - discount - paid_amount(payable)


def _returned(payable: Payable) -> bool:
    """Houve Pix devolvido, e nenhuma baixa válida depois dele."""
    returned = [p.id for p in payable.payments if p.kind == "devolucao"]
    last_active = max((p.id for p in _active_payments(payable)), default=0)
    return bool(returned) and max(returned) > last_active


def situation(payable: Payable, on: date) -> str:
    if payable.canceledAt is not None:
        return "cancelado"
    if payable.replaced_by_id is not None:
        return "substituido"
    if pending_amount(payable) <= 0:
        return "pago"
    if _returned(payable):
        return "devolvido"
    if payable.dueDate < on:
        return "vencido"
    if payable.dueDate == on:
        return "hoje"
    return "parcial" if paid_amount(payable) > 0 else "a_vencer"


def docs_late(payable: Payable) -> bool:
    """Documentação que chegou com menos de 3 dias do vencimento."""
    received = payable.docsReceivedOn
    return received is not None and (payable.dueDate - received).days < 3


def payee_name(payable: Payable) -> str:
    return payable.payeeName or (payable.supplier.name if payable.supplier else "—")


def can_pay_directly(payable: Payable) -> bool:
    return (
        pending_amount(payable) > 0
        and payable.type == "real"
        and payable.origin != "connect"
        and payable.canceledAt is None
    )


REPLACED_DETAIL = "Essa provisão já foi substituída — ela fica só no histórico"


def can_replace(payable: Payable) -> bool:
    return (
        payable.type == "provisao" and payable.canceledAt is None and payable.replaced_by_id is None
    )


# ---- Lista ----

Predicate = Callable[[Payable, date], bool]

INDICATORS: dict[str, Predicate] = {
    "total": lambda p, on: p.canceledAt is None and p.replaced_by_id is None,
    "pagos": lambda p, on: situation(p, on) == "pago",
    "pendentes": lambda p, on: pending_amount(p) > 0 and p.type == "real",
    "vencidos": lambda p, on: situation(p, on) in OVERDUE_SITUATIONS,
    "hoje": lambda p, on: situation(p, on) == "hoje",
    "avencer": lambda p, on: situation(p, on) in ("a_vencer", "parcial") and p.type == "real",
    "provisoes": lambda p, on: (
        p.type == "provisao" and p.canceledAt is None and p.replaced_by_id is None
    ),
    "cancelados": lambda p, on: p.canceledAt is not None,
}

TABS: dict[str, Callable[[Payable, dict[int, int]], bool]] = {
    "todas": lambda p, counts: True,
    "agrupados": lambda p, counts: counts.get(p.id, 0) > 0 and p.origin != "connect",
    "provisoes": lambda p, counts: p.type == "provisao",
    "connect": lambda p, counts: p.origin == "connect",
}


def _indicator_value(key: str, payables: list[Payable]) -> Decimal:
    if key == "pagos":
        return sum((paid_amount(p) for p in payables), ZERO)
    if key in ("total", "provisoes", "cancelados"):
        return sum((p.amount for p in payables), ZERO)
    return sum((pending_amount(p) for p in payables), ZERO)


def period_range(mode: str, ref: date) -> tuple[date | None, date | None]:
    if mode == "dia":
        return ref, ref
    if mode == "semana":
        start = ref - timedelta(days=ref.weekday())
        return start, start + timedelta(days=6)
    if mode == "mes":
        start = ref.replace(day=1)
        return start, (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    if mode == "ano":
        return ref.replace(month=1, day=1), ref.replace(month=12, day=31)
    return None, None


def _base_query(db: Session) -> Any:
    return (
        db.query(Payable)
        .filter(Payable.deletedAt.is_(None))
        # Ordem fixa: títulos com o mesmo vencimento não trocam de página entre duas leituras.
        .order_by(Payable.id)
        .options(
            selectinload(Payable.supplier),
            selectinload(Payable.category),
            selectinload(Payable.cost_center),
            selectinload(Payable.payment_method),
            selectinload(Payable.company),
            selectinload(Payable.allocations).selectinload(PayableAllocation.project),
            selectinload(Payable.payments),
            selectinload(Payable.replaced_provisions),
        )
    )


def _item_counts(db: Session, ids: Iterable[int]) -> dict[int, int]:
    rows = (
        db.query(PayableItem.payable_id, func.count(PayableItem.id))
        .filter(PayableItem.payable_id.in_(list(ids)))
        .group_by(PayableItem.payable_id)
        .all()
    )
    return {payable_id: count for payable_id, count in rows}


def _sort_key(column: str, on: date) -> Callable[[Payable], Any]:
    keys: dict[str, Callable[[Payable], Any]] = {
        "vencimento": lambda p: p.dueDate,
        "fornecedor": lambda p: payee_name(p).casefold(),
        "documento": lambda p: p.documentType,
        "categoria": lambda p: p.category.name.casefold(),
        "situacao": lambda p: situation(p, on),
        "valor": lambda p: p.amount,
        "pago": paid_amount,
        "pendente": pending_amount,
    }
    return keys[column]


def row(payable: Payable, on: date, item_count: int) -> dict[str, Any]:
    return {
        "id": payable.id,
        "type": payable.type,
        "origin": payable.origin,
        "situation": situation(payable, on),
        "dueDate": payable.dueDate,
        "payee": payee_name(payable),
        "description": payable.description,
        "documentType": payable.documentType,
        "documentNumber": payable.documentNumber,
        "allocations": [
            {"projectId": a.project_id, "code": a.project.code, "amount": a.amount}
            for a in payable.allocations
        ],
        "categoryName": payable.category.name,
        "costCenterName": payable.cost_center.name,
        "paymentMethodName": payable.payment_method.name,
        "companyName": payable.company.name,
        "amount": payable.amount,
        "paid": paid_amount(payable),
        "pending": pending_amount(payable),
        "docsLate": docs_late(payable),
        "barcode": payable.barcode,
        "itemCount": item_count,
        "canPayDirectly": can_pay_directly(payable),
        "canReplace": can_replace(payable),
        "replaces": (
            payable.replaced_provisions[0].amount if payable.replaced_provisions else None
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
) -> tuple[date, date | None, date | None, list[Payable]]:
    on = today()
    start, end = custom_range or period_range(mode, ref or on)
    query = _base_query(db)
    if start and end:
        if date_field == "baixa":
            undone = db.query(PayablePayment.reverses_id).filter(
                PayablePayment.reverses_id.isnot(None)
            )
            query = query.filter(
                Payable.payments.any(
                    and_(
                        PayablePayment.kind == "pagamento",
                        PayablePayment.paidOn >= start,
                        PayablePayment.paidOn <= end,
                        PayablePayment.id.notin_(undone),
                    )
                )
            )
        elif date_field == "competencia":
            query = query.filter(
                Payable.competence >= start.strftime("%Y-%m"),
                Payable.competence <= end.strftime("%Y-%m"),
            )
        else:
            query = query.filter(Payable.dueDate >= start, Payable.dueDate <= end)
    columns = {
        "supplier": Payable.supplier_id,
        "category": Payable.category_id,
        "company": Payable.company_id,
        "unit": Payable.unit_id,
        "costCenter": Payable.cost_center_id,
        "paymentMethod": Payable.payment_method_id,
        "kind": Payable.type,
    }
    for key, column in columns.items():
        if filters.get(key):
            query = query.filter(column == filters[key])
    if filters.get("project"):
        query = query.filter(
            Payable.allocations.any(PayableAllocation.project_id == filters["project"])
        )
    term = (search or "").strip().lower()
    if term:
        like = lambda column: func.lower(column).contains(term, autoescape=True)  # noqa: E731
        query = query.outerjoin(Supplier, Payable.supplier_id == Supplier.id).filter(
            or_(
                like(Payable.description),
                like(Payable.payeeName),
                like(Payable.documentNumber),
                like(Supplier.name),
                like(Supplier.nickname),
            )
        )
    # shortcut: situação calculada em Python, com tudo do período em memória; mover para SQL
    # quando um período passar de dezenas de milhares de títulos.
    payables: list[Payable] = query.all()
    wanted = filters.get("situation")
    if wanted:
        payables = [p for p in payables if situation(p, on) == wanted]
    return on, start, end, payables


def list_payables(
    db: Session,
    *,
    mode: str,
    ref: date | None,
    custom_range: tuple[date, date] | None = None,
    date_field: str = "vencimento",
    indicator: str,
    tab: str,
    filters: dict[str, Any],
    search: str | None,
    sort: str,
    descending: bool,
    page: int,
) -> dict[str, Any]:
    on, start, end, payables = _filtered(
        db,
        mode=mode,
        ref=ref,
        custom_range=custom_range,
        date_field=date_field,
        filters=filters,
        search=search,
    )
    counts = _item_counts(db, [p.id for p in payables])

    by_tab = [p for p in payables if TABS[tab](p, counts)]
    by_indicator = [p for p in payables if INDICATORS[indicator](p, on)]
    selected = [p for p in by_tab if INDICATORS[indicator](p, on)]
    selected.sort(key=_sort_key(sort, on), reverse=descending)

    indicators = {}
    for key, predicate in INDICATORS.items():
        matching = [p for p in by_tab if predicate(p, on)]
        indicators[key] = {"value": _indicator_value(key, matching), "count": len(matching)}

    first = (page - 1) * PAGE_SIZE
    return {
        "today": on,
        "rangeStart": start,
        "rangeEnd": end,
        "items": [row(p, on, counts.get(p.id, 0)) for p in selected[first : first + PAGE_SIZE]],
        "total": len(selected),
        "page": page,
        "pageSize": PAGE_SIZE,
        "filteredAmount": sum((p.amount for p in selected), ZERO),
        "filteredPaid": sum((paid_amount(p) for p in selected), ZERO),
        "filteredPending": sum((pending_amount(p) for p in selected), ZERO),
        "indicators": indicators,
        "tabs": {
            key: sum(1 for p in by_indicator if predicate(p, counts))
            for key, predicate in TABS.items()
        },
    }


SITUATION_LABELS = {
    "pago": "Paga",
    "parcial": "Parcial",
    "vencido": "Vencida",
    "hoje": "Vence hoje",
    "a_vencer": "A vencer",
    "devolvido": "Devolvida",
    "cancelado": "Cancelada",
    "substituido": "Substituída",
}
INDICATOR_LABELS = {
    "total": "Total",
    "pagos": "Pagos",
    "pendentes": "Pendentes",
    "vencidos": "Vencidos",
    "hoje": "Hoje",
    "avencer": "A vencer",
    "provisoes": "Provisões",
    "cancelados": "Canceladas",
}
DATE_FIELD_LABELS = {"vencimento": "vencimento", "competencia": "competência", "baixa": "baixa"}


def _csv_cell(value: str) -> str:
    """Célula que começa com = + - @ vira texto, para a planilha não executar fórmula."""
    return f"'{value}" if value[:1] in ("=", "+", "-", "@") else value


def _filter_names(db: Session, filters: dict[str, Any]) -> list[str]:
    named: list[tuple[str, type[Any], str]] = [
        ("supplier", Supplier, "fornecedor"),
        ("project", Project, "projeto"),
        ("category", ExpenseCategory, "categoria"),
        ("company", Company, "empresa"),
        ("unit", BusinessUnit, "unidade"),
        ("costCenter", CostCenter, "centro de custo"),
        ("paymentMethod", PaymentMethod, "forma"),
    ]
    names = []
    for key, model, label in named:
        if filters.get(key):
            record = db.get(model, filters[key])
            shown = getattr(record, "name", None) or getattr(record, "code", "—")
            names.append(f"{label}={shown}")
    if filters.get("situation"):
        names.append(f"situação={SITUATION_LABELS[filters['situation']]}")
    if filters.get("kind"):
        names.append(f"tipo={filters['kind']}")
    return names


def export_csv(
    db: Session,
    *,
    mode: str,
    ref: date | None,
    custom_range: tuple[date, date] | None = None,
    date_field: str = "vencimento",
    indicator: str,
    tab: str,
    filters: dict[str, Any],
    search: str | None,
    sort: str,
    descending: bool,
) -> str:
    """Tudo o que os filtros trazem, sem paginar, com os filtros na primeira linha."""
    on, start, end, payables = _filtered(
        db,
        mode=mode,
        ref=ref,
        custom_range=custom_range,
        date_field=date_field,
        filters=filters,
        search=search,
    )
    counts = _item_counts(db, [p.id for p in payables])
    selected = [p for p in payables if TABS[tab](p, counts) and INDICATORS[indicator](p, on)]
    selected.sort(key=_sort_key(sort, on), reverse=descending)

    period = (
        f"{format_date_br(start)} a {format_date_br(end)}" if start and end else "todo o período"
    )
    header = [
        f"Contas a pagar · {period} por {DATE_FIELD_LABELS[date_field]}",
        INDICATOR_LABELS[indicator],
        "filtros: " + (", ".join(_filter_names(db, filters)) or "nenhum"),
    ]
    if (search or "").strip():
        header.append(f"busca: {search}")

    output = io.StringIO()
    writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
    writer.writerow([_csv_cell(" · ".join(header))])
    writer.writerow(
        [
            "Vencimento",
            "Fornecedor",
            "Descrição",
            "Documento",
            "Projeto",
            "Categoria",
            "Centro de custo",
            "Forma",
            "Empresa",
            "Situação",
            "Valor",
            "Pago",
            "Pendente",
        ]
    )
    for p in selected:
        document = (
            f"NF {p.documentNumber or ''}".strip() if p.documentType == "NF" else p.documentType
        )
        writer.writerow(
            [
                format_date_br(p.dueDate),
                _csv_cell(payee_name(p)),
                _csv_cell(p.description),
                _csv_cell(document),
                " ".join(f"PRJ-{a.project.code}" for a in p.allocations),
                _csv_cell(p.category.name),
                _csv_cell(p.cost_center.name),
                _csv_cell(p.payment_method.name),
                _csv_cell(p.company.name),
                SITUATION_LABELS[situation(p, on)],
                format_brl_plain(p.amount),
                format_brl_plain(paid_amount(p)),
                format_brl_plain(pending_amount(p)),
            ]
        )
    # BOM: o Excel só lê os acentos com ele.
    return "\ufeff" + output.getvalue()


def _get(db: Session, payable_id: int, lock: bool = False) -> Payable:
    query = db.query(Payable).filter(Payable.id == payable_id, Payable.deletedAt.is_(None))
    if lock:
        # Dois pedidos ao mesmo tempo não podem pagar o mesmo saldo duas vezes.
        query = query.with_for_update()
    payable = query.first()
    if payable is None:
        raise PayableNotFound
    return payable


def detail(db: Session, payable_id: int) -> dict[str, Any]:
    payable = _get(db, payable_id)
    undone = reversed_ids(payable)
    return {
        **row(payable, today(), len(payable.items)),
        "company_id": payable.company_id,
        "unitName": payable.unit.name,
        "issueDate": payable.issueDate,
        "competence": payable.competence,
        "documentDate": payable.documentDate,
        "docsReceivedOn": payable.docsReceivedOn,
        "isTransfer": payable.isTransfer,
        "notes": payable.notes,
        "items": [
            {
                "id": i.id,
                "name": i.name,
                "documentType": i.documentType,
                "amount": i.amount,
                "invoiceNumber": i.invoiceNumber,
                "invoiceStatus": i.invoiceStatus,
            }
            for i in payable.items
        ],
        "payments": [
            {
                "id": p.id,
                "kind": p.kind,
                "reversesId": p.reverses_id,
                "reversed": p.id in undone,
                "paidOn": p.paidOn,
                "amount": p.amount,
                "surcharge": p.surcharge,
                "discount": p.discount,
                "bankAccountName": p.bank_account.name,
                "paymentMethodName": p.payment_method.name,
                "transactionId": p.transactionId,
                "note": p.note,
            }
            for p in payable.payments
        ],
        "events": [
            {"userName": e.user.name, "text": e.text, "createdAt": e.createdAt}
            for e in reversed(payable.events)
        ],
    }


# ---- Escrita ----


def audit(db: Session, payable: Payable, user: User, text: str) -> None:
    db.add(PayableEvent(payable_id=payable.id, user_id=user.id, text=text[:500]))


def _active(db: Session, model: type[Any], record_id: int, label: str) -> Any:
    record = db.get(model, record_id)
    if record is None or not record.active:
        raise PayableInvalid(f"{label} não encontrado ou inativo")
    return record


def _check_allocations(db: Session, allocations: list[AllocationIn], amount: Decimal) -> None:
    if not allocations:
        return
    total = sum((a.amount for a in allocations), ZERO)
    if total != amount:
        raise PayableInvalid(
            f"As partes do rateio somam {format_brl(total)}, "
            f"mas o lançamento é de {format_brl(amount)}"
        )
    ids = [a.projectId for a in allocations]
    if len(set(ids)) != len(ids):
        raise PayableInvalid("O mesmo projeto aparece mais de uma vez no rateio")
    for allocation in allocations:
        project = db.get(Project, allocation.projectId)
        if project is None:
            raise PayableInvalid(f"Projeto {allocation.projectId} não encontrado")
        if project.status == "encerrado":
            raise PayableConflict("Projeto fechado — peça a reabertura a um administrador")


def check_classification(
    db: Session,
    *,
    categoryId: int,
    companyId: int,
    unitId: int,
    costCenterId: int,
    paymentMethodId: int,
) -> None:
    _active(db, ExpenseCategory, categoryId, "Categoria")
    _active(db, Company, companyId, "Empresa")
    _active(db, CostCenter, costCenterId, "Centro de custo")
    _active(db, PaymentMethod, paymentMethodId, "Forma de pagamento")
    unit = _active(db, BusinessUnit, unitId, "Unidade")
    if unit.company_id != companyId:
        raise PayableInvalid("A unidade não é dessa empresa")


def create(db: Session, data: PayableCreate, user: User) -> Payable:
    if data.supplierId is not None:
        _active(db, Supplier, data.supplierId, "Fornecedor")
    elif data.type == "real":
        raise PayableInvalid("Escolha o fornecedor")
    check_classification(
        db,
        categoryId=data.categoryId,
        companyId=data.companyId,
        unitId=data.unitId,
        costCenterId=data.costCenterId,
        paymentMethodId=data.paymentMethodId,
    )
    if data.documentType == "NF" and (not data.documentNumber or not data.documentDate):
        raise PayableInvalid("Informe o número e a data de emissão da nota")
    _check_allocations(db, data.allocations, data.amount)

    payable = Payable(
        type=data.type,
        payeeName="Provisão" if data.type == "provisao" and not data.supplierId else None,
        supplier_id=data.supplierId,
        category_id=data.categoryId,
        company_id=data.companyId,
        unit_id=data.unitId,
        cost_center_id=data.costCenterId,
        payment_method_id=data.paymentMethodId,
        issueDate=data.issueDate,
        dueDate=data.dueDate,
        amount=data.amount,
        description=data.description,
        documentType=data.documentType,
        documentNumber=data.documentNumber or None,
        documentDate=data.documentDate,
        barcode=data.barcode or None,
        competence=data.competence or data.dueDate.strftime("%Y-%m"),
        docsReceivedOn=data.docsReceivedOn,
        isTransfer=data.isTransfer,
        notes=data.notes or None,
        created_by_user_id=user.id,
        allocations=[
            PayableAllocation(project_id=a.projectId, amount=a.amount) for a in data.allocations
        ],
    )
    db.add(payable)
    db.flush()
    audit(
        db,
        payable,
        user,
        f"Lançada: {payable.description} · {format_brl(payable.amount)} · "
        f"vence {format_date_br(payable.dueDate)}",
    )
    db.commit()
    return payable


def update(db: Session, payable_id: int, data: PayableUpdate, user: User) -> None:
    payable = _get(db, payable_id, lock=True)
    if payable.canceledAt is not None:
        raise PayableConflict("Conta cancelada não pode ser alterada")
    if payable.replaced_by_id is not None:
        raise PayableConflict(REPLACED_DETAIL)
    if payable.origin == "connect":
        raise PayableConflict("Lançamento do Connect não é alterado aqui")
    changes = []
    if data.amount != payable.amount:
        if any(a.project.status == "encerrado" for a in payable.allocations):
            raise PayableConflict("Projeto fechado — peça a reabertura a um administrador")
        if payable.items:
            raise PayableConflict("Lançamento com itens: o valor é a soma das pessoas")
        active = _active_payments(payable)
        surcharge = sum((p.surcharge for p in active), ZERO)
        discount = sum((p.discount for p in active), ZERO)
        if data.amount + surcharge - discount < paid_amount(payable):
            raise PayableConflict("O novo valor é menor do que já foi pago")
        if len(payable.allocations) > 1:
            raise PayableConflict("Conta com rateio: refaça o rateio para mudar o valor")
        if payable.allocations:
            payable.allocations[0].amount = data.amount
        changes.append(f"valor {format_brl(payable.amount)} → {format_brl(data.amount)}")
        payable.amount = data.amount
    if data.dueDate != payable.dueDate:
        before, after = format_date_br(payable.dueDate), format_date_br(data.dueDate)
        changes.append(f"vencimento {before} → {after}")
        payable.dueDate = data.dueDate
    if data.description != payable.description:
        changes.append(f"descrição {payable.description} → {data.description}")
        payable.description = data.description
    if changes:
        audit(db, payable, user, "Alterada: " + "; ".join(changes))
    db.commit()


def _check_payable(payable: Payable) -> None:
    if payable.type == "provisao":
        raise PayableConflict("Provisão não é paga — substitua pelo lançamento real")
    if payable.origin == "connect":
        raise PayableConflict(CONNECT_PAYMENT_DETAIL)
    if payable.canceledAt is not None:
        raise PayableConflict("Conta cancelada não recebe baixa")


def _check_paid_on(paid_on: date, note: str | None) -> None:
    on = today()
    if paid_on > on:
        raise PayableInvalid("A baixa é o dia em que o dinheiro saiu: não pode ser no futuro")
    if paid_on < on and not (note or "").strip():
        raise PayableInvalid("Baixa com data no passado precisa de observação")


def _bank_account(db: Session, account_id: int, company_id: int) -> BankAccount:
    account = _active(db, BankAccount, account_id, "Conta bancária")
    if account.company_id != company_id:
        raise PayableInvalid("A conta bancária não é da empresa desse lançamento")
    return account


def _transaction_used(db: Session, transaction_id: str) -> bool:
    """O mesmo Pix não dá baixa duas vezes. Depois de um estorno, o ID vale de novo."""
    undone = db.query(PayablePayment.reverses_id).filter(PayablePayment.reverses_id.isnot(None))
    return (
        db.query(PayablePayment.id)
        .filter(
            PayablePayment.transactionId == transaction_id,
            PayablePayment.kind == "pagamento",
            PayablePayment.id.notin_(undone),
        )
        .first()
        is not None
    )


def pay(db: Session, payable_id: int, data: PaymentCreate, user: User) -> Decimal:
    payable = _get(db, payable_id, lock=True)
    _check_payable(payable)
    _check_paid_on(data.paidOn, data.note)
    account = _bank_account(db, data.bankAccountId, payable.company_id)
    _active(db, PaymentMethod, data.paymentMethodId, "Forma de pagamento")
    pending = pending_amount(payable)
    if pending <= 0:
        raise PayableConflict("Essa conta já está paga")
    limit = pending + data.surcharge - data.discount
    if data.amount > limit:
        raise PayableConflict(f"O valor passa do saldo pendente ({format_brl(limit)})")
    if data.transactionId and _transaction_used(db, data.transactionId):
        raise PayableConflict("Esse ID de transação já foi usado em outra baixa")
    payment = PayablePayment(
        payable_id=payable.id,
        paidOn=data.paidOn,
        amount=data.amount,
        surcharge=data.surcharge,
        discount=data.discount,
        bank_account_id=account.id,
        payment_method_id=data.paymentMethodId,
        transactionId=data.transactionId or None,
        note=data.note or None,
        created_by_user_id=user.id,
    )
    db.add(payment)
    audit(
        db,
        payable,
        user,
        f"Baixa de {format_brl(data.amount)} em {format_date_br(data.paidOn)} ({account.name})",
    )
    db.commit()
    db.refresh(payable)
    return pending_amount(payable)


def pay_batch(db: Session, data: BatchPaymentCreate, user: User) -> Decimal:
    """Baixa o pendente de cada conta. Tudo ou nada: uma recusa desfaz o lote inteiro."""
    _check_paid_on(data.paidOn, data.note)
    _active(db, PaymentMethod, data.paymentMethodId, "Forma de pagamento")
    total = ZERO
    # Sempre na mesma ordem, para dois lotes simultâneos não travarem um ao outro.
    for payable_id in sorted(set(data.ids)):
        payable = _get(db, payable_id, lock=True)
        _check_payable(payable)
        account = _bank_account(db, data.bankAccountId, payable.company_id)
        pending = pending_amount(payable)
        if pending <= 0:
            raise PayableConflict(f"A conta {payable.description} já está paga")
        db.add(
            PayablePayment(
                payable_id=payable.id,
                paidOn=data.paidOn,
                amount=pending,
                bank_account_id=account.id,
                payment_method_id=data.paymentMethodId,
                note=data.note or None,
                created_by_user_id=user.id,
            )
        )
        audit(
            db,
            payable,
            user,
            f"Baixa em lote: {format_brl(pending)} em {format_date_br(data.paidOn)}",
        )
        total += pending
    db.commit()
    return total


def reverse_payment(
    db: Session, payable_id: int, payment_id: int, data: PaymentReverse, user: User
) -> None:
    payable = _get(db, payable_id, lock=True)
    original = next((p for p in payable.payments if p.id == payment_id), None)
    if original is None or original.kind != "pagamento":
        raise PayableNotFound
    if original.id in reversed_ids(payable):
        raise PayableConflict("Essa baixa já foi anulada")
    on = data.on if data.kind == "devolucao" and data.on else today()
    if on < original.paidOn or on > today():
        raise PayableInvalid("A data precisa estar entre a baixa e hoje")
    db.add(
        PayablePayment(
            payable_id=payable.id,
            kind=data.kind,
            reverses_id=original.id,
            paidOn=on,
            amount=original.amount,
            bank_account_id=original.bank_account_id,
            payment_method_id=original.payment_method_id,
            note=data.reason,
            created_by_user_id=user.id,
        )
    )
    label = "Estorno" if data.kind == "estorno" else "Pix devolvido"
    audit(
        db,
        payable,
        user,
        f"{label} da baixa de {format_date_br(original.paidOn)} "
        f"({format_brl(original.amount)}): {data.reason}",
    )
    db.commit()


def cancel(db: Session, payable_id: int, reason: str, user: User) -> None:
    payable = _get(db, payable_id, lock=True)
    if payable.canceledAt is not None:
        raise PayableConflict("Essa conta já está cancelada")
    if payable.replaced_by_id is not None:
        raise PayableConflict(REPLACED_DETAIL)
    if paid_amount(payable) > 0:
        raise PayableConflict("Essa conta tem baixa — estorne antes de cancelar")
    if payable.origin == "connect":
        raise PayableConflict("Lançamento do Connect não é cancelado aqui")
    payable.canceledAt = datetime.now(UTC)
    audit(db, payable, user, f"Cancelada: {reason}")
    _reopen_provisions(db, payable, user)
    db.commit()


def get_open_provision(db: Session, payable_id: int) -> Payable:
    provision = _get(db, payable_id)
    if not can_replace(provision):
        raise PayableConflict("Essa conta não é uma provisão em aberto")
    return provision


def replacement_candidates(db: Session, provision: Payable) -> list[Payable]:
    """Contas reais do mesmo projeto, que ainda não substituem outra provisão."""
    projects = [a.project_id for a in provision.allocations]
    if not projects:
        return []
    candidates: list[Payable] = (
        _base_query(db)
        .filter(
            Payable.type == "real",
            Payable.canceledAt.is_(None),
            Payable.allocations.any(PayableAllocation.project_id.in_(projects)),
            ~Payable.replaced_provisions.any(),
        )
        .all()
    )
    return candidates


def _launch_real(db: Session, provision: Payable, data: ProvisionReplace, user: User) -> Payable:
    if data.amount is None or data.supplierId is None:
        raise PayableInvalid("Informe o valor real e o fornecedor")
    _active(db, Supplier, data.supplierId, "Fornecedor")
    # O real pode ter outro valor: cada projeto segue com a sua proporção, e o resto fica no último.
    allocations = []
    remaining = data.amount
    for index, allocation in enumerate(provision.allocations):
        last = index == len(provision.allocations) - 1
        share = (
            remaining
            if last
            else min(
                remaining,
                (data.amount * allocation.amount / provision.amount).quantize(Decimal("0.01")),
            )
        )
        remaining -= share
        if share > 0:
            allocations.append(PayableAllocation(project_id=allocation.project_id, amount=share))
    real = Payable(
        supplier_id=data.supplierId,
        category_id=provision.category_id,
        company_id=provision.company_id,
        unit_id=provision.unit_id,
        cost_center_id=provision.cost_center_id,
        payment_method_id=provision.payment_method_id,
        issueDate=today(),
        dueDate=provision.dueDate,
        amount=data.amount,
        description=provision.description,
        competence=provision.competence,
        created_by_user_id=user.id,
        allocations=allocations,
    )
    db.add(real)
    db.flush()
    audit(db, real, user, f'Lançada como valor real da provisão "{provision.description}"')
    return real


def replace_provision(db: Session, payable_id: int, data: ProvisionReplace, user: User) -> Payable:
    """A provisão sai do previsto e o real entra no lugar, sem contar duas vezes."""
    provision = _get(db, payable_id, lock=True)
    if not can_replace(provision):
        raise PayableConflict("Essa conta não é uma provisão em aberto")
    if any(a.project.status == "encerrado" for a in provision.allocations):
        raise PayableConflict("Projeto fechado — peça a reabertura a um administrador")
    if data.realId is not None:
        real = _get(db, data.realId, lock=True)
        if real.id not in {c.id for c in replacement_candidates(db, provision)}:
            raise PayableConflict("Essa conta não pode substituir a provisão")
    else:
        real = _launch_real(db, provision, data, user)
    provision.replaced_by_id = real.id
    audit(
        db,
        provision,
        user,
        f"Provisão de {format_brl(provision.amount)} substituída pelo real "
        f'"{real.description}" ({format_brl(real.amount)})',
    )
    db.commit()
    return real


def _reopen_provisions(db: Session, real: Payable, user: User) -> None:
    """Sem a conta real, a provisão volta a contar: o previsto não pode sumir sem aviso."""
    for provision in real.replaced_provisions:
        provision.replaced_by_id = None
        audit(db, provision, user, f'Voltou a valer: a conta real "{real.description}" saiu')


def _classification(payable: Payable) -> str:
    projects = "+".join(f"PRJ-{a.project.code}" for a in payable.allocations) or "sem projeto"
    return f"{projects} / {payable.category.name} / {payable.cost_center.name}"


def reclassify_batch(db: Session, data: BatchReclassify, user: User) -> int:
    if not data.projectId and not data.categoryId and not data.costCenterId:
        raise PayableInvalid("Escolha o que vai mudar")
    project = db.get(Project, data.projectId) if data.projectId else None
    if data.projectId and project is None:
        raise PayableInvalid("Projeto não encontrado")
    if project is not None and project.status == "encerrado":
        raise PayableConflict("Projeto fechado — peça a reabertura a um administrador")
    category = (
        _active(db, ExpenseCategory, data.categoryId, "Categoria") if data.categoryId else None
    )
    center = (
        _active(db, CostCenter, data.costCenterId, "Centro de custo") if data.costCenterId else None
    )

    ids = sorted(set(data.ids))
    for payable_id in ids:
        payable = _get(db, payable_id, lock=True)
        if payable.origin == "connect":
            raise PayableConflict("Lançamento do Connect não é reclassificado aqui")
        if payable.canceledAt is not None or payable.replaced_by_id is not None:
            raise PayableConflict(f"A conta {payable.description} já foi encerrada")
        if any(a.project.status == "encerrado" for a in payable.allocations):
            raise PayableConflict("Projeto fechado — peça a reabertura a um administrador")
        before = _classification(payable)
        if project is not None:
            payable.allocations = [PayableAllocation(project=project, amount=payable.amount)]
        if category is not None:
            payable.category = category
        if center is not None:
            payable.cost_center = center
        audit(db, payable, user, f"Reclassificada: {before} → {_classification(payable)}")
    db.commit()
    return len(ids)


def _next_month(day: date) -> date:
    """Mesmo dia no mês seguinte; dia que não existe vira o último do mês."""
    first_of_next = (day.replace(day=1) + timedelta(days=32)).replace(day=1)
    last_of_next = (first_of_next + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    return first_of_next.replace(day=min(day.day, last_of_next.day))


def duplicate_batch(db: Session, ids: list[int], user: User) -> int:
    """Cópia para o mês seguinte, sem baixas e sem os dados do documento do mês anterior."""
    unique = sorted(set(ids))
    for payable_id in unique:
        source = _get(db, payable_id)
        if source.origin == "connect":
            raise PayableConflict("Lançamento do Connect não é duplicado aqui")
        if any(a.project.status == "encerrado" for a in source.allocations):
            raise PayableConflict("Projeto fechado — peça a reabertura a um administrador")
        due = _next_month(source.dueDate)
        copy = Payable(
            type=source.type,
            origin=source.origin,
            supplier_id=source.supplier_id,
            payeeName=source.payeeName,
            category_id=source.category_id,
            company_id=source.company_id,
            unit_id=source.unit_id,
            cost_center_id=source.cost_center_id,
            payment_method_id=source.payment_method_id,
            issueDate=today(),
            dueDate=due,
            amount=source.amount,
            description=source.description,
            documentType=source.documentType,
            competence=due.strftime("%Y-%m"),
            isTransfer=source.isTransfer,
            notes=source.notes,
            created_by_user_id=user.id,
            allocations=[
                PayableAllocation(project_id=a.project_id, amount=a.amount)
                for a in source.allocations
            ],
            items=[
                PayableItem(
                    name=i.name,
                    documentType=i.documentType,
                    amount=i.amount,
                    invoiceStatus="Pendente" if i.documentType == "NF" else None,
                )
                for i in source.items
            ],
        )
        db.add(copy)
        db.flush()
        audit(db, copy, user, f"Criada como cópia da conta {source.description}")
    db.commit()
    return len(unique)


def delete_batch(db: Session, ids: list[int], user: User) -> int:
    payables = [_get(db, payable_id, lock=True) for payable_id in sorted(set(ids))]
    with_payment = [p for p in payables if paid_amount(p) > 0]
    if with_payment:
        raise PayableConflict(f"{len(with_payment)} títulos têm baixa — estorne antes de excluir")
    if any(p.origin == "connect" for p in payables):
        raise PayableConflict("Lançamento do Connect não é excluído aqui")
    if any(p.replaced_by_id is not None for p in payables):
        raise PayableConflict(REPLACED_DETAIL)
    now = datetime.now(UTC)
    for payable in payables:
        payable.deletedAt = now
        audit(db, payable, user, f"Excluída: {payable.description} ({format_brl(payable.amount)})")
        _reopen_provisions(db, payable, user)
    db.commit()
    return len(payables)


def reference(db: Session) -> dict[str, Any]:
    def active(model: type[Any]) -> Any:
        return db.query(model).filter(model.active.is_(True)).order_by(model.name)

    return {
        "companies": active(Company).all(),
        "units": [
            {"id": u.id, "name": u.name, "companyId": u.company_id} for u in active(BusinessUnit)
        ],
        "costCenters": active(CostCenter).all(),
        "categories": db.query(ExpenseCategory)
        .filter(ExpenseCategory.active.is_(True))
        .order_by(ExpenseCategory.code)
        .all(),
        "paymentMethods": active(PaymentMethod).all(),
        "bankAccounts": [
            {"id": b.id, "name": b.name, "companyId": b.company_id} for b in active(BankAccount)
        ],
        "suppliers": active(Supplier).all(),
        "projects": db.query(Project).order_by(Project.code).all(),
    }


# ---- Início ----


def _plural(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def home_summary(db: Session) -> dict[str, Any]:
    on = today()
    # shortcut: lê todos os títulos não cancelados; limitar por data quando o histórico crescer.
    payables = (
        _base_query(db).filter(Payable.canceledAt.is_(None), Payable.replaced_by_id.is_(None)).all()
    )
    open_payables = [p for p in payables if pending_amount(p) > 0]
    by_situation: dict[str, list[Payable]] = {}
    for payable in open_payables:
        by_situation.setdefault(situation(payable, on), []).append(payable)

    overdue = by_situation.get("vencido", []) + by_situation.get("devolvido", [])
    week_end = on + timedelta(days=7)
    next_seven = [p for p in open_payables if p.type == "real" and on <= p.dueDate <= week_end]

    attention: list[dict[str, str]] = []
    if overdue:
        attention.append(
            {
                "kind": "vencidas",
                "title": _plural(len(overdue), "conta a pagar vencida", "contas a pagar vencidas"),
                "text": f"{format_brl(sum((pending_amount(p) for p in overdue), ZERO))} em atraso",
                "link": "/contas-a-pagar?indicador=vencidos&modo=tudo",
                "action": "Ver contas",
            }
        )
    for payable in by_situation.get("hoje", []):
        late = " · documentação atrasada" if docs_late(payable) else ""
        attention.append(
            {
                "kind": "hoje",
                "title": f"Vence hoje: {payable.description}",
                "text": f"{payee_name(payable)} · {format_brl(pending_amount(payable))}{late}",
                "link": f"/contas-a-pagar?conta={payable.id}",
                "action": "Abrir",
            }
        )
    for payable in by_situation.get("devolvido", []):
        attention.append(
            {
                "kind": "devolvida",
                "title": f"Pix devolvido: {payee_name(payable)}",
                "text": f"{format_brl(pending_amount(payable))} precisa ser pago de novo",
                "link": f"/contas-a-pagar?conta={payable.id}",
                "action": "Abrir",
            }
        )
    from_connect = [p for p in open_payables if p.origin == "connect"]
    if from_connect:
        total = sum((pending_amount(p) for p in from_connect), ZERO)
        attention.append(
            {
                "kind": "connect",
                "title": _plural(
                    len(from_connect),
                    "lançamento de entrevistadores do Connect para pagar",
                    "lançamentos de entrevistadores do Connect para pagar",
                ),
                "text": f"{format_brl(total)} · chegaram sozinhos em Contas a pagar",
                "link": "/contas-a-pagar?aba=connect&modo=tudo",
                "action": "Abrir",
            }
        )
    provisions_due = [
        p for p in open_payables if p.type == "provisao" and p.dueDate <= on + timedelta(days=10)
    ]
    if provisions_due:
        title = (
            "1 provisão vence em até 10 dias"
            if len(provisions_due) == 1
            else f"{len(provisions_due)} provisões vencem em até 10 dias"
        )
        attention.append(
            {
                "kind": "provisoes",
                "title": title,
                "text": "Troque pelo valor real quando chegar",
                "link": "/contas-a-pagar?aba=provisoes&modo=tudo",
                "action": "Ver",
            }
        )

    def week(label: str, start: date | None, end: date) -> dict[str, Any]:
        inside = [
            p for p in open_payables if (start is None or p.dueDate >= start) and p.dueDate <= end
        ]
        return {
            "label": label,
            "outflow": sum((pending_amount(p) for p in inside), ZERO),
            "provision": sum((pending_amount(p) for p in inside if p.type == "provisao"), ZERO),
        }

    cashflow = [week("Atrasadas", None, on - timedelta(days=1))]
    for index in range(4):
        start = on + timedelta(days=index * 7)
        end = start + timedelta(days=6)
        label = f"{start.strftime('%d/%m')} a {end.strftime('%d/%m')}"
        cashflow.append(week(label, start, end))

    upcoming = sorted(open_payables, key=lambda p: p.dueDate)[:8]
    return {
        "today": on,
        "overdue": {
            "value": sum((pending_amount(p) for p in overdue), ZERO),
            "count": len(overdue),
        },
        "nextSevenDays": {
            "value": sum((pending_amount(p) for p in next_seven), ZERO),
            "count": len(next_seven),
        },
        "payablesBadge": sum(len(by_situation.get(s, [])) for s in BADGE_SITUATIONS),
        "attention": attention,
        "cashflow": cashflow,
        "upcoming": [
            {
                "id": p.id,
                "type": p.type,
                "payee": payee_name(p),
                "description": p.description,
                "dueDate": p.dueDate,
                "situation": situation(p, on),
                "pending": pending_amount(p),
            }
            for p in upcoming
        ],
    }
