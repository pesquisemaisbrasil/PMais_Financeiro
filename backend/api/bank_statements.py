from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.exc import IntegrityError

from api.payables import DbSession, FinanceUser
from core.limiter import limiter
from core.statement import UNREADABLE, StatementError
from schemas.bank_statement import (
    StatementOut,
    StatementPreview,
    StatementResult,
    TransactionList,
)
from services import bank_statement
from services.payable import PayableConflict, PayableInvalid
from services.records import RecordNotFound

router = APIRouter(tags=["extratos"])

READ_LIMIT = "120/minute"
WRITE_LIMIT = "30/minute"
# Um extrato de um mês cabe em poucas centenas de KB: 5 MB cobre um ano inteiro
MAX_BYTES = 5 * 1024 * 1024
T = TypeVar("T")


def _handle(db: DbSession, action: Callable[[], T]) -> T:
    """Traduz as recusas em HTTP e volta atrás: nada fica pela metade."""
    try:
        return action()
    except RecordNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta bancária não encontrada") from exc
    except StatementError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except PayableConflict as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except PayableInvalid as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except IntegrityError as exc:
        # O banco segura o segundo de dois envios ao mesmo tempo
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Esse extrato acabou de ser importado por outra pessoa. Confira e tente de novo",
        ) from exc


def _upload(file: UploadFile) -> tuple[str, bytes]:
    """O nome e o conteúdo, sem ler mais do que o limite."""
    content = file.file.read(MAX_BYTES + 1)
    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, UNREADABLE)
    if len(content) > MAX_BYTES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "O extrato passa de 5 MB — importe por períodos menores",
        )
    return file.filename or "", content


@router.post(
    "/bank-accounts/{account_id}/statements/preview",
    response_model=StatementPreview,
    description="Confere o extrato (OFX ou CSV) contra a conta: linhas novas, repetidas, período e "
    "totais. Não grava nada",
)
@limiter.limit(WRITE_LIMIT)
def preview_statement(
    request: Request, account_id: int, file: UploadFile, db: DbSession, _: FinanceUser
) -> dict[str, Any]:
    content = _upload(file)[1]
    return _handle(db, lambda: bank_statement.preview(db, account_id, content))


@router.post(
    "/bank-accounts/{account_id}/statements",
    response_model=StatementResult,
    status_code=status.HTTP_201_CREATED,
    description="Importa o extrato: grava só as linhas novas, e reimportar o mesmo extrato não "
    "duplica. O arquivo não fica guardado",
)
@limiter.limit(WRITE_LIMIT)
def import_statement(
    request: Request, account_id: int, file: UploadFile, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    filename, content = _upload(file)
    return _handle(db, lambda: bank_statement.confirm(db, account_id, filename, content, user))


@router.get(
    "/bank-accounts/{account_id}/statements",
    response_model=list[StatementOut],
    description="As últimas importações de extrato da conta",
)
@limiter.limit(READ_LIMIT)
def list_statements(
    request: Request, account_id: int, db: DbSession, _: FinanceUser
) -> list[dict[str, Any]]:
    return _handle(db, lambda: bank_statement.list_statements(db, account_id))


@router.get(
    "/bank-accounts/{account_id}/transactions",
    response_model=TransactionList,
    description="As linhas do extrato da conta, com o total de entradas e saídas do período",
)
@limiter.limit(READ_LIMIT)
def list_transactions(
    request: Request,
    account_id: int,
    db: DbSession,
    _: FinanceUser,
    start: Annotated[date | None, Query(alias="from")] = None,
    end: Annotated[date | None, Query(alias="to")] = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
) -> dict[str, Any]:
    return _handle(db, lambda: bank_statement.list_transactions(db, account_id, start, end, page))
