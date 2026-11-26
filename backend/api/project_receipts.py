from typing import Annotated, Any

from fastapi import APIRouter, Query, Request, Response

from api.dre import READ_LIMIT, Id, _handle, _xlsx
from api.payables import DbSession, FinanceUser
from core.limiter import limiter
from core.permissions import require_screen
from schemas.project_receipts import ProjectReceiptsReport
from services import project_receipts

router = APIRouter(tags=["relatórios"], dependencies=[require_screen("recebimentos-projetos")])


@router.get(
    "/reports/project-receipts",
    response_model=ProjectReceiptsReport,
    description="Recebimentos de projetos × ano: o que entrou de cada projeto em cada mês do ano, "
    "pelo dia do recebimento, nas contas do fluxo de caixa. Filtra por empresa. Não altera nada",
)
@limiter.limit(READ_LIMIT)
def get_project_receipts(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    year: Annotated[int, Query()],
    company: Id = None,
) -> dict[str, Any]:
    return _handle(lambda: project_receipts.report(db, year, company))


@router.get(
    "/reports/project-receipts/export",
    response_class=Response,
    description="Os recebimentos de projetos × ano em Excel (.xlsx), com a linha de total",
)
@limiter.limit(READ_LIMIT)
def export_project_receipts(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    year: Annotated[int, Query()],
    company: Id = None,
) -> Response:
    content = _handle(lambda: project_receipts.export_xlsx(db, year, company))
    return _xlsx(content, f"recebimentos-de-projetos-{year}.xlsx")
