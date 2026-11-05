import logging
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
import requests

from services import connect_gateway
from services.connect_gateway import ConnectUnavailable, PaymentOrder
from services.connect_http import ATTEMPTS, HttpConnect

SECRET = "segredo-de-teste-do-connect"  # gitleaks:allow
BASE = "http://connect.test"


class FakeResponse:
    def __init__(
        self, status: int, body: dict[str, Any] | None = None, headers: dict[str, str] | None = None
    ) -> None:
        self.status_code = status
        self._body = body or {}
        self.headers = headers or {}

    def json(self) -> dict[str, Any]:
        return self._body


class FakeSession:
    """Responde por rota, em ordem. Guarda o que foi pedido."""

    def __init__(self) -> None:
        self.routes: dict[str, list[Any]] = {}
        self.calls: list[dict[str, Any]] = []

    def add(self, route: str, *answers: Any) -> None:
        self.routes.setdefault(route, []).extend(answers)

    def request(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        path = url.removeprefix(BASE)
        self.calls.append({"method": method, "path": path, **kwargs})
        answers = self.routes[f"{method} {path}"]
        answer = answers.pop(0) if len(answers) > 1 else answers[0]
        if isinstance(answer, Exception):
            raise answer
        return answer  # type: ignore[no-any-return]


def token(seconds: int = 900, value: str = "tok") -> FakeResponse:
    return FakeResponse(200, {"access_token": value, "expires_in": seconds, "scope": "x"})


@pytest.fixture
def sleeps(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    waited: list[float] = []
    monkeypatch.setattr("services.connect_http.time.sleep", waited.append)
    return waited


@pytest.fixture
def session() -> FakeSession:
    fake = FakeSession()
    fake.add("POST /oauth/token", token())
    return fake


@pytest.fixture
def connect(session: FakeSession) -> HttpConnect:
    return HttpConnect(BASE, "financeiro-teste", SECRET, session=session)


def project(project_id: int, title: str = "Pesquisa") -> dict[str, Any]:
    return {
        "projectId": project_id,
        "code": f"PRJ-{project_id}",
        "title": title,
        "status": "active",
        "valuePerInterview": "40.00",
        "paymentTermDays": 30,
        "budget": None,
        "updatedAt": "2026-10-14T18:20:00Z",
    }


def payable(interview_id: int, interviewer_id: int = 87, **overrides: Any) -> dict[str, Any]:
    return {
        "interviewId": interview_id,
        "interviewerId": interviewer_id,
        "projectId": 12,
        "amount": "40.00",
        "launchedOn": "2026-10-03",
        "dueOn": "2026-11-02",
        "status": "to_pay",
        "paidOn": None,
        "paymentRef": None,
        "updatedAt": "2026-10-03T21:10:44Z",
        **overrides,
    }


# ---- Token ----


def test_the_token_is_requested_with_basic_credentials_and_reused(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add(
        "GET /integrations/v1/projects", FakeResponse(200, {"items": [], "nextCursor": None})
    )
    connect.list_projects()
    connect.list_projects()
    tokens = [c for c in session.calls if c["path"] == "/oauth/token"]
    assert len(tokens) == 1
    assert tokens[0]["auth"] == ("financeiro-teste", SECRET)
    assert tokens[0]["data"] == {"grant_type": "client_credentials"}
    assert all(
        c["headers"]["Authorization"] == "Bearer tok" for c in session.calls if "headers" in c
    )


def test_an_expired_token_is_renewed_before_the_call(
    connect: HttpConnect, session: FakeSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    clock = [1000.0]
    monkeypatch.setattr("services.connect_http.time.monotonic", lambda: clock[0])
    session.routes["POST /oauth/token"] = [token(900, "um"), token(900, "dois")]
    session.add(
        "GET /integrations/v1/projects", FakeResponse(200, {"items": [], "nextCursor": None})
    )
    connect.list_projects()
    clock[0] += 900  # passou da validade, menos a margem de segurança
    connect.list_projects()
    used = [c["headers"]["Authorization"] for c in session.calls if "headers" in c]
    assert used == ["Bearer um", "Bearer dois"]


def test_a_rejected_token_is_renewed_once_and_the_call_repeated(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.routes["POST /oauth/token"] = [token(900, "velho"), token(900, "novo")]
    session.add(
        "GET /integrations/v1/projects",
        FakeResponse(401),
        FakeResponse(200, {"items": [project(12)], "nextCursor": None}),
    )
    assert [p.id for p in connect.list_projects()] == [12]
    assert [c["headers"]["Authorization"] for c in session.calls if "headers" in c] == [
        "Bearer velho",
        "Bearer novo",
    ]


def test_wrong_credentials_mean_the_connect_is_unavailable_and_nothing_leaks(
    session: FakeSession, caplog: pytest.LogCaptureFixture
) -> None:
    session.routes["POST /oauth/token"] = [FakeResponse(401, {"detail": f"segredo {SECRET}"})]
    caplog.set_level(logging.DEBUG)
    with pytest.raises(ConnectUnavailable):
        HttpConnect(BASE, "financeiro-teste", SECRET, session=session).list_projects()
    assert SECRET not in caplog.text and "financeiro-teste" not in caplog.text


# ---- Leituras ----


def test_projects_follow_the_cursor_to_the_end(connect: HttpConnect, session: FakeSession) -> None:
    session.add(
        "GET /integrations/v1/projects",
        FakeResponse(200, {"items": [project(12, "Mobilidade")], "nextCursor": "c1"}),
        FakeResponse(200, {"items": [], "nextCursor": "c2"}),  # página curta com cursor
        FakeResponse(200, {"items": [project(13, "Outra")], "nextCursor": None}),
    )
    found = connect.list_projects()
    assert [(p.id, p.title, p.payment_term_days) for p in found] == [
        (12, "Mobilidade", 30),
        (13, "Outra", 30),
    ]
    cursors = [c["params"].get("cursor") for c in session.calls if c["path"].endswith("/projects")]
    assert cursors == [None, "c1", "c2"]


def test_payables_of_each_person_become_mirror_rows(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add(
        "GET /integrations/v1/payables",
        FakeResponse(
            200,
            {
                "items": [
                    payable(5531),
                    payable(5532, status="paid", paidOn="2026-10-15", paymentRef="fin-pay-1"),
                    payable(5533, amount=None),  # sem valor, não há o que pagar
                    payable(5534, dueOn=None),
                ],
                "nextCursor": None,
            },
        ),
    )
    rows = connect.list_payables(12, [87])

    assert [r.interview_id for r in rows] == [5531, 5532, 5534]
    first, paid, no_due = rows
    assert first.amount == Decimal("40.00") and first.status == "to_pay"
    assert first.launched_at == datetime(2026, 10, 3, tzinfo=UTC)
    assert first.due_on == date(2026, 11, 2)
    assert (paid.status, paid.paid_on) == ("paid", date(2026, 10, 15))
    assert no_due.due_on == date(2026, 10, 3)  # sem prazo, vale o dia do lançamento
    assert first.updated_at == datetime(2026, 10, 3, 21, 10, 44, tzinfo=UTC)
    call = next(c for c in session.calls if c["path"].endswith("/payables"))
    assert call["params"]["projectId"] == 12 and call["params"]["interviewerId"] == 87


def test_each_person_is_asked_separately(connect: HttpConnect, session: FakeSession) -> None:
    session.add(
        "GET /integrations/v1/payables",
        FakeResponse(200, {"items": [payable(1, 87)], "nextCursor": None}),
        FakeResponse(200, {"items": [payable(2, 91)], "nextCursor": None}),
    )
    rows = connect.list_payables(12, [87, 91])
    assert [(r.interview_id, r.interviewer_id) for r in rows] == [(1, 87), (2, 91)]


def test_names_come_without_the_pix_key(connect: HttpConnect, session: FakeSession) -> None:
    session.add(
        "GET /integrations/v1/interviewers",
        FakeResponse(
            200,
            {
                "items": [
                    {
                        "interviewerId": 87,
                        "displayName": "Maria Exemplo",
                        "pixType": "email",
                        "pixKeyMasked": "mar***@exemplo.com",
                        "active": True,
                    }
                ],
                "nextCursor": None,
            },
        ),
    )
    assert connect.interviewer_names([87, 91]) == {87: "Maria Exemplo"}
    assert connect.interviewer_names([]) == {}
    call = next(c for c in session.calls if c["path"].endswith("/interviewers"))
    assert call["params"] == {"ids": "87,91"}


# ---- Falhas ----


def test_a_busy_connect_is_retried_waiting_what_it_asked(
    connect: HttpConnect, session: FakeSession, sleeps: list[float]
) -> None:
    session.add(
        "GET /integrations/v1/projects",
        FakeResponse(429, headers={"Retry-After": "3"}),
        FakeResponse(503),
        FakeResponse(200, {"items": [project(12)], "nextCursor": None}),
    )
    assert len(connect.list_projects()) == 1
    assert sleeps[0] == 3.0 and len(sleeps) == 2


def test_the_wait_is_capped(
    connect: HttpConnect, session: FakeSession, sleeps: list[float]
) -> None:
    session.add(
        "GET /integrations/v1/projects",
        FakeResponse(429, headers={"Retry-After": "600"}),
        FakeResponse(200, {"items": [], "nextCursor": None}),
    )
    connect.list_projects()
    assert sleeps == [5.0]


def test_giving_up_after_the_attempts_is_unavailable(
    connect: HttpConnect, session: FakeSession, sleeps: list[float]
) -> None:
    session.add("GET /integrations/v1/projects", FakeResponse(503))
    with pytest.raises(ConnectUnavailable):
        connect.list_projects()
    assert len([c for c in session.calls if c["path"].endswith("/projects")]) == ATTEMPTS


def test_a_network_failure_is_retried_then_unavailable(
    connect: HttpConnect, session: FakeSession, sleeps: list[float]
) -> None:
    session.add("GET /integrations/v1/projects", requests.ConnectionError("sem rede"))
    with pytest.raises(ConnectUnavailable):
        connect.list_projects()
    assert len(sleeps) == ATTEMPTS - 1


def test_a_refusal_that_retrying_will_not_fix_is_not_retried(
    connect: HttpConnect, session: FakeSession, sleeps: list[float]
) -> None:
    session.add("GET /integrations/v1/projects", FakeResponse(403))
    with pytest.raises(ConnectUnavailable):
        connect.list_projects()
    assert sleeps == []
    assert len([c for c in session.calls if c["path"].endswith("/projects")]) == 1


def test_every_call_has_a_timeout(connect: HttpConnect, session: FakeSession) -> None:
    session.add(
        "GET /integrations/v1/projects", FakeResponse(200, {"items": [], "nextCursor": None})
    )
    connect.list_projects()
    assert all(c["timeout"] for c in session.calls)


# ---- O que ainda não existe no Connect ----


def test_paying_and_matching_keys_stay_unavailable_until_the_connect_delivers(
    connect: HttpConnect, session: FakeSession
) -> None:
    order = PaymentOrder("fin-pay-1", "E1", 87, 12, Decimal("20.00"), date(2026, 2, 2), [1], 7)
    with pytest.raises(ConnectUnavailable):
        connect.create_payment(order)
    with pytest.raises(ConnectUnavailable):
        connect.get_payment("fin-pay-1")
    with pytest.raises(ConnectUnavailable):
        connect.match_pix_keys(12, {"0": "maria@exemplo.com"})
    assert session.calls == []  # nada saiu: não há rota no Connect para isso


# ---- Montagem ----


def test_production_only_accepts_https() -> None:
    with pytest.raises(ValueError, match="HTTPS"):
        HttpConnect("http://connect.test", "id", SECRET, production=True)
    HttpConnect("https://connect.test/", "id", SECRET, production=True)


def test_the_gateway_is_the_http_client_only_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(connect_gateway, "_http", None)
    assert isinstance(connect_gateway.get_connect(), connect_gateway.UnavailableConnect)

    for name, value in (
        ("CONNECT_BASE_URL", "https://connect.test"),
        ("CONNECT_CLIENT_ID", "financeiro"),
        ("CONNECT_CLIENT_SECRET", SECRET),
    ):
        monkeypatch.setattr(connect_gateway, name, value)
    first = connect_gateway.get_connect()
    assert isinstance(first, HttpConnect)
    assert connect_gateway.get_connect() is first  # o mesmo cliente guarda o token


def test_simulated_mode_wins_outside_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(connect_gateway, "CONNECT_MODE", "simulated")
    monkeypatch.setattr(connect_gateway, "CONNECT_BASE_URL", "https://connect.test")
    assert isinstance(connect_gateway.get_connect(), connect_gateway.SimulatedConnect)
    monkeypatch.setattr(connect_gateway, "ENVIRONMENT", "production")
    assert not isinstance(connect_gateway.get_connect(), connect_gateway.SimulatedConnect)
