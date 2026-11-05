"""Confirmar baixa (spec comprovantes-e-baixa): a única hora em que um comprovante vira pagamento.

Ordem: relê no Connect os itens das pessoas, trava o projeto, refaz a conciliação e grava, numa
transação só, a alocação (comprovante → item), o pedido de baixa e, se o PDF veio de um
lançamento, as baixas dele. Só depois da transação os pedidos vão ao Connect.
"""

import logging
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.text import format_brl
from models.connect_payable_item import ConnectPayableItem
from models.payable import PayablePayment
from models.project_ref import ProjectRef
from models.receipt import PaymentReceipt, PaymentRequest, ReceiptAllocation, ReceiptBatch
from models.reference import PaymentMethod
from models.user import User
from services import batches, connect_sync, payments
from services import payable as payable_service
from services.connect_gateway import ConnectGateway

logger = logging.getLogger(__name__)

ZERO = Decimal("0")


class ConfirmConflict(Exception):
    """Outro envio pagou um dos Pix no mesmo instante."""


def _payable_payments(
    db: Session,
    batch: ReceiptBatch,
    paid: list[PaymentReceipt],
    user: User,
    bank_account_id: int | None,
    payment_method_id: int | None,
) -> None:
    """As baixas do lançamento de onde o PDF veio: uma por Pix, com o ID da transação."""
    if not paid or batch.payable_id is None:
        return
    payable = payable_service._get(db, batch.payable_id, lock=True)
    if payable.canceledAt is not None:
        raise payable_service.PayableConflict("Conta cancelada não recebe baixa")
    if bank_account_id is None or payment_method_id is None:
        raise payable_service.PayableInvalid("Escolha a conta bancária e a forma de pagamento")
    account = payable_service._bank_account(db, bank_account_id, payable.company_id)
    payable_service._active(db, PaymentMethod, payment_method_id, "Forma de pagamento")
    total = sum((Decimal(r.amount or 0) for r in paid), ZERO)
    pending = payable_service.pending_amount(payable)
    if total > pending:
        raise payable_service.PayableConflict(
            f"O valor passa do saldo pendente ({format_brl(pending)})"
        )
    for receipt in paid:
        db.add(
            PayablePayment(
                payable_id=payable.id,
                paidOn=receipt.paidOn or payable_service.today(),
                amount=receipt.amount,
                bank_account_id=account.id,
                payment_method_id=payment_method_id,
                transactionId=receipt.e2eId,
                note="Pix lido do comprovante",
                created_by_user_id=user.id,
            )
        )
    payable_service.audit(
        db,
        payable,
        user,
        f"Baixa de {format_brl(total)} por comprovante Pix ({len(paid)} Pix, {account.name})",
    )


def confirm_batch(
    db: Session,
    connect: ConnectGateway,
    batch: ReceiptBatch,
    user: User,
    bank_account_id: int | None = None,
    payment_method_id: int | None = None,
) -> dict[str, object]:
    if batch.status == "confirmado":
        raise batches.BatchAlreadyConfirmed
    if (
        db.query(batches.ReceiptBatchPart).filter_by(batch_id=batch.id).count()
        < batch.partsExpected
    ):
        raise batches.PartsMissing

    project = db.get(ProjectRef, batch.project_ref_id)
    assert project is not None
    people = {
        row[0]
        for row in db.query(PaymentReceipt.connect_interviewer_id).filter(
            PaymentReceipt.batch_id == batch.id,
            PaymentReceipt.group == batches.GROUP_IN_PROJECT,
            PaymentReceipt.status == "pendente",
            PaymentReceipt.connect_interviewer_id.isnot(None),
        )
    }
    # relê no Connect antes de travar: chamada HTTP nunca fica dentro da transação
    connect_sync.sync_items(db, connect, project, people)

    if batches._lock_batch(db, batch) is None:
        db.rollback()
        raise batches.BatchNotFound
    if batch.status == "confirmado":
        db.rollback()
        raise batches.BatchAlreadyConfirmed

    receipts = (
        db.query(PaymentReceipt)
        .filter(PaymentReceipt.batch_id == batch.id)
        .order_by(PaymentReceipt.page, PaymentReceipt.id)
        .populate_existing()
        .all()
    )
    reconciliation, paid_elsewhere = batches.reconcile_batch(db, batch, receipts)
    for receipt in receipts:
        if receipt.id in paid_elsewhere:
            receipt.group = batches.GROUP_DUPLICATE

    paid: list[PaymentReceipt] = []
    items_paid = 0
    total = ZERO
    for receipt in receipts:
        result = reconciliation.get(receipt.id)
        if result is None or result.status != "bate":
            continue
        items = (
            db.query(ConnectPayableItem)
            .filter(ConnectPayableItem.id.in_(result.item_ids))
            .order_by(ConnectPayableItem.id)
            .all()
        )
        # regra do valor exato: nunca existe resto nem pagamento parcial
        assert sum((Decimal(i.amount) for i in items), ZERO) == Decimal(receipt.amount or 0)
        for item in items:
            db.add(
                ReceiptAllocation(
                    receipt_id=receipt.id, payable_item_id=item.id, amount=item.amount
                )
            )
        receipt.status = "pago"
        request = PaymentRequest(receipt_id=receipt.id, paymentRef=f"fin-pay-{receipt.id:06d}")
        db.add(request)
        paid.append(receipt)
        items_paid += len(items)
        total += Decimal(receipt.amount or 0)

    _payable_payments(db, batch, paid, user, bank_account_id, payment_method_id)
    batch.status = "confirmado"
    batch.confirmed_by_user_id = user.id
    batch.confirmedAt = datetime.now(UTC)
    try:
        db.commit()
    except IntegrityError as exc:  # o mesmo Pix ou item pago por outro envio ao mesmo tempo
        db.rollback()
        raise ConfirmConflict from exc

    request_ids = [
        r.id
        for r in db.query(PaymentRequest).filter(
            PaymentRequest.receipt_id.in_([p.id for p in paid] or [0])
        )
    ]
    try:
        payments.dispatch(db, connect, request_ids)
    except Exception:  # o pedido já está gravado: a próxima rodada reenvia
        logger.exception("Falha ao enviar a baixa do lote %s ao Connect", batch.id)
        db.rollback()

    states = [
        row[0]
        for row in db.query(PaymentRequest.status).filter(PaymentRequest.id.in_(request_ids or [0]))
    ]
    return {
        "paidReceipts": len(paid),
        "paidItems": items_paid,
        "paidTotal": total,
        "awaitingConnect": sum(s in (payments.PENDING, payments.SENT) for s in states),
        "refused": sum(s == payments.REFUSED for s in states),
    }


def divergences(db: Session, project_id: int) -> list[dict[str, object]]:
    """Pedidos que o Connect recusou: ficam aqui para uma pessoa decidir. Nada é corrigido
    sozinho."""
    rows = (
        db.query(PaymentRequest, PaymentReceipt, ReceiptBatch)
        .join(PaymentReceipt, PaymentReceipt.id == PaymentRequest.receipt_id)
        .join(ReceiptBatch, ReceiptBatch.id == PaymentReceipt.batch_id)
        .filter(
            ReceiptBatch.project_ref_id == project_id, PaymentRequest.status == payments.REFUSED
        )
        .order_by(PaymentRequest.id)
        .all()
    )
    return [
        {
            "paymentRef": request.paymentRef,
            "batchId": batch.id,
            "receiptId": receipt.id,
            "page": receipt.page,
            "keyMasked": receipt.payeeKeyMasked,
            "amount": receipt.amount,
            "paidOn": receipt.paidOn,
            "code": request.lastError,
            "message": payments.refusal_message(request.lastError),
        }
        for request, receipt, batch in rows
    ]
