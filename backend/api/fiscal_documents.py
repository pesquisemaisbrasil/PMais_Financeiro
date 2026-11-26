from collections.abc import Callable
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, HTTPException, Path, Query, Request, Response, status
from sqlalchemy.orm import Session

from api.dre import _xlsx
from api.payables import DbSession, FinanceUser
from core.limiter import limiter
from core.permissions import require_screen
from schemas.fiscal_documents import InvoiceIn, InvoiceOut, PendingInvoices, RpaMonth
from services import fiscal_documents
from services.payable import PayableConflict, PayableInvalid, PayableNotFound

router = APIRouter(tags=["notas e RPA"], dependencies=[require_screen("notas-e-rpa")])

READ_LIMIT = "120/minute"
WRITE_LIMIT = "60/minute"
T = TypeVar("T")
Id = Annotated[int | None, Query(ge=1)]


def _handle(db: Session, action: Callable[[], T]) -> T:
    """As recusas do serviço em HTTP; a sessão volta atrás, e nada fica pela metade."""
    try:
        return action()
    except PayableNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pessoa não encontrada") from exc
    except PayableConflict as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except PayableInvalid as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@router.get(
    "/fiscal/pending-invoices",
    response_model=PendingInvoices,
    description="NF pendente: quem recebe por NF nos lançamentos que valem e ainda não tem o "
    "número da nota. É só aviso, não bloqueia o pagamento. Filtra por projeto e pela busca (nome "
    "da pessoa ou do lançamento). Não altera nada",
)
@limiter.limit(READ_LIMIT)
def get_pending_invoices(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    project: Id = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> dict[str, Any]:
    return fiscal_documents.pending_invoices(db, project, search)


@router.put(
    "/fiscal/items/{item_id}/invoice",
    response_model=InvoiceOut,
    description="Registra a NF que chegou (número e data de emissão): a pessoa sai da NF "
    "pendente, e o registro fica no histórico do lançamento",
)
@limiter.limit(WRITE_LIMIT)
def register_invoice(
    request: Request,
    db: DbSession,
    user: FinanceUser,
    body: InvoiceIn,
    item_id: Annotated[int, Path(ge=1)],
) -> dict[str, Any]:
    return _handle(
        db,
        lambda: fiscal_documents.register_invoice(db, item_id, body.number, body.issueDate, user),
    )


@router.get(
    "/fiscal/rpa",
    response_model=RpaMonth,
    description="RPA do mês: quem recebe por RPA e foi paga no mês (AAAA-MM), com bruto, INSS e "
    "líquido. Filtra por empresa. Não altera nada",
)
@limiter.limit(READ_LIMIT)
def get_rpa(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    month: Annotated[str, Query(max_length=7)],
    company: Id = None,
) -> dict[str, Any]:
    return _handle(db, lambda: fiscal_documents.rpa_month(db, month, company))


@router.get(
    "/fiscal/rpa/export",
    response_class=Response,
    description="A lista de RPA do mês em Excel (.xlsx), com a linha de total, para a "
    "contabilidade",
)
@limiter.limit(READ_LIMIT)
def export_rpa(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    month: Annotated[str, Query(max_length=7)],
    company: Id = None,
) -> Response:
    content = _handle(db, lambda: fiscal_documents.export_rpa_xlsx(db, month, company))
    return _xlsx(content, f"rpa-{month}.xlsx")
