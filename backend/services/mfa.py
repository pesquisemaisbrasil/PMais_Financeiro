"""Segundo fator: TOTP e códigos de recuperação. Regras na spec acesso-e-auditoria."""

import base64
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import pyotp
from sqlalchemy.orm import Session

from core.crypto import decrypt_payload, encrypt_payload
from core.security import hash_token
from models.mfa_recovery_code import MfaRecoveryCode
from models.refresh_token import RefreshToken
from models.user import User
from services.auth import as_utc

ISSUER = "P+ Financeiro"
MAX_CONSECUTIVE_FAILURES = 10
LOCK_DURATION = timedelta(minutes=15)
RECOVERY_CODE_COUNT = 10
RECOVERY_METHOD = "recovery_code"


class MfaAlreadyEnabled(Exception):
    pass


class MfaLocked(Exception):
    pass


class InvalidMfaCode(Exception):
    pass


def _aad(user: User) -> str:
    return f"users:totpSecretEncrypted:{user.id}"


def _normalize_code(code: str) -> str:
    return code.replace(" ", "").replace("-", "").upper()


def _ensure_not_locked(user: User) -> None:
    if user.mfaLockedUntil is not None and as_utc(user.mfaLockedUntil) > datetime.now(UTC):
        raise MfaLocked


def _accept_totp(user: User, code: str) -> bool:
    """Aceita a janela atual e as vizinhas (relógio do celular adiantado ou atrasado), mas
    nunca uma janela já usada: quem vê um código passar não consegue repeti-lo."""
    if not user.totpSecretEncrypted:
        return False
    totp = pyotp.TOTP(decrypt_payload(user.totpSecretEncrypted, _aad(user)))
    current_step = totp.timecode(datetime.now(UTC))
    for step in (current_step - 1, current_step, current_step + 1):
        if user.totpLastUsedStep is not None and step <= user.totpLastUsedStep:
            continue
        if hmac.compare_digest(totp.generate_otp(step), code):
            user.totpLastUsedStep = step
            return True
    return False


def _accept_recovery_code(db: Session, user: User, code: str) -> bool:
    recovery_code = (
        db.query(MfaRecoveryCode)
        .filter(
            MfaRecoveryCode.user_id == user.id,
            MfaRecoveryCode.codeHash == hash_token(code),
            MfaRecoveryCode.usedAt.is_(None),
        )
        .first()
    )
    if recovery_code is None:
        return False
    recovery_code.usedAt = datetime.now(UTC)
    return True


def _register_failure(db: Session, user: User) -> None:
    user.mfaFailedAttempts += 1
    if user.mfaFailedAttempts >= MAX_CONSECUTIVE_FAILURES:
        user.mfaLockedUntil = datetime.now(UTC) + LOCK_DURATION
        user.mfaFailedAttempts = 0
    db.commit()


def _clear_failures(user: User) -> None:
    user.mfaFailedAttempts = 0
    user.mfaLockedUntil = None


def _new_recovery_codes(db: Session, user: User) -> list[str]:
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = base64.b32encode(secrets.token_bytes(10)).decode()  # 80 bits, 16 caracteres
        db.add(MfaRecoveryCode(user_id=user.id, codeHash=hash_token(raw)))
        codes.append("-".join(raw[i : i + 4] for i in range(0, len(raw), 4)))
    return codes


def start_setup(db: Session, user: User) -> tuple[str, str]:
    """Devolve (segredo, URI do QR code). Cada pedido gera um segredo novo: quem guardou uma
    cópia antes de a dona confirmar, como alguém com a senha vazada, fica sem nada que valha."""
    if user.mfaEnabledAt is not None:
        raise MfaAlreadyEnabled
    secret = pyotp.random_base32()
    user.totpSecretEncrypted = encrypt_payload(secret, _aad(user))
    db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=ISSUER)
    return secret, uri


def confirm_setup(db: Session, user: User, code: str) -> list[str]:
    """O primeiro código prova que o app foi cadastrado. Devolve os códigos de recuperação."""
    if user.mfaEnabledAt is not None:
        raise MfaAlreadyEnabled
    _ensure_not_locked(user)
    if not _accept_totp(user, _normalize_code(code)):
        _register_failure(db, user)
        raise InvalidMfaCode
    user.mfaEnabledAt = datetime.now(UTC)
    _clear_failures(user)
    codes = _new_recovery_codes(db, user)
    db.commit()
    return codes


def verify_code(db: Session, user: User, code: str) -> str | None:
    """Confere o código do app ou um de recuperação. Devolve RECOVERY_METHOD quando foi
    código de recuperação, para o evento de login registrar."""
    _ensure_not_locked(user)
    normalized = _normalize_code(code)
    if user.mfaEnabledAt is None:
        raise InvalidMfaCode
    method: str | None = None
    if not _accept_totp(user, normalized):
        if not _accept_recovery_code(db, user, normalized):
            _register_failure(db, user)
            raise InvalidMfaCode
        method = RECOVERY_METHOD
    _clear_failures(user)
    db.commit()
    return method


def reset_mfa(db: Session, user: User) -> None:
    """Apaga o MFA e derruba as sessões: no próximo login a pessoa cadastra de novo."""
    user.totpSecretEncrypted = None
    user.mfaEnabledAt = None
    user.totpLastUsedStep = None
    _clear_failures(user)
    db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == user.id).delete()
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update(
        {RefreshToken.revoked: True}
    )
    db.commit()
