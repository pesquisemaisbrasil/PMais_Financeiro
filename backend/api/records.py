from collections.abc import Callable
from typing import Any, TypeVar

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError

from api.payables import DbSession, FinanceUser
from core.limiter import limiter
from schemas.payable import ProjectOut
from schemas.records import ActiveIn, ProjectIncentive, RecordIn, RecordKind, RecordOut
from services import records as records_service
from services.payable import PayableConflict, PayableInvalid

router = APIRouter(tags=["cadastros"])

READ_LIMIT = "120/minute"
WRITE_LIMIT = "60/minute"
T = TypeVar("T")


def _write(db: DbSession, action: Callable[[], T]) -> T:
    """Traduz as recusas em HTTP e volta atrás: nada fica pela metade."""
    try:
        return action()
    except records_service.RecordNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cadastro não encontrado") from exc
    except PayableConflict as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except PayableInvalid as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except IntegrityError as exc:
        # Dois pedidos ao mesmo tempo passam pela conferência, e o banco segura o segundo.
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Já existe um cadastro com esses dados"
        ) from exc


@router.get(
    "/records/{kind}",
    response_model=list[RecordOut],
    description="Lista um cadastro, com ativos e inativos",
)
@limiter.limit(READ_LIMIT)
def list_records(
    request: Request, kind: RecordKind, db: DbSession, _: FinanceUser
) -> list[dict[str, Any]]:
    return records_service.list_records(db, kind)


@router.post(
    "/records/{kind}",
    response_model=RecordOut,
    status_code=status.HTTP_201_CREATED,
    description="Cria um cadastro",
)
@limiter.limit(WRITE_LIMIT)
def create_record(
    request: Request, kind: RecordKind, data: RecordIn, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    return _write(db, lambda: records_service.create(db, kind, data, user))


@router.patch(
    "/records/{kind}/{record_id}",
    response_model=RecordOut,
    description="Altera um cadastro",
)
@limiter.limit(WRITE_LIMIT)
def update_record(
    request: Request,
    kind: RecordKind,
    record_id: int,
    data: RecordIn,
    db: DbSession,
    user: FinanceUser,
) -> dict[str, Any]:
    return _write(db, lambda: records_service.update(db, kind, record_id, data, user))


@router.post(
    "/records/{kind}/{record_id}/active",
    response_model=RecordOut,
    description="Inativa ou reativa um cadastro",
)
@limiter.limit(WRITE_LIMIT)
def set_record_active(
    request: Request,
    kind: RecordKind,
    record_id: int,
    data: ActiveIn,
    db: DbSession,
    user: FinanceUser,
) -> dict[str, Any]:
    return _write(db, lambda: records_service.set_active(db, kind, record_id, data.active, user))


@router.delete(
    "/records/{kind}/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    description="Exclui um cadastro sem lançamentos",
)
@limiter.limit(WRITE_LIMIT)
def delete_record(
    request: Request, kind: RecordKind, record_id: int, db: DbSession, user: FinanceUser
) -> Response:
    _write(db, lambda: records_service.delete(db, kind, record_id, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch(
    "/projects/{project_id}/incentive",
    response_model=ProjectOut,
    description="Marca o tipo do projeto, se tem incentivo e o prazo em dias úteis",
)
@limiter.limit(WRITE_LIMIT)
def update_project_incentive(
    request: Request, project_id: int, data: ProjectIncentive, db: DbSession, user: FinanceUser
) -> Any:
    return _write(db, lambda: records_service.update_project(db, project_id, data, user))
