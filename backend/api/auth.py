from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from core.config import REFRESH_COOKIE_SECURE, REFRESH_TOKEN_EXPIRE_DAYS
from core.limiter import limiter
from core.security import hash_email
from db.connection import get_db
from models.user import User
from schemas.token import Token
from schemas.user import UserPublic
from services.auth import (
    check_credentials,
    get_current_user,
    issue_tokens,
    normalize_email,
    revoke_session,
    rotate_refresh_token,
)
from services.login_events import record_login_event, too_many_failures

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
RATE_LIMITED_DETAIL = "Muitas tentativas — aguarde alguns minutos"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=REFRESH_COOKIE_SECURE,
        samesite="strict",
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        httponly=True,
        secure=REFRESH_COOKIE_SECURE,
        samesite="strict",
        path="/auth",
    )


@router.post("/token", response_model=Token)
@limiter.limit("5/minute")
def login_for_access_token(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db),
) -> Token:
    email = normalize_email(form_data.username)
    email_hash = hash_email(email)
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    if too_many_failures(db, email_hash):
        # sem o hash: uma tentativa barrada não pode esticar o bloqueio
        record_login_event(db, user_id=None, success=False, reason="rate_limited", ip=client_ip)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=RATE_LIMITED_DETAIL)

    user, reason, account_id = check_credentials(db, email, form_data.password)
    if not user:
        record_login_event(
            db,
            user_id=account_id,
            email_hash=email_hash,
            success=False,
            reason=reason,
            ip=client_ip,
            user_agent=user_agent,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    record_login_event(
        db,
        user_id=user.id,
        email_hash=email_hash,
        success=True,
        ip=client_ip,
        user_agent=user_agent,
    )
    access_token, refresh_token = issue_tokens(db, user.id)
    _set_refresh_cookie(response, refresh_token)
    return Token(access_token=access_token, token_type="bearer")


# Folgado de propósito: o access token só vive em memória, então cada recarga de página
# renova, e o financeiro inteiro pode sair pelo mesmo IP. O token é aleatório: não há o
# que adivinhar aqui.
@router.post("/token/refresh", response_model=Token)
@limiter.limit("60/minute")
def refresh_access_token(
    request: Request,
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
    db: Session = Depends(get_db),
) -> Token | JSONResponse:
    tokens = rotate_refresh_token(db, refresh_token) if refresh_token else None
    if not tokens:
        # JSONResponse, não HTTPException: o cookie morto precisa sair junto com o 401
        denied = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Sua sessão expirou. Entre de novo"},
        )
        _clear_refresh_cookie(denied)
        return denied
    access_token, new_refresh_token = tokens
    _set_refresh_cookie(response, new_refresh_token)
    return Token(access_token=access_token, token_type="bearer")


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
    db: Session = Depends(get_db),
) -> None:
    if refresh_token:
        revoke_session(db, refresh_token)
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserPublic)
def read_me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user
