"""Fechamento do mês por empresa (PF-72): o que falta para fechar, fechar, reabrir (só admin)
e a planilha da contabilidade. Fechado, a trava de `services/period_lock.py` recusa baixa, estorno,
recebimento e lançamento com data daquele mês."""

import re
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from core.xlsx import build_xlsx
from models.bank_reconciliation import BankReconciliation
from models.bank_statement import BankTransaction
from models.period_closing import PeriodClosing, PeriodClosingEvent
from models.reference import BankAccount, Company
from models.user import User
from services.bank_reconciliation import attach_reconciliations, description_of
from services.bank_reports import month_bounds
from services.payable import PayableConflict, PayableInvalid, today
from services.period_lock import month_name
from services.records import RecordNotFound

SHEET_HEADERS = [
    "Data",
    "Conta",
    "Descrição no extrato",
    "Valor (R$)",
    "Classificação",
    "Número da NF",
    "Emissão da NF",
    "Lançamento no sistema",
    "Situação",
]


class NotAdmin(Exception):
    """Quem tentou reabrir o período não é administrador."""


def _company(db: Session, company_id: int) -> Company:
    company = db.get(Company, company_id)
    if company is None:
        raise RecordNotFound
    return company


def _pending(db: Session, company: Company, month: str) -> dict[str, Any]:
    """O que impede fechar: conta ativa sem extrato no mês, linha sem conciliar e linha sem
    classificação (exceção antiga, de antes de a classificação ser obrigatória)."""
    first, last = month_bounds(month)
    accounts = db.query(BankAccount).filter(BankAccount.company_id == company.id).all()
    lines = (
        db.query(BankTransaction.id, BankTransaction.bank_account_id)
        .filter(
            BankTransaction.bank_account_id.in_([a.id for a in accounts] or [0]),
            BankTransaction.postedOn.between(first, last),
        )
        .all()
    )
    with_lines = {account_id for _, account_id in lines}
    done = {
        transaction_id: classification
        for transaction_id, classification in db.query(
            BankReconciliation.bank_transaction_id, BankReconciliation.classification
        ).filter(BankReconciliation.bank_transaction_id.in_([i for i, _ in lines] or [0]))
    }
    active = [a for a in accounts if a.active]
    not_imported = [a.name for a in active if a.id not in with_lines]
    without_pair = sum(1 for line_id, _ in lines if line_id not in done)
    without_class = sum(1 for classification in done.values() if not classification)
    return {
        "lines": len(lines),
        "notImported": not_imported,
        "withoutPair": without_pair,
        "withoutClassification": without_class,
        "ready": bool(active) and not not_imported and without_pair == 0 and without_class == 0,
        "hasAccounts": bool(active),
    }


def status(db: Session, month: str) -> dict[str, Any]:
    """Cada empresa com conta bancária, no mês: fechada ou não e o que falta; e todos os meses
    fechados até hoje."""
    month_bounds(month)  # valida o mês
    closings = {
        (c.company_id, c.month): c
        for c in db.query(PeriodClosing).order_by(PeriodClosing.month.desc())
    }
    names = dict(db.query(User.id, User.name))
    companies = []
    for company in db.query(Company).order_by(Company.name):
        if not db.query(BankAccount.id).filter_by(company_id=company.id).first():
            continue
        closing = closings.get((company.id, month))
        pending = _pending(db, company, month)
        pending.pop("hasAccounts")
        companies.append(
            {
                "id": company.id,
                "name": company.name,
                "closed": closing is not None,
                "closedAt": closing.createdAt if closing else None,
                "closedBy": names.get(closing.closed_by_id) if closing else None,
                **pending,
            }
        )
    company_names = dict(db.query(Company.id, Company.name))
    return {
        "month": month,
        "companies": companies,
        "closings": [
            {
                "companyId": c.company_id,
                "company": company_names.get(c.company_id, ""),
                "month": c.month,
                "closedAt": c.createdAt,
                "closedBy": names.get(c.closed_by_id),
            }
            for c in closings.values()
        ],
    }


def _event(db: Session, company_id: int, month: str, user: User, text: str) -> None:
    db.add(PeriodClosingEvent(company_id=company_id, month=month, user_id=user.id, text=text[:500]))


def close(db: Session, company_id: int, month: str, user: User) -> None:
    """Fecha o mês da empresa quando todas as linhas do extrato estão conciliadas (exceção conta) e
    classificadas, e há extrato de cada conta ativa."""
    company = _company(db, company_id)
    first, _ = month_bounds(month)
    if first > date(today().year, today().month, 1):
        raise PayableInvalid("Esse mês ainda não começou")
    if db.query(PeriodClosing.id).filter_by(company_id=company.id, month=month).first():
        raise PayableConflict("Esse mês já está fechado")
    pending = _pending(db, company, month)
    if not pending["hasAccounts"]:
        raise PayableConflict("Essa empresa não tem conta bancária ativa")
    if pending["notImported"]:
        raise PayableConflict(f"Importe o extrato de {pending['notImported'][0]} antes de fechar")
    open_lines = pending["withoutPair"] + pending["withoutClassification"]
    if open_lines:
        raise PayableConflict(
            f"Há {open_lines} linhas não conciliadas ou sem classificação em {company.name}"
        )
    db.add(PeriodClosing(company_id=company.id, month=month, closed_by_id=user.id))
    _event(db, company.id, month, user, f"Fechou {month_name(month)}")
    db.commit()


def reopen(db: Session, company_id: int, month: str, reason: str, user: User) -> None:
    """Reabre o mês. Só administrador, com motivo, e o histórico guarda quem e por quê."""
    if user.role != "admin":
        raise NotAdmin
    company = _company(db, company_id)
    month_bounds(month)
    why = (reason or "").strip()
    if not why:
        raise PayableInvalid("Informe o motivo para reabrir")
    closing = db.query(PeriodClosing).filter_by(company_id=company.id, month=month).first()
    if closing is None:
        raise PayableConflict("Esse mês não está fechado")
    db.delete(closing)
    _event(db, company.id, month, user, f"Reabriu {month_name(month)}: {why}")
    db.commit()


def sheet(db: Session, company_id: int, month: str, user: User) -> tuple[bytes, str]:
    """A planilha da contabilidade: uma linha por transação do extrato do mês, com a classificação,
    o número e a emissão da NF e o lançamento. Cada download fica no histórico."""
    company = _company(db, company_id)
    first, last = month_bounds(month)
    accounts = {
        a.id: a.name for a in db.query(BankAccount).filter(BankAccount.company_id == company.id)
    }
    transactions = (
        db.query(BankTransaction)
        .filter(
            BankTransaction.bank_account_id.in_(list(accounts) or [0]),
            BankTransaction.postedOn.between(first, last),
        )
        .order_by(BankTransaction.postedOn, BankTransaction.id)
        .all()
    )
    items: list[dict[str, Any]] = [
        {
            "id": tx.id,
            "postedOn": tx.postedOn,
            "account": accounts[tx.bank_account_id],
            "description": description_of(tx),
            "amount": tx.amount,
        }
        for tx in transactions
    ]
    attach_reconciliations(db, items)
    rows: list[list[Any]] = []
    for item in items:
        rec = item["reconciliation"]
        linked = rec is not None and rec["kind"] == "lancamento"
        rows.append(
            [
                item["postedOn"],
                item["account"],
                item["description"],
                item["amount"],
                (rec or {}).get("classificationLabel") or "",
                (rec or {}).get("nfNumber") or "",
                (rec or {}).get("nfIssuedOn"),
                rec["label"] if linked and rec else "",
                "Conferida" if linked else (rec["label"] if rec else "Pendente"),
            ]
        )
    content = build_xlsx(
        sheet="Conciliação",
        title=f"Conciliação bancária · {company.name} · {month_name(month)}",
        headers=SHEET_HEADERS,
        rows=rows,
        total_columns=(3,),
    )
    _event(
        db,
        company.id,
        month,
        user,
        f"Baixou a planilha da contabilidade de {month_name(month)} ({len(rows)} linhas)",
    )
    db.commit()
    slug = re.sub(r"[^a-z0-9]+", "-", company.name.lower()).strip("-") or str(company.id)
    return content, f"conciliacao-{slug}-{month}.xlsx"
