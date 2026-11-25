from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, Literal, TypeVar

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from api.payables import DbSession, FinanceUser
from core import xlsx
from core.limiter import limiter
from core.permissions import require_screen
from schemas.cash_flow import CashFlowDetail, CashFlowReport
from services import cash_flow
from services.payable import PayableInvalid

router = APIRouter(tags=["relatórios"], dependencies=[require_screen("fluxo-de-caixa")])

READ_LIMIT = "120/minute"
Group = Literal["dia", "semana", "mes"]
T = TypeVar("T")


def _handle(action: Callable[[], T]) -> T:
    try:
        return action()
    except PayableInvalid as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@router.get(
    "/reports/cash-flow",
    response_model=CashFlowReport,
    description="Fluxo de caixa: previsto (títulos em aberto, pelo vencimento) × realizado "
    "(baixas e recebimentos, pela data do dinheiro) por dia, semana ou mês, com o saldo projetado "
    "e o realizado de cada conta bancária. Não altera nada",
)
@limiter.limit(READ_LIMIT)
def get_cash_flow(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
    group: Annotated[Group, Query()] = "semana",
) -> dict[str, Any]:
    return _handle(lambda: cash_flow.report(db, start, end, group))


@router.get(
    "/reports/cash-flow/detail",
    response_model=CashFlowDetail,
    description="O que compõe um período do fluxo de caixa: os títulos em aberto que vencem nele "
    "e as baixas e os recebimentos feitos nele",
)
@limiter.limit(READ_LIMIT)
def get_cash_flow_detail(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
) -> dict[str, Any]:
    return _handle(lambda: cash_flow.detail(db, start, end))


@router.get(
    "/reports/cash-flow/export",
    response_class=Response,
    description="O fluxo de caixa em Excel (.xlsx), com o período e o saldo inicial na "
    "primeira linha",
)
@limiter.limit(READ_LIMIT)
def export_cash_flow(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
    group: Annotated[Group, Query()] = "semana",
) -> Response:
    content = _handle(lambda: cash_flow.export_xlsx(db, start, end, group))
    return Response(
        content,
        media_type=xlsx.MEDIA_TYPE,
        headers={
            "Content-Disposition": 'attachment; filename="fluxo-de-caixa.xlsx"',
            "Cache-Control": "no-store",
        },
    )
