from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from api.payables import DbSession, FinanceUser
from core import xlsx
from core.limiter import limiter
from core.permissions import require_screen
from schemas.dre import DreReport, DreStatement
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
    response_model=DreStatement,
    description="DRE por competência: as linhas com os subtotais (receita líquida, lucro bruto, "
    "resultado operacional e resultado do período) por mês, com os grupos e as contas de cada "
    "linha, e o que fica fora do resultado. Filtra por empresa, unidade, projeto e centro de "
    "custo. Não altera nada",
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
    return _handle(lambda: dre.statement(db, start, end, filters))


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
    return _xlsx(content, "dre.xlsx")


def _xlsx(content: bytes, filename: str) -> Response:
    return Response(
        content,
        media_type=xlsx.MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# O fluxo mensal é o mesmo quadro pelo mês do pagamento, numa tela que se bloqueia à parte
monthly_router = APIRouter(tags=["relatórios"], dependencies=[require_screen("fluxo-mensal")])


@monthly_router.get(
    "/reports/monthly-flow",
    response_model=DreReport,
    description="Fluxo mensal: entradas e saídas por mês do pagamento e por grupo do plano de "
    "contas, com as baixas e os recebimentos que valem nas contas do fluxo de caixa. Filtra por "
    "empresa, unidade, projeto e centro de custo. Não altera nada",
)
@limiter.limit(READ_LIMIT)
def get_monthly_flow(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    start: Annotated[date, Query()],
    end: Annotated[date, Query()],
    company: Id = None,
    unit: Id = None,
    project: Id = None,
    costCenter: Id = None,  # noqa: N803
) -> dict[str, Any]:
    filters = _filters(company, unit, project, costCenter)
    return _handle(lambda: dre.report(db, start, end, filters))


@monthly_router.get(
    "/reports/monthly-flow/export",
    response_class=Response,
    description="O fluxo mensal em Excel (.xlsx), com o período e os filtros na primeira linha",
)
@limiter.limit(READ_LIMIT)
def export_monthly_flow(
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
    content = _handle(lambda: dre.export_xlsx(db, start, end, filters, "caixa"))
    return _xlsx(content, "fluxo-mensal.xlsx")
