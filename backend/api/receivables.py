from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, TypeVar, get_args

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from core.limiter import limiter
from core.permissions import require_finance
from core.query_lists import parse_choices, parse_ids
from db.connection import get_db
from models.user import User
from schemas.payable import (
    PeriodMode,
    ReasonIn,
    SeriesCancel,
    SeriesCreated,
    SeriesEdit,
    SeriesResult,
)
from schemas.receivable import (
    DelinquentCustomer,
    ReceiptCreate,
    ReceiptReverse,
    ReceivableCreate,
    ReceivableDateField,
    ReceivableDetail,
    ReceivableIndicator,
    ReceivableList,
    ReceivableSituation,
    ReceivableSort,
    ReceivableUpdate,
    RecurringReceivableCreate,
)
from services import payable as payable_service
from services import receivable as receivable_service
from services import receivable_series
from services.auth import get_current_user

router = APIRouter(tags=["contas a receber"])

T = TypeVar("T")

# Por IP, e o escritório sai todo pelo mesmo: folga para várias pessoas no dia a dia.
READ_LIMIT = "120/minute"
WRITE_LIMIT = "60/minute"


def finance_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    require_finance(user)
    return user


DbSession = Annotated[Session, Depends(get_db)]
FinanceUser = Annotated[User, Depends(finance_user)]


def _handle(db: Session, action: Callable[[], T]) -> T:
    """Traduz as recusas do serviço em HTTP. A sessão volta atrás: nada fica pela metade."""
    try:
        return action()
    except payable_service.PayableNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Título não encontrado") from exc
    except payable_service.PayableConflict as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except payable_service.PayableInvalid as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


class ListParams:
    """Os mesmos filtros do Contas a pagar, com cliente no lugar de fornecedor."""

    def __init__(
        self,
        mode: PeriodMode = "dia",
        ref: date | None = None,
        start: date | None = None,
        end: date | None = None,
        dateField: ReceivableDateField = "vencimento",
        indicator: ReceivableIndicator = "total",
        # Cada filtro aceita mais de uma opção, separadas por vírgula: project=3,5
        customer: Annotated[str | None, Query(max_length=400)] = None,
        project: Annotated[str | None, Query(max_length=400)] = None,
        category: Annotated[str | None, Query(max_length=400)] = None,
        company: Annotated[str | None, Query(max_length=400)] = None,
        unit: Annotated[str | None, Query(max_length=400)] = None,
        costCenter: Annotated[str | None, Query(max_length=400)] = None,
        situation: Annotated[str | None, Query(max_length=400)] = None,
        search: Annotated[str | None, Query(max_length=100)] = None,
        sort: ReceivableSort = "vencimento",
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
            "filters": {
                "customer": parse_ids(customer),
                "project": parse_ids(project),
                "category": parse_ids(category),
                "company": parse_ids(company),
                "unit": parse_ids(unit),
                "costCenter": parse_ids(costCenter),
                "situation": parse_choices(situation, get_args(ReceivableSituation)),
            },
            "search": search,
            "sort": sort,
            "descending": descending,
        }


Params = Annotated[ListParams, Depends()]


@router.get(
    "/receivables", response_model=ReceivableList, description="Títulos a receber do período"
)
@limiter.limit(READ_LIMIT)
def list_receivables(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    params: Params,
    page: Annotated[int, Query(ge=1)] = 1,
) -> dict[str, Any]:
    return receivable_service.list_receivables(db, **params.values, page=page)


@router.get(
    "/receivables/delinquency",
    response_model=list[DelinquentCustomer],
    description="Inadimplência: títulos vencidos por cliente, com dias de atraso e total",
)
@limiter.limit(READ_LIMIT)
def delinquency(request: Request, db: DbSession, _: FinanceUser) -> list[dict[str, Any]]:
    return receivable_service.delinquency(db)


@router.get(
    "/receivables/export",
    response_class=Response,
    description="Os títulos dos filtros em CSV, com os filtros na primeira linha",
)
@limiter.limit(READ_LIMIT)
def export_receivables(request: Request, db: DbSession, _: FinanceUser, params: Params) -> Response:
    return Response(
        receivable_service.export_csv(db, **params.values),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="contas-a-receber.csv"',
            "Cache-Control": "no-store",
        },
    )


@router.post(
    "/receivables/recurrence",
    response_model=SeriesCreated,
    status_code=status.HTTP_201_CREATED,
    description="Parcela ou repete a receita: um título por ocorrência, todos ou nenhum",
)
@limiter.limit(WRITE_LIMIT)
def create_series(
    request: Request, data: RecurringReceivableCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    series, created = _handle(
        db,
        lambda: receivable_series.create_series(
            db, ReceivableCreate(**data.model_dump(exclude={"recurrence"})), data.recurrence, user
        ),
    )
    return {"seriesId": series.id, "ids": [r.id for r in created]}


@router.patch(
    "/receivables/{receivable_id}/series",
    response_model=SeriesResult,
    description="Muda valor ou descrição de só este, este e os seguintes ou todos em aberto",
)
@limiter.limit(WRITE_LIMIT)
def edit_series(
    request: Request, receivable_id: int, data: SeriesEdit, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _handle(db, lambda: receivable_series.edit_series(db, receivable_id, data, user))
    return {"count": count}


@router.post(
    "/receivables/{receivable_id}/series/cancel",
    response_model=SeriesResult,
    description="Cancela este e os seguintes, ou todos em aberto; quem já recebeu continua",
)
@limiter.limit(WRITE_LIMIT)
def cancel_series(
    request: Request, receivable_id: int, data: SeriesCancel, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _handle(db, lambda: receivable_series.cancel_series(db, receivable_id, data, user))
    return {"count": count}


@router.post(
    "/receivables",
    response_model=ReceivableDetail,
    status_code=status.HTTP_201_CREATED,
    description="Lança um título a receber",
)
@limiter.limit(WRITE_LIMIT)
def create_receivable(
    request: Request, data: ReceivableCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    receivable = _handle(db, lambda: receivable_service.create(db, data, user))
    return receivable_service.detail(db, receivable.id)


@router.get(
    "/receivables/{receivable_id}",
    response_model=ReceivableDetail,
    description="Um título, com recebimentos e histórico",
)
@limiter.limit(READ_LIMIT)
def read_receivable(
    request: Request, receivable_id: int, db: DbSession, _: FinanceUser
) -> dict[str, Any]:
    return _handle(db, lambda: receivable_service.detail(db, receivable_id))


@router.patch(
    "/receivables/{receivable_id}",
    response_model=ReceivableDetail,
    description="Muda valor, abatimentos, vencimento ou descrição",
)
@limiter.limit(WRITE_LIMIT)
def update_receivable(
    request: Request,
    receivable_id: int,
    data: ReceivableUpdate,
    db: DbSession,
    user: FinanceUser,
) -> dict[str, Any]:
    _handle(db, lambda: receivable_service.update(db, receivable_id, data, user))
    return receivable_service.detail(db, receivable_id)


@router.post(
    "/receivables/{receivable_id}/receipts",
    response_model=ReceivableDetail,
    description="Registra um recebimento, total ou parcial",
)
@limiter.limit(WRITE_LIMIT)
def receive(
    request: Request, receivable_id: int, data: ReceiptCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _handle(db, lambda: receivable_service.receive(db, receivable_id, data, user))
    return receivable_service.detail(db, receivable_id)


@router.post(
    "/receivables/{receivable_id}/receipts/{receipt_id}/reverse",
    response_model=ReceivableDetail,
    description="Estorna um recebimento: uma linha nova, a original continua no histórico",
)
@limiter.limit(WRITE_LIMIT)
def reverse_receipt(
    request: Request,
    receivable_id: int,
    receipt_id: int,
    data: ReceiptReverse,
    db: DbSession,
    user: FinanceUser,
) -> dict[str, Any]:
    _handle(db, lambda: receivable_service.reverse(db, receivable_id, receipt_id, data, user))
    return receivable_service.detail(db, receivable_id)


@router.post(
    "/receivables/{receivable_id}/cancel",
    response_model=ReceivableDetail,
    description="Cancela um título sem recebimento",
)
@limiter.limit(WRITE_LIMIT)
def cancel_receivable(
    request: Request, receivable_id: int, data: ReasonIn, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _handle(db, lambda: receivable_service.cancel(db, receivable_id, data.reason, user))
    return receivable_service.detail(db, receivable_id)


@router.delete(
    "/receivables/{receivable_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    description="Exclui (de forma lógica) um título sem recebimento",
)
@limiter.limit(WRITE_LIMIT)
def delete_receivable(
    request: Request, receivable_id: int, db: DbSession, user: FinanceUser
) -> Response:
    _handle(db, lambda: receivable_service.delete(db, receivable_id, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
