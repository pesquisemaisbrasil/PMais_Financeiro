from collections.abc import Callable
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, HTTPException, Path, Query, Request, Response, status
from sqlalchemy.exc import IntegrityError

from api.payables import DbSession, FinanceUser
from core import xlsx
from core.limiter import limiter
from schemas.period_closing import ClosingStatus, ReopenIn
from services import period_closing
from services.payable import PayableConflict, PayableInvalid
from services.records import RecordNotFound

router = APIRouter(tags=["fechamento do mês"])

READ_LIMIT = "120/minute"
WRITE_LIMIT = "30/minute"
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"
MonthQuery = Annotated[str, Query(pattern=MONTH_PATTERN, description="O mês, AAAA-MM")]
MonthPath = Annotated[str, Path(pattern=MONTH_PATTERN, description="O mês, AAAA-MM")]
T = TypeVar("T")


def _handle(db: DbSession, action: Callable[[], T]) -> T:
    """Traduz as recusas em HTTP e volta atrás: nada fica pela metade."""
    try:
        return action()
    except RecordNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Empresa não encontrada") from exc
    except period_closing.NotAdmin as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Só um administrador pode reabrir um período fechado"
        ) from exc
    except PayableConflict as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except PayableInvalid as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except IntegrityError as exc:
        # Dois fechamentos ao mesmo tempo: o banco segura o segundo
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse mês já está fechado") from exc


@router.get(
    "/period-closings",
    response_model=ClosingStatus,
    description="Cada empresa com conta bancária no mês: fechada ou não e o que falta para fechar "
    "(extrato não importado, linhas sem conciliar ou sem classificação), e os meses já fechados",
)
@limiter.limit(READ_LIMIT)
def closing_status(
    request: Request, month: MonthQuery, db: DbSession, _: FinanceUser
) -> dict[str, Any]:
    return _handle(db, lambda: period_closing.status(db, month))


@router.post(
    "/period-closings/{company_id}/{month}/close",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    description="Fecha o mês da empresa. Exige extrato de cada conta ativa e todas as linhas "
    "conciliadas (a exceção conta) e classificadas. Fechado, ninguém dá baixa, estorna, recebe "
    "nem lança com data daquele mês",
)
@limiter.limit(WRITE_LIMIT)
def close_month(
    request: Request, company_id: int, month: MonthPath, db: DbSession, user: FinanceUser
) -> Response:
    _handle(db, lambda: period_closing.close(db, company_id, month, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/period-closings/{company_id}/{month}/reopen",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    description="Reabre o mês fechado. Só administrador, com motivo; o histórico guarda quem e "
    "por quê",
)
@limiter.limit(WRITE_LIMIT)
def reopen_month(
    request: Request,
    company_id: int,
    month: MonthPath,
    body: ReopenIn,
    db: DbSession,
    user: FinanceUser,
) -> Response:
    _handle(db, lambda: period_closing.reopen(db, company_id, month, body.reason, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/period-closings/{company_id}/{month}/sheet",
    response_class=Response,
    description="A planilha da contabilidade do mês (Excel): uma linha por transação do extrato, "
    "com classificação, número e emissão da NF e o lançamento. Cada download fica no histórico",
)
@limiter.limit(READ_LIMIT)
def accounting_sheet(
    request: Request, company_id: int, month: MonthPath, db: DbSession, user: FinanceUser
) -> Response:
    content, filename = _handle(db, lambda: period_closing.sheet(db, company_id, month, user))
    return Response(
        content,
        media_type=xlsx.MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
