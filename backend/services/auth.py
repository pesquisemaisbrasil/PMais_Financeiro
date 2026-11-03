import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

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


def normalize_email(email: str) -> str:
    return email.strip().lower()


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


def create_access_token(user_id: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def issue_tokens(db: Session, user_id: int, family_id: str | None = None) -> tuple[str, str]:
    refresh_token = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            user_id=user_id,
            familyId=family_id or uuid.uuid4().hex,
            tokenHash=hash_token(refresh_token),
            expiresAt=datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
            revoked=False,
        )
    )
    db.commit()
    return create_access_token(user_id), refresh_token


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


def _is_expired(db_token: RefreshToken) -> bool:
    expires_at = db_token.expiresAt
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at < datetime.now(UTC)


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
    if _is_expired(db_token):
        return None

    # conta desativada depois do login não renova sessão (mesmo 401 genérico do login)
    user = db.query(User).filter(User.id == db_token.user_id).first()
    if user is None or user.status != "active":
        _revoke_family(db, db_token.familyId)
        return None

    db_token.revoked = True
    return issue_tokens(db, user.id, db_token.familyId)


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
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
        user_id = int(payload["sub"])
    except (PyJWTError, ValueError):
        raise credentials_exception from None
    # papel e status vêm do banco a cada requisição: desativar vale na hora
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or user.status != "active":
        raise credentials_exception
    return user
