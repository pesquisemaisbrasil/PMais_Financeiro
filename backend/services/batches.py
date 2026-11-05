"""Lotes de comprovantes: envio em partes, leitura, classificação, conferência e descarte
(spec comprovantes-e-baixa). A confirmação da baixa vem numa entrega à parte.

O PDF é lido em memória e descartado: nada dele vai para disco, banco ou log.
"""

import logging
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.crypto import decrypt_payload, encrypt_payload
from core.pix import hash_pix, mask_pix_key, normalize_pix_key
from models.connect_payable_item import ConnectPayableItem
from models.payable import Payable
from models.project_ref import ProjectRef
from models.receipt import (
    PaymentReceipt,
    PaymentRequest,
    ReceiptAllocation,
    ReceiptBatch,
    ReceiptBatchPart,
)
from services.connect_gateway import ConnectGateway, ConnectUnavailable
from services.notifications import notify_finance
from services.payments import PENDING, REFUSED, SENT, refusal_message
from services.receipt_parser import ParsedReceipt, extract_pdf_pages, parse_receipts
from services.reconciliation import PendingReceipt, QueueItem, reconcile

logger = logging.getLogger(__name__)

GROUP_IN_PROJECT = "no_projeto"
GROUP_OUT_OF_PROJECT = "fora_do_projeto"
GROUP_UNKNOWN_KEY = "chave_nao_cadastrada"
GROUP_UNREADABLE = "erro_leitura"
GROUP_DUPLICATE = "duplicado"

MAX_KEYS_PER_CALL = 500
ENCRYPTION_CONTEXT = "payment_receipts:payeeNameEncrypted"


class ProjectNotFound(Exception):
    pass


class BatchNotFound(Exception):
    pass


class ReceiptNotFound(Exception):
    pass


class BatchAlreadyConfirmed(Exception):
    pass


class PartOutOfRange(Exception):
    pass


class PartsMissing(Exception):
    pass


class PayableNotFound(Exception):
    pass


def get_project(db: Session, project_id: int) -> ProjectRef:
    project = db.get(ProjectRef, project_id)
    if project is None:
        raise ProjectNotFound
    return project


def get_batch(db: Session, project_id: int, batch_id: int) -> ReceiptBatch:
    batch = (
        db.query(ReceiptBatch)
        .filter(ReceiptBatch.id == batch_id, ReceiptBatch.project_ref_id == project_id)
        .first()
    )
    if batch is None:
        raise BatchNotFound
    return batch


def create_batch(
    db: Session, project_id: int, parts: int, user_id: int, payable_id: int | None = None
) -> ReceiptBatch:
    get_project(db, project_id)
    if payable_id is not None and db.get(Payable, payable_id) is None:
        raise PayableNotFound
    batch = ReceiptBatch(
        project_ref_id=project_id,
        partsExpected=parts,
        uploaded_by_user_id=user_id,
        payable_id=payable_id,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return batch


def _lock_batch(db: Session, batch: ReceiptBatch) -> ReceiptBatch | None:
    """Trava o projeto e relê o lote. Quem altera um lote decide pelo status relido aqui, não
    pelo lido no começo do pedido: senão um descarte ou cancelamento em paralelo com a
    confirmação desfaz a baixa que ela acabou de gravar. None = lote apagado."""
    db.query(ProjectRef).filter(ProjectRef.id == batch.project_ref_id).with_for_update().first()
    return db.query(ReceiptBatch).filter(ReceiptBatch.id == batch.id).populate_existing().first()


@dataclass
class _Classified:
    parsed: ParsedReceipt
    group: str
    interviewer_id: int | None = None
    key_hash: str | None = None
    masked: str | None = None


def _classify_all(
    connect: ConnectGateway, connect_project_id: int, parsed_receipts: list[ParsedReceipt]
) -> list[_Classified]:
    """Grupo de cada comprovante. Pergunta ao Connect de quem é cada chave, em lotes de 500
    (o Connect fora do ar levanta `ConnectUnavailable` e nada é gravado)."""
    result: list[_Classified] = []
    refs: dict[str, str] = {}
    for index, parsed in enumerate(parsed_receipts):
        if parsed.error:
            result.append(_Classified(parsed, GROUP_UNREADABLE))
            continue
        normalized = normalize_pix_key(parsed.pix_key or "")
        result.append(
            _Classified(
                parsed,
                GROUP_UNKNOWN_KEY,
                key_hash=hash_pix(normalized),
                masked=mask_pix_key(normalized),
            )
        )
        refs[str(index)] = normalized

    matches = {}
    items = list(refs.items())
    for start in range(0, len(items), MAX_KEYS_PER_CALL):
        matches.update(
            connect.match_pix_keys(
                connect_project_id, dict(items[start : start + MAX_KEYS_PER_CALL])
            )
        )
    for ref in refs:
        match = matches.get(ref)
        if match is None or match.interviewer_id is None:
            continue
        classified = result[int(ref)]
        classified.interviewer_id = match.interviewer_id
        classified.group = GROUP_IN_PROJECT if match.in_project else GROUP_OUT_OF_PROJECT
    return result


def _is_duplicate(db: Session, batch_id: int, e2e_id: str) -> bool:
    """Repetido = o mesmo ID de transação já foi PAGO (em qualquer lote) ou aparece de novo no
    próprio lote. Um lote anterior só conferido, sem baixa, não trava o comprovante."""
    return (
        db.query(PaymentReceipt.id)
        .filter(
            PaymentReceipt.e2eId == e2e_id,
            (PaymentReceipt.status == "pago") | (PaymentReceipt.batch_id == batch_id),
        )
        .first()
        is not None
    )


def _paid_elsewhere(db: Session, receipts: list[PaymentReceipt]) -> set[int]:
    """Comprovantes pendentes cujo ID de transação foi pago em outro lote depois da leitura:
    viram duplicados na conferência e na baixa."""
    e2e_ids = {r.e2eId for r in receipts if r.e2eId and r.status == "pendente"}
    if not e2e_ids:
        return set()
    paid = {
        row[0]
        for row in db.query(PaymentReceipt.e2eId)
        .filter(PaymentReceipt.e2eId.in_(e2e_ids), PaymentReceipt.status == "pago")
        .all()
    }
    return {r.id for r in receipts if r.status == "pendente" and r.e2eId in paid}


def process_part(
    db: Session,
    connect: ConnectGateway,
    batch: ReceiptBatch,
    part_index: int,
    page_offset: int,
    content: bytes,
) -> ReceiptBatchPart:
    """Lê uma parte do PDF e grava um comprovante por Pix. Idempotente por (lote, índice).
    PDF ilegível não derruba o lote: o erro fica na parte. Nada do arquivo é guardado."""
    if batch.status == "confirmado":
        raise BatchAlreadyConfirmed
    if not 0 <= part_index < batch.partsExpected:
        raise PartOutOfRange

    existing = _find_part(db, batch.id, part_index)
    if existing:
        return existing

    part = ReceiptBatchPart(batch_id=batch.id, partIndex=part_index, pageOffset=page_offset)
    try:
        parsed_receipts = parse_receipts(extract_pdf_pages(content), page_offset=page_offset)
    except Exception as exc:  # PDF ilegível, protegido etc.: registra e segue
        part.error = str(exc)[:255] or "Não foi possível ler esta parte"
        parsed_receipts = []

    project = db.get(ProjectRef, batch.project_ref_id)
    assert project is not None
    classified = _classify_all(connect, project.connect_project_id, parsed_receipts)

    # trava só agora: a leitura do PDF e a chamada ao Connect ficam fora da trava
    if _lock_batch(db, batch) is None:
        db.rollback()
        raise BatchNotFound
    if batch.status == "confirmado":
        db.rollback()
        raise BatchAlreadyConfirmed

    for item in classified:
        e2e_id = item.parsed.e2e_id
        group = item.group
        if e2e_id and _is_duplicate(db, batch.id, e2e_id):
            group = GROUP_DUPLICATE
        name = item.parsed.payee_name
        db.add(
            PaymentReceipt(
                batch_id=batch.id,
                page=item.parsed.page,
                payeeNameEncrypted=encrypt_payload(name, ENCRYPTION_CONTEXT) if name else None,
                payeeKeyHash=item.key_hash,
                payeeKeyMasked=item.masked,
                amount=item.parsed.amount,
                paidOn=item.parsed.paid_at,
                e2eId=e2e_id,
                group=group,
                connect_interviewer_id=item.interviewer_id,
                error=item.parsed.error,
            )
        )
        # flush por comprovante: o mesmo ID repetido no próprio PDF aparece no próximo
        db.flush()
    part.receiptsCount = len(classified)
    db.add(part)
    try:
        db.flush()
    except IntegrityError:  # a mesma parte chegou duas vezes ao mesmo tempo: vale a primeira
        db.rollback()
        return _find_part(db, batch.id, part_index) or part

    parts_done = db.query(ReceiptBatchPart).filter(ReceiptBatchPart.batch_id == batch.id).count()
    if parts_done >= batch.partsExpected and batch.status == "enviando":
        batch.status = "pronto"
        notify_out_of_project(db, batch)
    db.commit()
    db.refresh(part)
    return part


def _find_part(db: Session, batch_id: int, part_index: int) -> ReceiptBatchPart | None:
    return (
        db.query(ReceiptBatchPart)
        .filter(ReceiptBatchPart.batch_id == batch_id, ReceiptBatchPart.partIndex == part_index)
        .first()
    )


def _payment_state(request: PaymentRequest | None) -> str | None:
    if request is None:
        return None
    return {PENDING: "aguardando_connect", SENT: "aguardando_connect"}.get(
        request.status, request.status
    )


def notify_out_of_project(db: Session, batch: ReceiptBatch) -> None:
    """`receipt_out_of_project`: o lote ficou pronto com gente fora do projeto. Avisa admin e
    financeiro."""
    count = (
        db.query(PaymentReceipt)
        .filter(
            PaymentReceipt.batch_id == batch.id,
            PaymentReceipt.group.in_([GROUP_OUT_OF_PROJECT, GROUP_UNKNOWN_KEY]),
        )
        .count()
    )
    if not count:
        return
    project = db.get(ProjectRef, batch.project_ref_id)
    plural = "s" if count != 1 else ""
    notify_finance(
        db,
        "receipt_out_of_project",
        f"{count} comprovante{plural} de pessoa{plural} fora do projeto "
        f"{project.title if project else ''}",
        "Confira no envio de comprovantes quem recebeu sem estar na equipe.",
        "/contas-a-pagar",
    )


# --- Conferência -------------------------------------------------------------


def _queues(db: Session, project_id: int, interviewer_ids: set[int]) -> dict[int, list[QueueItem]]:
    """Itens a pagar de cada pessoa, do mais antigo para o mais novo."""
    if not interviewer_ids:
        return {}
    rows = (
        db.query(ConnectPayableItem)
        .filter(
            ConnectPayableItem.project_ref_id == project_id,
            ConnectPayableItem.connect_interviewer_id.in_(interviewer_ids),
            ConnectPayableItem.status == "a_pagar",
            # já alocado a um Pix (a baixa espera o Connect): não entra em outra conta
            ConnectPayableItem.id.notin_(db.query(ReceiptAllocation.payable_item_id)),
        )
        .order_by(ConnectPayableItem.launchedAt, ConnectPayableItem.connect_interview_id)
        .all()
    )
    queues: dict[int, list[QueueItem]] = {}
    for row in rows:
        queues.setdefault(row.connect_interviewer_id, []).append(
            QueueItem(id=row.id, amount=Decimal(row.amount))
        )
    return queues


def reconcile_batch(db: Session, batch: ReceiptBatch, receipts: list[PaymentReceipt]):  # type: ignore[no-untyped-def]
    """Conciliação calculada na hora, sem gravar nada. Só entra o comprovante `no_projeto`,
    pendente, com valor, que não foi pago em outro lote."""
    excluded = _paid_elsewhere(db, receipts)
    pending = [
        PendingReceipt(r.id, r.connect_interviewer_id, Decimal(r.amount), r.paidOn, r.page)
        for r in receipts
        if r.group == GROUP_IN_PROJECT
        and r.status == "pendente"
        and r.amount
        and r.connect_interviewer_id is not None
        and r.id not in excluded
    ]
    queues = _queues(db, batch.project_ref_id, {p.person_id for p in pending})
    return reconcile(pending, queues), excluded


def batch_progress(db: Session, batch: ReceiptBatch) -> dict:  # type: ignore[type-arg]
    parts_received, receipts_total = (
        db.query(
            func.count(ReceiptBatchPart.id),
            func.coalesce(func.sum(ReceiptBatchPart.receiptsCount), 0),
        )
        .filter(ReceiptBatchPart.batch_id == batch.id)
        .one()
    )
    return {
        "id": batch.id,
        "status": batch.status,
        "partsExpected": batch.partsExpected,
        "partsReceived": parts_received,
        "receiptsTotal": int(receipts_total),
        "createdAt": batch.createdAt,
        "confirmedAt": batch.confirmedAt,
    }


def _names(connect: ConnectGateway | None, ids: set[int]) -> dict[int, str]:
    """Nome de quem é do projeto vem do Connect, na hora. Sem Connect a tela segue sem nome."""
    if connect is None or not ids:
        return {}
    try:
        return connect.interviewer_names(sorted(ids))
    except ConnectUnavailable:
        return {}


def get_batch_detail(
    db: Session, batch: ReceiptBatch, connect: ConnectGateway | None = None
) -> dict:  # type: ignore[type-arg]
    receipts = (
        db.query(PaymentReceipt)
        .filter(PaymentReceipt.batch_id == batch.id)
        .order_by(PaymentReceipt.page, PaymentReceipt.id)
        .all()
    )
    reconciliation, paid_elsewhere = reconcile_batch(db, batch, receipts)
    part_errors = [
        {"partIndex": p.partIndex, "error": p.error}
        for p in db.query(ReceiptBatchPart)
        .filter(ReceiptBatchPart.batch_id == batch.id, ReceiptBatchPart.error.isnot(None))
        .order_by(ReceiptBatchPart.partIndex)
        .all()
    ]
    requests = {
        r.receipt_id: r
        for r in db.query(PaymentRequest)
        .filter(PaymentRequest.receipt_id.in_([r.id for r in receipts] or [0]))
        .all()
    }
    names = _names(
        connect,
        {r.connect_interviewer_id for r in receipts if r.group == GROUP_IN_PROJECT} - {None},
    )
    items = []
    for receipt in receipts:
        rec = reconciliation.get(receipt.id)
        request = requests.get(receipt.id)
        # o nome lido do comprovante só aparece quando a chave não casa com ninguém: é o único
        # jeito de o financeiro descobrir de quem é o pagamento. Quem é do projeto vem do Connect.
        name = (
            decrypt_payload(receipt.payeeNameEncrypted, ENCRYPTION_CONTEXT)
            if receipt.group == GROUP_UNKNOWN_KEY and receipt.payeeNameEncrypted
            else names.get(receipt.connect_interviewer_id or 0)
            if receipt.group == GROUP_IN_PROJECT
            else None
        )
        items.append(
            {
                "id": receipt.id,
                "page": receipt.page,
                "group": GROUP_DUPLICATE if receipt.id in paid_elsewhere else receipt.group,
                "status": receipt.status,
                "name": name,
                "interviewerId": receipt.connect_interviewer_id,
                "keyMasked": receipt.payeeKeyMasked,
                "amount": receipt.amount,
                "paidOn": receipt.paidOn,
                "error": receipt.error,
                "reconcileStatus": rec.status if rec else None,
                "itemsToPay": len(rec.item_ids) if rec else 0,
                "message": rec.message if rec else None,
                "payment": _payment_state(request),
                "paymentMessage": refusal_message(request.lastError)
                if request and request.status == REFUSED
                else None,
            }
        )
    return {**batch_progress(db, batch), "receipts": items, "partErrors": part_errors}


def list_batches(db: Session, project_id: int) -> list[dict]:  # type: ignore[type-arg]
    batches = (
        db.query(ReceiptBatch)
        .filter(ReceiptBatch.project_ref_id == project_id)
        .order_by(ReceiptBatch.id.desc())
        .all()
    )
    ids = [b.id for b in batches]
    out_counts: dict[int, int] = {}
    paid: dict[int, Decimal] = {}
    if ids:
        out_counts = dict(
            db.query(PaymentReceipt.batch_id, func.count(PaymentReceipt.id))
            .filter(
                PaymentReceipt.batch_id.in_(ids),
                PaymentReceipt.group.in_([GROUP_OUT_OF_PROJECT, GROUP_UNKNOWN_KEY]),
            )
            .group_by(PaymentReceipt.batch_id)
            .all()
        )
        paid = {
            batch_id: Decimal(str(total))
            for batch_id, total in db.query(
                PaymentReceipt.batch_id, func.coalesce(func.sum(PaymentReceipt.amount), 0)
            )
            .filter(PaymentReceipt.batch_id.in_(ids), PaymentReceipt.status == "pago")
            .group_by(PaymentReceipt.batch_id)
            .all()
        }
    return [
        {
            **batch_progress(db, batch),
            "outOfProjectCount": out_counts.get(batch.id, 0),
            "paidTotal": paid.get(batch.id, Decimal("0")),
        }
        for batch in batches
    ]


# --- Alterar o lote antes de confirmar ---------------------------------------


def set_receipt_discarded(
    db: Session, batch: ReceiptBatch, receipt_id: int, discarded: bool
) -> PaymentReceipt:
    if _lock_batch(db, batch) is None:
        db.rollback()
        raise BatchNotFound
    if batch.status == "confirmado":
        db.rollback()
        raise BatchAlreadyConfirmed
    receipt = (
        db.query(PaymentReceipt)
        .filter(PaymentReceipt.id == receipt_id, PaymentReceipt.batch_id == batch.id)
        .populate_existing()
        .first()
    )
    if receipt is None:
        db.rollback()
        raise ReceiptNotFound
    # só quem ainda não foi pago muda de lado; o pago é prova e fica como está
    receipt.status = "descartado" if discarded else "pendente"
    db.commit()
    db.refresh(receipt)
    return receipt


def cancel_batch(db: Session, batch: ReceiptBatch) -> None:
    """Apaga um lote não confirmado e seus comprovantes, explicitamente: a FK é RESTRICT."""
    if _lock_batch(db, batch) is None:
        db.rollback()
        raise BatchNotFound
    if batch.status == "confirmado":
        db.rollback()
        raise BatchAlreadyConfirmed
    db.query(PaymentReceipt).filter(PaymentReceipt.batch_id == batch.id).delete(
        synchronize_session=False
    )
    db.query(ReceiptBatchPart).filter(ReceiptBatchPart.batch_id == batch.id).delete(
        synchronize_session=False
    )
    db.delete(batch)
    db.commit()
