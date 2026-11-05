import base64
import hashlib
from collections.abc import Callable, Generator
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
import requests
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.config import FRONTEND_URL
from core.limiter import limiter
from models.login_event import LoginEvent
from models.refresh_token import RefreshToken
from models.sso_identity import SsoIdentity
from models.user import User
from services import sso
from tests.test_auth import bearer, login

EMAIL = "ana@pesquisemais.com.br"
TENANT = "tenant-da-empresa"
PROVIDER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)

GOOGLE = sso.Provider(
    name="google",
    authorize_url="https://google.test/auth",
    token_url="https://google.test/token",
    jwks_url="https://google.test/jwks",
    issuers=("https://accounts.google.com",),
    client_id="id-do-google",
    client_secret="segredo-do-google",  # gitleaks:allow
)
MICROSOFT = sso.Provider(
    name="microsoft",
    authorize_url="https://microsoft.test/auth",
    token_url="https://microsoft.test/token",
    jwks_url="https://microsoft.test/jwks",
    issuers=("https://microsoft.test/v2.0",),
    client_id="id-da-microsoft",
    client_secret="segredo-da-microsoft",  # gitleaks:allow
    tenant_id=TENANT,
)


class FakeProviderApi:
    """Faz o papel do token endpoint e guarda o que recebeu."""

    def __init__(self) -> None:
        self.received: dict[str, Any] = {}
        self.claims: dict[str, Any] = {}
        self.key: Any = PROVIDER_KEY
        self.fail_with: Exception | None = None

    def post(self, url: str, data: dict[str, Any], timeout: int) -> Any:
        self.received = {"url": url, **data}
        if self.fail_with:
            raise self.fail_with
        token = jwt.encode(self.claims, self.key, algorithm="RS256")

        class Reply:
            def raise_for_status(self) -> None:
                pass

            def json(self) -> dict[str, str]:
                return {"id_token": token}

        return Reply()


@pytest.fixture
def provider_api(monkeypatch: pytest.MonkeyPatch) -> Generator[FakeProviderApi, None, None]:
    fake = FakeProviderApi()
    monkeypatch.setattr(sso, "PROVIDERS", {"google": GOOGLE, "microsoft": MICROSOFT})
    monkeypatch.setattr(sso.requests, "post", fake.post)
    monkeypatch.setattr(sso, "_signing_key", lambda provider, token: PROVIDER_KEY.public_key())
    yield fake


def start(client: TestClient, provider: str = "google") -> dict[str, str]:
    """Inicia o login e devolve os parâmetros enviados ao provedor, com o cookie já guardado."""
    response = client.get(f"/auth/sso/{provider}/start", follow_redirects=False)
    assert response.status_code == 303
    query = parse_qs(urlparse(response.headers["location"]).query)
    return {key: values[0] for key, values in query.items()}


def google_claims(params: dict[str, str], **overrides: Any) -> dict[str, Any]:
    claims = {
        "iss": "https://accounts.google.com",
        "aud": GOOGLE.client_id,
        "sub": "123",
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(minutes=5),
        "nonce": params["nonce"],
        "email": EMAIL,
        "email_verified": True,
    }
    claims.update(overrides)
    return {key: value for key, value in claims.items() if value is not None}


def microsoft_claims(params: dict[str, str], **overrides: Any) -> dict[str, Any]:
    claims = {
        "iss": "https://microsoft.test/v2.0",
        "aud": MICROSOFT.client_id,
        "sub": "456",
        "oid": "oid-da-ana",
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(minutes=5),
        "nonce": params["nonce"],
        "tid": TENANT,
        "preferred_username": EMAIL,
    }
    claims.update(overrides)
    return {key: value for key, value in claims.items() if value is not None}


def callback(client: TestClient, params: dict[str, str], provider: str = "google"):  # type: ignore[no-untyped-def]
    return client.get(
        f"/auth/sso/{provider}/callback",
        params={"code": "codigo", "state": params["state"]},
        follow_redirects=False,
    )


def assert_denied(response: Any, client: TestClient, error: str = "sso_falhou") -> None:
    assert response.status_code == 303
    assert response.headers["location"] == f"{FRONTEND_URL}/login?erro={error}"
    assert "refresh_token" not in client.cookies


# ---- Início ----


def test_unknown_provider_is_404(client: TestClient, provider_api: FakeProviderApi) -> None:
    assert client.get("/auth/sso/github/start", follow_redirects=False).status_code == 404
    assert client.get("/auth/sso/github/callback", follow_redirects=False).status_code == 404


def test_provider_without_keys_goes_back_with_a_message(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    empty = sso.Provider("google", "", "", "", (), "", "")
    monkeypatch.setattr(sso, "PROVIDERS", {"google": empty})
    response = client.get("/auth/sso/google/start", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == f"{FRONTEND_URL}/login?erro=sso_indisponivel"


def test_microsoft_without_tenant_stays_off() -> None:
    # sem o tenant no ambiente de teste, a Microsoft não pode aceitar qualquer empresa
    assert sso.PROVIDERS["microsoft"].configured is False


def test_start_sends_what_the_provider_needs(
    client: TestClient, provider_api: FakeProviderApi
) -> None:
    response = client.get("/auth/sso/google/start", follow_redirects=False)
    target = urlparse(response.headers["location"])
    params = parse_qs(target.query)

    assert f"{target.scheme}://{target.netloc}{target.path}" == GOOGLE.authorize_url
    assert params["client_id"] == [GOOGLE.client_id]
    assert params["response_type"] == ["code"]
    assert params["code_challenge_method"] == ["S256"]
    assert params["redirect_uri"][0].endswith("/auth/sso/google/callback")
    assert "segredo" not in response.headers["location"]

    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/auth/sso" in cookie


def test_each_start_uses_new_state_and_nonce(
    client: TestClient, provider_api: FakeProviderApi
) -> None:
    first, second = start(client), start(client)
    assert first["state"] != second["state"]
    assert first["nonce"] != second["nonce"]


# ---- Volta do provedor ----


def test_google_login_opens_session_without_totp(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
) -> None:
    user = make_user(mfa=False)
    params = start(client)
    provider_api.claims = google_claims(params)

    response = callback(client, params)

    assert response.status_code == 303
    assert response.headers["location"] == f"{FRONTEND_URL}/"
    assert "refresh_token" in client.cookies
    assert "sso_state" not in client.cookies

    # a sessão funciona e continua renovando, mesmo sem TOTP cadastrado
    access = client.post("/auth/token/refresh").json()["access_token"]
    assert client.get("/auth/me", headers=bearer(access)).json()["email"] == EMAIL
    assert client.post("/auth/token/refresh").status_code == 200
    db_session.refresh(user)
    assert user.lastSignedInAt is not None
    assert db_session.query(LoginEvent).one().reason == "sso_google"


def test_pkce_verifier_matches_the_challenge(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user()
    params = start(client)
    provider_api.claims = google_claims(params)
    callback(client, params)

    sent = provider_api.received
    assert sent["url"] == GOOGLE.token_url
    assert sent["code"] == "codigo"
    assert sent["client_secret"] == GOOGLE.client_secret
    digest = hashlib.sha256(sent["code_verifier"].encode()).digest()
    assert base64.urlsafe_b64encode(digest).rstrip(b"=").decode() == params["code_challenge"]


def test_email_is_matched_ignoring_case(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user()
    params = start(client)
    provider_api.claims = google_claims(params, email="ANA@PesquiseMais.com.br")
    assert callback(client, params).headers["location"] == f"{FRONTEND_URL}/"


def test_microsoft_login_inside_the_company(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user(mfa=False)
    params = start(client, "microsoft")
    provider_api.claims = microsoft_claims(params)
    response = callback(client, params, "microsoft")
    assert response.headers["location"] == f"{FRONTEND_URL}/"
    assert "refresh_token" in client.cookies


def test_microsoft_refuses_another_company(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user()
    params = start(client, "microsoft")
    provider_api.claims = microsoft_claims(params, tid="outra-empresa")
    assert_denied(callback(client, params, "microsoft"), client)


@pytest.mark.parametrize("status", ["inactive", None], ids=["conta desativada", "sem conta"])
def test_no_active_account_means_no_login_and_no_new_account(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
    status: str | None,
) -> None:
    if status:
        make_user(status=status)
    before = db_session.query(User).count()
    params = start(client)
    provider_api.claims = google_claims(params)

    assert_denied(callback(client, params), client, "sso_conta")
    assert db_session.query(User).count() == before
    assert db_session.query(RefreshToken).count() == 0
    assert db_session.query(LoginEvent).one().reason == "sso_no_account"


def test_email_is_never_stored_in_the_event(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
) -> None:
    make_user()
    params = start(client)
    provider_api.claims = google_claims(params)
    callback(client, params)
    event = db_session.query(LoginEvent).one()
    assert EMAIL not in " ".join(str(v) for v in (event.reason, event.emailHash, event.userAgent))


# ---- Identificador fixo (PF-49) ----


def sso_login(
    client: TestClient, provider_api: FakeProviderApi, provider: str = "google", **overrides: Any
) -> Any:
    client.cookies.clear()
    params = start(client, provider)
    make = google_claims if provider == "google" else microsoft_claims
    provider_api.claims = make(params, **overrides)
    return callback(client, params, provider)


def test_first_login_saves_the_fixed_identifier(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
) -> None:
    user = make_user()
    sso_login(client, provider_api)
    sso_login(client, provider_api, "microsoft")
    saved = {(row.provider, row.subject) for row in db_session.query(SsoIdentity)}
    assert saved == {("google", "123"), ("microsoft", f"{TENANT}:oid-da-ana")}
    assert {row.user_id for row in db_session.query(SsoIdentity)} == {user.id}


@pytest.mark.parametrize("provider", ["google", "microsoft"])
def test_changing_the_email_at_the_provider_keeps_the_same_account(
    client: TestClient,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
    provider: str,
) -> None:
    make_user(mfa=False)
    assert sso_login(client, provider_api, provider).headers["location"] == f"{FRONTEND_URL}/"
    new_email = {
        "email": "ana.nova@pesquisemais.com.br",
        "preferred_username": "ana.nova@pesquisemais.com.br",
    }
    again = sso_login(client, provider_api, provider, **new_email)
    assert again.headers["location"] == f"{FRONTEND_URL}/"
    assert "refresh_token" in client.cookies


@pytest.mark.parametrize(
    ("provider", "other_person"),
    [("google", {"sub": "outra-pessoa"}), ("microsoft", {"oid": "outro-oid"})],
)
def test_someone_else_with_the_old_email_does_not_get_in(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
    provider: str,
    other_person: dict[str, str],
) -> None:
    make_user(mfa=False)
    sso_login(client, provider_api, provider)
    denied = sso_login(client, provider_api, provider, **other_person)
    assert_denied(denied, client, "sso_conta")
    assert db_session.query(SsoIdentity).count() == 1


def test_microsoft_without_a_fixed_identifier_is_refused(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user()
    assert_denied(sso_login(client, provider_api, "microsoft", oid=None), client)


def test_same_person_in_another_company_is_not_the_same_identifier(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
) -> None:
    make_user()
    sso_login(client, provider_api, "microsoft")
    assert db_session.query(SsoIdentity).one().subject.startswith(f"{TENANT}:")


# ---- Ataques e erros ----


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "app-de-outra-pessoa"},
        {"iss": "https://falso.test"},
        {"exp": datetime(2020, 1, 1, tzinfo=UTC)},
        {"nonce": "nonce-de-outro-login"},
        {"email_verified": False},
        {"email_verified": "false"},
        {"email_verified": None},
        {"email": None},
        {"email": "sem-arroba"},
    ],
    ids=[
        "app errado",
        "emissor errado",
        "vencido",
        "nonce errado",
        "e-mail não verificado",
        "verificado como texto",
        "sem verificação",
        "sem e-mail",
        "e-mail inválido",
    ],
)
def test_bad_id_token_is_refused(
    client: TestClient,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
    overrides: dict[str, Any],
) -> None:
    make_user()
    params = start(client)
    provider_api.claims = google_claims(params, **overrides)
    assert_denied(callback(client, params), client)


def test_token_signed_by_someone_else_is_refused(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user()
    params = start(client)
    provider_api.claims = google_claims(params)
    provider_api.key = OTHER_KEY
    assert_denied(callback(client, params), client)


def test_callback_without_the_browser_cookie_is_refused(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user()
    params = start(client)
    provider_api.claims = google_claims(params)
    client.cookies.clear()
    assert_denied(callback(client, params), client)
    assert provider_api.received == {}


def test_callback_with_another_state_is_refused(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user()
    params = start(client)
    provider_api.claims = google_claims(params)
    assert_denied(callback(client, {**params, "state": "de-outro-login"}), client)
    assert provider_api.received == {}


def test_cookie_from_one_provider_does_not_work_on_the_other(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user()
    params = start(client, "google")
    provider_api.claims = google_claims(params)
    assert_denied(callback(client, params, "microsoft"), client)


def test_user_who_cancelled_at_the_provider_goes_back_with_a_message(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    make_user()
    params = start(client)
    response = client.get(
        "/auth/sso/google/callback",
        params={"error": "access_denied", "state": params["state"]},
        follow_redirects=False,
    )
    assert_denied(response, client)
    assert provider_api.received == {}


@pytest.mark.parametrize(
    "failure",
    [requests.Timeout("lento"), requests.ConnectionError("fora")],
    ids=["demorou", "fora do ar"],
)
def test_provider_down_is_a_message_not_an_error_page(
    client: TestClient,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
    failure: Exception,
) -> None:
    make_user()
    params = start(client)
    provider_api.fail_with = failure
    assert_denied(callback(client, params), client)


def test_sso_session_is_not_a_way_around_the_password_second_factor(
    client: TestClient, make_user: Callable[..., User], provider_api: FakeProviderApi
) -> None:
    # entrar pelo Google não libera a senha sem TOTP
    make_user(mfa=False)
    params = start(client)
    provider_api.claims = google_claims(params)
    callback(client, params)
    client.cookies.clear()
    limiter.reset()

    challenge = login(client).json()
    assert challenge["setup_required"] is True
    assert client.get("/auth/me", headers=bearer(challenge["mfa_token"])).status_code == 401
