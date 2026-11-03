import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError
from sqlalchemy.orm import Session

from core.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    JWT_AUDIENCE,
    JWT_ISSUER,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
)
from core.security import dummy_verify_password, hash_token, verify_password
from db.connection import get_db
from models.refresh_token import RefreshToken
from models.user import User

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

ACCESS_TOKEN_TYPE = "access"
MFA_TOKEN_TYPE = "mfa_pending"
MFA_TOKEN_EXPIRE_MINUTES = 5


def normalize_email(email: str) -> str:
    return email.strip().lower()


def as_utc(value: datetime) -> datetime:
    """O SQLite devolve data sem fuso; o Postgres, com."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def check_credentials(
    db: Session, email: str, password: str
) -> tuple[User | None, str | None, int | None]:
    """(usuário, motivo da recusa, id da conta identificada). O motivo só vai para
    `login_events`: a resposta ao cliente continua o mesmo 401 genérico."""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        dummy_verify_password()
        return None, "unknown_account", None
    if not verify_password(password, user.passwordHash):
        return None, "wrong_password", user.id
    # inativo recebe o mesmo 401 genérico: não revela que a conta existe
    if user.status != "active":
        return None, "inactive_account", user.id
    return user, None, user.id


def _create_token(user_id: int, token_type: str, lifetime: timedelta, via_sso: bool = False) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
    }
    if via_sso:
        payload["sso"] = True
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(user_id: int, via_sso: bool = False) -> str:
    return _create_token(
        user_id, ACCESS_TOKEN_TYPE, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES), via_sso
    )


def create_mfa_token(user_id: int) -> str:
    return _create_token(user_id, MFA_TOKEN_TYPE, timedelta(minutes=MFA_TOKEN_EXPIRE_MINUTES))


def _decode_token(token: str, token_type: str) -> dict[str, Any] | None:
    """Conteúdo do token, se for válido e do tipo pedido: o token parcial do MFA nunca serve
    como token de acesso, e vice-versa."""
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
        int(payload["sub"])
    except (PyJWTError, ValueError):
        return None
    return payload if payload.get("type") == token_type else None


def issue_tokens(
    db: Session, user_id: int, family_id: str | None = None, via_sso: bool = False
) -> tuple[str, str]:
    refresh_token = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            user_id=user_id,
            familyId=family_id or uuid.uuid4().hex,
            tokenHash=hash_token(refresh_token),
            expiresAt=datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
            revoked=False,
            viaSso=via_sso,
        )
    )
    db.commit()
    return create_access_token(user_id, via_sso), refresh_token


def _find_refresh_token(db: Session, token: str) -> RefreshToken | None:
    # FOR UPDATE: duas renovações simultâneas do mesmo token não passam as duas
    return (
        db.query(RefreshToken)
        .filter(RefreshToken.tokenHash == hash_token(token))
        .with_for_update()
        .first()
    )


def _revoke_family(db: Session, family_id: str) -> None:
    db.query(RefreshToken).filter(RefreshToken.familyId == family_id).update(
        {RefreshToken.revoked: True}
    )
    db.commit()


def rotate_refresh_token(db: Session, token: str) -> tuple[str, str] | None:
    db_token = _find_refresh_token(db, token)
    if db_token is None:
        return None
    if db_token.revoked:
        # Token já trocado que reaparece foi roubado ou repetido: não dá para saber
        # quem é o dono legítimo, então a sessão inteira cai.
        logger.warning("Reuso de refresh token: família revogada")
        _revoke_family(db, db_token.familyId)
        return None
    if as_utc(db_token.expiresAt) < datetime.now(UTC):
        return None

    # Conta desativada não renova sessão (mesmo 401 genérico do login). Sem MFA, só quem
    # entrou pelo Google ou pela Microsoft, porque o segundo fator foi o deles.
    user = db.query(User).filter(User.id == db_token.user_id).first()
    if (
        user is None
        or user.status != "active"
        or (user.mfaEnabledAt is None and not db_token.viaSso)
    ):
        _revoke_family(db, db_token.familyId)
        return None

    db_token.revoked = True
    return issue_tokens(db, user.id, db_token.familyId, db_token.viaSso)


def revoke_session(db: Session, token: str) -> None:
    db_token = _find_refresh_token(db, token)
    if db_token is not None:
        _revoke_family(db, db_token.familyId)


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = _decode_token(token, ACCESS_TOKEN_TYPE)
    if payload is None:
        raise credentials_exception
    # papel, status e MFA vêm do banco a cada requisição: desativar ou resetar vale na hora
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if (
        user is None
        or user.status != "active"
        or (user.mfaEnabledAt is None and not payload.get("sso"))
    ):
        raise credentials_exception
    return user


def get_mfa_pending_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    denied = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Código de verificação inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = _decode_token(token, MFA_TOKEN_TYPE)
    if payload is None:
        raise denied
    # FOR UPDATE: dois envios simultâneos do mesmo código não passam os dois
    user = db.query(User).filter(User.id == int(payload["sub"])).with_for_update().first()
    if user is None or user.status != "active":
        raise denied
    return user
