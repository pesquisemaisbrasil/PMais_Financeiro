import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import jwt
import pyotp
import pytest
from cryptography.exceptions import InvalidTag
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.config import ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, SECRET_KEY
from core.crypto import decrypt_payload, encrypt_payload
from core.limiter import limiter
from db.connection import Base
from models.login_event import LoginEvent
from models.mfa_recovery_code import MfaRecoveryCode
from models.refresh_token import RefreshToken
from models.user import User
from services.mfa import MAX_CONSECUTIVE_FAILURES, RECOVERY_CODE_COUNT, reset_mfa
from tests.conftest import PASSWORD, TOTP_SECRET
from tests.test_auth import bearer, login, sign_in

ANY_CODE = "000000"


def mfa_token(client: TestClient) -> str:
    return login(client).json()["mfa_token"]


def current_code(secret: str = TOTP_SECRET, offset: int = 0) -> str:
    return pyotp.TOTP(secret).at(int(time.time()), offset)


def wrong_code() -> str:
    """Um código que não é o de nenhuma janela aceita (a atual e as vizinhas)."""
    accepted = {current_code(offset=offset) for offset in (-1, 0, 1)}
    return next(f"{n:06d}" for n in range(1000) if f"{n:06d}" not in accepted)


def verify(client: TestClient, token: str, code: str):  # type: ignore[no-untyped-def]
    return client.post("/auth/token/mfa", json={"code": code}, headers=bearer(token))


def enroll(client: TestClient) -> tuple[str, list[str]]:
    """Cadastro completo a partir de uma conta sem MFA: (segredo, códigos de recuperação)."""
    token = mfa_token(client)
    secret = client.post("/auth/mfa/setup", headers=bearer(token)).json()["secret"]
    confirmed = client.post(
        "/auth/mfa/setup/confirm", json={"code": current_code(secret)}, headers=bearer(token)
    )
    assert confirmed.status_code == 200
    return secret, confirmed.json()["recovery_codes"]


# ---- Senha certa ainda não é login ----


def test_password_alone_gives_no_session(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    response = login(client)

    assert response.status_code == 200
    assert set(response.json()) == {"mfa_token", "token_type", "setup_required"}
    assert response.json()["setup_required"] is False
    assert "set-cookie" not in response.headers
    assert db_session.query(RefreshToken).count() == 0
    db_session.refresh(user)
    assert user.lastSignedInAt is None


def test_account_without_mfa_is_told_to_enroll(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user(mfa=False)
    assert login(client).json()["setup_required"] is True


def test_mfa_token_is_not_an_access_token(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    assert client.get("/auth/me", headers=bearer(mfa_token(client))).status_code == 401


def test_access_token_cannot_finish_mfa(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user()
    access_token = sign_in(client).json()["access_token"]

    response = verify(client, access_token, current_code(offset=1))
    assert response.status_code == 401
    assert response.json() == {"detail": "Código de verificação inválido"}


def test_expired_mfa_token_is_refused(client: TestClient, make_user: Callable[..., User]) -> None:
    user = make_user()
    expired = jwt.encode(
        {
            "sub": str(user.id),
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
            "type": "mfa_pending",
            "exp": datetime.now(UTC) - timedelta(minutes=1),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    response = verify(client, expired, current_code())
    assert response.status_code == 401
    assert response.json() == {"detail": "Código de verificação inválido"}


def test_account_deactivated_during_mfa_is_refused(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    token = mfa_token(client)
    user.status = "inactive"
    db_session.commit()
    assert verify(client, token, current_code()).status_code == 401


# ---- Cadastro ----


def test_first_login_enrolls_and_starts_session(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user(mfa=False)
    token = mfa_token(client)

    setup = client.post("/auth/mfa/setup", headers=bearer(token)).json()
    uri = urlparse(setup["otpauth_uri"])
    assert uri.scheme == "otpauth"
    assert parse_qs(uri.query)["secret"] == [setup["secret"]]
    assert parse_qs(uri.query)["issuer"] == ["P+ Financeiro"]

    confirmed = client.post(
        "/auth/mfa/setup/confirm",
        json={"code": current_code(setup["secret"])},
        headers=bearer(token),
    )
    assert confirmed.status_code == 200
    body = confirmed.json()
    assert len(body["recovery_codes"]) == RECOVERY_CODE_COUNT
    assert "refresh_token" in client.cookies
    assert client.get("/auth/me", headers=bearer(body["access_token"])).status_code == 200
    db_session.refresh(user)
    assert user.mfaEnabledAt is not None
    assert user.lastSignedInAt is not None


def test_secret_is_never_stored_in_clear(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user(mfa=False)
    secret = client.post("/auth/mfa/setup", headers=bearer(mfa_token(client))).json()["secret"]

    db_session.refresh(user)
    assert user.totpSecretEncrypted
    assert secret not in user.totpSecretEncrypted
    assert decrypt_payload(user.totpSecretEncrypted, f"users:totpSecretEncrypted:{user.id}") == (
        secret
    )


def test_encrypted_secret_does_not_open_on_another_account() -> None:
    envelope = encrypt_payload(TOTP_SECRET, "users:totpSecretEncrypted:1")
    with pytest.raises(InvalidTag):
        decrypt_payload(envelope, "users:totpSecretEncrypted:2")


def test_repeating_setup_keeps_the_same_secret(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user(mfa=False)
    token = mfa_token(client)
    first = client.post("/auth/mfa/setup", headers=bearer(token)).json()
    second = client.post("/auth/mfa/setup", headers=bearer(token)).json()
    assert first == second


def test_wrong_code_does_not_enable_mfa(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user(mfa=False)
    token = mfa_token(client)
    client.post("/auth/mfa/setup", headers=bearer(token))

    response = client.post(
        "/auth/mfa/setup/confirm", json={"code": ANY_CODE}, headers=bearer(token)
    )
    assert response.status_code == 401
    db_session.refresh(user)
    assert user.mfaEnabledAt is None
    assert db_session.query(MfaRecoveryCode).count() == 0
    assert "refresh_token" not in client.cookies


def test_confirm_without_setup_is_refused(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user(mfa=False)
    response = client.post(
        "/auth/mfa/setup/confirm", json={"code": ANY_CODE}, headers=bearer(mfa_token(client))
    )
    assert response.status_code == 401


def test_enrolled_account_cannot_enroll_again(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    token = mfa_token(client)

    assert client.post("/auth/mfa/setup", headers=bearer(token)).status_code == 409
    confirm = client.post(
        "/auth/mfa/setup/confirm", json={"code": current_code()}, headers=bearer(token)
    )
    assert confirm.status_code == 409


def test_account_without_mfa_cannot_use_verify(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user(mfa=False)
    assert verify(client, mfa_token(client), ANY_CODE).status_code == 401


# ---- Verificação ----


def test_right_code_starts_session(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    response = verify(client, mfa_token(client), current_code())

    assert response.status_code == 200
    assert set(response.json()) == {"access_token", "token_type"}
    assert (
        client.get("/auth/me", headers=bearer(response.json()["access_token"])).status_code == 200
    )
    assert "refresh_token" in client.cookies
    db_session.refresh(user)
    assert user.lastSignedInAt is not None


def test_same_code_cannot_be_used_twice(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user()
    code = current_code()
    assert verify(client, mfa_token(client), code).status_code == 200

    client.cookies.clear()
    replay = verify(client, mfa_token(client), code)
    assert replay.status_code == 401
    assert "refresh_token" not in client.cookies


def test_older_window_cannot_follow_a_newer_one(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    assert verify(client, mfa_token(client), current_code(offset=1)).status_code == 200
    assert verify(client, mfa_token(client), current_code()).status_code == 401


def test_clock_slightly_behind_is_accepted(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    assert verify(client, mfa_token(client), current_code(offset=-1)).status_code == 200


def test_code_from_far_away_is_refused(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user()
    assert verify(client, mfa_token(client), current_code(offset=5)).status_code == 401


def test_code_with_invalid_characters_is_refused_without_crashing(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    assert verify(client, mfa_token(client), "çódigo-inválido").status_code == 422


def test_wrong_code_is_logged_without_the_code(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    verify(client, mfa_token(client), wrong_code())

    event = db_session.query(LoginEvent).one()
    assert (event.success, event.reason, event.user_id) == (False, "wrong_mfa_code", user.id)
    # não entra na conta de falhas de senha por e-mail
    assert event.emailHash is None


# ---- Códigos de recuperação ----


def test_recovery_code_works_only_once(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    make_user(mfa=False)
    _, codes = enroll(client)
    client.cookies.clear()
    limiter.reset()

    first = verify(client, mfa_token(client), codes[0])
    assert first.status_code == 200
    assert "refresh_token" in client.cookies
    assert db_session.query(LoginEvent).order_by(LoginEvent.id.desc()).first().reason == (
        "recovery_code"
    )

    client.cookies.clear()
    again = verify(client, mfa_token(client), codes[0])
    assert again.status_code == 401
    assert "refresh_token" not in client.cookies


def test_recovery_code_accepts_lowercase_and_no_dashes(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user(mfa=False)
    _, codes = enroll(client)
    limiter.reset()
    assert verify(client, mfa_token(client), codes[1].replace("-", "").lower()).status_code == 200


def test_recovery_codes_are_stored_only_as_hash(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    make_user(mfa=False)
    _, codes = enroll(client)
    stored = [row.codeHash for row in db_session.query(MfaRecoveryCode).all()]
    assert len(stored) == RECOVERY_CODE_COUNT
    assert len(set(codes)) == RECOVERY_CODE_COUNT
    for code in codes:
        assert code not in stored
        assert code.replace("-", "") not in stored


def test_recovery_code_of_another_account_is_refused(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user(mfa=False)
    _, codes = enroll(client)
    make_user(email="bia@pesquisemais.com.br")
    limiter.reset()

    token = login(client, email="bia@pesquisemais.com.br").json()["mfa_token"]
    assert verify(client, token, codes[0]).status_code == 401


# ---- Limites ----


def test_ip_limit_on_verify(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user()
    token = mfa_token(client)
    code = wrong_code()
    for _ in range(5):
        assert verify(client, token, code).status_code == 401

    blocked = verify(client, token, current_code())
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "Muitas tentativas — aguarde alguns minutos"}


def test_ten_failures_lock_the_account_even_with_the_right_code(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = make_user()
    monkeypatch.setattr(limiter, "enabled", False)
    token = mfa_token(client)
    code = wrong_code()
    for _ in range(MAX_CONSECUTIVE_FAILURES):
        assert verify(client, token, code).status_code == 401

    locked = verify(client, token, current_code())
    assert locked.status_code == 429
    assert locked.json() == {"detail": "Muitas tentativas — aguarde alguns minutos"}
    assert "refresh_token" not in client.cookies
    assert db_session.query(LoginEvent).order_by(LoginEvent.id.desc()).first().reason == (
        "mfa_locked"
    )

    # passado o bloqueio, o código certo volta a valer e a contagem recomeça
    user.mfaLockedUntil = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    assert verify(client, token, current_code()).status_code == 200
    db_session.refresh(user)
    assert user.mfaFailedAttempts == 0
    assert user.mfaLockedUntil is None


def test_lock_also_applies_during_setup(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    make_user(mfa=False)
    monkeypatch.setattr(limiter, "enabled", False)
    token = mfa_token(client)
    secret = client.post("/auth/mfa/setup", headers=bearer(token)).json()["secret"]
    accepted = {current_code(secret, offset) for offset in (-1, 0, 1)}
    code = next(f"{n:06d}" for n in range(1000) if f"{n:06d}" not in accepted)
    for _ in range(MAX_CONSECUTIVE_FAILURES):
        client.post("/auth/mfa/setup/confirm", json={"code": code}, headers=bearer(token))

    locked = client.post(
        "/auth/mfa/setup/confirm", json={"code": current_code(secret)}, headers=bearer(token)
    )
    assert locked.status_code == 429


def test_success_clears_the_failure_count(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = make_user()
    monkeypatch.setattr(limiter, "enabled", False)
    token = mfa_token(client)
    verify(client, token, wrong_code())
    db_session.refresh(user)
    assert user.mfaFailedAttempts == 1

    verify(client, token, current_code())
    db_session.refresh(user)
    assert user.mfaFailedAttempts == 0


# ---- Sessões e reset ----


def test_session_of_account_without_mfa_does_not_renew(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    sign_in(client)
    user.mfaEnabledAt = None
    db_session.commit()

    assert client.post("/auth/token/refresh").status_code == 401
    assert db_session.query(RefreshToken).filter(RefreshToken.revoked.is_(False)).count() == 0


def test_refresh_keeps_working_without_asking_the_code_again(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    sign_in(client)
    assert client.post("/auth/token/refresh").status_code == 200


def test_reset_clears_everything_and_drops_sessions(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user(mfa=False)
    _, codes = enroll(client)
    access_token = client.post("/auth/token/refresh").json()["access_token"]
    assert client.get("/auth/me", headers=bearer(access_token)).status_code == 200

    reset_mfa(db_session, user)

    assert client.get("/auth/me", headers=bearer(access_token)).status_code == 401
    assert client.post("/auth/token/refresh").status_code == 401
    assert db_session.query(MfaRecoveryCode).count() == 0
    limiter.reset()
    challenge = login(client).json()
    assert challenge["setup_required"] is True
    assert verify(client, challenge["mfa_token"], codes[0]).status_code == 401


def test_password_limit_is_not_touched_by_mfa_failures(
    client: TestClient, make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch
) -> None:
    make_user()
    monkeypatch.setattr(limiter, "enabled", False)
    token = mfa_token(client)
    code = wrong_code()
    for _ in range(MAX_CONSECUTIVE_FAILURES - 1):
        verify(client, token, code)
    assert (
        client.post(
            "/auth/token", data={"username": "ana@pesquisemais.com.br", "password": PASSWORD}
        ).status_code
        == 200
    )


def test_schema_stores_no_totp_secret_in_clear() -> None:
    columns = Base.metadata.tables["users"].columns.keys()
    assert "totpSecretEncrypted" in columns
    assert "totpSecret" not in columns
