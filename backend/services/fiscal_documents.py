"""Notas e RPA (PF-60): acompanha os documentos fiscais das pessoas da folha de campo, sem
pagar nada.

- **NF pendente** (PF-66): quem recebe por NF e ainda não tem a nota. É só aviso, e não bloqueia o
  pagamento (decisão de 28/10). Quando a nota chega, o financeiro registra o número e a emissão na
  tela (decisão do Bruno, 26/11/2026); quando o Connect mandar o status, ele preenche o mesmo campo.
- **RPA do mês** (PF-67): quem recebe por RPA e foi paga no mês (decisão do Bruno, 26/11/2026), com
  o bruto, o INSS e o líquido, para a contabilidade emitir os recibos. O INSS foi calculado na
  importação da folha e fica guardado: aqui ele é só bruto menos líquido, nunca digitado.

O dia do pagamento de cada pessoa é o de `payable.item_paid_on`: o do comprovante dela, ou o da
última baixa quando o lançamento inteiro foi pago.
"""

import re
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session, selectinload

from core.text import format_date_br, matches_words
from core.xlsx import build_xlsx
from models.payable import Payable, PayableAllocation, PayableItem
from models.user import User
from services import payable as payable_service
from services.payable import PayableConflict, PayableInvalid, PayableNotFound, today
from services.period_lock import month_name

ZERO = Decimal("0")
MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
NEED_INVOICE = "Informe o número e a data de emissão da nota"


def _items(db: Session, document: str) -> list[tuple[PayableItem, Payable]]:
    """As pessoas de um tipo de documento nos lançamentos que valem (sem excluídos, cancelados e
    substituídos)."""
    return (
        db.query(PayableItem, Payable)
        .join(Payable, PayableItem.payable_id == Payable.id)
        .options(
            selectinload(Payable.allocations).selectinload(PayableAllocation.project),
            selectinload(Payable.payments),
        )
        .filter(
            PayableItem.documentType == document,
            Payable.deletedAt.is_(None),
            Payable.canceledAt.is_(None),
            Payable.replaced_by_id.is_(None),
        )
        .order_by(Payable.dueDate, Payable.id, PayableItem.id)
        .all()
    )


def _projects(payable: Payable) -> str:
    return ", ".join(f"PRJ-{a.project.code}" for a in payable.allocations) or "Sem projeto"


def _in_project(payable: Payable, project: int | None) -> bool:
    return project is None or any(a.project_id == project for a in payable.allocations)


def pending_invoices(
    db: Session, project: int | None = None, search: str | None = None
) -> dict[str, Any]:
    """Quem recebe por NF e ainda não tem o número da nota, do vencimento mais antigo ao mais
    novo."""
    rows = []
    for item, payable in _items(db, "NF"):
        if item.invoiceNumber or not _in_project(payable, project):
            continue
        if search and not matches_words(f"{item.name} {payable.description}", search):
            continue
        rows.append(
            {
                "itemId": item.id,
                "payableId": payable.id,
                "name": item.name,
                "project": _projects(payable),
                "description": payable.description,
                "dueDate": payable.dueDate,
                "situation": payable_service._item_status(payable, item),
                "amount": item.amount,
            }
        )
    return {"rows": rows, "total": sum((row["amount"] for row in rows), ZERO)}


def register_invoice(
    db: Session, item_id: int, number: str, issued_on: date | None, user: User
) -> dict[str, Any]:
    """A nota chegou: grava o número e a emissão, e o aviso de NF pendente some. Fica no histórico
    do lançamento quem registrou."""
    item = db.query(PayableItem).filter(PayableItem.id == item_id).with_for_update().first()
    if item is None:
        raise PayableNotFound
    payable = payable_service._get(db, item.payable_id)
    if payable.canceledAt is not None or payable.replaced_by_id is not None:
        raise PayableConflict("Esse lançamento foi cancelado")
    if item.documentType != "NF":
        raise PayableInvalid("Essa pessoa não recebe por NF")
    clean = number.strip()[:50]
    if not clean or issued_on is None:
        raise PayableInvalid(NEED_INVOICE)
    if issued_on > today():
        raise PayableInvalid("A data de emissão não pode ser depois de hoje")
    item.invoiceNumber = clean
    item.invoiceDate = issued_on
    item.invoiceStatus = "Recebida"
    payable_service.audit(
        db,
        payable,
        user,
        f"NF {clean} registrada para {item.name}, emitida em {format_date_br(issued_on)}",
    )
    db.commit()
    return {"itemId": item.id, "invoiceNumber": clean, "invoiceDate": issued_on}


def rpa_month(db: Session, month: str, company: int | None = None) -> dict[str, Any]:
    """Quem recebe por RPA e foi paga no mês, com bruto, INSS e líquido."""
    if not MONTH.match(month):
        raise PayableInvalid("Escolha o mês no formato AAAA-MM")
    rows = []
    for item, payable in _items(db, "RPA"):
        if company is not None and payable.company_id != company:
            continue
        paid_on = payable_service.item_paid_on(payable, item)
        if paid_on is None or paid_on.strftime("%Y-%m") != month:
            continue
        # shortcut: lançamento antigo sem o bruto guardado mostra o líquido como bruto e INSS zero
        gross = item.grossAmount if item.grossAmount is not None else item.amount
        rows.append(
            {
                "itemId": item.id,
                "payableId": payable.id,
                "name": item.name,
                "project": _projects(payable),
                "paidOn": paid_on,
                "gross": gross,
                "inss": gross - item.amount,
                "net": item.amount,
            }
        )
    rows.sort(key=lambda row: (row["name"].casefold(), row["paidOn"]))
    return {
        "month": month,
        "label": month_name(month),
        "rows": rows,
        "gross": sum((row["gross"] for row in rows), ZERO),
        "inss": sum((row["inss"] for row in rows), ZERO),
        "net": sum((row["net"] for row in rows), ZERO),
    }


def export_rpa_xlsx(db: Session, month: str, company: int | None = None) -> bytes:
    data = rpa_month(db, month, company)
    headers = ["Pessoa", "Projeto", "Nº do lançamento", "Pago em", "Bruto", "INSS", "Líquido"]
    rows = [
        [
            row["name"],
            row["project"],
            row["payableId"],
            row["paidOn"],
            row["gross"],
            row["inss"],
            row["net"],
        ]
        for row in data["rows"]
    ]
    count = len(rows)
    title = (
        f"Lista de RPA · pagos em {data['label']} · {count} {'pessoa' if count == 1 else 'pessoas'}"
        " · o INSS é o descontado na importação da folha"
    )
    return build_xlsx(sheet="RPA", title=title, headers=headers, rows=rows, total_columns=(4, 5, 6))
