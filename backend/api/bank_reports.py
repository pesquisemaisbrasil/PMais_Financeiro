from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from api.payables import DbSession, FinanceUser
from core import xlsx
from core.limiter import limiter
from core.permissions import require_screen
from schemas.bank_reports import Balances, Difference
from services import bank_reports
from services.payable import PayableInvalid
from services.records import RecordNotFound

router = APIRouter(
    tags=["conferência bancária"], dependencies=[require_screen("conferencia-bancaria")]
)

READ_LIMIT = "120/minute"
Month = Annotated[str, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="O mês, AAAA-MM")]


@router.get(
    "/bank-accounts/{account_id}/difference",
    response_model=Difference,
    description="As saídas do extrato contra as baixas do sistema no mês, por dia, com o que "
    "explica a diferença (saída sem par, baixa sem linha e volta de Pix). Não altera nada",
)
@limiter.limit(READ_LIMIT)
def difference(
    request: Request, account_id: int, month: Month, db: DbSession, _: FinanceUser
) -> dict[str, Any]:
    try:
        return bank_reports.difference(db, account_id, month)
    except RecordNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta bancária não encontrada") from exc
    except PayableInvalid as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.get(
    "/bank-accounts/{account_id}/difference/export",
    response_class=Response,
    description="O extrato × sistema do mês em Excel (.xlsx): uma linha por dia, com o total e o "
    "que explica a diferença na primeira linha",
)
@limiter.limit(READ_LIMIT)
def export_difference(
    request: Request, account_id: int, month: Month, db: DbSession, _: FinanceUser
) -> Response:
    try:
        content, filename = bank_reports.difference_xlsx(db, account_id, month)
    except RecordNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta bancária não encontrada") from exc
    except PayableInvalid as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    return Response(
        content,
        media_type=xlsx.MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/bank-balances",
    response_model=Balances,
    description="O saldo do mês de cada conta bancária e o consolidado: saldo inicial, entradas, "
    "saídas, saldo final pelo extrato e pelo que já foi conferido. Não altera nada",
)
@limiter.limit(READ_LIMIT)
def balances(request: Request, month: Month, db: DbSession, _: FinanceUser) -> dict[str, Any]:
    try:
        return bank_reports.balances(db, month)
    except PayableInvalid as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
