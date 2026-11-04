from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from core.permissions import require_finance
from db.connection import get_db
from models.user import User
from schemas.payable import (
    BatchIds,
    BatchPaymentCreate,
    HomeSummary,
    Indicator,
    PayableCreate,
    PayableDetail,
    PayableList,
    PayableUpdate,
    PaymentCreate,
    PaymentReverse,
    PeriodMode,
    ReasonIn,
    Reference,
    SortColumn,
    Tab,
)
from services import payable as payable_service
from services.auth import get_current_user

router = APIRouter(tags=["contas a pagar"])

T = TypeVar("T")


def finance_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    require_finance(user)
    return user


DbSession = Annotated[Session, Depends(get_db)]
FinanceUser = Annotated[User, Depends(finance_user)]


def _handle(action: Callable[[], T]) -> T:
    """Traduz as recusas do serviço em HTTP. A sessão volta atrás: nada fica pela metade."""
    try:
        return action()
    except payable_service.PayableNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada") from exc
    except payable_service.PayableConflict as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except payable_service.PayableInvalid as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


def _in_transaction(db: Session, action: Callable[[], T]) -> T:
    try:
        return _handle(action)
    except HTTPException:
        db.rollback()
        raise


@router.get("/home", response_model=HomeSummary)
def home(db: DbSession, _: FinanceUser) -> dict[str, Any]:
    return payable_service.home_summary(db)


@router.get("/reference", response_model=Reference)
def reference(db: DbSession, _: FinanceUser) -> dict[str, Any]:
    return payable_service.reference(db)


@router.get("/payables", response_model=PayableList)
def list_payables(
    db: DbSession,
    _: FinanceUser,
    mode: PeriodMode = "dia",
    ref: date | None = None,
    indicator: Indicator = "total",
    tab: Tab = "todas",
    supplier: int | None = None,
    project: int | None = None,
    category: int | None = None,
    company: int | None = None,
    costCenter: int | None = None,
    paymentMethod: int | None = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    sort: SortColumn = "vencimento",
    descending: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
) -> dict[str, Any]:
    return payable_service.list_payables(
        db,
        mode=mode,
        ref=ref,
        indicator=indicator,
        tab=tab,
        filters={
            "supplier": supplier,
            "project": project,
            "category": category,
            "company": company,
            "costCenter": costCenter,
            "paymentMethod": paymentMethod,
        },
        search=search,
        sort=sort,
        descending=descending,
        page=page,
    )


@router.post("/payables", response_model=PayableDetail, status_code=status.HTTP_201_CREATED)
def create_payable(data: PayableCreate, db: DbSession, user: FinanceUser) -> dict[str, Any]:
    payable = _in_transaction(db, lambda: payable_service.create(db, data, user))
    return payable_service.detail(db, payable.id)


@router.post("/payables/batch/payments")
def pay_batch(data: BatchPaymentCreate, db: DbSession, user: FinanceUser) -> dict[str, Any]:
    total = _in_transaction(db, lambda: payable_service.pay_batch(db, data, user))
    return {"total": total, "count": len(set(data.ids))}


@router.post("/payables/batch/delete")
def delete_batch(data: BatchIds, db: DbSession, user: FinanceUser) -> dict[str, int]:
    count = _in_transaction(db, lambda: payable_service.delete_batch(db, data.ids, user))
    return {"count": count}


@router.get("/payables/{payable_id}", response_model=PayableDetail)
def get_payable(payable_id: int, db: DbSession, _: FinanceUser) -> dict[str, Any]:
    return _handle(lambda: payable_service.detail(db, payable_id))


@router.patch("/payables/{payable_id}", response_model=PayableDetail)
def update_payable(
    payable_id: int, data: PayableUpdate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(db, lambda: payable_service.update(db, payable_id, data, user))
    return payable_service.detail(db, payable_id)


@router.post("/payables/{payable_id}/cancel", response_model=PayableDetail)
def cancel_payable(
    payable_id: int, data: ReasonIn, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(db, lambda: payable_service.cancel(db, payable_id, data.reason, user))
    return payable_service.detail(db, payable_id)


@router.post("/payables/{payable_id}/payments", response_model=PayableDetail)
def pay_payable(
    payable_id: int, data: PaymentCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(db, lambda: payable_service.pay(db, payable_id, data, user))
    return payable_service.detail(db, payable_id)


@router.post("/payables/{payable_id}/payments/{payment_id}/reverse", response_model=PayableDetail)
def reverse_payment(
    payable_id: int, payment_id: int, data: PaymentReverse, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(
        db, lambda: payable_service.reverse_payment(db, payable_id, payment_id, data, user)
    )
    return payable_service.detail(db, payable_id)
