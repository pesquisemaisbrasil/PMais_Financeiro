from collections.abc import Callable
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Form, HTTPException, Path, Request, Response, UploadFile, status
from sqlalchemy.exc import IntegrityError

from api import attachment_http
from api.payables import DbSession, FinanceUser
from core import file_vault
from core.limiter import limiter
from schemas.payable import AttachmentOut, AttachmentUpdate, ProjectOut, ReasonIn
from schemas.records import ActiveIn, CnpjOut, ProjectIncentive, RecordIn, RecordKind, RecordOut
from services import attachments, cnpj_lookup
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
    except attachments.AttachmentNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, attachment_http.NOT_FOUND) from exc
    except file_vault.FilesUnavailable as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, attachment_http.UNAVAILABLE
        ) from exc
    except file_vault.FileCorrupted as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, attachment_http.CORRUPTED
        ) from exc
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
    "/lookups/cnpj/{cnpj}",
    response_model=CnpjOut,
    description="Dados públicos do CNPJ (BrasilAPI) para preencher o cadastro; não grava nada",
)
@limiter.limit("20/minute")
def lookup_cnpj(
    request: Request, cnpj: Annotated[str, Path(max_length=30)], _: FinanceUser
) -> dict[str, str]:
    try:
        info = cnpj_lookup.lookup(cnpj)
    except PayableInvalid as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except cnpj_lookup.CnpjNotFound as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "CNPJ não encontrado na Receita. Confira ou preencha à mão."
        ) from exc
    except cnpj_lookup.CnpjUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "A consulta de CNPJ não respondeu agora. Preencha à mão ou tente de novo.",
        ) from exc
    return {
        "cnpj": info.cnpj,
        "name": info.name,
        "nickname": info.nickname,
        "situation": info.situation,
    }


# Documentos do cliente (contrato, ficha...): as mesmas regras dos anexos das contas.
# Ficam antes das rotas genéricas de /records/{kind}/... para o caminho não se confundir.


def _customer_documents(db: DbSession, customer_id: int) -> list[dict[str, Any]]:
    return attachments.listing(attachments.CUSTOMER.get(db, customer_id))


@router.get(
    "/records/customers/{record_id}/attachments",
    response_model=list[AttachmentOut],
    description="Os documentos do cliente",
)
@limiter.limit(READ_LIMIT)
def list_customer_documents(
    request: Request, record_id: int, db: DbSession, _: FinanceUser
) -> list[dict[str, Any]]:
    return _write(db, lambda: _customer_documents(db, record_id))


@router.post(
    "/records/customers/{record_id}/attachments",
    response_model=list[AttachmentOut],
    status_code=status.HTTP_201_CREATED,
    description="Anexa um documento ao cliente (PDF, imagem, planilha, documento ou XML, até 20MB)",
)
@limiter.limit(WRITE_LIMIT)
def add_customer_document(
    request: Request,
    record_id: int,
    file: UploadFile,
    db: DbSession,
    user: FinanceUser,
    kind: Annotated[str, Form(max_length=20)] = attachments.DEFAULT_KIND,
) -> list[dict[str, Any]]:
    filename, content = attachment_http.read_upload(file)
    _write(
        db,
        lambda: attachments.add(db, attachments.CUSTOMER, record_id, filename, content, kind, user),
    )
    return _customer_documents(db, record_id)


@router.get(
    "/records/customers/{record_id}/attachments/{attachment_id}/download",
    response_class=Response,
    description="Baixa o documento, decifrado aqui; cada download fica no histórico do cliente",
)
@limiter.limit(READ_LIMIT)
def download_customer_document(
    request: Request, record_id: int, attachment_id: int, db: DbSession, user: FinanceUser
) -> Response:
    name, content_type, content = _write(
        db, lambda: attachments.download(db, attachments.CUSTOMER, record_id, attachment_id, user)
    )
    return attachment_http.download_response(name, content_type, content)


@router.patch(
    "/records/customers/{record_id}/attachments/{attachment_id}",
    response_model=list[AttachmentOut],
    description="Renomeia o documento e/ou muda o tipo dele; o arquivo guardado não é tocado",
)
@limiter.limit(WRITE_LIMIT)
def update_customer_document(
    request: Request,
    record_id: int,
    attachment_id: int,
    data: AttachmentUpdate,
    db: DbSession,
    user: FinanceUser,
) -> list[dict[str, Any]]:
    _write(
        db,
        lambda: attachments.update(
            db, attachments.CUSTOMER, record_id, attachment_id, data.name, data.kind, user
        ),
    )
    return _customer_documents(db, record_id)


@router.post(
    "/records/customers/{record_id}/attachments/{attachment_id}/remove",
    response_model=list[AttachmentOut],
    description="Tira o documento do cliente, com o motivo; o arquivo continua guardado",
)
@limiter.limit(WRITE_LIMIT)
def remove_customer_document(
    request: Request,
    record_id: int,
    attachment_id: int,
    data: ReasonIn,
    db: DbSession,
    user: FinanceUser,
) -> list[dict[str, Any]]:
    _write(
        db,
        lambda: attachments.remove(
            db, attachments.CUSTOMER, record_id, attachment_id, data.reason, user
        ),
    )
    return _customer_documents(db, record_id)


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
