"""Login por Google e Microsoft (OpenID Connect, fluxo de código com PKCE).

O segundo fator é o do provedor. Só o e-mail confirmado por ele sai daqui: quem decide se a
pessoa tem conta no Financeiro é a rota, e não há criação de conta.
"""

import base64
import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import jwt
import requests
from jwt import PyJWKClient, PyJWTError

from core.config import (
    ALGORITHM,
    API_PUBLIC_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    JWT_AUDIENCE,
    JWT_ISSUER,
    MICROSOFT_CLIENT_ID,
    MICROSOFT_CLIENT_SECRET,
    MICROSOFT_TENANT_ID,
    SECRET_KEY,
)

STATE_LIFETIME = timedelta(minutes=10)
STATE_TOKEN_TYPE = "sso_state"
HTTP_TIMEOUT_SECONDS = 10


class SsoError(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class Provider:
    name: str
    authorize_url: str
    token_url: str
    jwks_url: str
    issuers: tuple[str, ...]
    client_id: str
    client_secret: str
    # Microsoft: só a empresa. Em app multi-empresa, o e-mail do token não é confiável.
    tenant_id: str = ""

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    @property
    def redirect_uri(self) -> str:
        return f"{API_PUBLIC_URL}/auth/sso/{self.name}/callback"


_MICROSOFT_BASE = f"https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}"

PROVIDERS = {
    "google": Provider(
        name="google",
        authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
        token_url="https://oauth2.googleapis.com/token",
        jwks_url="https://www.googleapis.com/oauth2/v3/certs",
        issuers=("https://accounts.google.com", "accounts.google.com"),
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
    ),
    "microsoft": Provider(
        name="microsoft",
        authorize_url=f"{_MICROSOFT_BASE}/oauth2/v2.0/authorize",
        token_url=f"{_MICROSOFT_BASE}/oauth2/v2.0/token",
        jwks_url=f"{_MICROSOFT_BASE}/discovery/v2.0/keys",
        issuers=(f"{_MICROSOFT_BASE}/v2.0",),
        # sem o tenant, a Microsoft fica desligada em vez de aceitar qualquer empresa
        client_id=MICROSOFT_CLIENT_ID if MICROSOFT_TENANT_ID else "",
        client_secret=MICROSOFT_CLIENT_SECRET,
        tenant_id=MICROSOFT_TENANT_ID,
    ),
}


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def build_authorization(provider: Provider) -> tuple[str, str]:
    """Devolve (URL do provedor, valor do cookie de estado). O cookie amarra a volta do
    provedor a este navegador: sem ele, alguém poderia logar a vítima na conta de outra pessoa."""
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    query = urlencode(
        {
            "client_id": provider.client_id,
            "redirect_uri": provider.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": _pkce_challenge(verifier),
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
    )
    cookie = jwt.encode(
        {
            "iss": JWT_ISSUER,
            "aud": JWT_AUDIENCE,
            "type": STATE_TOKEN_TYPE,
            "provider": provider.name,
            "state": state,
            "nonce": nonce,
            "verifier": verifier,
            "exp": datetime.now(UTC) + STATE_LIFETIME,
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return f"{provider.authorize_url}?{query}", cookie


def _read_state_cookie(provider: Provider, cookie: str | None, state: str | None) -> dict[str, Any]:
    if not cookie or not state:
        raise SsoError("missing_state")
    try:
        saved = jwt.decode(
            cookie, SECRET_KEY, algorithms=[ALGORITHM], audience=JWT_AUDIENCE, issuer=JWT_ISSUER
        )
    except PyJWTError as exc:
        raise SsoError("invalid_state") from exc
    if (
        saved.get("type") != STATE_TOKEN_TYPE
        or saved.get("provider") != provider.name
        or not secrets.compare_digest(str(saved.get("state")), state)
    ):
        raise SsoError("invalid_state")
    return saved


def _exchange_code(provider: Provider, code: str, verifier: str) -> str:
    try:
        response = requests.post(
            provider.token_url,
            data={
                "grant_type": "authorization_code",
                "client_id": provider.client_id,
                "client_secret": provider.client_secret,
                "redirect_uri": provider.redirect_uri,
                "code": code,
                "code_verifier": verifier,
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return str(response.json()["id_token"])
    except (requests.RequestException, KeyError, ValueError) as exc:
        raise SsoError("token_exchange_failed") from exc


def _signing_key(provider: Provider, id_token: str) -> Any:
    return PyJWKClient(provider.jwks_url, timeout=HTTP_TIMEOUT_SECONDS).get_signing_key_from_jwt(
        id_token
    )


def _validated_email(provider: Provider, id_token: str, nonce: str) -> str:
    try:
        claims = jwt.decode(
            id_token,
            _signing_key(provider, id_token),
            algorithms=["RS256"],
            audience=provider.client_id,
            issuer=list(provider.issuers),
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except PyJWTError as exc:
        raise SsoError("invalid_id_token") from exc
    if not secrets.compare_digest(str(claims.get("nonce")), nonce):
        raise SsoError("invalid_nonce")

    if provider.tenant_id:
        if claims.get("tid") != provider.tenant_id:
            raise SsoError("wrong_tenant")
        email = claims.get("email") or claims.get("preferred_username")
    else:
        # is True: o Google manda booleano, e um texto como "false" não pode passar
        if claims.get("email_verified") is not True:
            raise SsoError("email_not_verified")
        email = claims.get("email")
    if not email or "@" not in str(email):
        raise SsoError("no_email")
    return str(email)


def complete_login(
    provider: Provider, code: str | None, state: str | None, state_cookie: str | None
) -> str:
    """Confere a volta do provedor e devolve o e-mail confirmado. Levanta SsoError se falhar."""
    saved = _read_state_cookie(provider, state_cookie, state)
    if not code:
        raise SsoError("provider_denied")
    id_token = _exchange_code(provider, code, str(saved["verifier"]))
    return _validated_email(provider, id_token, str(saved["nonce"]))
