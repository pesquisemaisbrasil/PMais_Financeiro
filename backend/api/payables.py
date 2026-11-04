from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from core.limiter import limiter
from core.permissions import require_finance
from db.connection import get_db
from models.user import User
from schemas.payable import (
    BatchCount,
    BatchDeleteResult,
    BatchIds,
    BatchPaymentCreate,
    BatchPaymentResult,
    BatchReclassify,
    DateField,
    HomeSummary,
    Indicator,
    KindFilter,
    PayableCreate,
    PayableDetail,
    PayableList,
    PayableUpdate,
    PaymentCreate,
    PaymentReverse,
    PeriodMode,
    ProvisionReplace,
    ReasonIn,
    Reference,
    ReplacementCandidate,
    SituationFilter,
    SortColumn,
    Tab,
)
from services import payable as payable_service
from services.auth import get_current_user

router = APIRouter(tags=["contas a pagar"])

T = TypeVar("T")

# Por IP, e o escritório sai todo pelo mesmo: folga para várias pessoas no dia a dia.
READ_LIMIT = "120/minute"
WRITE_LIMIT = "60/minute"


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


@router.get("/home", response_model=HomeSummary, description="Resumo da tela Início")
@limiter.limit(READ_LIMIT)
def home(request: Request, db: DbSession, _: FinanceUser) -> dict[str, Any]:
    return payable_service.home_summary(db)


@router.get("/reference", response_model=Reference, description="Cadastros ativos")
@limiter.limit(READ_LIMIT)
def reference(request: Request, db: DbSession, _: FinanceUser) -> dict[str, Any]:
    return payable_service.reference(db)


class ListParams:
    """Os mesmos filtros valem para a lista e para a exportação."""

    def __init__(
        self,
        mode: PeriodMode = "dia",
        ref: date | None = None,
        start: date | None = None,
        end: date | None = None,
        dateField: DateField = "vencimento",
        indicator: Indicator = "total",
        tab: Tab = "todas",
        supplier: int | None = None,
        project: int | None = None,
        category: int | None = None,
        company: int | None = None,
        unit: int | None = None,
        costCenter: int | None = None,
        paymentMethod: int | None = None,
        situation: SituationFilter | None = None,
        kind: KindFilter | None = None,
        search: Annotated[str | None, Query(max_length=100)] = None,
        sort: SortColumn = "vencimento",
        descending: bool = False,
    ) -> None:
        if any(day and not 2000 <= day.year <= 2100 for day in (ref, start, end)):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Data fora do intervalo aceito"
            )
        if mode == "periodo" and (not start or not end):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha a data inicial e a data final"
            )
        if mode == "periodo" and start and end and start > end:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "A data inicial precisa ser igual ou anterior à data final",
            )
        self.values: dict[str, Any] = {
            "mode": mode,
            "ref": ref,
            "custom_range": (start, end) if mode == "periodo" and start and end else None,
            "date_field": dateField,
            "indicator": indicator,
            "tab": tab,
            "filters": {
                "supplier": supplier,
                "project": project,
                "category": category,
                "company": company,
                "unit": unit,
                "costCenter": costCenter,
                "paymentMethod": paymentMethod,
                "situation": situation,
                "kind": kind,
            },
            "search": search,
            "sort": sort,
            "descending": descending,
        }


Params = Annotated[ListParams, Depends()]


@router.get("/payables", response_model=PayableList, description="Contas do período, com totais")
@limiter.limit(READ_LIMIT)
def list_payables(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    params: Params,
    page: Annotated[int, Query(ge=1)] = 1,
) -> dict[str, Any]:
    return payable_service.list_payables(db, **params.values, page=page)


@router.get(
    "/payables/export",
    response_class=Response,
    description="As contas dos filtros em CSV, com os filtros na primeira linha",
)
@limiter.limit(READ_LIMIT)
def export_payables(request: Request, db: DbSession, _: FinanceUser, params: Params) -> Response:
    return Response(
        payable_service.export_csv(db, **params.values),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="contas-a-pagar.csv"',
            "Cache-Control": "no-store",
        },
    )


@router.post(
    "/payables",
    response_model=PayableDetail,
    status_code=status.HTTP_201_CREATED,
    description="Lança uma conta",
)
@limiter.limit(WRITE_LIMIT)
def create_payable(
    request: Request, data: PayableCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    payable = _in_transaction(db, lambda: payable_service.create(db, data, user))
    return payable_service.detail(db, payable.id)


@router.post(
    "/payables/batch/payments",
    response_model=BatchPaymentResult,
    description="Baixa o pendente de várias contas, tudo ou nada",
)
@limiter.limit(WRITE_LIMIT)
def pay_batch(
    request: Request, data: BatchPaymentCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    total = _in_transaction(db, lambda: payable_service.pay_batch(db, data, user))
    return {"total": total, "count": len(set(data.ids))}


@router.post(
    "/payables/batch/reclassify",
    response_model=BatchCount,
    description="Muda projeto, categoria ou centro de custo de várias contas",
)
@limiter.limit(WRITE_LIMIT)
def reclassify_batch(
    request: Request, data: BatchReclassify, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _in_transaction(db, lambda: payable_service.reclassify_batch(db, data, user))
    return {"count": count}


@router.post(
    "/payables/batch/duplicate",
    response_model=BatchCount,
    description="Copia as contas para o mês seguinte",
)
@limiter.limit(WRITE_LIMIT)
def duplicate_batch(
    request: Request, data: BatchIds, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _in_transaction(db, lambda: payable_service.duplicate_batch(db, data.ids, user))
    return {"count": count}


@router.post(
    "/payables/batch/delete",
    response_model=BatchDeleteResult,
    description="Exclui contas sem baixa; o histórico fica",
)
@limiter.limit(WRITE_LIMIT)
def delete_batch(
    request: Request, data: BatchIds, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _in_transaction(db, lambda: payable_service.delete_batch(db, data.ids, user))
    return {"count": count}


@router.get("/payables/{payable_id}", response_model=PayableDetail, description="Detalhe da conta")
@limiter.limit(READ_LIMIT)
def get_payable(request: Request, payable_id: int, db: DbSession, _: FinanceUser) -> dict[str, Any]:
    return _handle(lambda: payable_service.detail(db, payable_id))


@router.patch(
    "/payables/{payable_id}",
    response_model=PayableDetail,
    description="Altera descrição, valor e vencimento",
)
@limiter.limit(WRITE_LIMIT)
def update_payable(
    request: Request, payable_id: int, data: PayableUpdate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(db, lambda: payable_service.update(db, payable_id, data, user))
    return payable_service.detail(db, payable_id)


@router.get(
    "/payables/{payable_id}/replacement-candidates",
    response_model=list[ReplacementCandidate],
    description="Contas já lançadas que podem substituir a provisão",
)
@limiter.limit(READ_LIMIT)
def replacement_candidates(
    request: Request, payable_id: int, db: DbSession, _: FinanceUser
) -> list[dict[str, Any]]:
    provision = _handle(lambda: payable_service.get_open_provision(db, payable_id))
    return [
        {
            "id": c.id,
            "description": c.description,
            "payee": payable_service.payee_name(c),
            "amount": c.amount,
        }
        for c in payable_service.replacement_candidates(db, provision)
    ]


@router.post(
    "/payables/{payable_id}/replace",
    response_model=PayableDetail,
    description="Troca a provisão pelo lançamento real",
)
@limiter.limit(WRITE_LIMIT)
def replace_provision(
    request: Request, payable_id: int, data: ProvisionReplace, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    payable = _in_transaction(
        db, lambda: payable_service.replace_provision(db, payable_id, data, user)
    )
    return payable_service.detail(db, payable.id)


@router.post(
    "/payables/{payable_id}/cancel",
    response_model=PayableDetail,
    description="Cancela uma conta sem baixa",
)
@limiter.limit(WRITE_LIMIT)
def cancel_payable(
    request: Request, payable_id: int, data: ReasonIn, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(db, lambda: payable_service.cancel(db, payable_id, data.reason, user))
    return payable_service.detail(db, payable_id)


@router.post(
    "/payables/{payable_id}/payments",
    response_model=PayableDetail,
    description="Dá baixa, total ou parcial",
)
@limiter.limit(WRITE_LIMIT)
def pay_payable(
    request: Request, payable_id: int, data: PaymentCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(db, lambda: payable_service.pay(db, payable_id, data, user))
    return payable_service.detail(db, payable_id)


@router.post(
    "/payables/{payable_id}/payments/{payment_id}/reverse",
    response_model=PayableDetail,
    description="Anula uma baixa por estorno ou Pix devolvido",
)
@limiter.limit(WRITE_LIMIT)
def reverse_payment(
    request: Request,
    payable_id: int,
    payment_id: int,
    data: PaymentReverse,
    db: DbSession,
    user: FinanceUser,
) -> dict[str, Any]:
    _in_transaction(
        db, lambda: payable_service.reverse_payment(db, payable_id, payment_id, data, user)
    )
    return payable_service.detail(db, payable_id)
