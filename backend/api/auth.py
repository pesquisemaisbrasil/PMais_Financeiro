from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from core.config import FRONTEND_URL, REFRESH_COOKIE_SECURE, REFRESH_TOKEN_EXPIRE_DAYS
from core.limiter import limiter
from core.security import hash_email
from db.connection import get_db
from models.user import User
from schemas.token import MfaChallenge, MfaCode, MfaSetup, Token, TokenWithRecoveryCodes
from schemas.user import UserPublic
from services import mfa, sso
from services.auth import (
    check_credentials,
    create_mfa_token,
    get_current_user,
    get_mfa_pending_user,
    issue_tokens,
    normalize_email,
    revoke_session,
    rotate_refresh_token,
)
from services.login_events import record_login_event, too_many_failures

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
RATE_LIMITED_DETAIL = "Muitas tentativas — aguarde alguns minutos"
INVALID_CODE_DETAIL = "Código de verificação inválido"
SSO_STATE_COOKIE = "sso_state"
SSO_COOKIE_PATH = "/auth/sso"


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


def _client_info(request: Request) -> dict[str, str | None]:
    return {
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }


def _start_session(
    db: Session, request: Request, response: Response, user: User, method: str | None = None
) -> str:
    """Só aqui o login termina: é o único caminho que grava o sucesso e entrega a sessão."""
    record_login_event(db, user_id=user.id, success=True, reason=method, **_client_info(request))
    access_token, refresh_token = issue_tokens(db, user.id)
    _set_refresh_cookie(response, refresh_token)
    return access_token


def _deny_mfa(db: Session, request: Request, user: User, reason: str, status_code: int) -> None:
    record_login_event(db, user_id=user.id, success=False, reason=reason, **_client_info(request))
    detail = RATE_LIMITED_DETAIL if status_code == 429 else INVALID_CODE_DETAIL
    raise HTTPException(status_code=status_code, detail=detail)


@router.post("/token", response_model=MfaChallenge)
@limiter.limit("5/minute")
def login_for_mfa_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Session = Depends(get_db),
) -> MfaChallenge:
    email = normalize_email(form_data.username)
    email_hash = hash_email(email)

    if too_many_failures(db, email_hash):
        # sem o hash: uma tentativa barrada não pode esticar o bloqueio
        record_login_event(
            db,
            user_id=None,
            success=False,
            reason="rate_limited",
            ip=_client_info(request)["ip"],
        )
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=RATE_LIMITED_DETAIL)

    user, reason, account_id = check_credentials(db, email, form_data.password)
    if not user:
        record_login_event(
            db,
            user_id=account_id,
            email_hash=email_hash,
            success=False,
            reason=reason,
            **_client_info(request),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return MfaChallenge(
        mfa_token=create_mfa_token(user.id),
        token_type="bearer",
        setup_required=user.mfaEnabledAt is None,
    )


@router.post("/token/mfa", response_model=Token)
@limiter.limit("5/minute")
def verify_mfa(
    request: Request,
    response: Response,
    body: MfaCode,
    user: Annotated[User, Depends(get_mfa_pending_user)],
    db: Session = Depends(get_db),
) -> Token:
    method: str | None = None
    try:
        method = mfa.verify_code(db, user, body.code)
    except mfa.MfaLocked:
        _deny_mfa(db, request, user, "mfa_locked", status.HTTP_429_TOO_MANY_REQUESTS)
    except mfa.InvalidMfaCode:
        _deny_mfa(db, request, user, "wrong_mfa_code", status.HTTP_401_UNAUTHORIZED)
    access_token = _start_session(db, request, response, user, method)
    return Token(access_token=access_token, token_type="bearer")


@router.post("/mfa/setup", response_model=MfaSetup)
@limiter.limit("20/minute")
def start_mfa_setup(
    request: Request,
    user: Annotated[User, Depends(get_mfa_pending_user)],
    db: Session = Depends(get_db),
) -> MfaSetup:
    try:
        secret, otpauth_uri = mfa.start_setup(db, user)
    except mfa.MfaAlreadyEnabled as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="O MFA já está cadastrado") from exc
    return MfaSetup(secret=secret, otpauth_uri=otpauth_uri)


@router.post("/mfa/setup/confirm", response_model=TokenWithRecoveryCodes)
@limiter.limit("5/minute")
def confirm_mfa_setup(
    request: Request,
    response: Response,
    body: MfaCode,
    user: Annotated[User, Depends(get_mfa_pending_user)],
    db: Session = Depends(get_db),
) -> TokenWithRecoveryCodes:
    codes: list[str] = []
    try:
        codes = mfa.confirm_setup(db, user, body.code)
    except mfa.MfaAlreadyEnabled as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="O MFA já está cadastrado") from exc
    except mfa.MfaLocked:
        _deny_mfa(db, request, user, "mfa_locked", status.HTTP_429_TOO_MANY_REQUESTS)
    except mfa.InvalidMfaCode:
        _deny_mfa(db, request, user, "wrong_mfa_code", status.HTTP_401_UNAUTHORIZED)
    access_token = _start_session(db, request, response, user)
    return TokenWithRecoveryCodes(
        access_token=access_token, token_type="bearer", recovery_codes=codes
    )


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


def _sso_provider(name: str) -> sso.Provider:
    provider = sso.PROVIDERS.get(name)
    if provider is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Não encontrado")
    return provider


def _back_to_login(error: str) -> RedirectResponse:
    response = RedirectResponse(f"{FRONTEND_URL}/login?erro={error}", status_code=303)
    response.delete_cookie(SSO_STATE_COOKIE, path=SSO_COOKIE_PATH)
    return response


@router.get("/sso/{provider_name}/start")
@limiter.limit("20/minute")
def start_sso(request: Request, provider_name: str) -> RedirectResponse:
    provider = _sso_provider(provider_name)
    if not provider.configured:
        return _back_to_login("sso_indisponivel")
    authorization_url, state_cookie = sso.build_authorization(provider)
    response = RedirectResponse(authorization_url, status_code=303)
    # Lax, não Strict: o cookie precisa voltar junto com o redirecionamento vindo do provedor.
    response.set_cookie(
        SSO_STATE_COOKIE,
        state_cookie,
        max_age=int(sso.STATE_LIFETIME.total_seconds()),
        httponly=True,
        secure=REFRESH_COOKIE_SECURE,
        samesite="lax",
        path=SSO_COOKIE_PATH,
    )
    return response


@router.get("/sso/{provider_name}/callback")
@limiter.limit("20/minute")
def finish_sso(
    request: Request,
    provider_name: str,
    code: str | None = None,
    state: str | None = None,
    sso_state: Annotated[str | None, Cookie()] = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    provider = _sso_provider(provider_name)
    try:
        identity = sso.complete_login(provider, code, state, sso_state)
    except sso.SsoError as exc:
        record_login_event(
            db, user_id=None, success=False, reason=f"sso_{exc.reason}", **_client_info(request)
        )
        return _back_to_login("sso_falhou")

    # Sem criação de conta: só entra quem já foi cadastrado no Financeiro.
    user = sso.find_account(db, provider, identity)
    if user is None or user.status != "active":
        record_login_event(
            db,
            user_id=user.id if user else None,
            success=False,
            reason="sso_no_account",
            **_client_info(request),
        )
        return _back_to_login("sso_conta")

    record_login_event(
        db, user_id=user.id, success=True, reason=f"sso_{provider.name}", **_client_info(request)
    )
    _, refresh_token = issue_tokens(db, user.id, via_sso=True)
    response = RedirectResponse(f"{FRONTEND_URL}/", status_code=303)
    _set_refresh_cookie(response, refresh_token)
    response.delete_cookie(SSO_STATE_COOKIE, path=SSO_COOKIE_PATH)
    return response


@router.get("/me", response_model=UserPublic)
def read_me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user
