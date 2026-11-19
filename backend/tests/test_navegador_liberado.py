# ruff: noqa: F811  (as fixtures importadas de outros testes são reusadas pelo nome)
"""Navegador liberado (spec acesso-e-auditoria, ADR 0022): depois da senha e do autenticador, a
conta só entra pelos navegadores que um admin liberou. O primeiro é liberado sozinho."""

from collections.abc import Callable
from typing import Any

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core import config
from core.config import FRONTEND_URL
from core.limiter import limiter
from core.security import hash_token
from models.login_event import LoginEvent
from models.notification import Notification
from models.trusted_browser import TrustedBrowser
from models.user import User
from services import browsers, mfa
from services.auth import create_access_token
from tests.conftest import PASSWORD, TOTP_SECRET
from tests.test_auth import bearer
from tests.test_sso import FakeProviderApi, provider_api, sso_login  # noqa: F401

CHROME_WINDOWS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0 Safari/537.36"
)


@pytest.fixture(autouse=True)
def approval_on(monkeypatch: pytest.MonkeyPatch) -> None:
    """Os outros testes rodam com a trava desligada (conftest); aqui ela vale."""
    monkeypatch.setattr(config, "DEVICE_APPROVAL_ENABLED", True)


def enter(
    client: TestClient,
    db_session: Session,
    user: User,
    cookie: str | None = None,
    user_agent: str = CHROME_WINDOWS,
) -> Any:
    """Login completo num navegador: sem `cookie`, é um navegador que nunca entrou."""
    user.totpLastUsedStep = None  # o mesmo código vale de novo, só para o teste
    db_session.commit()
    limiter.reset()
    client.cookies.clear()
    if cookie:
        client.cookies.set(browsers.COOKIE_NAME, cookie)
    headers = {"User-Agent": user_agent}
    token = client.post(
        "/auth/token", data={"username": user.email, "password": PASSWORD}, headers=headers
    ).json()["mfa_token"]
    code = pyotp.TOTP(TOTP_SECRET).now()
    return client.post("/auth/token/mfa", json={"code": code}, headers={**bearer(token), **headers})


def browser_cookie(response: Any) -> str:
    value = response.cookies.get(browsers.COOKIE_NAME)
    assert value, "o navegador precisa guardar a marca"
    return str(value)


def as_admin(admin: User) -> dict[str, str]:
    return bearer(create_access_token(admin.id))


@pytest.fixture
def people(make_user: Callable[..., User]) -> dict[str, User]:
    return {
        "ana": make_user(),
        "chefe": make_user(email="chefe@pesquisemais.com.br", role="admin"),
        "outro": make_user(email="outro@pesquisemais.com.br", role="admin"),
    }


# ---- Primeiro navegador ----


def test_the_first_browser_enters_and_only_its_hash_is_kept(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    first = enter(client, db_session, people["ana"])
    assert first.status_code == 200, first.text
    cookie = browser_cookie(first)
    saved = db_session.query(TrustedBrowser).one()
    assert (saved.status, saved.label) == ("liberado", "Chrome no Windows")
    assert saved.tokenHash == hash_token(cookie) != cookie
    reason = db_session.query(LoginEvent).order_by(LoginEvent.id.desc()).first()
    assert reason is not None and reason.reason == "browser_first"
    # De volta no mesmo navegador: entra, sem pedido novo
    assert enter(client, db_session, people["ana"], cookie).status_code == 200
    assert db_session.query(TrustedBrowser).count() == 1
    assert db_session.query(Notification).count() == 0


# ---- Navegador novo vira pedido ----


def test_a_new_browser_waits_and_the_other_admins_are_told_once(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    enter(client, db_session, people["ana"])
    waiting = enter(client, db_session, people["ana"], user_agent="Mozilla/5.0 Firefox/133.0")
    assert waiting.status_code == 403
    assert waiting.json() == {"detail": browsers.PENDING_DETAIL, "browser": "pendente"}
    assert "refresh_token" not in waiting.cookies  # sem sessão
    second = browser_cookie(waiting)
    notices = db_session.query(Notification).filter_by(type="browser_request").all()
    assert sorted(n.user_id for n in notices) == sorted([people["chefe"].id, people["outro"].id])
    assert notices[0].title == "Ana pediu para entrar de um computador novo"
    assert notices[0].link == "/acessos"
    # Tentar de novo no mesmo navegador não repete o aviso
    assert enter(client, db_session, people["ana"], second).status_code == 403
    assert db_session.query(Notification).count() == 2


def test_an_admin_approves_and_the_browser_enters(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    enter(client, db_session, people["ana"])
    second = browser_cookie(enter(client, db_session, people["ana"]))
    pending = client.get(
        "/admin/navegadores?situacao=pendente", headers=as_admin(people["chefe"])
    ).json()
    assert [(row["userName"], row["label"], row["status"]) for row in pending] == [
        ("Ana", "Chrome no Windows", "pendente")
    ]
    approved = client.post(
        f"/admin/navegadores/{pending[0]['id']}/liberar", headers=as_admin(people["chefe"])
    )
    assert approved.status_code == 200
    assert (approved.json()["status"], approved.json()["decidedBy"]) == ("liberado", "Ana")
    assert enter(client, db_session, people["ana"], second).status_code == 200
    again = client.post(
        f"/admin/navegadores/{pending[0]['id']}/liberar", headers=as_admin(people["chefe"])
    )
    assert again.status_code == 409


def test_a_refused_browser_gets_its_own_message(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    enter(client, db_session, people["ana"])
    second = browser_cookie(enter(client, db_session, people["ana"]))
    request_id = db_session.query(TrustedBrowser).filter_by(status="pendente").one().id
    refused = client.post(
        f"/admin/navegadores/{request_id}/recusar", headers=as_admin(people["chefe"])
    )
    assert refused.json()["status"] == "recusado"
    denied = enter(client, db_session, people["ana"], second)
    assert denied.status_code == 403
    assert denied.json() == {"detail": browsers.REFUSED_DETAIL, "browser": "recusado"}
    twice = client.post(
        f"/admin/navegadores/{request_id}/recusar", headers=as_admin(people["chefe"])
    )
    assert (twice.status_code, twice.json()["detail"]) == (409, browsers.ALREADY_DECIDED_DETAIL)


def test_an_admin_does_not_approve_their_own_computer(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    chefe = people["chefe"]
    enter(client, db_session, chefe)
    enter(client, db_session, chefe)  # computador novo do próprio admin
    notices = db_session.query(Notification).all()
    assert [n.user_id for n in notices] == [people["outro"].id]  # o aviso vai só para o outro
    request_id = db_session.query(TrustedBrowser).filter_by(status="pendente").one().id
    own = client.post(f"/admin/navegadores/{request_id}/liberar", headers=as_admin(chefe))
    assert (own.status_code, own.json()["detail"]) == (409, browsers.OWN_REQUEST_DETAIL)
    other = client.post(
        f"/admin/navegadores/{request_id}/liberar", headers=as_admin(people["outro"])
    )
    assert other.status_code == 200


# ---- Revogar ----


def test_revoking_ends_the_sessions_and_the_next_login_asks_again(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    first = enter(client, db_session, people["ana"])
    cookie, session = browser_cookie(first), first.cookies.get("refresh_token")
    browser_id = db_session.query(TrustedBrowser).one().id
    revoked = client.post(
        f"/admin/navegadores/{browser_id}/revogar", headers=as_admin(people["chefe"])
    )
    assert revoked.json()["status"] == "revogado"
    client.cookies.clear()
    refresh = client.post("/auth/token/refresh", cookies={"refresh_token": str(session)})
    assert refresh.status_code == 401
    # Revogar tudo não abre a porta para o próximo navegador entrar sozinho
    assert enter(client, db_session, people["ana"], cookie).status_code == 403
    assert enter(client, db_session, people["ana"]).status_code == 403
    twice = client.post(
        f"/admin/navegadores/{browser_id}/revogar", headers=as_admin(people["chefe"])
    )
    # o navegador revogado que tentou entrar de novo voltou a ser pedido: não há o que revogar
    assert (twice.status_code, twice.json()["detail"]) == (409, browsers.NOT_APPROVED_DETAIL)


def test_only_a_released_browser_is_revoked(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    enter(client, db_session, people["ana"])
    enter(client, db_session, people["ana"])
    pending_id = db_session.query(TrustedBrowser).filter_by(status="pendente").one().id
    response = client.post(
        f"/admin/navegadores/{pending_id}/revogar", headers=as_admin(people["chefe"])
    )
    assert (response.status_code, response.json()["detail"]) == (
        409,
        browsers.NOT_APPROVED_DETAIL,
    )


# ---- Autenticador ----


def test_setting_up_the_authenticator_frees_the_first_browser(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user(mfa=False)
    token = client.post("/auth/token", data={"username": user.email, "password": PASSWORD}).json()[
        "mfa_token"
    ]
    secret = client.post("/auth/mfa/setup", headers=bearer(token)).json()["secret"]
    confirmed = client.post(
        "/auth/mfa/setup/confirm",
        json={"code": pyotp.TOTP(secret).now()},
        headers=bearer(token),
    )
    assert confirmed.status_code == 200
    assert len(confirmed.json()["recovery_codes"]) == 10
    browser_cookie(confirmed)
    assert db_session.query(TrustedBrowser).one().status == "liberado"


def test_redoing_the_authenticator_in_a_new_browser_still_needs_an_admin(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    ana = people["ana"]
    enter(client, db_session, ana)
    mfa.reset_mfa(db_session, ana)  # celular perdido: os navegadores liberados ficam
    assert db_session.query(TrustedBrowser).filter_by(status="liberado").count() == 1
    limiter.reset()
    client.cookies.clear()
    token = client.post("/auth/token", data={"username": ana.email, "password": PASSWORD}).json()[
        "mfa_token"
    ]
    secret = client.post("/auth/mfa/setup", headers=bearer(token)).json()["secret"]
    confirmed = client.post(
        "/auth/mfa/setup/confirm",
        json={"code": pyotp.TOTP(secret).now()},
        headers=bearer(token),
    )
    assert confirmed.status_code == 403
    body = confirmed.json()
    assert body["browser"] == "pendente"
    assert len(body["recovery_codes"]) == 10  # os códigos só aparecem aqui: vão junto
    assert "refresh_token" not in confirmed.cookies


# ---- Pelo provedor (Google ou Microsoft) ----


def test_the_provider_login_goes_through_the_same_rule(
    client: TestClient,
    make_user: Callable[..., User],
    provider_api: FakeProviderApi,
) -> None:
    make_user(mfa=False)
    first = sso_login(client, provider_api)
    assert first.headers["location"] == f"{FRONTEND_URL}/"
    assert browser_cookie(first)
    second = sso_login(client, provider_api)  # limpa os cookies: outro navegador
    assert second.headers["location"] == f"{FRONTEND_URL}/login?erro=navegador_pendente"
    assert "refresh_token" not in second.cookies


# ---- Interruptor, permissões e a saída de emergência ----


def test_the_switch_off_lets_any_browser_in(
    client: TestClient,
    db_session: Session,
    people: dict[str, User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(config, "DEVICE_APPROVAL_ENABLED", False)
    assert enter(client, db_session, people["ana"]).status_code == 200
    assert enter(client, db_session, people["ana"]).status_code == 200
    assert db_session.query(TrustedBrowser).count() == 0


def test_only_an_admin_sees_and_decides(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    assert client.get("/admin/navegadores").status_code == 401
    assert client.post("/admin/navegadores/1/liberar").status_code == 401
    finance = as_admin(people["ana"])  # o papel financeiro não é admin
    assert client.get("/admin/navegadores", headers=finance).status_code == 403
    assert client.post("/admin/navegadores/1/recusar", headers=finance).status_code == 403
    missing = client.post("/admin/navegadores/999/liberar", headers=as_admin(people["chefe"]))
    assert (missing.status_code, missing.json()["detail"]) == (404, "Navegador não encontrado")
    wrong = client.get("/admin/navegadores?situacao=qualquer", headers=as_admin(people["chefe"]))
    assert wrong.status_code == 422


def test_the_server_command_approves_the_latest_request(
    client: TestClient, db_session: Session, people: dict[str, User]
) -> None:
    assert browsers.approve_latest_request(db_session, people["ana"]) is None
    enter(client, db_session, people["ana"])
    second = browser_cookie(enter(client, db_session, people["ana"]))
    approved = browsers.approve_latest_request(db_session, people["ana"])
    assert approved is not None and approved.status == "liberado"
    assert enter(client, db_session, people["ana"], second).status_code == 200


@pytest.mark.parametrize(
    ("user_agent", "label"),
    [
        (CHROME_WINDOWS, "Chrome no Windows"),
        ("Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36 Edg/131.0", "Edge no Windows"),
        ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/17.0 Safari/605.1", "Safari no Mac"),
        (
            "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
            "Firefox no Linux",
        ),
        ("Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile Safari/537.36", "Chrome no Android"),
        ("curl/8.0", "Navegador desconhecido"),
        (None, "Navegador desconhecido"),
    ],
)
def test_the_browser_name_the_admin_sees(user_agent: str | None, label: str) -> None:
    assert browsers.browser_label(user_agent) == label
