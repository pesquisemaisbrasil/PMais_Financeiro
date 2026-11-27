"""Acesso por empresa (pedido do Bruno, 27/11/2026): o admin escolhe quais empresas cada conta vê, e
o servidor esconde o resto (ADR 0029).

- O login grava na sessão do banco as empresas da pessoa (`apply`); sem restrição, nada muda.
- Toda consulta dessa sessão passa por um filtro (`with_loader_criteria`): empresa, unidade, conta
  bancária, conta a pagar, título a receber, extrato, fechamento e o que pendura neles. Uma tela
  nova já nasce filtrada, e uma escolha de outra empresa vira "não encontrada" na gravação.
- Os projetos são filtrados só nas listas (`visible_projects`): uma conta da empresa pode ter
  rateio num projeto de outra, e esconder o projeto quebraria a conta.
- As checagens que protegem dado e dinheiro (um Pix só paga uma vez, nome e código que não repetem,
  cadastro em uso) olham todas as empresas, com `unscoped(query)`.

O SQLAlchemy 1.4 reaproveitava o filtro de uma pessoa nas cargas de relação de outra. Por isso o
valor das empresas é lido na hora da consulta (`callable_` sobre uma ContextVar), e a consulta
filtrada não usa o cache de comandos.
"""

from collections.abc import Iterable
from contextvars import ContextVar
from typing import Any

from sqlalchemy import Integer, bindparam, event, or_, select
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from models.bank_reconciliation import BankReconciliation, BankReconciliationEvent
from models.bank_statement import BankStatement, BankTransaction
from models.payable import (
    Payable,
    PayableAdjustment,
    PayableAllocation,
    PayableAttachment,
    PayableEvent,
    PayableItem,
    PayablePayment,
)
from models.period_closing import PeriodClosing, PeriodClosingEvent
from models.receipt import ReceiptBatch
from models.receivable import (
    Receivable,
    ReceivableAdjustment,
    ReceivableAttachment,
    ReceivableEvent,
    ReceivablePayment,
)
from models.reference import BankAccount, BusinessUnit, Company, Project

_KEY = "company_scope"
_BYPASS = "all_companies"
_current: ContextVar[tuple[int, ...]] = ContextVar("company_scope", default=())


def apply(db: Session, company_ids: Iterable[int] | None) -> None:
    """As empresas que a sessão enxerga; None é todas."""
    if company_ids is None:
        db.info.pop(_KEY, None)
    else:
        db.info[_KEY] = tuple(sorted(set(company_ids)))


def allowed(db: Session) -> tuple[int, ...] | None:
    return db.info.get(_KEY)


def unscoped(query: Any) -> Any:
    """A consulta que precisa ver todas as empresas. Use só para conferir (colunas), nunca para
    devolver o registro à tela: o objeto ficaria na sessão."""
    return query.execution_options(**{_BYPASS: True})


def visible_projects(db: Session, query: Any) -> Any:
    """Os projetos das empresas da sessão, e os sem empresa (os que ainda não têm unidade)."""
    ids = allowed(db)
    if ids is None:
        return query
    return query.filter(or_(Project.company_id.is_(None), Project.company_id.in_(ids)))


def sees_project(db: Session, project: Project) -> bool:
    ids = allowed(db)
    return ids is None or project.company_id is None or project.company_id in ids


def _companies() -> Any:
    return bindparam(
        "scope_companies",
        expanding=True,
        unique=True,
        type_=Integer,
        callable_=lambda: list(_current.get()),
    )


def _criteria() -> list[tuple[type[Any], Any]]:
    accounts = select(BankAccount.id).where(BankAccount.company_id.in_(_companies()))
    payables = select(Payable.id).where(Payable.company_id.in_(_companies()))
    receivables = select(Receivable.id).where(Receivable.company_id.in_(_companies()))
    lines = select(BankTransaction.id).where(BankTransaction.bank_account_id.in_(accounts))
    return [
        (Company, Company.id.in_(_companies())),
        (BusinessUnit, BusinessUnit.company_id.in_(_companies())),
        (BankAccount, BankAccount.company_id.in_(_companies())),
        (Payable, Payable.company_id.in_(_companies())),
        (PayableAdjustment, PayableAdjustment.payable_id.in_(payables)),
        (PayableAllocation, PayableAllocation.payable_id.in_(payables)),
        (PayableAttachment, PayableAttachment.payable_id.in_(payables)),
        (PayableEvent, PayableEvent.payable_id.in_(payables)),
        (PayableItem, PayableItem.payable_id.in_(payables)),
        (PayablePayment, PayablePayment.payable_id.in_(payables)),
        (ReceiptBatch, ReceiptBatch.payable_id.in_(payables)),
        (Receivable, Receivable.company_id.in_(_companies())),
        (ReceivableAdjustment, ReceivableAdjustment.receivable_id.in_(receivables)),
        (ReceivableAttachment, ReceivableAttachment.receivable_id.in_(receivables)),
        (ReceivableEvent, ReceivableEvent.receivable_id.in_(receivables)),
        (ReceivablePayment, ReceivablePayment.receivable_id.in_(receivables)),
        (BankStatement, BankStatement.bank_account_id.in_(accounts)),
        (BankTransaction, BankTransaction.bank_account_id.in_(accounts)),
        (BankReconciliation, BankReconciliation.bank_transaction_id.in_(lines)),
        (BankReconciliationEvent, BankReconciliationEvent.bank_transaction_id.in_(lines)),
        (PeriodClosing, PeriodClosing.company_id.in_(_companies())),
        (PeriodClosingEvent, PeriodClosingEvent.company_id.in_(_companies())),
    ]


@event.listens_for(Session, "do_orm_execute")
def _filter_by_company(state: ORMExecuteState) -> None:
    ids = state.session.info.get(_KEY)
    if ids is None or state.execution_options.get(_BYPASS):
        return
    _current.set(ids)
    state.update_execution_options(compiled_cache=None)
    # a recarga de um registro e as cargas de relação já levam o filtro da consulta de origem
    if state.is_column_load or state.is_relationship_load:
        return
    if state.is_select or state.is_update or state.is_delete:
        state.statement = state.statement.options(
            *[
                with_loader_criteria(model, criterion, include_aliases=True)
                for model, criterion in _criteria()
            ]
        )
