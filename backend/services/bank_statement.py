"""Extrato bancário importado: prévia, importação (sem duplicar) e consulta.

A transação importada é imutável: este módulo só insere e lê. A descrição de cada linha é guardada
cifrada, porque o Pix traz o nome de quem pagou ou recebeu (Q44).
"""

import hashlib
import re
from collections import Counter
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from core.crypto import decrypt_payload, encrypt_payload
from core.security import hash_statement_key
from core.statement import ParsedStatement, StatementLine, parse_statement
from models.bank_reconciliation import BankReconciliation
from models.bank_statement import BankStatement, BankTransaction
from models.reference import BankAccount, RecordEvent
from models.user import User
from services import period_lock
from services.payable import PayableConflict
from services.records import RecordNotFound

PAGE_SIZE = 50
SAMPLE_SIZE = 10
_CHUNK = 500  # o IN do SQL em pedaços, para qualquer banco aceitar
OTHER_ACCOUNT = "O arquivo parece ser de outra conta bancária. Confira se escolheu a conta certa."


def _account(db: Session, account_id: int, lock: bool = False) -> BankAccount:
    query = db.query(BankAccount).filter_by(id=account_id)
    account = (query.with_for_update() if lock else query).first()
    if account is None:
        raise RecordNotFound
    return account


def _text_key(line: StatementLine) -> str:
    description = re.sub(r"\s+", " ", line.description).strip().lower()
    return f"txt:{line.posted_on.isoformat()}|{line.amount}|{description}"


def _keys(lines: list[StatementLine]) -> list[str]:
    """A chave de cada linha: o ID que o banco dá, ou data + valor + descrição. A repetição dentro
    do mesmo arquivo entra na chave (dois Pix iguais no mesmo dia são duas linhas), e reimportar o
    mesmo arquivo gera as mesmas chaves."""
    # shortcut: sem ID do banco, um extrato que começa no meio de um dia pode contar a repetição
    # diferente de outro que se sobrepõe a ele; use o OFX (com ID) quando houver sobreposição.
    seen: Counter[str] = Counter()
    keys: list[str] = []
    for line in lines:
        base = f"id:{line.external_id}" if line.external_id else _text_key(line)
        seen[base] += 1
        suffix = f"|{seen[base]}" if seen[base] > 1 else ""
        keys.append(hash_statement_key(f"{base}{suffix}"))
    return keys


def _existing(db: Session, account_id: int, keys: list[str]) -> set[str]:
    found: set[str] = set()
    for start in range(0, len(keys), _CHUNK):
        chunk = keys[start : start + _CHUNK]
        found |= {
            key
            for (key,) in db.query(BankTransaction.dedupeKey).filter(
                BankTransaction.bank_account_id == account_id, BankTransaction.dedupeKey.in_(chunk)
            )
        }
    return found


def _same_account(file_digits: str | None, stored: str | None) -> bool | None:
    """Os dígitos do arquivo batem com a conta escolhida? Nulo quando um dos lados não diz."""
    mine = re.sub(r"\D", "", stored or "").lstrip("0")
    theirs = (file_digits or "").lstrip("0")
    if not mine or not theirs:
        return None
    return mine.endswith(theirs) or theirs.endswith(mine)


def _split(
    db: Session, account: BankAccount, parsed: ParsedStatement
) -> tuple[list[tuple[StatementLine, str]], int]:
    """As linhas novas, cada uma com a sua chave, e quantas já estavam na conta."""
    keys = _keys(parsed.lines)
    known = _existing(db, account.id, keys)
    fresh = [(line, key) for line, key in zip(parsed.lines, keys, strict=True) if key not in known]
    return fresh, len(parsed.lines) - len(fresh)


def _period(parsed: ParsedStatement) -> tuple[date, date]:
    days = [line.posted_on for line in parsed.lines]
    return min(days), max(days)


def preview(db: Session, account_id: int, content: bytes) -> dict[str, Any]:
    """Confere o arquivo contra a conta: linhas novas e repetidas. Não grava nada."""
    account = _account(db, account_id)
    parsed = parse_statement(content)
    fresh, duplicates = _split(db, account, parsed)
    start, end = _period(parsed)
    warnings = []
    if _same_account(parsed.account_digits, account.accountNumber) is False:
        warnings.append(OTHER_ACCOUNT)
    previous = (
        db.query(BankStatement)
        .filter_by(bank_account_id=account.id, fileHash=hashlib.sha256(content).hexdigest())
        .order_by(BankStatement.id.desc())
        .first()
    )
    return {
        "fileFormat": parsed.file_format,
        "lines": len(parsed.lines),
        "newLines": len(fresh),
        "duplicateLines": duplicates,
        "periodStart": start,
        "periodEnd": end,
        "income": sum((line.amount for line, _ in fresh if line.amount > 0), Decimal("0")),
        "expense": sum((-line.amount for line, _ in fresh if line.amount < 0), Decimal("0")),
        "warnings": warnings,
        "sample": [
            {"postedOn": line.posted_on, "description": line.description, "amount": line.amount}
            for line, _ in fresh[:SAMPLE_SIZE]
        ],
        "alreadyImportedAt": previous.createdAt if previous else None,
    }


def _cents(total: Any) -> Decimal:
    """A soma do banco (que pode vir como float no SQLite) sempre em centavos."""
    return Decimal(str(total)).quantize(Decimal("0.01"))


def _associated_data(account_id: int, key: str) -> str:
    return f"bank_transactions:description:{account_id}:{key}"


def confirm(
    db: Session, account_id: int, filename: str, content: bytes, user: User
) -> dict[str, Any]:
    """Grava só as linhas novas: reimportar o mesmo extrato não muda nada. O arquivo não fica."""
    account = _account(db, account_id, lock=True)  # dois envios ao mesmo tempo esperam um ao outro
    if not account.active:
        raise PayableConflict("Essa conta bancária está inativa")
    parsed = parse_statement(content)
    fresh, duplicates = _split(db, account, parsed)
    start, end = _period(parsed)
    result: dict[str, Any] = {
        "statementId": None,
        "newLines": len(fresh),
        "duplicateLines": duplicates,
        "periodStart": start,
        "periodEnd": end,
    }
    if not fresh:
        return result
    # linha nova num mês já fechado da empresa ficaria pendente para sempre: o administrador reabre
    for month in sorted({line.posted_on.strftime("%Y-%m") for line, _ in fresh}):
        period_lock.ensure_open(db, account.company_id, date.fromisoformat(f"{month}-01"))
    statement = BankStatement(
        bank_account_id=account.id,
        filename=re.split(r"[\\/]", filename)[-1][:255] or "extrato",
        fileHash=hashlib.sha256(content).hexdigest(),
        fileFormat=parsed.file_format,
        periodStart=start,
        periodEnd=end,
        newLines=len(fresh),
        duplicateLines=duplicates,
        imported_by_id=user.id,
    )
    db.add(statement)
    db.flush()
    db.add_all(
        BankTransaction(
            bank_account_id=account.id,
            statement_id=statement.id,
            postedOn=line.posted_on,
            amount=line.amount,
            description_enc=encrypt_payload(line.description, _associated_data(account.id, key)),
            externalId=line.external_id[:100] if line.external_id else None,
            dedupeKey=key,
        )
        for line, key in fresh
    )
    # O histórico diz o que entrou, nunca o que está escrito nas linhas (têm nome de gente).
    db.add(
        RecordEvent(
            kind="bankAccounts",
            record_id=account.id,
            user_id=user.id,
            text=(
                f"Importou extrato: {len(fresh)} linhas novas e {duplicates} repetidas "
                f"({start:%d/%m/%Y} a {end:%d/%m/%Y})"
            ),
        )
    )
    db.commit()
    result["statementId"] = statement.id
    return result


def list_statements(db: Session, account_id: int) -> list[dict[str, Any]]:
    """As últimas importações da conta, da mais nova para a mais antiga."""
    _account(db, account_id)
    rows = (
        db.query(BankStatement, User.name)
        .outerjoin(User, User.id == BankStatement.imported_by_id)
        .filter(BankStatement.bank_account_id == account_id)
        .order_by(BankStatement.id.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": statement.id,
            "filename": statement.filename,
            "fileFormat": statement.fileFormat,
            "periodStart": statement.periodStart,
            "periodEnd": statement.periodEnd,
            "newLines": statement.newLines,
            "duplicateLines": statement.duplicateLines,
            "importedBy": name,
            "createdAt": statement.createdAt,
        }
        for statement, name in rows
    ]


def _counts(query: Any) -> dict[str, int]:
    """Quantas linhas do período estão pendentes, conciliadas e como exceção."""
    reconciled, exceptions = (
        query.join(BankReconciliation, BankReconciliation.bank_transaction_id == BankTransaction.id)
        .with_entities(
            func.coalesce(func.sum(case((BankReconciliation.kind == "lancamento", 1), else_=0)), 0),
            func.coalesce(func.sum(case((BankReconciliation.kind == "excecao", 1), else_=0)), 0),
        )
        .one()
    )
    total = query.count()
    return {
        "pending": total - int(reconciled) - int(exceptions),
        "reconciled": int(reconciled),
        "exceptions": int(exceptions),
    }


def list_transactions(
    db: Session,
    account_id: int,
    start: date | None,
    end: date | None,
    page: int,
    status: str | None = None,
) -> dict[str, Any]:
    """As linhas do extrato, da mais nova para a mais antiga, com o que o período soma. `status`
    filtra por pendente, conciliada ou exceção; as contagens ignoram esse filtro."""
    _account(db, account_id)
    query = db.query(BankTransaction).filter(BankTransaction.bank_account_id == account_id)
    if start:
        query = query.filter(BankTransaction.postedOn >= start)
    if end:
        query = query.filter(BankTransaction.postedOn <= end)
    counts = _counts(query)
    on = BankReconciliation.bank_transaction_id == BankTransaction.id
    if status == "pendente":
        query = query.outerjoin(BankReconciliation, on).filter(BankReconciliation.id.is_(None))
    elif status == "conciliada":
        query = query.join(BankReconciliation, on).filter(BankReconciliation.kind == "lancamento")
    elif status == "excecao":
        query = query.join(BankReconciliation, on).filter(BankReconciliation.kind == "excecao")
    total, income, expense = query.with_entities(
        func.count(BankTransaction.id),
        func.coalesce(
            func.sum(case((BankTransaction.amount > 0, BankTransaction.amount), else_=0)), 0
        ),
        func.coalesce(
            func.sum(case((BankTransaction.amount < 0, -BankTransaction.amount), else_=0)), 0
        ),
    ).one()
    rows = (
        query.order_by(BankTransaction.postedOn.desc(), BankTransaction.id.desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .all()
    )
    return {
        "items": [
            {
                "id": row.id,
                "postedOn": row.postedOn,
                "description": decrypt_payload(
                    row.description_enc, _associated_data(account_id, row.dedupeKey)
                ),
                "amount": row.amount,
                "statementId": row.statement_id,
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "pageSize": PAGE_SIZE,
        "counts": counts,
        "income": _cents(income),
        "expense": _cents(expense),
    }
