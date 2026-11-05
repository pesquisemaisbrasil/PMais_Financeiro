"""Envio da baixa ao Connect (spec comprovantes-e-baixa, estados do pedido de baixa).

A confirmação grava o pedido (`payment_requests`) e termina. Só depois, fora de qualquer
transação, cada pedido vai ao Connect com `paymentRef` como Idempotency-Key. Por isso repetir
é seguro: o mesmo pedido nunca paga duas vezes, nem aqui nem no Connect.
"""

import logging
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from models.connect_payable_item import ConnectPayableItem
from models.project_ref import ProjectRef
from models.receipt import (
    PaymentReceipt,
    PaymentRequest,
    ReceiptAllocation,
    ReceiptBatch,
)
from services.connect_gateway import (
    ConnectGateway,
    ConnectRefused,
    ConnectTimeout,
    ConnectUnavailable,
    PaymentApplied,
    PaymentOrder,
)
from services.notifications import notify_finance

logger = logging.getLogger(__name__)

PENDING = "pendente_envio"
SENT = "enviada"
APPLIED = "aplicada"
REFUSED = "recusada"

REFUSAL_MESSAGES = {
    "already_paid": "O Connect já tinha essas entrevistas como pagas",
    "duplicate_e2e": "O Connect já recebeu esse Pix em outra baixa",
    "amount_mismatch": "O valor do Pix não bate com a soma das entrevistas no Connect",
    "mixed_interviewer": "O Connect achou entrevistas de outra pessoa ou de outro projeto",
    "not_payable": "O Connect não considera essas entrevistas prontas para pagar",
    "idempotency_conflict": "O Connect já tem um pedido diferente com essa mesma referência",
}


def refusal_message(code: str | None) -> str:
    return REFUSAL_MESSAGES.get(code or "", "O Connect recusou a baixa")


def _order(db: Session, request: PaymentRequest, receipt: PaymentReceipt) -> PaymentOrder:
    batch = db.get(ReceiptBatch, receipt.batch_id)
    assert batch is not None and batch.confirmed_by_user_id is not None
    project = db.get(ProjectRef, batch.project_ref_id)
    assert project is not None
    interviews = (
        db.query(ConnectPayableItem.connect_interview_id)
        .join(ReceiptAllocation, ReceiptAllocation.payable_item_id == ConnectPayableItem.id)
        .filter(ReceiptAllocation.receipt_id == receipt.id)
        .order_by(ConnectPayableItem.id)
        .all()
    )
    assert receipt.amount is not None and receipt.e2eId and receipt.paidOn
    return PaymentOrder(
        payment_ref=request.paymentRef,
        e2e_id=receipt.e2eId,
        interviewer_id=int(receipt.connect_interviewer_id or 0),
        connect_project_id=project.connect_project_id,
        amount=Decimal(receipt.amount),
        paid_on=receipt.paidOn,
        interview_ids=[row[0] for row in interviews],
        confirmed_by_user_id=batch.confirmed_by_user_id,
    )


def _apply(
    db: Session, request: PaymentRequest, receipt: PaymentReceipt, done: PaymentApplied
) -> None:
    """O Connect confirmou: o item fica pago no espelho, com a data do Pix."""
    now = done.applied_at
    request.status = APPLIED
    request.appliedAt = now
    request.lastError = None
    for allocation in db.query(ReceiptAllocation).filter_by(receipt_id=receipt.id).all():
        allocation.connectAckAt = now
        item = db.get(ConnectPayableItem, allocation.payable_item_id)
        assert item is not None
        item.status = "pago"
        item.paidOn = receipt.paidOn


def _send(db: Session, connect: ConnectGateway, request: PaymentRequest) -> None:
    receipt = db.get(PaymentReceipt, request.receipt_id)
    assert receipt is not None
    order = _order(db, request, receipt)
    request.status = SENT
    request.attempts += 1
    request.sentAt = datetime.now(UTC)
    db.commit()  # o pedido marcado como enviado fica gravado antes da chamada

    try:
        try:
            done = connect.create_payment(order)
        except ConnectTimeout:
            # a resposta não voltou: vê se o Connect aplicou; se não conhece, reenvia com o
            # mesmo Idempotency-Key (não paga duas vezes)
            done = connect.get_payment(request.paymentRef) or connect.create_payment(order)
    except ConnectRefused as refused:
        request.status = REFUSED
        request.lastError = refused.code[:255]
        notify_finance(
            db,
            "payment_refused",
            "O Connect recusou uma baixa",
            refusal_message(refused.code),
            "/divergencias",
        )
        db.commit()
        return
    except ConnectUnavailable:
        # volta para a fila: nada foi pago "no escuro", e a próxima rodada tenta de novo
        request.status = PENDING
        request.lastError = "unavailable"
        db.commit()
        return
    _apply(db, request, receipt, done)
    db.commit()


def dispatch(db: Session, connect: ConnectGateway, request_ids: list[int] | None = None) -> int:
    """Envia os pedidos que ainda não foram aplicados nem recusados. Devolve quantos foram
    aplicados agora. Erro do Connect nunca vira "pago": o pedido só muda com a resposta dele."""
    query = db.query(PaymentRequest).filter(PaymentRequest.status.in_([PENDING, SENT]))
    if request_ids is not None:
        query = query.filter(PaymentRequest.id.in_(request_ids))
    applied = 0
    for request in query.order_by(PaymentRequest.id).all():
        _send(db, connect, request)
        db.refresh(request)
        applied += request.status == APPLIED
    return applied
