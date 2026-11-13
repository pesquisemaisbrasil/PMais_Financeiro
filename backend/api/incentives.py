from typing import Any

from fastapi import APIRouter, Request

from api.payables import DbSession, FinanceUser, Params
from core.limiter import limiter
from schemas.incentives import IncentiveAgenda
from services import incentives

router = APIRouter(tags=["incentivos"])

READ_LIMIT = "120/minute"


@router.get(
    "/incentives/agenda",
    response_model=IncentiveAgenda,
    description="Os incentivos por data de vencimento, com as pessoas de cada lançamento e a "
    "situação (a vencer, hoje, vencido, pago). Usa o mesmo período do Contas a pagar. "
    "Não altera nada",
)
@limiter.limit(READ_LIMIT)
def incentive_agenda(
    request: Request, db: DbSession, _: FinanceUser, params: Params
) -> dict[str, Any]:
    values = params.values
    return incentives.agenda(
        db, mode=values["mode"], ref=values["ref"], custom_range=values["custom_range"]
    )
