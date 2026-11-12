"""Conciliação das linhas do extrato (PF-70, primeira fatia).

Cada linha do extrato é ligada a um lançamento que já tem baixa (e à pessoa dele, quando o
lançamento tem itens), ou marcada como exceção com motivo, e sempre classificada. Saída casa com
conta a pagar e entrada com conta a receber. Desfazer pede motivo e fica no histórico.

Ainda não baixa título em aberto nem cria lançamento a partir da linha, e o Pix devolvido casa só
como exceção: ficam para a próxima fatia.
"""

import re
import unicodedata
from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.crypto import decrypt_payload
from core.text import format_brl
from models.bank_reconciliation import BankReconciliation, BankReconciliationEvent
from models.bank_statement import BankTransaction
from models.payable import Payable, PayablePayment
from models.receivable import Receivable, ReceivablePayment
from models.reference import BankAccount
from models.user import User
from services import payable as payable_service
from services import receivable as receivable_service
from services.payable import PayableConflict, PayableInvalid

ZERO = Decimal("0")
WINDOW_DAYS = 3
MAX_SUGGESTIONS = 10

CLASSIFICATIONS: dict[str, str] = {
    "incentivo": "Incentivo",
    "adiantamento": "Adiantamento",
    "nf": "Pagamento com NF",
    "rpa": "RPA",
    "sem_nf": "Sem NF",
    "reembolso": "Reembolso",
    "tarifa": "Tarifa",
    "transferencia": "Transferência",
    "recebimento": "Recebimento de cliente",
    "outro": "Outro",
}
# O tipo de documento da pessoa do lançamento já diz como classificar a linha dela.
ITEM_CLASSIFICATION = {"Incentivo": "incentivo", "NF": "nf", "RPA": "rpa", "Sem NF": "sem_nf"}


class TransactionNotFound(Exception):
    """A linha do extrato não existe."""


class TargetNotFound(Exception):
    """O lançamento escolhido não existe."""


def description_of(tx: BankTransaction) -> str:
    """O texto da linha, decifrado só na memória (nunca vai para o log nem para o histórico)."""
    return decrypt_payload(
        tx.description_enc, f"bank_transactions:description:{tx.bank_account_id}:{tx.dedupeKey}"
    )


def _transaction(db: Session, transaction_id: int, lock: bool = False) -> BankTransaction:
    query = db.query(BankTransaction).filter_by(id=transaction_id)
    tx = (query.with_for_update() if lock else query).first()
    if tx is None:
        raise TransactionNotFound
    return tx


def _words(text: str) -> set[str]:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return set(re.findall(r"[a-z0-9]{3,}", plain))


def _name_matches(who: str | None, description_words: set[str]) -> bool:
    """O nome da pessoa ou do fornecedor aparece na descrição da linha (que costuma vir cortada)."""
    words = _words(who or "")
    shared = words & description_words
    return bool(shared) and len(shared) >= min(2, len(words))


def _linked_total(
    db: Session, *, payable_id: int | None = None, receivable_id: int | None = None
) -> Decimal:
    """O que as linhas já conciliadas com o lançamento somam."""
    query = db.query(func.coalesce(func.sum(func.abs(BankTransaction.amount)), 0)).join(
        BankReconciliation, BankReconciliation.bank_transaction_id == BankTransaction.id
    )
    if payable_id is not None:
        query = query.filter(BankReconciliation.payable_id == payable_id)
    else:
        query = query.filter(BankReconciliation.receivable_id == receivable_id)
    return Decimal(str(query.scalar()))


def _payable_ceiling(payable: Payable) -> Decimal:
    """O valor do lançamento, com juros, multa e descontos das baixas."""
    return payable_service.pending_amount(payable) + payable_service.paid_amount(payable)


def _linked_item_ids(db: Session, payable_id: int) -> set[int]:
    return {
        item_id
        for (item_id,) in db.query(BankReconciliation.payable_item_id).filter(
            BankReconciliation.payable_id == payable_id,
            BankReconciliation.payable_item_id.isnot(None),
        )
    }


def _project_codes(payable: Payable) -> list[str]:
    return [allocation.project.code for allocation in payable.allocations]


def _payable_who(payable: Payable) -> str | None:
    if payable.supplier is not None:
        return payable.supplier.nickname or payable.supplier.name
    return payable.payeeName


def _payable_classification(payable: Payable, item: Any | None) -> str | None:
    if item is not None and item.documentType in ITEM_CLASSIFICATION:
        return ITEM_CLASSIFICATION[item.documentType]
    if payable.origin == "incentivo":
        return "incentivo"
    return "nf" if payable.documentType == "NF" else None


def _score(days: int, named: bool) -> tuple[int, list[str]]:
    reasons = ["valor igual", "mesmo dia" if days == 0 else f"{days} dia(s) de diferença"]
    score = 100 - 15 * days
    if named:
        score += 30
        reasons.append("nome na descrição")
    return score, reasons


def _outgoing(
    db: Session, tx: BankTransaction, amount: Decimal, words: set[str]
) -> list[dict[str, Any]]:
    low, high = tx.postedOn - timedelta(days=WINDOW_DAYS), tx.postedOn + timedelta(days=WINDOW_DAYS)
    near = {
        p.id: p
        for p in db.query(PayablePayment).filter(
            PayablePayment.bank_account_id == tx.bank_account_id,
            PayablePayment.kind == "pagamento",
            PayablePayment.paidOn.between(low, high),
        )
    }
    if not near:
        return []
    payables = (
        db.query(Payable)
        .filter(
            Payable.id.in_({p.payable_id for p in near.values()}),
            Payable.deletedAt.is_(None),
            Payable.canceledAt.is_(None),
            Payable.replaced_by_id.is_(None),
        )
        .all()
    )
    found: list[dict[str, Any]] = []
    for payable in payables:
        active = [p for p in payable_service._active_payments(payable) if p.id in near]
        if not active:
            continue
        closest = min(active, key=lambda p: abs((p.paidOn - tx.postedOn).days))
        days = abs((closest.paidOn - tx.postedOn).days)
        if payable.items:
            taken = _linked_item_ids(db, payable.id)
            choices: list[Any] = [
                i for i in payable.items if i.id not in taken and i.amount == amount
            ]
        elif any(p.amount == amount for p in active) and (
            _linked_total(db, payable_id=payable.id) + amount <= _payable_ceiling(payable)
        ):
            choices = [None]
        else:
            choices = []
        for item in choices:
            who = item.name if item is not None else _payable_who(payable)
            score, reasons = _score(days, _name_matches(who, words))
            number = item.invoiceNumber if item is not None else payable.documentNumber
            issued = item.invoiceDate if item is not None else payable.documentDate
            found.append(
                {
                    "targetKind": "payable",
                    "targetId": payable.id,
                    "itemId": item.id if item is not None else None,
                    "description": payable.description,
                    "who": who,
                    "projectCodes": _project_codes(payable),
                    "amount": amount,
                    "paidOn": closest.paidOn,
                    "score": score,
                    "reasons": reasons,
                    "classification": _payable_classification(payable, item),
                    "nfNumber": number,
                    "nfIssuedOn": issued,
                }
            )
    return found


def _incoming(
    db: Session, tx: BankTransaction, amount: Decimal, words: set[str]
) -> list[dict[str, Any]]:
    low, high = tx.postedOn - timedelta(days=WINDOW_DAYS), tx.postedOn + timedelta(days=WINDOW_DAYS)
    near = {
        p.id: p
        for p in db.query(ReceivablePayment).filter(
            ReceivablePayment.bank_account_id == tx.bank_account_id,
            ReceivablePayment.kind == "recebimento",
            ReceivablePayment.receivedOn.between(low, high),
        )
    }
    if not near:
        return []
    receivables = (
        db.query(Receivable)
        .filter(
            Receivable.id.in_({p.receivable_id for p in near.values()}),
            Receivable.deletedAt.is_(None),
            Receivable.canceledAt.is_(None),
        )
        .all()
    )
    found: list[dict[str, Any]] = []
    for receivable in receivables:
        active = [p for p in receivable_service._active_receipts(receivable) if p.id in near]
        if not active or not any(p.amount == amount for p in active):
            continue
        if _linked_total(db, receivable_id=receivable.id) + amount > receivable_service.net_amount(
            receivable
        ):
            continue
        closest = min(active, key=lambda p: abs((p.receivedOn - tx.postedOn).days))
        days = abs((closest.receivedOn - tx.postedOn).days)
        who = receivable.customer.nickname if receivable.customer else None
        score, reasons = _score(days, _name_matches(who, words))
        found.append(
            {
                "targetKind": "receivable",
                "targetId": receivable.id,
                "itemId": None,
                "description": receivable.description,
                "who": who,
                "projectCodes": [receivable.project.code] if receivable.project else [],
                "amount": amount,
                "paidOn": closest.receivedOn,
                "score": score,
                "reasons": reasons,
                "classification": "nf" if receivable.documentType == "NF" else "recebimento",
                "nfNumber": receivable.documentNumber,
                "nfIssuedOn": receivable.documentDate,
            }
        )
    return found


def suggestions(db: Session, transaction_id: int) -> list[dict[str, Any]]:
    """Lançamentos com baixa na mesma conta, no mesmo valor e até 3 dias da linha, do mais provável
    ao menos provável. Valor igual é obrigatório: valor diferente é divergência para revisão."""
    tx = _transaction(db, transaction_id)
    if db.query(BankReconciliation.id).filter_by(bank_transaction_id=tx.id).first():
        return []
    amount = abs(tx.amount)
    words = _words(description_of(tx))
    found = _outgoing(db, tx, amount, words) if tx.amount < 0 else _incoming(db, tx, amount, words)
    found.sort(key=lambda s: (-s["score"], s["targetId"], s["itemId"] or 0))
    return found[:MAX_SUGGESTIONS]


def _event(db: Session, tx: BankTransaction, user: User, text: str) -> None:
    db.add(BankReconciliationEvent(bank_transaction_id=tx.id, user_id=user.id, text=text[:500]))


def _classification(value: str | None) -> str | None:
    """A classificação escolhida, se veio uma; recusa a que não existe."""
    key = (value or "").strip()
    if key and key not in CLASSIFICATIONS:
        raise PayableInvalid("Classificação inválida")
    return key or None


def reconcile(db: Session, transaction_id: int, data: Any, user: User) -> None:
    """Liga a linha ao lançamento (e à pessoa). Tudo ou nada: uma recusa não deixa nada gravado."""
    tx = _transaction(db, transaction_id, lock=True)
    if db.query(BankReconciliation.id).filter_by(bank_transaction_id=tx.id).first():
        raise PayableConflict("Essa linha já foi conciliada")
    classification = _classification(data.classification)
    if classification is None:
        raise PayableInvalid("Escolha a classificação da linha")
    number = (data.nfNumber or "").strip() or None
    if classification == "nf" and (number is None or data.nfIssuedOn is None):
        raise PayableInvalid("Pagamento com NF pede o número e a data de emissão da nota")
    outgoing = tx.amount < 0
    if outgoing and data.targetKind != "payable":
        raise PayableConflict("Essa linha é uma saída: concilie com uma conta a pagar")
    if not outgoing and data.targetKind != "receivable":
        raise PayableConflict("Essa linha é uma entrada: concilie com uma conta a receber")
    amount = abs(tx.amount)
    account = db.get(BankAccount, tx.bank_account_id)
    link: dict[str, Any] = {}
    if data.targetKind == "payable":
        link = _link_payable(db, tx, account, data, amount)
    else:
        link = _link_receivable(db, tx, account, data.targetId, amount)
    db.add(
        BankReconciliation(
            bank_transaction_id=tx.id,
            kind="lancamento",
            classification=classification,
            nfNumber=number if classification == "nf" else None,
            nfIssuedOn=data.nfIssuedOn if classification == "nf" else None,
            reconciled_by_id=user.id,
            **link,
        )
    )
    where = "conta a pagar" if data.targetKind == "payable" else "conta a receber"
    _event(
        db,
        tx,
        user,
        f"Conciliou {format_brl(amount)} com a {where} #{data.targetId} "
        f"({CLASSIFICATIONS[classification]})",
    )
    db.commit()


def _link_payable(
    db: Session, tx: BankTransaction, account: BankAccount | None, data: Any, amount: Decimal
) -> dict[str, Any]:
    payable = (
        db.query(Payable)
        .filter(Payable.id == data.targetId, Payable.deletedAt.is_(None))
        .with_for_update(of=Payable)
        .first()
    )
    if payable is None:
        raise TargetNotFound
    if payable.canceledAt is not None or payable.replaced_by_id is not None:
        raise PayableConflict("Esse lançamento está cancelado")
    if account is None or payable.company_id != account.company_id:
        raise PayableConflict("O lançamento é de outra empresa, não da dona da conta bancária")
    if payable_service.paid_amount(payable) <= 0:
        raise PayableConflict("Esse lançamento ainda não tem baixa: dê a baixa antes de conciliar")
    item_id = None
    if payable.items:
        item = next((i for i in payable.items if i.id == data.itemId), None)
        if data.itemId is None:
            raise PayableInvalid("Escolha a pessoa do lançamento")
        if item is None:
            raise PayableInvalid("Essa pessoa não é deste lançamento")
        if item.id in _linked_item_ids(db, payable.id):
            raise PayableConflict("Essa pessoa já foi conciliada com outra linha")
        if item.amount != amount:
            raise PayableConflict(
                f"O valor da linha ({format_brl(amount)}) não é o da pessoa "
                f"({format_brl(item.amount)})"
            )
        item_id = item.id
    elif data.itemId is not None:
        raise PayableInvalid("Esse lançamento não tem pessoas")
    total = _linked_total(db, payable_id=payable.id) + amount
    ceiling = _payable_ceiling(payable)
    if total > ceiling:
        raise PayableConflict(
            f"As linhas somam {format_brl(total)}, mas o lançamento é de {format_brl(ceiling)}"
        )
    return {"payable_id": payable.id, "payable_item_id": item_id}


def _link_receivable(
    db: Session,
    tx: BankTransaction,
    account: BankAccount | None,
    receivable_id: int,
    amount: Decimal,
) -> dict[str, Any]:
    receivable = (
        db.query(Receivable)
        .filter(Receivable.id == receivable_id, Receivable.deletedAt.is_(None))
        .with_for_update(of=Receivable)
        .first()
    )
    if receivable is None:
        raise TargetNotFound
    if receivable.canceledAt is not None:
        raise PayableConflict("Esse lançamento está cancelado")
    if account is None or receivable.company_id != account.company_id:
        raise PayableConflict("O lançamento é de outra empresa, não da dona da conta bancária")
    if receivable_service.received_amount(receivable) <= 0:
        raise PayableConflict("Esse lançamento ainda não tem baixa: dê a baixa antes de conciliar")
    total = _linked_total(db, receivable_id=receivable.id) + amount
    ceiling = receivable_service.net_amount(receivable)
    if total > ceiling:
        raise PayableConflict(
            f"As linhas somam {format_brl(total)}, mas o lançamento é de {format_brl(ceiling)}"
        )
    return {"receivable_id": receivable.id}


def mark_exception(db: Session, transaction_id: int, data: Any, user: User) -> None:
    """Exceção aceita, com motivo: a linha conta como conciliada, mas sem ligar a lançamento."""
    tx = _transaction(db, transaction_id, lock=True)
    if db.query(BankReconciliation.id).filter_by(bank_transaction_id=tx.id).first():
        raise PayableConflict("Essa linha já foi conciliada")
    reason = (data.reason or "").strip()
    if not reason:
        raise PayableInvalid("Informe o motivo da exceção")
    classification = _classification(data.classification)
    db.add(
        BankReconciliation(
            bank_transaction_id=tx.id,
            kind="excecao",
            classification=classification,
            note=reason,
            reconciled_by_id=user.id,
        )
    )
    _event(db, tx, user, f"Marcou {format_brl(abs(tx.amount))} como exceção: {reason}")
    db.commit()


def undo(db: Session, transaction_id: int, reason: str, user: User) -> None:
    """Desfaz a conciliação ou a exceção. Pede motivo, e o histórico guarda quem e por quê."""
    tx = _transaction(db, transaction_id, lock=True)
    current = db.query(BankReconciliation).filter_by(bank_transaction_id=tx.id).first()
    if current is None:
        raise PayableConflict("Essa linha não está conciliada")
    why = (reason or "").strip()
    if not why:
        raise PayableInvalid("Informe o motivo para desfazer")
    what = "a exceção" if current.kind == "excecao" else "a conciliação"
    db.delete(current)
    _event(db, tx, user, f"Desfez {what} de {format_brl(abs(tx.amount))}: {why}")
    db.commit()


def _label(db: Session, row: BankReconciliation) -> str:
    if row.kind == "excecao":
        return f"Exceção: {row.note}"
    if row.payable_id is not None:
        payable = db.get(Payable, row.payable_id)
        text = payable.description if payable else f"Conta a pagar #{row.payable_id}"
        if row.payable_item_id is not None and payable is not None:
            item = next((i for i in payable.items if i.id == row.payable_item_id), None)
            if item is not None:
                text = f"{text} · {item.name}"
        return text
    receivable = db.get(Receivable, row.receivable_id)
    return receivable.description if receivable else f"Conta a receber #{row.receivable_id}"


def attach_reconciliations(db: Session, items: list[dict[str, Any]]) -> None:
    """Põe em cada linha do extrato listada o que foi feito com ela (ou nada, se está pendente)."""
    rows = {
        r.bank_transaction_id: r
        for r in db.query(BankReconciliation).filter(
            BankReconciliation.bank_transaction_id.in_([i["id"] for i in items])
        )
    }
    names = {
        user_id: name
        for user_id, name in db.query(User.id, User.name).filter(
            User.id.in_({r.reconciled_by_id for r in rows.values()})
        )
    }
    for item in items:
        row = rows.get(item["id"])
        if row is None:
            item["reconciliation"] = None
            continue
        item["reconciliation"] = {
            "kind": row.kind,
            "classification": row.classification,
            "classificationLabel": CLASSIFICATIONS.get(row.classification or ""),
            "label": _label(db, row),
            "targetKind": "payable"
            if row.payable_id is not None
            else ("receivable" if row.receivable_id is not None else None),
            "targetId": row.payable_id or row.receivable_id,
            "nfNumber": row.nfNumber,
            "nfIssuedOn": row.nfIssuedOn,
            "by": names.get(row.reconciled_by_id),
            "at": row.createdAt,
        }
