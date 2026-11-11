"""Relatório do projeto (spec relatorios-e-analises e projetos-financeiros): quanto foi lançado,
pago e falta pagar de cada projeto, a parte do projeto em cada conta e os documentos de todos os
lançamentos. Só lê: aqui não se paga, e nada é alterado.

Conta cancelada, substituída ou excluída não é gasto, então não entra nem nos totais nem nas
linhas (os totais são a soma exata das linhas, regra 1 do spec). Provisão não é gasto: aparece à
parte, como "provisionado a pagar".

O orçamento é do Connect (`GET /projects/{id}/budget`) e o cliente HTTP do Financeiro ainda não o
busca: por enquanto ele vem vazio e o saldo também (a tela mostra "—", como o protótipo).
"""

from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session, selectinload

from models.payable import Payable, PayableAllocation, PayableAttachment
from models.reference import Project
from services import payable as payables

ZERO = Decimal("0")
CENT = Decimal("0.01")


class ProjectNotFound(Exception):
    pass


def _counts(payable: Payable) -> bool:
    return payable.canceledAt is None and payable.replaced_by_id is None


def _shares(total: Decimal, payable: Payable) -> dict[int, Decimal]:
    """Reparte `total` (líquido, pago ou pendente da conta) entre os projetos, pela parte de cada
    um no valor da conta. A diferença de centavos fica com o último: a soma dos projetos dá o
    total da conta."""
    allocations = sorted(payable.allocations, key=lambda a: a.id)
    shares: dict[int, Decimal] = {}
    given = ZERO
    for index, allocation in enumerate(allocations):
        if index == len(allocations) - 1:
            share = total - given
        else:
            share = (total * allocation.amount / payable.amount).quantize(CENT)
        shares[allocation.project_id] = shares.get(allocation.project_id, ZERO) + share
        given += share
    return shares


def _payables(db: Session, project_id: int | None = None) -> list[Payable]:
    """As contas que contam (nem cancelada, nem substituída, nem excluída) e têm projeto."""
    query = (
        db.query(Payable)
        .options(
            selectinload(Payable.allocations).selectinload(PayableAllocation.project),
            selectinload(Payable.adjustments),
            selectinload(Payable.payments),
            selectinload(Payable.attachments).selectinload(PayableAttachment.uploaded_by),
            selectinload(Payable.category),
            selectinload(Payable.supplier),
        )
        .filter(
            Payable.deletedAt.is_(None),
            Payable.canceledAt.is_(None),
            Payable.replaced_by_id.is_(None),
        )
    )
    if project_id is None:
        query = query.filter(Payable.allocations.any())
    else:
        query = query.filter(Payable.allocations.any(PayableAllocation.project_id == project_id))
    return query.order_by(Payable.dueDate, Payable.id).all()


def _project_shares(payable: Payable, project_id: int) -> tuple[Decimal, Decimal, Decimal]:
    """A parte do projeto no líquido, no pago e no pendente da conta."""
    return (
        _shares(payables.net_amount(payable), payable).get(project_id, ZERO),
        _shares(payables.paid_amount(payable), payable).get(project_id, ZERO),
        _shares(payables.pending_amount(payable), payable).get(project_id, ZERO),
    )


def list_projects(db: Session) -> list[dict[str, Any]]:
    """Os projetos com o total lançado, pago e a pagar de cada um (provisão fora)."""
    # shortcut: lê todas as contas com projeto de uma vez; com milhares delas, somar no banco
    totals: dict[int, dict[str, Any]] = {}
    for payable in _payables(db):
        if payable.type != "real":
            continue
        net = _shares(payables.net_amount(payable), payable)
        paid = _shares(payables.paid_amount(payable), payable)
        pending = _shares(payables.pending_amount(payable), payable)
        for project_id, share in net.items():
            entry = totals.setdefault(
                project_id, {"launched": ZERO, "paid": ZERO, "pending": ZERO, "payableCount": 0}
            )
            entry["launched"] += share
            entry["paid"] += paid.get(project_id, ZERO)
            entry["pending"] += pending.get(project_id, ZERO)
            entry["payableCount"] += 1
    empty = {"launched": ZERO, "paid": ZERO, "pending": ZERO, "payableCount": 0}
    return [
        {
            "id": project.id,
            "code": project.code,
            "title": project.title,
            "status": project.status,
            **totals.get(project.id, empty),
        }
        for project in db.query(Project).order_by(Project.id.desc()).all()
    ]


def report(db: Session, code: str) -> dict[str, Any]:
    project = db.query(Project).filter(Project.code == code).first()
    if project is None:
        raise ProjectNotFound
    on = payables.today()
    launched = paid = pending = provisioned = ZERO
    lines: list[dict[str, Any]] = []
    provisions: list[dict[str, Any]] = []
    documents: list[dict[str, Any]] = []
    for payable in _payables(db, project.id):
        amount, paid_part, pending_part = _project_shares(payable, project.id)
        active = [a for a in payable.attachments if a.deletedAt is None]
        line = {
            "id": payable.id,
            "type": payable.type,
            "situation": payables.situation(payable, on),
            "dueDate": payable.dueDate,
            "payee": payables.payee_name(payable),
            "description": payable.description,
            "categoryName": payable.category.name,
            "amount": amount,
            "paid": paid_part,
            "pending": pending_part,
            "documentCount": len(active),
        }
        if payable.type == "real":
            launched += amount
            paid += paid_part
            pending += pending_part
            lines.append(line)
        else:
            provisioned += amount
            provisions.append(line)
        documents.extend(
            {
                "id": a.id,
                "payableId": payable.id,
                "payableDescription": payable.description,
                "name": a.name,
                "kind": a.kind,
                "size": a.size,
                "uploadedBy": a.uploaded_by.name,
                "createdAt": a.createdAt,
            }
            for a in active
        )
    return {
        "project": {
            "id": project.id,
            "code": project.code,
            "title": project.title,
            "status": project.status,
            "projectType": project.projectType,
            "hasIncentive": project.hasIncentive,
            "incentiveDays": project.incentiveDays,
        },
        "budget": None,
        "launched": launched,
        "paid": paid,
        "pending": pending,
        "provisioned": provisioned,
        "totalSpent": launched,
        "balance": None,
        "lines": lines,
        "provisions": provisions,
        "documents": documents,
    }
