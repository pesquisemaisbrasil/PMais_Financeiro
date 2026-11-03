import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import jwt
import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import api.auth as auth_api
from core.config import ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, SECRET_KEY
from core.limiter import limiter
from core.net import mask_ip
from db.connection import Base
from models.login_event import LoginEvent
from models.refresh_token import RefreshToken
from models.user import User
from schemas.user import validate_password_strength
from services.login_events import MAX_FAILURES_PER_EMAIL
from tests.conftest import PASSWORD, TOTP_SECRET

EMAIL = "ana@pesquisemais.com.br"


def login(client: TestClient, email: str = EMAIL, password: str = PASSWORD):  # type: ignore[no-untyped-def]
    return client.post("/auth/token", data={"username": email, "password": password})


def sign_in(client: TestClient, offset: int = 0):  # type: ignore[no-untyped-def]
    """Login completo. `offset` escolhe a janela do código: o mesmo código não vale duas vezes."""
    token = login(client).json()["mfa_token"]
    code = pyotp.TOTP(TOTP_SECRET).at(int(time.time()), offset)
    return client.post("/auth/token/mfa", json={"code": code}, headers=bearer(token))


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def make_token(user_id: int, **overrides: object) -> str:
    claims: dict[str, object] = {
        "sub": str(user_id),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "type": "access",
        "exp": datetime.now(UTC) + timedelta(minutes=5),
    }
    claims.update(overrides)
    return jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)


# ---- Login ----


def test_login_success(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user()
    response = sign_in(client)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"access_token", "token_type"}  # refresh nunca no corpo
    assert client.get("/auth/me", headers=bearer(body["access_token"])).json()["email"] == EMAIL


def test_login_ignores_email_case_and_spaces(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    assert login(client, email="  ANA@PesquiseMais.com.br ").status_code == 200


def test_refresh_cookie_attributes(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user()
    cookie = sign_in(client).headers["set-cookie"].lower()

    assert "httponly" in cookie
    assert "samesite=strict" in cookie
    assert "path=/auth" in cookie
    assert "max-age=604800" in cookie


def test_refresh_cookie_is_secure_when_configured(
    client: TestClient, make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch
) -> None:
    make_user()
    monkeypatch.setattr(auth_api, "REFRESH_COOKIE_SECURE", True)
    assert "secure" in sign_in(client).headers["set-cookie"].lower()


@pytest.mark.parametrize(
    ("email", "password", "status"),
    [
        (EMAIL, "WrongPass1!", "active"),
        ("ninguem@pesquisemais.com.br", PASSWORD, "active"),
        (EMAIL, PASSWORD, "inactive"),
    ],
    ids=["senha errada", "e-mail desconhecido", "conta desativada"],
)
def test_login_denied_is_always_the_same_answer(
    client: TestClient, make_user: Callable[..., User], email: str, password: str, status: str
) -> None:
    make_user(status=status)
    response = login(client, email=email, password=password)

    assert response.status_code == 401
    assert response.json() == {"detail": "E-mail ou senha incorretos"}
    assert "set-cookie" not in response.headers


def test_login_event_has_no_personal_data_in_clear(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    login(client, password="WrongPass1!")
    sign_in(client)

    failure, success = db_session.query(LoginEvent).order_by(LoginEvent.id).all()
    assert (failure.success, failure.reason, failure.user_id) == (False, "wrong_password", user.id)
    assert success.success is True
    assert failure.emailHash and EMAIL not in failure.emailHash
    assert success.userAgent
    db_session.refresh(user)
    assert user.lastSignedInAt is not None


@pytest.mark.parametrize(
    "password", ["x" * 5000, "com" + chr(0) + "nulo"], ids=["acima de 4096 bytes", "byte nulo"]
)
def test_password_bcrypt_refuses_is_just_a_wrong_password(
    client: TestClient, make_user: Callable[..., User], password: str
) -> None:
    make_user()
    response = login(client, password=password)
    assert response.status_code == 401
    assert response.json() == {"detail": "E-mail ou senha incorretos"}


def test_ip_is_always_masked() -> None:
    assert mask_ip("200.1.2.3") == "200.1.2.0"
    assert mask_ip("2001:db8:1:2:3:4:5:6") == "2001:db8:1::"
    assert mask_ip("testclient") is None


# ---- Limites ----


def test_ip_limit_returns_429(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user()
    for _ in range(5):
        assert login(client, password="WrongPass1!").status_code == 401

    blocked = login(client)
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "Muitas tentativas — aguarde alguns minutos"}


@pytest.mark.parametrize(
    "email", [EMAIL, "ninguem@pesquisemais.com.br"], ids=["com conta", "sem conta"]
)
def test_email_limit_does_not_reveal_who_exists(
    client: TestClient,
    make_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
    email: str,
) -> None:
    make_user()
    monkeypatch.setattr(limiter, "enabled", False)
    for _ in range(MAX_FAILURES_PER_EMAIL):
        assert login(client, email=email, password="WrongPass1!").status_code == 401

    # bloqueado mesmo com a senha certa, e o outro e-mail segue livre
    assert login(client, email=email).status_code == 429
    assert login(client, email="outra@pesquisemais.com.br").status_code == 401


def test_blocked_attempts_do_not_extend_the_block(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    make_user()
    monkeypatch.setattr(limiter, "enabled", False)
    for _ in range(MAX_FAILURES_PER_EMAIL):
        login(client, password="WrongPass1!")
    login(client)

    db_session.query(LoginEvent).filter(LoginEvent.emailHash.isnot(None)).update(
        {LoginEvent.createdAt: datetime.now(UTC) - timedelta(hours=2)}
    )
    db_session.commit()
    assert login(client).status_code == 200


# ---- Rotas autenticadas ----


def test_me_without_token(client: TestClient) -> None:
    assert client.get("/auth/me").status_code == 401


@pytest.mark.parametrize(
    "overrides",
    [
        {"exp": datetime.now(UTC) - timedelta(minutes=1)},
        {"aud": "outro-sistema"},
        {"iss": "pconnect"},
        {"sub": "nao-e-numero"},
        {"type": "mfa_pending"},
        {"type": None},
    ],
    ids=["expirado", "aud errado", "iss errado", "sub inválido", "token parcial", "sem tipo"],
)
def test_me_rejects_bad_claims(
    client: TestClient, make_user: Callable[..., User], overrides: dict[str, object]
) -> None:
    user = make_user()
    token = make_token(user.id, **overrides)
    assert client.get("/auth/me", headers=bearer(token)).status_code == 401


def test_me_accepts_valid_access_token(client: TestClient, make_user: Callable[..., User]) -> None:
    user = make_user()
    assert client.get("/auth/me", headers=bearer(make_token(user.id))).status_code == 200


def test_me_rejects_token_signed_with_other_key(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    user = make_user()
    claims = {
        "sub": str(user.id),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "type": "access",
        "exp": 9999999999,
    }
    token = jwt.encode(claims, "outra-chave-com-pelo-menos-32-caracteres!", algorithm=ALGORITHM)
    assert client.get("/auth/me", headers=bearer(token)).status_code == 401


def test_me_rejects_inactive_account_right_away(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    token = sign_in(client).json()["access_token"]

    user.status = "inactive"
    db_session.commit()
    assert client.get("/auth/me", headers=bearer(token)).status_code == 401


def test_refresh_cookie_value_is_not_an_access_token(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    sign_in(client)
    refresh = client.cookies["refresh_token"]
    assert client.get("/auth/me", headers=bearer(refresh)).status_code == 401


# ---- Refresh ----


def test_refresh_rotates_and_keeps_session(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    sign_in(client)
    before = client.cookies["refresh_token"]

    response = client.post("/auth/token/refresh")

    assert response.status_code == 200
    assert client.cookies["refresh_token"] != before
    assert (
        client.get("/auth/me", headers=bearer(response.json()["access_token"])).status_code == 200
    )


def test_refresh_without_cookie(client: TestClient) -> None:
    assert client.post("/auth/token/refresh").status_code == 401


def test_refresh_reuse_revokes_whole_family(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    make_user()
    sign_in(client)
    stolen = client.cookies["refresh_token"]
    client.post("/auth/token/refresh")
    current = client.cookies["refresh_token"]

    client.cookies.clear()
    reuse = client.post("/auth/token/refresh", cookies={"refresh_token": stolen})
    assert reuse.status_code == 401

    # até o token novo, que estava válido, caiu junto
    client.cookies.clear()
    assert client.post("/auth/token/refresh", cookies={"refresh_token": current}).status_code == 401
    assert db_session.query(RefreshToken).filter(RefreshToken.revoked.is_(False)).count() == 0


def test_reuse_does_not_touch_other_sessions(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    sign_in(client, offset=-1)
    other_session = client.cookies["refresh_token"]
    client.cookies.clear()
    sign_in(client)
    stolen = client.cookies["refresh_token"]
    client.post("/auth/token/refresh")

    client.cookies.clear()
    client.post("/auth/token/refresh", cookies={"refresh_token": stolen})

    client.cookies.clear()
    assert (
        client.post("/auth/token/refresh", cookies={"refresh_token": other_session}).status_code
        == 200
    )


def test_refresh_denied_clears_the_cookie(client: TestClient) -> None:
    response = client.post("/auth/token/refresh", cookies={"refresh_token": "inexistente"})
    assert response.status_code == 401
    assert 'refresh_token=""' in response.headers["set-cookie"]


def test_expired_refresh_is_refused(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    make_user()
    sign_in(client)
    db_session.query(RefreshToken).update(
        {RefreshToken.expiresAt: datetime.now(UTC) - timedelta(minutes=1)}
    )
    db_session.commit()
    assert client.post("/auth/token/refresh").status_code == 401


def test_deactivated_account_loses_session_on_next_refresh(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    sign_in(client)
    user.status = "inactive"
    db_session.commit()

    assert client.post("/auth/token/refresh").status_code == 401
    assert db_session.query(RefreshToken).filter(RefreshToken.revoked.is_(False)).count() == 0


def test_refresh_limit_survives_a_team_reloading_pages(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()
    sign_in(client)
    for _ in range(30):
        assert client.post("/auth/token/refresh").status_code == 200


# ---- Logout ----


def test_logout_revokes_session(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    make_user()
    sign_in(client)
    token = client.cookies["refresh_token"]

    assert client.post("/auth/logout").status_code == 204
    assert client.post("/auth/token/refresh", cookies={"refresh_token": token}).status_code == 401
    assert db_session.query(RefreshToken).filter(RefreshToken.revoked.is_(False)).count() == 0


def test_logout_without_session_is_harmless(client: TestClient) -> None:
    assert client.post("/auth/logout").status_code == 204


# ---- Segurança geral ----


def test_security_headers_on_every_response(client: TestClient) -> None:
    headers = client.get("/healthz").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "no-referrer"
    assert headers["cache-control"] == "no-store"


def test_readyz_reports_database(client: TestClient) -> None:
    assert client.get("/readyz").json() == {"status": "ok", "db": "reachable"}


def test_schema_has_no_cpf_nor_pix_column() -> None:
    columns = [c.name.lower() for table in Base.metadata.tables.values() for c in table.columns]
    assert not [name for name in columns if "cpf" in name or "pix" in name]


@pytest.mark.parametrize(
    "weak",
    ["Curta1!", "semmaiuscula1!", "SEMMINUSCULA1!", "SemNumero!", "SemEspecial1", "Tem Espaco1!"],
)
def test_weak_passwords_are_refused(weak: str) -> None:
    with pytest.raises(ValueError):
        validate_password_strength(weak)


def test_strong_password_is_accepted() -> None:
    assert validate_password_strength(PASSWORD) == PASSWORD
