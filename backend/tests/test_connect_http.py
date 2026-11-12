import logging
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
import requests

from services import connect_gateway
from services.connect_gateway import (
    ConnectRefused,
    ConnectTimeout,
    ConnectUnavailable,
    KeyMatch,
    PaymentApplied,
    PaymentOrder,
)
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


# ---- Consulta por POST: de quem é a chave e a chave completa ----

PIX_KEY = "maria.exemplo@exemplo.com"  # fictícia


def matches(*items: tuple[str, int | None, bool]) -> FakeResponse:
    return FakeResponse(
        200,
        {"matches": [{"ref": r, "interviewerId": i, "inProject": p} for r, i, p in items]},
    )


def test_matching_keys_sends_the_normalized_keys_and_maps_who_they_are(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add(
        "POST /integrations/v1/pix-key-matches",
        matches(("rcpt-1", 87, True), ("rcpt-2", None, False), ("rcpt-3", 91, False)),
    )
    found = connect.match_pix_keys(
        12, {"rcpt-1": PIX_KEY, "rcpt-2": "+5511900000000", "rcpt-3": "x@y.invalid"}
    )
    assert found == {
        "rcpt-1": KeyMatch(87, True),
        "rcpt-2": KeyMatch(None, False),
        "rcpt-3": KeyMatch(91, False),  # recebeu sem estar no projeto
    }
    call = session.calls[-1]
    assert call["json"] == {
        "projectId": 12,
        "keys": [
            {"ref": "rcpt-1", "pixKey": PIX_KEY},
            {"ref": "rcpt-2", "pixKey": "+5511900000000"},
            {"ref": "rcpt-3", "pixKey": "x@y.invalid"},
        ],
    }
    assert call["headers"]["Authorization"] == "Bearer tok" and call["timeout"]


def test_matching_with_no_keys_asks_nothing(connect: HttpConnect, session: FakeSession) -> None:
    assert connect.match_pix_keys(12, {}) == {}
    assert session.calls == []


def test_matching_goes_in_batches_of_500(connect: HttpConnect, session: FakeSession) -> None:
    keys = {f"r{n}": f"k{n}@exemplo.invalid" for n in range(1001)}

    def answer(chunk: list[str]) -> FakeResponse:
        return matches(*[(ref, None, False) for ref in chunk])

    refs = list(keys)
    session.add(
        "POST /integrations/v1/pix-key-matches",
        answer(refs[:500]),
        answer(refs[500:1000]),
        answer(refs[1000:]),
    )
    assert len(connect.match_pix_keys(12, keys)) == 1001
    sent = [c["json"]["keys"] for c in session.calls if c["path"].endswith("/pix-key-matches")]
    assert [len(chunk) for chunk in sent] == [500, 500, 1]


def test_a_key_the_connect_left_without_an_answer_is_never_classified(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add("POST /integrations/v1/pix-key-matches", matches(("rcpt-1", 87, True)))
    with pytest.raises(ConnectUnavailable):
        connect.match_pix_keys(12, {"rcpt-1": PIX_KEY, "rcpt-2": "outra@exemplo.invalid"})


def test_matching_is_retried_like_a_read_but_a_refusal_is_not(
    connect: HttpConnect, session: FakeSession, sleeps: list[float]
) -> None:
    session.add(
        "POST /integrations/v1/pix-key-matches",
        FakeResponse(503),
        FakeResponse(503),
        matches(("rcpt-1", 87, True)),
    )
    assert connect.match_pix_keys(12, {"rcpt-1": PIX_KEY}) == {"rcpt-1": KeyMatch(87, True)}
    assert len(sleeps) == 2

    session.calls.clear()
    session.routes.pop("POST /integrations/v1/pix-key-matches")
    session.add(
        "POST /integrations/v1/pix-key-matches",
        FakeResponse(422, {"code": "validation_error", "detail": "x", "requestId": "r"}),
    )
    with pytest.raises(ConnectRefused) as refused:
        connect.match_pix_keys(12, {"rcpt-1": PIX_KEY})
    assert refused.value.code == "validation_error"
    assert len([c for c in session.calls if c["path"].endswith("/pix-key-matches")]) == 1


def payment_data_answer() -> FakeResponse:
    return FakeResponse(
        200,
        {
            "items": [
                {
                    "interviewerId": 87,
                    "name": "Maria Exemplo",
                    "pixType": "email",
                    "pixKey": PIX_KEY,
                    "pixKeyUpdatedAt": "2026-09-02T12:00:00Z",
                },
                {
                    "interviewerId": 91,
                    "name": "João Exemplo",
                    "pixType": None,
                    "pixKey": None,
                    "pixKeyUpdatedAt": None,
                },
            ]
        },
    )


def test_payment_data_returns_the_full_key_only_in_memory_and_never_in_the_repr_or_the_log(
    connect: HttpConnect, session: FakeSession, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    session.add("POST /integrations/v1/interviewers/payment-data", payment_data_answer())
    people = connect.payment_data([87, 91], 12, "payment_sheet", 7, "Equipe Financeiro 1")
    assert [(p.interviewer_id, p.pix_key, p.pix_type) for p in people] == [
        (87, PIX_KEY, "email"),
        (91, None, None),
    ]
    assert people[0].pix_key_updated_at == datetime(2026, 9, 2, 12, 0, tzinfo=UTC)
    assert PIX_KEY not in repr(people) and PIX_KEY not in caplog.text
    assert session.calls[-1]["json"] == {
        "interviewerIds": [87, 91],
        "purpose": "payment_sheet",
        "projectId": 12,
        "onBehalfOf": {"financeUserId": 7, "financeUserName": "Equipe Financeiro 1"},
    }


def test_payment_data_goes_in_batches_of_200(connect: HttpConnect, session: FakeSession) -> None:
    session.add("POST /integrations/v1/interviewers/payment-data", FakeResponse(200, {"items": []}))
    assert connect.payment_data(list(range(450)), 12, "payment_check", 7, "Equipe") == []
    sent = [
        c["json"]["interviewerIds"] for c in session.calls if c["path"].endswith("payment-data")
    ]
    assert [len(chunk) for chunk in sent] == [200, 200, 50]


# ---- Escrita: a baixa ----


def order(**overrides: Any) -> PaymentOrder:
    fields: dict[str, Any] = {
        "payment_ref": "fin-pay-000231",
        "e2e_id": "E00000000202610151302ABCDEF123456",
        "interviewer_id": 87,
        "connect_project_id": 12,
        "amount": Decimal("80"),
        "paid_on": date(2026, 10, 15),
        "interview_ids": [5531, 5533],
        "confirmed_by_user_id": 7,
    }
    return PaymentOrder(**{**fields, **overrides})


def applied(ref: str = "fin-pay-000231") -> FakeResponse:
    return FakeResponse(
        201,
        {
            "paymentRef": ref,
            "status": "applied",
            "interviewIds": [5531, 5533],
            "amount": "80.00",
            "paidOn": "2026-10-15",
            "appliedAt": "2026-10-15T13:02:11Z",
        },
    )


def test_paying_sends_the_order_with_the_idempotency_key_and_maps_the_answer(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add("POST /integrations/v1/payments", applied())
    result = connect.create_payment(order())
    assert result == PaymentApplied(
        "fin-pay-000231", [5531, 5533], datetime(2026, 10, 15, 13, 2, 11, tzinfo=UTC)
    )
    call = session.calls[-1]
    assert call["headers"]["Idempotency-Key"] == "fin-pay-000231"
    assert call["headers"]["Authorization"] == "Bearer tok"
    assert call["json"] == {
        "paymentRef": "fin-pay-000231",
        "e2eId": "E00000000202610151302ABCDEF123456",
        "interviewerId": 87,
        "projectId": 12,
        "amount": "80.00",  # dinheiro é texto com duas casas, nunca número
        "paidOn": "2026-10-15",
        "interviewIds": [5531, 5533],
        "confirmedBy": {"financeUserId": 7},
    }
    assert call["timeout"]


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (409, "already_paid"),
        (409, "duplicate_e2e"),
        (409, "idempotency_conflict"),
        (422, "amount_mismatch"),
        (422, "mixed_interviewer"),
        (422, "not_payable"),
        (403, "insufficient_scope"),
        (404, "not_found"),
        (400, "invalid_request"),
    ],
)
def test_a_refusal_carries_the_connect_code_and_is_never_repeated(
    connect: HttpConnect, session: FakeSession, sleeps: list[float], status: int, code: str
) -> None:
    session.add(
        "POST /integrations/v1/payments",
        FakeResponse(status, {"detail": "x", "code": code, "requestId": "r"}),
    )
    with pytest.raises(ConnectRefused) as refused:
        connect.create_payment(order())
    assert refused.value.code == code
    assert sleeps == []
    assert len([c for c in session.calls if c["path"].endswith("/payments")]) == 1


def test_a_refusal_without_a_code_says_the_http_status(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add("POST /integrations/v1/payments", FakeResponse(422))
    with pytest.raises(ConnectRefused) as refused:
        connect.create_payment(order())
    assert refused.value.code == "http_422"


@pytest.mark.parametrize(
    "failure",
    [requests.ReadTimeout("sem resposta"), requests.ConnectionError("conexão caiu")],
)
def test_a_payment_whose_answer_did_not_come_back_is_a_timeout_and_never_repeats(
    connect: HttpConnect, session: FakeSession, sleeps: list[float], failure: Exception
) -> None:
    session.add("POST /integrations/v1/payments", failure)
    with pytest.raises(ConnectTimeout):
        connect.create_payment(order())
    assert sleeps == []
    assert len([c for c in session.calls if c["path"].endswith("/payments")]) == 1


def test_a_payment_that_never_connected_is_unavailable_not_a_timeout(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add("POST /integrations/v1/payments", requests.ConnectTimeout("nem conectou"))
    with pytest.raises(ConnectUnavailable) as caught:
        connect.create_payment(order())
    assert not isinstance(caught.value, ConnectTimeout)  # nada saiu: nada foi aplicado


@pytest.mark.parametrize(
    ("status", "is_timeout"), [(500, True), (502, True), (504, True), (429, False), (503, False)]
)
def test_a_server_error_on_a_payment_may_have_been_applied_but_a_busy_connect_was_not(
    connect: HttpConnect, session: FakeSession, status: int, is_timeout: bool
) -> None:
    session.add("POST /integrations/v1/payments", FakeResponse(status))
    with pytest.raises(ConnectUnavailable) as caught:
        connect.create_payment(order())
    assert isinstance(caught.value, ConnectTimeout) is is_timeout
    assert len([c for c in session.calls if c["path"].endswith("/payments")]) == 1


def test_a_payment_is_sent_again_once_after_a_401_with_a_new_token(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add("POST /oauth/token", token(value="new"))
    session.add("POST /integrations/v1/payments", FakeResponse(401), applied())
    assert connect.create_payment(order()).payment_ref == "fin-pay-000231"
    sent = [c for c in session.calls if c["path"].endswith("/payments")]
    assert [c["headers"]["Authorization"] for c in sent] == ["Bearer tok", "Bearer new"]
    assert [c["headers"]["Idempotency-Key"] for c in sent] == ["fin-pay-000231"] * 2


def test_a_second_401_on_a_payment_is_unavailable(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add("POST /integrations/v1/payments", FakeResponse(401))
    with pytest.raises(ConnectUnavailable):
        connect.create_payment(order())
    assert len([c for c in session.calls if c["path"].endswith("/payments")]) == 2


def test_getting_a_payment_maps_it_and_a_404_means_the_connect_does_not_know_it(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add(
        "GET /integrations/v1/payments/fin-pay-000231",
        FakeResponse(
            200,
            {
                "paymentRef": "fin-pay-000231",
                "status": "applied",
                "interviewIds": [5531],
                "appliedAt": "2026-10-15T13:02:11Z",
            },
        ),
    )
    found = connect.get_payment("fin-pay-000231")
    assert found is not None and found.interview_ids == [5531]

    session.add("GET /integrations/v1/payments/fin-pay-9", FakeResponse(404, {"code": "not_found"}))
    assert connect.get_payment("fin-pay-9") is None


def test_getting_a_payment_when_the_connect_fails_is_unavailable_not_unknown(
    connect: HttpConnect, session: FakeSession, sleeps: list[float]
) -> None:
    session.add("GET /integrations/v1/payments/fin-pay-1", FakeResponse(503))
    with pytest.raises(ConnectUnavailable):
        connect.get_payment("fin-pay-1")  # 404 é "não conheço"; 503 não diz nada sobre a baixa


def test_reversing_sends_the_reason_and_who_approved_and_quotes_the_reference(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add(
        "POST /integrations/v1/payments/fin%2Fpay%2F1/reversal",
        FakeResponse(
            200,
            {
                "paymentRef": "fin/pay/1",
                "status": "reversed",
                "interviewIds": [5531, 5533],
                "reversedAt": "2026-10-18T10:00:00Z",
            },
        ),
    )
    result = connect.reverse_payment(
        "fin/pay/1",
        idempotency_key="fin-rev-000012",
        reason="bank_reversal",
        reversed_on=date(2026, 10, 18),
        note="Pix devolvido pelo banco",
        confirmed_by_user_id=7,
        approved_by_user_id=2,
    )
    assert result.interview_ids == [5531, 5533]
    assert result.reversed_at == datetime(2026, 10, 18, 10, 0, tzinfo=UTC)
    call = session.calls[-1]
    assert call["headers"]["Idempotency-Key"] == "fin-rev-000012"
    assert call["json"] == {
        "reason": "bank_reversal",
        "reversedOn": "2026-10-18",
        "note": "Pix devolvido pelo banco",
        "confirmedBy": {"financeUserId": 7, "approvedByFinanceUserId": 2},
    }


def test_reversing_twice_is_refused_with_not_reversible(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add(
        "POST /integrations/v1/payments/fin-pay-1/reversal",
        FakeResponse(409, {"detail": "x", "code": "not_reversible", "requestId": "r"}),
    )
    with pytest.raises(ConnectRefused) as refused:
        connect.reverse_payment(
            "fin-pay-1",
            idempotency_key="fin-rev-2",
            reason="wrong_match",
            reversed_on=date(2026, 10, 18),
            note="",
            confirmed_by_user_id=7,
        )
    assert refused.value.code == "not_reversible"
    assert "approvedByFinanceUserId" not in session.calls[-1]["json"]["confirmedBy"]


# ---- Feed de eventos e itens do projeto ----


def test_the_event_feed_returns_the_items_and_the_next_cursor(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add(
        "GET /integrations/v1/events",
        FakeResponse(
            200,
            {
                "items": [{"seq": 10453, "type": "payment.applied", "data": {"projectId": 12}}],
                "nextCursor": "10453",
            },
        ),
    )
    items, cursor = connect.events(after=10452, limit=100)
    assert [i["type"] for i in items] == ["payment.applied"] and cursor == "10453"
    assert session.calls[-1]["params"] == {"after": 10452, "limit": 100}


def test_the_payables_of_a_whole_project_are_read_by_status_without_an_interviewer(
    connect: HttpConnect, session: FakeSession
) -> None:
    session.add(
        "GET /integrations/v1/payables",
        FakeResponse(
            200, {"items": [payable(5531), payable(5533, interviewer_id=91)], "nextCursor": None}
        ),
    )
    found = connect.list_project_payables(12)
    assert [(p.interview_id, p.interviewer_id) for p in found] == [(5531, 87), (5533, 91)]
    assert session.calls[-1]["params"] == {"projectId": 12, "status": "to_pay", "limit": 500}


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
