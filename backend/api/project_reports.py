from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Request, status

from api.payables import DbSession, FinanceUser
from core.limiter import limiter
from schemas.project_report import ProjectReport, ProjectSummary
from services import project_report

router = APIRouter(tags=["relatórios"])

READ_LIMIT = "120/minute"


@router.get(
    "/reports/projects",
    response_model=list[ProjectSummary],
    description="Os projetos com o total lançado, pago e a pagar de cada um",
)
@limiter.limit(READ_LIMIT)
def list_project_reports(request: Request, db: DbSession, _: FinanceUser) -> list[dict[str, Any]]:
    return project_report.list_projects(db)


@router.get(
    "/reports/projects/{code}",
    response_model=ProjectReport,
    description="Relatório do projeto: lançado, pago, a pagar, a parte dele em cada conta e os "
    "documentos de todos os lançamentos. Não altera nada",
)
@limiter.limit(READ_LIMIT)
def get_project_report(
    request: Request, code: Annotated[str, Path(max_length=20)], db: DbSession, _: FinanceUser
) -> dict[str, Any]:
    try:
        return project_report.report(db, code)
    except project_report.ProjectNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projeto não encontrado") from exc
