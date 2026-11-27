"""Pessoas e telas (Acessos) e demandas (Bruno, 19/11/2026)."""

from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)

from api import attachment_http
from api.payables import READ_LIMIT, WRITE_LIMIT, DbSession, FinanceUser, _handle, _in_transaction
from core.limiter import limiter
from core.permissions import require_admin, require_superadmin
from models.user import User
from schemas.access import CompaniesIn, DemandOut, PeopleOut, PersonOut, ScreensIn
from services import demands, people
from services.auth import get_current_user

router = APIRouter(tags=["acessos"])


def admin_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    require_admin(user)
    return user


def superadmin_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    require_superadmin(user)
    return user


AdminUser = Annotated[User, Depends(admin_user)]
SuperAdminUser = Annotated[User, Depends(superadmin_user)]


@router.get(
    "/admin/pessoas",
    response_model=PeopleOut,
    description="As pessoas ativas, o nível de cada uma e as telas bloqueadas (admin)",
)
@limiter.limit(READ_LIMIT)
def list_people(request: Request, db: DbSession, user: AdminUser) -> dict[str, Any]:
    return people.listing(db, user)


@router.put(
    "/admin/pessoas/{person_id}/telas",
    response_model=PersonOut,
    description="Troca as telas bloqueadas da pessoa. Admin muda só as de usuário; super admin, "
    "também as de admin. Ninguém muda as próprias",
)
@limiter.limit(WRITE_LIMIT)
def set_person_screens(
    request: Request, person_id: int, body: ScreensIn, db: DbSession, user: AdminUser
) -> dict[str, Any]:
    try:
        return _in_transaction(db, lambda: people.set_screens(db, person_id, body.blocked, user))
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Pessoa não encontrada") from exc
        raise


@router.put(
    "/admin/pessoas/{person_id}/empresas",
    response_model=PersonOut,
    description="Troca as empresas que a pessoa vê (companyIds nulo = todas). Só quem vê todas, "
    "com as mesmas regras das telas",
)
@limiter.limit(WRITE_LIMIT)
def set_person_companies(
    request: Request, person_id: int, body: CompaniesIn, db: DbSession, user: AdminUser
) -> dict[str, Any]:
    try:
        return _in_transaction(
            db, lambda: people.set_companies(db, person_id, body.companyIds, user)
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Pessoa não encontrada") from exc
        raise


@router.post(
    "/demands",
    response_model=DemandOut,
    status_code=status.HTTP_201_CREATED,
    description="Abre uma demanda para o super admin: tipo, descrição e um anexo (imagem ou PDF)",
)
@limiter.limit("20/minute")
def open_demand(
    request: Request,
    db: DbSession,
    user: FinanceUser,
    kind: Annotated[str, Form()] = "",
    description: Annotated[str, Form()] = "",
    page: Annotated[str, Form()] = "/",
    file: Annotated[UploadFile | None, File()] = None,
) -> dict[str, Any]:
    data = file.file.read(demands.MAX_BYTES + 1) if file else b""
    if len(data) > demands.MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, demands.TOO_LARGE)
    name = (file.filename or "") if file else ""
    return _in_transaction(
        db, lambda: demands.create(db, user, kind, description, page, name, data)
    )


@router.get(
    "/demands",
    response_model=list[DemandOut],
    description="As demandas abertas, da mais nova para a mais antiga (só o super admin)",
)
@limiter.limit(READ_LIMIT)
def list_demands(request: Request, db: DbSession, _: SuperAdminUser) -> list[dict[str, Any]]:
    return demands.listing(db)


@router.post(
    "/demands/{demand_id}/concluir",
    response_model=DemandOut,
    description="Marca a demanda como concluída e avisa no sino quem abriu (só o super admin)",
)
@limiter.limit(WRITE_LIMIT)
def conclude_demand(
    request: Request, demand_id: int, db: DbSession, user: SuperAdminUser
) -> dict[str, Any]:
    try:
        return _in_transaction(db, lambda: demands.conclude(db, demand_id, user))
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Demanda não encontrada") from exc
        raise


@router.get(
    "/demands/{demand_id}/anexo",
    response_class=Response,
    description="O anexo da demanda, para baixar (só o super admin)",
)
@limiter.limit(READ_LIMIT)
def demand_attachment(
    request: Request, demand_id: int, db: DbSession, _: SuperAdminUser
) -> Response:
    try:
        name, content_type, data = _handle(lambda: demands.download(db, demand_id))
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Demanda não encontrada") from exc
        raise
    return attachment_http.download_response(name, content_type, data)
