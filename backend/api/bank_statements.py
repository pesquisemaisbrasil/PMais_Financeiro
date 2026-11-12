from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, Literal, TypeVar

from fastapi import APIRouter, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError

from api.payables import DbSession, FinanceUser
from core.limiter import limiter
from core.statement import UNREADABLE, StatementError
from schemas.bank_reconciliation import (
    ExceptionIn,
    ReconcileIn,
    SuggestionOut,
    UndoIn,
)
from schemas.bank_statement import (
    StatementOut,
    StatementPreview,
    StatementResult,
    TransactionList,
)
from services import bank_reconciliation, bank_statement
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
    except bank_reconciliation.TransactionNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Linha do extrato não encontrada") from exc
    except bank_reconciliation.TargetNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lançamento não encontrado") from exc
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
    situation: Annotated[Literal["pendente", "conciliada", "excecao"] | None, Query()] = None,
) -> dict[str, Any]:
    def listing() -> dict[str, Any]:
        result = bank_statement.list_transactions(db, account_id, start, end, page, situation)
        bank_reconciliation.attach_reconciliations(db, result["items"])
        return result

    return _handle(db, listing)


@router.get(
    "/bank-transactions/{transaction_id}/suggestions",
    response_model=list[SuggestionOut],
    description="Lançamentos com baixa na mesma conta, de valor igual e até 3 dias da linha, do "
    "mais ao menos provável. Não altera nada",
)
@limiter.limit(READ_LIMIT)
def suggestions(
    request: Request, transaction_id: int, db: DbSession, _: FinanceUser
) -> list[dict[str, Any]]:
    return _handle(db, lambda: bank_reconciliation.suggestions(db, transaction_id))


@router.post(
    "/bank-transactions/{transaction_id}/reconcile",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    description="Concilia a linha do extrato com um lançamento (e a pessoa dele, se tiver itens), "
    "com a classificação. As linhas de um lançamento nunca passam do valor dele",
)
@limiter.limit(WRITE_LIMIT)
def reconcile(
    request: Request, transaction_id: int, body: ReconcileIn, db: DbSession, user: FinanceUser
) -> Response:
    _handle(db, lambda: bank_reconciliation.reconcile(db, transaction_id, body, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/bank-transactions/{transaction_id}/exception",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    description="Marca a linha do extrato como exceção, com o motivo (conta como conciliada)",
)
@limiter.limit(WRITE_LIMIT)
def mark_exception(
    request: Request, transaction_id: int, body: ExceptionIn, db: DbSession, user: FinanceUser
) -> Response:
    _handle(db, lambda: bank_reconciliation.mark_exception(db, transaction_id, body, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/bank-transactions/{transaction_id}/undo",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    description="Desfaz a conciliação ou a exceção da linha. Pede o motivo, e o histórico guarda "
    "quem desfez",
)
@limiter.limit(WRITE_LIMIT)
def undo_reconciliation(
    request: Request, transaction_id: int, body: UndoIn, db: DbSession, user: FinanceUser
) -> Response:
    _handle(db, lambda: bank_reconciliation.undo(db, transaction_id, body.reason, user))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
