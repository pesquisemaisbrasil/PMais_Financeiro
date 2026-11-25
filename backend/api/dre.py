from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from api.payables import DbSession, FinanceUser
from core import xlsx
from core.limiter import limiter
from core.permissions import require_screen
from schemas.dre import DreReport
from services import dre
from services.payable import PayableInvalid

router = APIRouter(tags=["relatórios"], dependencies=[require_screen("dre")])

READ_LIMIT = "120/minute"
T = TypeVar("T")
Id = Annotated[int | None, Query(ge=1)]


def _handle(action: Callable[[], T]) -> T:
    try:
        return action()
    except PayableInvalid as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


def _filters(
    company: int | None, unit: int | None, project: int | None, center: int | None
) -> dre.Filters:
    return dre.Filters(company=company, unit=unit, project=project, cost_center=center)


@router.get(
    "/reports/dre",
    response_model=DreReport,
    description="DRE por competência: receitas, despesas e resultado por linha (grupo do plano de "
    "contas) e por mês, com as contas analíticas de cada linha. Filtra por empresa, unidade, "
    "projeto e centro de custo. Não altera nada",
)
@limiter.limit(READ_LIMIT)
def get_dre(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
    company: Id = None,
    unit: Id = None,
    project: Id = None,
    costCenter: Id = None,  # noqa: N803 (o nome da API, como nas outras rotas)
) -> dict[str, Any]:
    filters = _filters(company, unit, project, costCenter)
    return _handle(lambda: dre.report(db, start, end, filters))


@router.get(
    "/reports/dre/export",
    response_class=Response,
    description="O DRE em Excel (.xlsx), com o período e os filtros na primeira linha",
)
@limiter.limit(READ_LIMIT)
def export_dre(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
    company: Id = None,
    unit: Id = None,
    project: Id = None,
    costCenter: Id = None,  # noqa: N803
) -> Response:
    filters = _filters(company, unit, project, costCenter)
    content = _handle(lambda: dre.export_xlsx(db, start, end, filters))
    return Response(
        content,
        media_type=xlsx.MEDIA_TYPE,
        headers={
            "Content-Disposition": 'attachment; filename="dre.xlsx"',
            "Cache-Control": "no-store",
        },
    )
