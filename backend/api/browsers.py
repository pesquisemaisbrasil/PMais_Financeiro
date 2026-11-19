"""Tela Acessos: o admin libera, recusa ou revoga os navegadores das contas."""

from collections.abc import Callable
from typing import Annotated, Any, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from core.limiter import limiter
from core.permissions import require_admin
from db.connection import get_db
from models.trusted_browser import TrustedBrowser
from models.user import User
from schemas.browser import BrowserOut, BrowserStatus
from services import browsers
from services.auth import get_current_user

router = APIRouter(prefix="/admin/navegadores", tags=["acessos"])
T = TypeVar("T")


def admin_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    require_admin(user)
    return user


DbSession = Annotated[Session, Depends(get_db)]
AdminUser = Annotated[User, Depends(admin_user)]


def _handle(db: Session, action: Callable[[], T]) -> T:
    """Traduz as recusas do serviço em HTTP e desfaz o que ficou pela metade."""
    try:
        return action()
    except browsers.BrowserNotFound as exc:
        db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Navegador não encontrado") from exc
    except browsers.BrowserConflict as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


def _one(db: Session, browser: TrustedBrowser) -> dict[str, Any]:
    return next(row for row in browsers.listing(db, None) if row["id"] == browser.id)


@router.get(
    "",
    response_model=list[BrowserOut],
    description="Os navegadores das contas, do mais novo para o mais antigo; `situacao` filtra",
)
@limiter.limit("120/minute")
def list_browsers(
    request: Request,
    db: DbSession,
    _: AdminUser,
    situacao: Annotated[BrowserStatus | None, Query()] = None,
) -> list[dict[str, Any]]:
    return browsers.listing(db, situacao)


@router.post(
    "/{browser_id}/liberar",
    response_model=BrowserOut,
    description="Libera o navegador: a conta passa a entrar por ele. Admin não libera o próprio",
)
@limiter.limit("60/minute")
def approve_browser(
    request: Request, browser_id: int, db: DbSession, admin: AdminUser
) -> dict[str, Any]:
    browser = _handle(db, lambda: browsers.approve(db, browser_id, admin))
    return _one(db, browser)


@router.post(
    "/{browser_id}/recusar",
    response_model=BrowserOut,
    description="Recusa o pedido: o navegador continua sem entrar, e a pessoa vê o aviso",
)
@limiter.limit("60/minute")
def refuse_browser(
    request: Request, browser_id: int, db: DbSession, admin: AdminUser
) -> dict[str, Any]:
    browser = _handle(db, lambda: browsers.refuse(db, browser_id, admin))
    return _one(db, browser)


@router.post(
    "/{browser_id}/revogar",
    response_model=BrowserOut,
    description="Tira a liberação e encerra as sessões da conta; o próximo login ali vira pedido",
)
@limiter.limit("60/minute")
def revoke_browser(
    request: Request, browser_id: int, db: DbSession, admin: AdminUser
) -> dict[str, Any]:
    browser = _handle(db, lambda: browsers.revoke(db, browser_id, admin))
    return _one(db, browser)
