from collections.abc import Callable
from datetime import date as Date
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError

from api.payables import DbSession, FinanceUser
from core.limiter import limiter
from schemas.holidays import BusinessDayOut, HolidayIn, HolidayOut, HolidaySyncOut
from services import holiday_sync
from services import holidays as holidays_service
from services.payable import PayableConflict, PayableInvalid
from services.records import RecordNotFound

router = APIRouter(tags=["feriados"])

READ_LIMIT = "120/minute"
WRITE_LIMIT = "60/minute"
SYNC_LIMIT = "10/minute"
UNAVAILABLE = (
    "Não foi possível buscar os feriados agora. Vale a tabela do sistema "
    "(feriados nacionais fixos e Páscoa) e os que você cadastrou."
)
T = TypeVar("T")


def _write(db: DbSession, action: Callable[[], T]) -> T:
    """Traduz as recusas em HTTP e volta atrás: nada fica pela metade."""
    try:
        return action()
    except RecordNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feriado não encontrado") from exc
    except holiday_sync.HolidaysUnavailable as exc:
        db.rollback()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, UNAVAILABLE) from exc
    except PayableConflict as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except PayableInvalid as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except IntegrityError as exc:
        # Dois pedidos ao mesmo tempo passam pela conferência, e o banco segura o segundo.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Esse feriado já está cadastrado") from exc


@router.get(
    "/holidays",
    response_model=list[HolidayOut],
    description="Os feriados cadastrados (nacionais da BrasilAPI e os locais), pela data",
)
@limiter.limit(READ_LIMIT)
def list_holidays(request: Request, db: DbSession, _: FinanceUser) -> list[dict[str, Any]]:
    return holidays_service.list_all(db)


@router.get(
    "/business-days/check",
    response_model=BusinessDayOut,
    description="Diz se a data é dia útil (fim de semana e feriado cadastrado não são) e, quando "
    "não é, o motivo e o dia útil anterior e o próximo. Serve ao aviso na hora de lançar. "
    "Não altera nada",
)
@limiter.limit(READ_LIMIT)
def check_business_day(
    request: Request, date: Annotated[Date, Query()], db: DbSession, _: FinanceUser
) -> dict[str, Any]:
    return _write(db, lambda: holidays_service.check_day(db, date))


@router.post(
    "/holidays",
    response_model=HolidayOut,
    status_code=status.HTTP_201_CREATED,
    description="Cadastra um feriado (nacional, estadual ou municipal). Passa a contar como dia "
    "não útil nos vencimentos calculados",
)
@limiter.limit(WRITE_LIMIT)
def create_holiday(
    request: Request, data: HolidayIn, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    return _write(db, lambda: holidays_service.create(db, data, user))


@router.delete(
    "/holidays/{holiday_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    description="Exclui um feriado cadastrado. Um nacional da BrasilAPI volta se for buscado "
    "de novo",
)
@limiter.limit(WRITE_LIMIT)
def delete_holiday(request: Request, holiday_id: int, db: DbSession, user: FinanceUser) -> None:
    _write(db, lambda: holidays_service.delete(db, holiday_id, user))


@router.post(
    "/holidays/sync",
    response_model=HolidaySyncOut,
    description="Busca os feriados nacionais do ano na BrasilAPI e acrescenta os que faltam",
)
@limiter.limit(SYNC_LIMIT)
def sync_holidays(request: Request, year: int, db: DbSession, user: FinanceUser) -> dict[str, int]:
    return _write(db, lambda: holidays_service.sync(db, year, user))
