"""Espelho mínimo do Connect: projetos (`project_refs`) e itens a pagar (`connect_payable_items`).

O Connect é a fonte da verdade. O espelho guarda só ids, valores e datas, sem nome nem chave.
Um dado mais velho que o já gravado é ignorado (`connectUpdatedAt`), para que evento ou leitura
fora de ordem não desfaça o que já se sabe.
"""

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from models.connect_payable_item import ConnectPayableItem
from models.project_ref import ProjectRef
from services.connect_gateway import ConnectGateway, ConnectPayable

STATUS = {"to_pay": "a_pagar", "paid": "pago", "removed": "cancelado"}


def sync_projects(db: Session, connect: ConnectGateway) -> int:
    """Traz os projetos do Connect. Devolve quantos existem agora no espelho."""
    now = datetime.now(UTC)
    for project in connect.list_projects():
        ref = db.query(ProjectRef).filter_by(connect_project_id=project.id).first()
        if ref is None:
            ref = ProjectRef(connect_project_id=project.id)
            db.add(ref)
        ref.title = project.title[:255]
        ref.paymentTermDays = project.payment_term_days
        ref.syncedAt = now
    db.commit()
    return db.query(ProjectRef).count()


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _apply(db: Session, project: ProjectRef, payable: ConnectPayable) -> None:
    row = db.query(ConnectPayableItem).filter_by(connect_interview_id=payable.interview_id).first()
    updated_at = _as_utc(payable.updated_at)
    if row is not None and _as_utc(row.connectUpdatedAt) > updated_at:
        return  # já temos coisa mais nova
    if row is None:
        row = ConnectPayableItem(
            connect_interview_id=payable.interview_id, project_ref_id=project.id
        )
        db.add(row)
    elif row.status == "pago" and payable.status == "to_pay":
        return  # o Financeiro já aplicou a baixa; o Connect ainda não refletiu
    row.connect_interviewer_id = payable.interviewer_id
    row.amount = payable.amount
    row.launchedAt = payable.launched_at
    row.dueOn = payable.due_on
    row.status = STATUS.get(payable.status, "cancelado")
    row.paidOn = payable.paid_on
    row.connectUpdatedAt = updated_at
    row.syncedAt = datetime.now(UTC)


def sync_items(
    db: Session, connect: ConnectGateway, project: ProjectRef, interviewer_ids: set[int]
) -> int:
    """Relê no Connect os itens das pessoas e atualiza o espelho. Chamada HTTP e gravação ficam
    separadas: primeiro lê tudo, depois grava de uma vez."""
    if not interviewer_ids:
        return 0
    payables = connect.list_payables(project.connect_project_id, sorted(interviewer_ids))
    for payable in payables:
        _apply(db, project, payable)
    db.commit()
    return len(payables)
