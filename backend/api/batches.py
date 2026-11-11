from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from core.limiter import limiter
from core.permissions import require_finance
from db.connection import get_db
from models.notification import Notification
from models.project_ref import ProjectRef
from models.user import User
from schemas.receipt import (
    BatchCreate,
    BatchDetail,
    BatchProgress,
    BatchSummary,
    ConfirmIn,
    ConfirmResult,
    DiscardIn,
    DivergenceItem,
    NotificationOut,
    PartResult,
    ProjectOut,
    ReceiptItem,
)
from services import batches, confirmation, connect_sync, mfa
from services import payable as payable_service
from services.auth import get_current_user
from services.connect_gateway import ConnectGateway, ConnectUnavailable, get_connect

router = APIRouter(prefix="/projects/{project_id}/finance", tags=["comprovantes"])
# Fora de um projeto: escolher o projeto, trazer os do Connect e os avisos de quem está logado.
shared = APIRouter(tags=["comprovantes"])

T = TypeVar("T")

MAX_PART_BYTES = 25 * 1024 * 1024

NOT_FOUND = {
    batches.ProjectNotFound: "Projeto não encontrado",
    batches.BatchNotFound: "Envio de comprovantes não encontrado",
    batches.ReceiptNotFound: "Comprovante não encontrado",
    batches.PayableNotFound: "Lançamento não encontrado",
}
CONFIRMED = "Esse envio já foi confirmado e não pode mais ser alterado"
CONNECT_DOWN = "O P+ Connect não respondeu — tente de novo em alguns minutos"


def finance_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    require_finance(user)
    return user


DbSession = Annotated[Session, Depends(get_db)]
FinanceUser = Annotated[User, Depends(finance_user)]
Connect = Annotated[ConnectGateway, Depends(get_connect)]


def _fail(db: Session, code: int, detail: str, exc: Exception) -> HTTPException:
    db.rollback()
    return HTTPException(code, detail)


def _handle(db: Session, action: Callable[[], T]) -> T:
    """Exceção de domínio vira resposta com mensagem em pt-BR; nada fica pela metade."""
    try:
        return action()
    except tuple(NOT_FOUND) as exc:
        raise _fail(db, status.HTTP_404_NOT_FOUND, NOT_FOUND[type(exc)], exc) from exc
    except batches.BatchAlreadyConfirmed as exc:
        raise _fail(db, status.HTTP_409_CONFLICT, CONFIRMED, exc) from exc
    except batches.PartsMissing as exc:
        raise _fail(
            db, status.HTTP_409_CONFLICT, "Ainda faltam partes do PDF para terminar de enviar", exc
        ) from exc
    except confirmation.ConfirmConflict as exc:
        raise _fail(
            db,
            status.HTTP_409_CONFLICT,
            "Outro envio acabou de pagar um desses Pix: confira o envio de novo",
            exc,
        ) from exc
    except payable_service.PayableConflict as exc:
        raise _fail(db, status.HTTP_409_CONFLICT, str(exc), exc) from exc
    except payable_service.PayableInvalid as exc:
        raise _fail(db, status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc), exc) from exc
    except batches.PartOutOfRange as exc:
        raise _fail(
            db, status.HTTP_422_UNPROCESSABLE_ENTITY, "Parte fora do intervalo deste envio", exc
        ) from exc
    except ConnectUnavailable as exc:
        raise _fail(db, status.HTTP_503_SERVICE_UNAVAILABLE, CONNECT_DOWN, exc) from exc


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
        batch = batches.create_batch(db, project_id, data.parts, user.id, data.payableId)
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
    request: Request,
    project_id: int,
    batch_id: int,
    db: DbSession,
    connect: Connect,
    _: FinanceUser,
) -> dict[str, Any]:
    def action() -> dict[str, Any]:
        batches.get_project(db, project_id)
        batch = batches.get_batch(db, project_id, batch_id)
        return batches.get_batch_detail(db, batch, connect)

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


@router.post(
    "/receipt-batches/{batch_id}/confirm",
    response_model=ConfirmResult,
    description="Confirma a baixa: só os comprovantes que batem viram pagamento",
)
@limiter.limit("20/minute")
def confirm_batch(
    request: Request,
    project_id: int,
    batch_id: int,
    data: ConfirmIn,
    db: DbSession,
    connect: Connect,
    user: FinanceUser,
) -> dict[str, object]:
    # Quem tem MFA digita o código de novo para pagar. Quem entrou por Google ou Microsoft e
    # não tem TOTP segue sem etapa extra até a decisão da Q20.
    if user.mfaEnabledAt is not None:
        try:
            mfa.verify_code(db, user, data.code or "")
        except mfa.MfaLocked as exc:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS, "Muitas tentativas — aguarde alguns minutos"
            ) from exc
        except mfa.InvalidMfaCode as exc:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, "Código de verificação inválido"
            ) from exc

    def action() -> dict[str, object]:
        batches.get_project(db, project_id)
        batch = batches.get_batch(db, project_id, batch_id)
        return confirmation.confirm_batch(
            db, connect, batch, user, data.bankAccountId, data.paymentMethodId
        )

    return _handle(db, action)


@router.get(
    "/divergences",
    response_model=list[DivergenceItem],
    description="Baixas que o Connect recusou, para decisão humana",
)
@limiter.limit("60/minute")
def list_divergences(
    request: Request, project_id: int, db: DbSession, _: FinanceUser
) -> list[dict[str, object]]:
    def action() -> list[dict[str, object]]:
        batches.get_project(db, project_id)
        return confirmation.divergences(db, project_id)

    return _handle(db, action)


@shared.get(
    "/finance/divergences",
    response_model=list[DivergenceItem],
    description="Baixas que o Connect recusou, de todos os projetos, as mais novas primeiro",
)
@limiter.limit("60/minute")
def all_divergences(request: Request, db: DbSession, _: FinanceUser) -> list[dict[str, object]]:
    return confirmation.divergences(db)


def _projects(db: Session) -> list[dict[str, Any]]:
    rows = db.query(ProjectRef).order_by(ProjectRef.title).all()
    return [{"id": r.id, "connectProjectId": r.connect_project_id, "title": r.title} for r in rows]


@shared.get(
    "/finance/projects",
    response_model=list[ProjectOut],
    description="Projetos do Connect já espelhados, para escolher onde enviar o PDF",
)
@limiter.limit("120/minute")
def list_projects(request: Request, db: DbSession, _: FinanceUser) -> list[dict[str, Any]]:
    return _projects(db)


@shared.post(
    "/finance/connect/sync",
    response_model=list[ProjectOut],
    description="Traz os projetos do Connect para o espelho",
)
@limiter.limit("10/minute")
def sync_projects(
    request: Request, db: DbSession, connect: Connect, _: FinanceUser
) -> list[dict[str, Any]]:
    _handle(db, lambda: connect_sync.sync_projects(db, connect))
    return _projects(db)


@shared.get(
    "/notifications",
    response_model=list[NotificationOut],
    description="Avisos de quem está logado, os mais novos primeiro",
)
@limiter.limit("120/minute")
def list_notifications(request: Request, db: DbSession, user: FinanceUser) -> list[Notification]:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.id.desc())
        .limit(50)
        .all()
    )


@shared.post(
    "/notifications/{notification_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    description="Marca um aviso como lido",
)
@limiter.limit("120/minute")
def read_notification(
    request: Request, notification_id: int, db: DbSession, user: FinanceUser
) -> Response:
    row = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aviso não encontrado")
    if row.readAt is None:
        row.readAt = datetime.now(UTC)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
