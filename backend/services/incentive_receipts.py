"""Baixa do lançamento de incentivos pelos comprovantes Pix (pedido do Bruno, 27/11/2026).

"Quando elas derem a baixa, eles vão verificar se os 25 comprovantes batem com o valor da conta e
liberar para dar a baixa, e daí os 25 comprovantes vão ter que ser comparados chave Pix por chave
para poderem ser anexados aos devidos entrevistados."

- O PDF de comprovantes (o "Comprovante de Transferência" do Itaú, em um ou mais arquivos) é lido em
  memória pelo mesmo leitor do Connect (services/receipt_parser), só no bloco do recebedor.
- Cada comprovante casa com a pessoa do lançamento pela chave: o HMAC da chave lida
  (core/pix.hash_pix) contra o que a importação guardou. A chave nunca é guardada nem mostrada
  inteira.
- A baixa só libera com tudo certo (decisão do Bruno: "só baixa com todos"): cada pessoa com um
  comprovante do valor dela; nenhum comprovante sobrando, repetido, ilegível ou já usado; e a soma
  igual ao pendente da conta. O que não bate é divergência para corrigir antes (AGENTS, regra 4).
- Confirmar grava um Pix por pessoa (a baixa com o ID da transação e a pessoa), e a página do
  comprovante de cada uma vai para os documentos da conta, ligada a ela. Tudo ou nada.
"""

import re
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from io import BytesIO
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.pix import hash_pix, mask_pix_key, normalize_pix_key
from core.text import format_brl, format_date_br
from models.payable import Payable, PayableItem, PayablePayment
from models.receipt import PaymentReceipt
from models.user import User
from services import attachments
from services import payable as payable_service
from services.payable import PayableConflict, PayableInvalid, pending_amount, today
from services.receipt_parser import ParsedReceipt, UnreadablePdf, extract_pdf_pages, parse_receipts

MAX_FILES = 20
NOTE = "Comprovante Pix casado com a pessoa pela chave"
STATUS_TEXT = {
    "bate": "Bate",
    "valor_diferente": "Valor diferente",
    "sem_comprovante": "Sem comprovante",
    "sem_chave": "Sem chave Pix",
}
PROBLEM_TEXT = {
    "erro_leitura": "Não deu para ler a chave, o valor ou o ID da transação",
    "repetido": "Comprovante repetido: o mesmo ID da transação aparece de novo",
    "ja_usado": "Esse Pix já deu baixa em outra conta",
    "outra_chave": "A chave não é de ninguém deste lançamento",
    "a_mais": "Mais de um comprovante para a mesma pessoa",
    "ja_paga": "Essa pessoa já foi paga neste lançamento, com outro Pix",
}


@dataclass
class _Receipt:
    file: int  # a posição do arquivo enviado
    filename: str
    first_page: int  # do arquivo, a partir de 1
    last_page: int
    parsed: ParsedReceipt
    key_hash: str | None
    masked: str | None
    problem: str | None = None
    item_id: int | None = None
    # o Pix que já pagou alguém deste lançamento: não entra de novo nem trava a baixa
    ignored: bool = False


def _plural(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def _read(files: list[tuple[str, bytes]]) -> list[_Receipt]:
    """Os comprovantes de todos os arquivos, com as páginas de cada um. Nada é guardado aqui."""
    if not files:
        raise PayableInvalid("Envie o PDF dos comprovantes Pix")
    if len(files) > MAX_FILES:
        raise PayableInvalid(f"Envie até {MAX_FILES} arquivos de uma vez")
    receipts: list[_Receipt] = []
    for index, (filename, content) in enumerate(files):
        name = re.split(r"[\\/]", filename)[-1][:100] or f"arquivo {index + 1}"
        try:
            pages = extract_pdf_pages(content)
        except UnreadablePdf as exc:
            raise PayableInvalid(f"{name}: não dá para ler este PDF") from exc
        parsed = parse_receipts(pages)
        if not parsed:
            raise PayableInvalid(f"{name}: nenhum comprovante Pix encontrado")
        for position, receipt in enumerate(parsed):
            following = parsed[position + 1].page if position + 1 < len(parsed) else len(pages) + 1
            masked = key_hash = None
            if receipt.pix_key:
                normalized = normalize_pix_key(receipt.pix_key)
                masked, key_hash = mask_pix_key(normalized), hash_pix(normalized)
            last = max(receipt.page, following - 1)
            receipts.append(_Receipt(index, name, receipt.page, last, receipt, key_hash, masked))
    return receipts


def _used_before(db: Session, e2e_id: str) -> bool:
    """O Pix já deu baixa: numa conta (o ID da transação da baixa) ou num lote do Connect."""
    if payable_service._transaction_used(db, e2e_id):
        return True
    return (
        db.query(PaymentReceipt.id)
        .filter(func.upper(PaymentReceipt.e2eId) == e2e_id, PaymentReceipt.status == "pago")
        .first()
        is not None
    )


def _open_items(payable: Payable) -> list[PayableItem]:
    """Quem ainda não foi pago: sem Pix ativo nem dia de pagamento. O estorno reabre a pessoa."""
    return [i for i in payable.items if payable_service.own_paid_on(payable, i) is None]


def _match(db: Session, payable: Payable, receipts: list[_Receipt]) -> dict[str, Any]:
    """Casa cada comprovante com uma pessoa em aberto e diz se a baixa pode sair. Não grava
    nada."""
    open_items = _open_items(payable)
    by_hash: dict[str, list[PayableItem]] = defaultdict(list)
    for item in open_items:
        if item.pix_hash:
            by_hash[item.pix_hash].append(item)
    open_ids = {item.id for item in open_items}
    paid_hashes = {i.pix_hash for i in payable.items if i.pix_hash and i.id not in open_ids}
    used_here = {
        (p.transactionId or "").strip().upper()
        for p in payable_service._active_payments(payable)
        if p.item_id is not None
    }
    seen: set[str] = set()
    matched: dict[int, _Receipt] = {}
    for receipt in receipts:
        parsed = receipt.parsed
        if parsed.error or not receipt.key_hash or parsed.amount is None or not parsed.e2e_id:
            receipt.problem = "erro_leitura"
            continue
        e2e = parsed.e2e_id.strip().upper()
        if e2e in seen:
            receipt.problem = "repetido"
            continue
        seen.add(e2e)
        if e2e in used_here:
            receipt.ignored = True
            continue
        if _used_before(db, e2e):
            receipt.problem = "ja_usado"
            continue
        free = [item for item in by_hash.get(receipt.key_hash, []) if item.id not in matched]
        if not free:
            if receipt.key_hash in by_hash:
                receipt.problem = "a_mais"
            else:
                receipt.problem = "ja_paga" if receipt.key_hash in paid_hashes else "outra_chave"
            continue
        # a mesma chave em duas pessoas: vai para a do mesmo valor
        chosen = next((item for item in free if item.amount == parsed.amount), free[0])
        matched[chosen.id] = receipt
        receipt.item_id = chosen.id

    items = []
    for item in open_items:
        found = matched.get(item.id)
        if not item.pix_hash:
            status = "sem_chave"
        elif found is None:
            status = "sem_comprovante"
        elif found.parsed.amount != item.amount:
            status = "valor_diferente"
        else:
            status = "bate"
        items.append(
            {
                "itemId": item.id,
                "name": item.name,
                "amount": item.amount,
                "pixMasked": item.pix_masked,
                "status": status,
                "statusText": STATUS_TEXT[status],
                "receiptAmount": found.parsed.amount if found else None,
                "paidOn": found.parsed.paid_at if found else None,
                "file": found.filename if found else None,
                "page": found.first_page if found else None,
            }
        )
    extras = [
        {
            "file": receipt.filename,
            "page": receipt.first_page,
            "amount": receipt.parsed.amount,
            "pixMasked": receipt.masked,
            # o nome lido só aparece quando a chave não é de ninguém: é o jeito de achar o papel
            "payeeName": receipt.parsed.payee_name if receipt.problem == "outra_chave" else None,
            "status": receipt.problem,
            "message": PROBLEM_TEXT[receipt.problem],
        }
        for receipt in receipts
        if receipt.problem
    ]
    pending = pending_amount(payable)
    total = sum(
        (r.parsed.amount for r in receipts if r.parsed.amount and not r.ignored), Decimal("0")
    )
    counts: dict[str, int] = defaultdict(int)
    for row in items:
        counts[row["status"]] += 1
    blockers = []
    if counts["sem_chave"]:
        blockers.append(
            f"{_plural(counts['sem_chave'], 'pessoa', 'pessoas')} sem chave Pix no lançamento"
        )
    if counts["sem_comprovante"]:
        blockers.append(
            f"{_plural(counts['sem_comprovante'], 'pessoa', 'pessoas')} sem comprovante"
        )
    if counts["valor_diferente"]:
        blockers.append(
            f"{_plural(counts['valor_diferente'], 'comprovante', 'comprovantes')} com valor "
            "diferente do da pessoa"
        )
    if extras:
        blockers.append(
            f"{_plural(len(extras), 'comprovante', 'comprovantes')} que não "
            f"{'entra' if len(extras) == 1 else 'entram'} na baixa (veja abaixo)"
        )
    if total != pending:
        blockers.append(
            f"A soma dos comprovantes ({format_brl(total)}) não bate com o valor da conta "
            f"({format_brl(pending)})"
        )
    return {
        "payableId": payable.id,
        "pending": pending,
        "receiptsTotal": total,
        "count": len(items),
        "matched": counts["bate"],
        "ready": not blockers,
        "ignored": sum(1 for receipt in receipts if receipt.ignored),
        "blockers": blockers,
        "items": items,
        "extras": extras,
    }


def _load(db: Session, payable_id: int, lock: bool = False) -> Payable:
    payable = payable_service._get(db, payable_id, lock=lock)
    if not payable.paidByReceipts:
        raise PayableConflict(
            "Só o lançamento de incentivos da planilha nova é baixado pelos comprovantes"
        )
    if payable.canceledAt is not None:
        raise PayableConflict("Conta cancelada não recebe baixa")
    if pending_amount(payable) <= 0:
        raise PayableConflict("Essa conta já está paga")
    return payable


def preview(db: Session, payable_id: int, files: list[tuple[str, bytes]]) -> dict[str, Any]:
    """Confere os comprovantes contra as pessoas, sem gravar nada."""
    payable = _load(db, payable_id)
    return _match(db, payable, _read(files))


def _pages(content: bytes, first: int, last: int) -> bytes:
    """As páginas de um comprovante, num PDF só dele."""
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(BytesIO(content))
    writer = PdfWriter()
    for number in range(first, last + 1):
        writer.add_page(reader.pages[number - 1])
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def confirm(
    db: Session, payable_id: int, files: list[tuple[str, bytes]], bank_account_id: int, user: User
) -> dict[str, Any]:
    """Dá a baixa de cada pessoa pelo seu comprovante e anexa o comprovante nela. Os arquivos são
    lidos de novo (como a planilha na importação) e a conferência é refeita com a conta travada."""
    payable = _load(db, payable_id, lock=True)
    receipts = _read(files)
    result = _match(db, payable, receipts)
    if not result["ready"]:
        raise PayableConflict(f"A baixa ainda não pode sair: {result['blockers'][0]}")
    account = payable_service._bank_account(db, bank_account_id, payable.company_id)
    by_item = {receipt.item_id: receipt for receipt in receipts if receipt.item_id}
    paying = _open_items(payable)
    on = today()
    for item in paying:
        receipt = by_item[item.id]
        paid_on = receipt.parsed.paid_at or on
        if paid_on > on:
            raise PayableInvalid(f"O comprovante de {item.name} tem data no futuro")
        payable_service._period_open(db, payable.company_id, paid_on)
        e2e = (receipt.parsed.e2e_id or "").strip()
        payable_service.lock_transaction_id(db, e2e.upper())
        db.add(
            PayablePayment(
                payable_id=payable.id,
                paidOn=paid_on,
                amount=item.amount,
                bank_account_id=account.id,
                payment_method_id=payable.payment_method_id,
                transactionId=e2e,
                note=NOTE,
                item_id=item.id,
                created_by_user_id=user.id,
            )
        )
        attachments.store_item_receipt(
            db,
            payable,
            item.id,
            f"Comprovante Pix - {item.name}"[:190] + ".pdf",
            _pages(files[receipt.file][1], receipt.first_page, receipt.last_page),
            user,
        )
    days = sorted({by_item[item.id].parsed.paid_at or on for item in paying})
    payable_service.audit(
        db,
        payable,
        user,
        f"Baixa pelos comprovantes Pix: {_plural(len(paying), 'pessoa', 'pessoas')}, "
        f"{format_brl(result['pending'])} ({account.name}), "
        f"em {' e '.join(format_date_br(day) for day in days)}",
    )
    db.commit()
    return {"count": len(paying), "total": result["pending"]}
