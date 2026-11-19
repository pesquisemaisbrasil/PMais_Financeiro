from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from api.payables import DbSession, FinanceUser
from core.limiter import limiter
from core.permissions import require_screen
from schemas.tax_rates import TaxRateOut, TaxRatesIn
from services import tax_rates
from services.payable import PayableInvalid

CADASTROS = require_screen("cadastros")

router = APIRouter(tags=["impostos retidos"])

READ_LIMIT = "120/minute"
WRITE_LIMIT = "60/minute"


@router.get(
    "/tax-rates",
    response_model=list[TaxRateOut],
    description="Os percentuais dos impostos retidos que toda conta a pagar nova já traz, "
    "calculados sobre o valor principal",
)
@limiter.limit(READ_LIMIT)
def list_tax_rates(request: Request, db: DbSession, _: FinanceUser) -> list[dict[str, Any]]:
    return tax_rates.list_rates(db)


@router.put(
    "/tax-rates",
    dependencies=[CADASTROS],
    response_model=list[TaxRateOut],
    description="Troca os percentuais. Vale para as contas novas daqui para frente; as já "
    "lançadas não mudam, e a troca fica no histórico",
)
@limiter.limit(WRITE_LIMIT)
def update_tax_rates(
    request: Request, body: TaxRatesIn, db: DbSession, user: FinanceUser
) -> list[dict[str, Any]]:
    try:
        return tax_rates.update_rates(db, body.rates, user)
    except PayableInvalid as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
