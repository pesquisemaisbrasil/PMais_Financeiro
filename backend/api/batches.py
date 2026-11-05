from collections.abc import Callable
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from core.limiter import limiter
from core.permissions import require_finance
from db.connection import get_db
from models.user import User
from schemas.receipt import (
    BatchCreate,
    BatchDetail,
    BatchProgress,
    BatchSummary,
    DiscardIn,
    PartResult,
    ReceiptItem,
)
from services import batches
from services.auth import get_current_user
from services.connect_gateway import ConnectGateway, ConnectUnavailable, get_connect

router = APIRouter(prefix="/projects/{project_id}/finance", tags=["comprovantes"])

T = TypeVar("T")

MAX_PART_BYTES = 25 * 1024 * 1024

NOT_FOUND = {
    batches.ProjectNotFound: "Projeto não encontrado",
    batches.BatchNotFound: "Envio de comprovantes não encontrado",
    batches.ReceiptNotFound: "Comprovante não encontrado",
}
CONFIRMED = "Esse envio já foi confirmado e não pode mais ser alterado"
CONNECT_DOWN = "O P+ Connect não respondeu — tente de novo em alguns minutos"


def finance_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    require_finance(user)
    return user


DbSession = Annotated[Session, Depends(get_db)]
FinanceUser = Annotated[User, Depends(finance_user)]
Connect = Annotated[ConnectGateway, Depends(get_connect)]


def _handle(db: Session, action: Callable[[], T]) -> T:
    """Exceção de domínio vira resposta com mensagem em pt-BR; nada fica pela metade."""
    try:
        return action()
    except tuple(NOT_FOUND) as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND[type(exc)]) from exc
    except batches.BatchAlreadyConfirmed as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, CONFIRMED) from exc
    except batches.PartOutOfRange as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Parte fora do intervalo deste envio"
        ) from exc
    except ConnectUnavailable as exc:
        db.rollback()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, CONNECT_DOWN) from exc


@router.post(
    "/receipt-batches",
    response_model=BatchProgress,
    status_code=status.HTTP_201_CREATED,
    description="Abre o envio de um PDF de comprovantes, que sobe em partes",
)
@limiter.limit("30/minute")
def open_batch(
    request: Request, project_id: int, data: BatchCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    def action() -> dict[str, Any]:
        batch = batches.create_batch(db, project_id, data.parts, user.id)
        return batches.batch_progress(db, batch)

    return _handle(db, action)


@router.put(
    "/receipt-batches/{batch_id}/parts/{part_index}",
    response_model=PartResult,
    description="Lê uma parte do PDF em memória e descarta o arquivo; reenviar não duplica",
)
@limiter.limit("600/minute")
def upload_part(
    request: Request,
    project_id: int,
    batch_id: int,
    part_index: int,
    file: UploadFile,
    db: DbSession,
    connect: Connect,
    _: FinanceUser,
    page_offset: Annotated[int, Form(ge=0, le=100000)] = 0,
) -> Any:
    content = file.file.read(MAX_PART_BYTES + 1)
    if len(content) > MAX_PART_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Parte grande demais — divida o PDF em partes menores",
        )

    def action() -> Any:
        batch = batches.get_batch(db, project_id, batch_id)
        return batches.process_part(db, connect, batch, part_index, page_offset, content)

    return _handle(db, action)


@router.get(
    "/receipt-batches",
    response_model=list[BatchSummary],
    description="Histórico de envios do projeto, com os fora do projeto e o total pago",
)
@limiter.limit("60/minute")
def list_batches(
    request: Request, project_id: int, db: DbSession, _: FinanceUser
) -> list[dict[str, Any]]:
    def action() -> list[dict[str, Any]]:
        batches.get_project(db, project_id)
        return batches.list_batches(db, project_id)

    return _handle(db, action)


@router.get(
    "/receipt-batches/{batch_id}",
    response_model=BatchDetail,
    description="Comprovantes do envio e a conferência, calculada na hora sem gravar nada",
)
@limiter.limit("120/minute")
def read_batch(
    request: Request, project_id: int, batch_id: int, db: DbSession, _: FinanceUser
) -> dict[str, Any]:
    def action() -> dict[str, Any]:
        batches.get_project(db, project_id)
        return batches.get_batch_detail(db, batches.get_batch(db, project_id, batch_id))

    return _handle(db, action)


@router.patch(
    "/receipt-batches/{batch_id}/receipts/{receipt_id}",
    response_model=ReceiptItem,
    description="Descarta ou restaura um comprovante antes de confirmar o envio",
)
@limiter.limit("120/minute")
def discard_receipt(
    request: Request,
    project_id: int,
    batch_id: int,
    receipt_id: int,
    data: DiscardIn,
    db: DbSession,
    _: FinanceUser,
) -> dict[str, Any]:
    def action() -> dict[str, Any]:
        batch = batches.get_batch(db, project_id, batch_id)
        batches.set_receipt_discarded(db, batch, receipt_id, data.discarded)
        detail = batches.get_batch_detail(db, batch)
        return next(item for item in detail["receipts"] if item["id"] == receipt_id)

    return _handle(db, action)


@router.delete(
    "/receipt-batches/{batch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    description="Cancela um envio que ainda não foi confirmado",
)
@limiter.limit("20/minute")
def cancel_batch(
    request: Request, project_id: int, batch_id: int, db: DbSession, _: FinanceUser
) -> Response:
    def action() -> None:
        batches.cancel_batch(db, batches.get_batch(db, project_id, batch_id))

    _handle(db, action)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
