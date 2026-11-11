from collections.abc import Callable
from datetime import date
from typing import Annotated, Any, Literal, TypeVar, get_args

from fastapi import (
    APIRouter,
    Depends,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from api import attachment_http
from core import file_vault, xlsx
from core.limiter import limiter
from core.permissions import require_finance
from core.query_lists import parse_choices, parse_ids
from db.connection import get_db
from models.user import User
from schemas.payable import (
    AttachmentUpdate,
    BatchCount,
    BatchDeleteResult,
    BatchIds,
    BatchPaymentCreate,
    BatchPaymentResult,
    BatchReclassify,
    DateField,
    HomeSummary,
    ImportFields,
    ImportKind,
    ImportPreview,
    ImportResult,
    Indicator,
    KindFilter,
    OccurrenceOut,
    PayableCreate,
    PayableDetail,
    PayableList,
    PayableUpdate,
    PaymentCreate,
    PaymentReverse,
    PeriodMode,
    PrintTable,
    ProvisionReplace,
    ReasonIn,
    RecurringCreate,
    Reference,
    ReplacementCandidate,
    SeriesCancel,
    SeriesCreated,
    SeriesEdit,
    SeriesOccurrence,
    SeriesResult,
    SimulateIn,
    SituationFilter,
    SortColumn,
    Tab,
)
from services import attachments, payable_import, recurrence
from services import payable as payable_service
from services.auth import get_current_user
from services.holidays import holiday_names

router = APIRouter(tags=["contas a pagar"])

T = TypeVar("T")

# Por IP, e o escritório sai todo pelo mesmo: folga para várias pessoas no dia a dia.
READ_LIMIT = "120/minute"
WRITE_LIMIT = "60/minute"


def finance_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    require_finance(user)
    return user


DbSession = Annotated[Session, Depends(get_db)]
FinanceUser = Annotated[User, Depends(finance_user)]


def _handle(action: Callable[[], T]) -> T:
    """Traduz as recusas do serviço em HTTP. A sessão volta atrás: nada fica pela metade."""
    try:
        return action()
    except attachments.AttachmentNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, attachment_http.NOT_FOUND) from exc
    except payable_service.PayableNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conta não encontrada") from exc
    except file_vault.FilesUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, attachment_http.UNAVAILABLE
        ) from exc
    except file_vault.FileCorrupted as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, attachment_http.CORRUPTED
        ) from exc
    except payable_service.PayableConflict as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except payable_service.PayableInvalid as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


def _in_transaction(db: Session, action: Callable[[], T]) -> T:
    try:
        return _handle(action)
    except HTTPException:
        db.rollback()
        raise


@router.get("/home", response_model=HomeSummary, description="Resumo da tela Início")
@limiter.limit(READ_LIMIT)
def home(request: Request, db: DbSession, _: FinanceUser) -> dict[str, Any]:
    return payable_service.home_summary(db)


@router.get("/reference", response_model=Reference, description="Cadastros ativos")
@limiter.limit(READ_LIMIT)
def reference(request: Request, db: DbSession, _: FinanceUser) -> dict[str, Any]:
    return payable_service.reference(db)


class ListParams:
    """Os mesmos filtros valem para a lista e para a exportação."""

    def __init__(
        self,
        mode: PeriodMode = "dia",
        ref: date | None = None,
        start: date | None = None,
        end: date | None = None,
        dateField: DateField = "vencimento",
        indicator: Indicator = "total",
        tab: Tab = "todas",
        # Cada filtro aceita mais de uma opção, separadas por vírgula: project=3,5
        supplier: Annotated[str | None, Query(max_length=400)] = None,
        project: Annotated[str | None, Query(max_length=400)] = None,
        category: Annotated[str | None, Query(max_length=400)] = None,
        company: Annotated[str | None, Query(max_length=400)] = None,
        unit: Annotated[str | None, Query(max_length=400)] = None,
        costCenter: Annotated[str | None, Query(max_length=400)] = None,
        paymentMethod: Annotated[str | None, Query(max_length=400)] = None,
        situation: Annotated[str | None, Query(max_length=400)] = None,
        kind: Annotated[str | None, Query(max_length=400)] = None,
        search: Annotated[str | None, Query(max_length=100)] = None,
        sort: SortColumn = "vencimento",
        descending: bool = False,
    ) -> None:
        if any(day and not 2000 <= day.year <= 2100 for day in (ref, start, end)):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Data fora do intervalo aceito"
            )
        if mode == "periodo" and (not start or not end):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Escolha a data inicial e a data final"
            )
        if mode == "periodo" and start and end and start > end:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "A data inicial precisa ser igual ou anterior à data final",
            )
        self.values: dict[str, Any] = {
            "mode": mode,
            "ref": ref,
            "custom_range": (start, end) if mode == "periodo" and start and end else None,
            "date_field": dateField,
            "indicator": indicator,
            "tab": tab,
            "filters": {
                "supplier": parse_ids(supplier),
                "project": parse_ids(project),
                "category": parse_ids(category),
                "company": parse_ids(company),
                "unit": parse_ids(unit),
                "costCenter": parse_ids(costCenter),
                "paymentMethod": parse_ids(paymentMethod),
                "situation": parse_choices(situation, get_args(SituationFilter)),
                "kind": parse_choices(kind, get_args(KindFilter)),
            },
            "search": search,
            "sort": sort,
            "descending": descending,
        }


Params = Annotated[ListParams, Depends()]


@router.get("/payables", response_model=PayableList, description="Contas do período, com totais")
@limiter.limit(READ_LIMIT)
def list_payables(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    params: Params,
    page: Annotated[int, Query(ge=1)] = 1,
) -> dict[str, Any]:
    return payable_service.list_payables(db, **params.values, page=page)


@router.get(
    "/payables/export",
    response_class=Response,
    description="As contas dos filtros em CSV ou Excel (.xlsx), com os filtros na primeira linha",
)
@limiter.limit(READ_LIMIT)
def export_payables(
    request: Request,
    db: DbSession,
    _: FinanceUser,
    params: Params,
    file_format: Annotated[Literal["csv", "xlsx"], Query(alias="format")] = "csv",
) -> Response:
    if file_format == "xlsx":
        return Response(
            payable_service.export_xlsx(db, **params.values),
            media_type=xlsx.MEDIA_TYPE,
            headers={
                "Content-Disposition": 'attachment; filename="contas-a-pagar.xlsx"',
                "Cache-Control": "no-store",
            },
        )
    return Response(
        payable_service.export_csv(db, **params.values),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="contas-a-pagar.csv"',
            "Cache-Control": "no-store",
        },
    )


@router.get(
    "/payables/print",
    response_model=PrintTable,
    description="As contas dos filtros, sem paginar, nas colunas que cabem numa folha",
)
@limiter.limit(READ_LIMIT)
def print_payables(
    request: Request, db: DbSession, _: FinanceUser, params: Params
) -> dict[str, Any]:
    return payable_service.print_table(db, **params.values)


@router.post(
    "/payables",
    response_model=PayableDetail,
    status_code=status.HTTP_201_CREATED,
    description="Lança uma conta",
)
@limiter.limit(WRITE_LIMIT)
def create_payable(
    request: Request, data: PayableCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    payable = _in_transaction(db, lambda: payable_service.create(db, data, user))
    return payable_service.detail(db, payable.id)


@router.post(
    "/payables/batch/payments",
    response_model=BatchPaymentResult,
    description="Baixa o pendente de várias contas, tudo ou nada",
)
@limiter.limit(WRITE_LIMIT)
def pay_batch(
    request: Request, data: BatchPaymentCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    total = _in_transaction(db, lambda: payable_service.pay_batch(db, data, user))
    return {"total": total, "count": len(set(data.ids))}


def _upload(file: UploadFile) -> tuple[str, bytes]:
    content = file.file.read(payable_import.MAX_BYTES + 1)
    if len(content) > payable_import.MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "A planilha passa de 5 MB")
    return file.filename or "", content


def _import_fields(
    kind: Annotated[ImportKind, Form()],
    # Os cadastros marcados em cada campo, separados por vírgula ("3,5"). Vazio = todos os que
    # a planilha trouxer na coluna de mesmo nome.
    projectIds: Annotated[str | None, Form(max_length=400)] = None,
    companyIds: Annotated[str | None, Form(max_length=400)] = None,
    unitIds: Annotated[str | None, Form(max_length=400)] = None,
    costCenterIds: Annotated[str | None, Form(max_length=400)] = None,
    categoryIds: Annotated[str | None, Form(max_length=400)] = None,
    paymentMethodIds: Annotated[str | None, Form(max_length=400)] = None,
    description: Annotated[str | None, Form(max_length=200)] = None,
    dueDate: Annotated[date | None, Form()] = None,
) -> ImportFields:
    return ImportFields(
        kind=kind,
        projectIds=parse_ids(projectIds) or [],
        companyIds=parse_ids(companyIds) or [],
        unitIds=parse_ids(unitIds) or [],
        costCenterIds=parse_ids(costCenterIds) or [],
        categoryIds=parse_ids(categoryIds) or [],
        paymentMethodIds=parse_ids(paymentMethodIds) or [],
        description=description,
        dueDate=dueDate,
    )


@router.post(
    "/payables/import/preview",
    response_model=ImportPreview,
    description="Confere a planilha, sem gravar nada",
)
@limiter.limit(WRITE_LIMIT)
def preview_import(
    request: Request,
    file: UploadFile,
    fields: Annotated[ImportFields, Depends(_import_fields)],
    db: DbSession,
    _: FinanceUser,
) -> dict[str, Any]:
    filename, content = _upload(file)
    return _handle(lambda: payable_import.preview(db, fields, filename, content))


@router.post(
    "/payables/import",
    response_model=ImportResult,
    status_code=status.HTTP_201_CREATED,
    description="Cria os lançamentos da planilha; o arquivo não fica guardado",
)
@limiter.limit(WRITE_LIMIT)
def import_payables(
    request: Request,
    file: UploadFile,
    fields: Annotated[ImportFields, Depends(_import_fields)],
    db: DbSession,
    user: FinanceUser,
) -> dict[str, Any]:
    filename, content = _upload(file)
    return _in_transaction(db, lambda: payable_import.confirm(db, fields, filename, content, user))


@router.post(
    "/payables/{payable_id}/attachments",
    response_model=PayableDetail,
    status_code=status.HTTP_201_CREATED,
    description="Anexa um documento à conta (PDF, imagem, planilha, documento ou XML, até 20 MB)",
)
@limiter.limit(WRITE_LIMIT)
def add_attachment(
    request: Request,
    payable_id: int,
    file: UploadFile,
    db: DbSession,
    user: FinanceUser,
    kind: Annotated[str, Form(max_length=20)] = attachments.DEFAULT_KIND,
) -> dict[str, Any]:
    filename, content = attachment_http.read_upload(file)
    _in_transaction(
        db,
        lambda: attachments.add(db, attachments.PAYABLE, payable_id, filename, content, kind, user),
    )
    return _handle(lambda: payable_service.detail(db, payable_id))


@router.get(
    "/payables/{payable_id}/attachments/{attachment_id}/download",
    response_class=Response,
    description="Baixa o documento, decifrado aqui; cada download fica no histórico da conta",
)
@limiter.limit(READ_LIMIT)
def download_attachment(
    request: Request, payable_id: int, attachment_id: int, db: DbSession, user: FinanceUser
) -> Response:
    name, content_type, content = _in_transaction(
        db, lambda: attachments.download(db, attachments.PAYABLE, payable_id, attachment_id, user)
    )
    return attachment_http.download_response(name, content_type, content)


@router.patch(
    "/payables/{payable_id}/attachments/{attachment_id}",
    response_model=PayableDetail,
    description="Renomeia o documento e/ou muda o tipo dele; o arquivo guardado não é tocado",
)
@limiter.limit(WRITE_LIMIT)
def update_attachment(
    request: Request,
    payable_id: int,
    attachment_id: int,
    data: AttachmentUpdate,
    db: DbSession,
    user: FinanceUser,
) -> dict[str, Any]:
    _in_transaction(
        db,
        lambda: attachments.update(
            db, attachments.PAYABLE, payable_id, attachment_id, data.name, data.kind, user
        ),
    )
    return _handle(lambda: payable_service.detail(db, payable_id))


@router.post(
    "/payables/{payable_id}/attachments/{attachment_id}/remove",
    response_model=PayableDetail,
    description="Tira o documento da conta, com o motivo; o arquivo continua guardado",
)
@limiter.limit(WRITE_LIMIT)
def remove_attachment(
    request: Request,
    payable_id: int,
    attachment_id: int,
    data: ReasonIn,
    db: DbSession,
    user: FinanceUser,
) -> dict[str, Any]:
    _in_transaction(
        db,
        lambda: attachments.remove(
            db, attachments.PAYABLE, payable_id, attachment_id, data.reason, user
        ),
    )
    return _handle(lambda: payable_service.detail(db, payable_id))


@router.post(
    "/payables/batch/reclassify",
    response_model=BatchCount,
    description="Muda projeto, categoria ou centro de custo de várias contas",
)
@limiter.limit(WRITE_LIMIT)
def reclassify_batch(
    request: Request, data: BatchReclassify, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _in_transaction(db, lambda: payable_service.reclassify_batch(db, data, user))
    return {"count": count}


@router.post(
    "/payables/batch/duplicate",
    response_model=BatchCount,
    description="Copia as contas para o mês seguinte",
)
@limiter.limit(WRITE_LIMIT)
def duplicate_batch(
    request: Request, data: BatchIds, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _in_transaction(db, lambda: payable_service.duplicate_batch(db, data.ids, user))
    return {"count": count}


@router.post(
    "/payables/batch/delete",
    response_model=BatchDeleteResult,
    description="Exclui contas sem baixa; o histórico fica",
)
@limiter.limit(WRITE_LIMIT)
def delete_batch(
    request: Request, data: BatchIds, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _in_transaction(db, lambda: payable_service.delete_batch(db, data.ids, user))
    return {"count": count}


@router.get("/payables/{payable_id}", response_model=PayableDetail, description="Detalhe da conta")
@limiter.limit(READ_LIMIT)
def get_payable(request: Request, payable_id: int, db: DbSession, _: FinanceUser) -> dict[str, Any]:
    return _handle(lambda: payable_service.detail(db, payable_id))


@router.patch(
    "/payables/{payable_id}",
    response_model=PayableDetail,
    description="Altera descrição, valor e vencimento",
)
@limiter.limit(WRITE_LIMIT)
def update_payable(
    request: Request, payable_id: int, data: PayableUpdate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(db, lambda: payable_service.update(db, payable_id, data, user))
    return payable_service.detail(db, payable_id)


@router.get(
    "/payables/{payable_id}/replacement-candidates",
    response_model=list[ReplacementCandidate],
    description="Contas já lançadas que podem substituir a provisão",
)
@limiter.limit(READ_LIMIT)
def replacement_candidates(
    request: Request, payable_id: int, db: DbSession, _: FinanceUser
) -> list[dict[str, Any]]:
    provision = _handle(lambda: payable_service.get_open_provision(db, payable_id))
    return [
        {
            "id": c.id,
            "description": c.description,
            "payee": payable_service.payee_name(c),
            "amount": c.amount,
        }
        for c in payable_service.replacement_candidates(db, provision)
    ]


@router.post(
    "/payables/{payable_id}/replace",
    response_model=PayableDetail,
    description="Troca a provisão pelo lançamento real",
)
@limiter.limit(WRITE_LIMIT)
def replace_provision(
    request: Request, payable_id: int, data: ProvisionReplace, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    payable = _in_transaction(
        db, lambda: payable_service.replace_provision(db, payable_id, data, user)
    )
    return payable_service.detail(db, payable.id)


@router.post(
    "/payables/{payable_id}/cancel",
    response_model=PayableDetail,
    description="Cancela uma conta sem baixa",
)
@limiter.limit(WRITE_LIMIT)
def cancel_payable(
    request: Request, payable_id: int, data: ReasonIn, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(db, lambda: payable_service.cancel(db, payable_id, data.reason, user))
    return payable_service.detail(db, payable_id)


@router.post(
    "/payables/recurrence/simulate",
    response_model=list[OccurrenceOut],
    description="Mostra as ocorrências de uma série, sem gravar nada",
)
@limiter.limit(READ_LIMIT)
def simulate_recurrence(
    request: Request, data: SimulateIn, db: DbSession, _: FinanceUser
) -> list[dict[str, Any]]:
    extra = holiday_names(db)
    return [
        {"index": o.index, "dueDate": o.dueDate, "amount": o.amount}
        for o in recurrence.simulate(data.kind, data.startDate, data.count, data.amount, extra)
    ]


@router.post(
    "/payables/recurrence",
    response_model=SeriesCreated,
    status_code=status.HTTP_201_CREATED,
    description="Cria a série: uma conta por ocorrência, todas ou nenhuma",
)
@limiter.limit(WRITE_LIMIT)
def create_series(
    request: Request, data: RecurringCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    series, created = _in_transaction(
        db,
        lambda: recurrence.create_series(
            db, PayableCreate(**data.model_dump(exclude={"recurrence"})), data.recurrence, user
        ),
    )
    return {"seriesId": series.id, "ids": [p.id for p in created]}


@router.get(
    "/payables/{payable_id}/series",
    response_model=list[SeriesOccurrence],
    description="Lista as ocorrências da série da conta, na ordem",
)
@limiter.limit(READ_LIMIT)
def list_series(
    request: Request, payable_id: int, db: DbSession, _: FinanceUser
) -> list[dict[str, Any]]:
    return _handle(lambda: recurrence.list_series(db, payable_id))


@router.patch(
    "/payables/{payable_id}/series",
    response_model=SeriesResult,
    description="Muda valor ou descrição de só esta, esta e as seguintes ou todas em aberto",
)
@limiter.limit(WRITE_LIMIT)
def edit_series(
    request: Request, payable_id: int, data: SeriesEdit, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _in_transaction(db, lambda: recurrence.edit_series(db, payable_id, data, user))
    return {"count": count}


@router.post(
    "/payables/{payable_id}/series/cancel",
    response_model=SeriesResult,
    description="Cancela esta e as seguintes, ou todas em aberto; o que já foi pago continua",
)
@limiter.limit(WRITE_LIMIT)
def cancel_series(
    request: Request, payable_id: int, data: SeriesCancel, db: DbSession, user: FinanceUser
) -> dict[str, int]:
    count = _in_transaction(db, lambda: recurrence.cancel_series(db, payable_id, data, user))
    return {"count": count}


@router.post(
    "/payables/{payable_id}/payments",
    response_model=PayableDetail,
    description="Dá baixa, total ou parcial",
)
@limiter.limit(WRITE_LIMIT)
def pay_payable(
    request: Request, payable_id: int, data: PaymentCreate, db: DbSession, user: FinanceUser
) -> dict[str, Any]:
    _in_transaction(db, lambda: payable_service.pay(db, payable_id, data, user))
    return payable_service.detail(db, payable_id)


@router.post(
    "/payables/{payable_id}/payments/{payment_id}/reverse",
    response_model=PayableDetail,
    description="Anula uma baixa por estorno ou Pix devolvido",
)
@limiter.limit(WRITE_LIMIT)
def reverse_payment(
    request: Request,
    payable_id: int,
    payment_id: int,
    data: PaymentReverse,
    db: DbSession,
    user: FinanceUser,
) -> dict[str, Any]:
    _in_transaction(
        db, lambda: payable_service.reverse_payment(db, payable_id, payment_id, data, user)
    )
    return payable_service.detail(db, payable_id)
