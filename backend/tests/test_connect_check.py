"""O verificador do roteiro do dev, contra um Connect de mentira que segue o contrato do guia
(`docs/connect-dev-integracao-financeiro.md`).

Se o Connect real se comportar igual, o roteiro passa."""

import hashlib
import json
from datetime import date
from typing import Any

import pytest
import requests

from core.pix import normalize_pix_key
from services.connect_check import DevCheck, Step
from services.connect_http import HttpConnect

BASE = "http://connect-dev.test"
SECRET = "segredo-de-teste-do-connect"  # gitleaks:allow
PIX_KEY = "maria.exemplo@exemplo.com"  # fictícia
NAME = "Maria Exemplo"
ALL_SCOPES = {
    "projects:read",
    "payables:read",
    "interviewers:read",
    "interviewers:pix:read",
    "pix:match",
    "payments:write",
    "events:read",
}


class Reply:
    def __init__(self, status: int, body: dict[str, Any] | None = None) -> None:
        self.status_code = status
        self._body = body or {}
        self.headers: dict[str, str] = {}

    def json(self) -> dict[str, Any]:
        return self._body


def refuse(status: int, code: str) -> Reply:
    return Reply(status, {"detail": "x", "code": code, "requestId": "r"})


class FakeConnectDev:
    """O Connect do dev em memória: só o que o guia descreve. Cada opção quebra uma regra do
    contrato, para provar que o verificador percebe."""

    def __init__(
        self,
        *,
        enforce_idempotency: bool = True,
        enforce_amount: bool = True,
        allow_double_reversal: bool = False,
        emit_events: bool = True,
        enforce_scope: bool = True,
        fail_first_reversal: bool = False,
        lose_first_payment_answer: bool = False,
        matches_key: str = "matches",
        with_items: bool = True,
    ) -> None:
        self.enforce_idempotency = enforce_idempotency
        self.enforce_amount = enforce_amount
        self.allow_double_reversal = allow_double_reversal
        self.emit_events = emit_events
        self.enforce_scope = enforce_scope
        self.fail_first_reversal = fail_first_reversal
        self.lose_first_payment_answer = lose_first_payment_answer
        self.matches_key = matches_key
        status = "to_pay" if with_items else "paid"
        self.items: dict[int, dict[str, Any]] = {
            5531: {"interviewerId": 87, "amount": "40.00", "status": status, "paidOn": None},
            5533: {"interviewerId": 87, "amount": "40.00", "status": status, "paidOn": None},
            5540: {"interviewerId": 91, "amount": "25.00", "status": status, "paidOn": None},
        }
        self.payments: dict[str, dict[str, Any]] = {}
        self.cache: dict[str, tuple[str, Reply]] = {}
        self.events: list[dict[str, Any]] = []
        self.tokens: dict[str, set[str]] = {}
        self.calls: list[dict[str, Any]] = []

    # ---- HTTP ----

    def request(self, method: str, url: str, **kwargs: Any) -> Reply:
        path = url.removeprefix(BASE)
        self.calls.append({"method": method, "path": path, **kwargs})
        if path == "/oauth/token":
            return self._token(kwargs)
        header = kwargs.get("headers", {}).get("Authorization", "")
        scopes = self.tokens.get(header.removeprefix("Bearer "))
        if scopes is None:
            return refuse(401, "invalid_token")
        route = path.removeprefix("/integrations/v1")
        need, handler = self._route(method, route)
        if need and self.enforce_scope and need not in scopes:
            return refuse(403, "insufficient_scope")
        return handler(kwargs)

    def _token(self, kwargs: dict[str, Any]) -> Reply:
        asked = kwargs["data"].get("scope")
        scopes = set(asked.split()) if asked else set(ALL_SCOPES)
        token = f"tok-{len(self.tokens) + 1}"
        self.tokens[token] = scopes
        return Reply(
            200,
            {
                "access_token": token,
                "token_type": "bearer",
                "expires_in": 900,
                "scope": " ".join(scopes),
            },
        )

    def _route(self, method: str, route: str) -> tuple[str, Any]:
        if method == "GET" and route == "/projects":
            return "projects:read", self._projects
        if method == "GET" and route == "/payables":
            return "payables:read", self._payables
        if method == "GET" and route == "/interviewers":
            return "interviewers:read", self._interviewers
        if method == "POST" and route == "/interviewers/payment-data":
            return "interviewers:pix:read", self._payment_data
        if method == "POST" and route == "/pix-key-matches":
            return "pix:match", self._matches
        if method == "POST" and route == "/payments":
            return (
                "payments:write",
                self._pay_losing_the_answer if self.lose_first_payment_answer else self._pay,
            )
        if method == "GET" and route.startswith("/payments/"):
            return "payments:write", lambda kw: self._get_payment(route.removeprefix("/payments/"))
        if method == "POST" and route.endswith("/reversal"):
            ref = route.removeprefix("/payments/").removesuffix("/reversal")
            return "payments:write", lambda kw: self._reverse(ref, kw)
        if method == "GET" and route == "/events":
            return "events:read", self._feed
        return "", lambda kw: refuse(404, "not_found")

    # ---- Rotas ----

    def _projects(self, kw: dict[str, Any]) -> Reply:
        project = {
            "projectId": 12,
            "code": "PRJ-12",
            "title": "Pesquisa fictícia",
            "status": "active",
            "valuePerInterview": "40.00",
            "paymentTermDays": 30,
            "budget": None,
            "updatedAt": "2026-10-14T18:20:00Z",
        }
        return Reply(200, {"items": [project], "nextCursor": None})

    def _payables(self, kw: dict[str, Any]) -> Reply:
        params = kw["params"]
        rows = [
            {
                "interviewId": i,
                "interviewerId": item["interviewerId"],
                "projectId": 12,
                "amount": item["amount"],
                "launchedOn": "2026-10-10",
                "dueOn": "2026-11-10",
                "status": item["status"],
                "paidOn": item["paidOn"],
                "updatedAt": "2026-10-14T18:20:00Z",
            }
            for i, item in sorted(self.items.items())
            if params.get("projectId") == 12
            and item["status"] == params.get("status", item["status"])
            and item["interviewerId"] == params.get("interviewerId", item["interviewerId"])
        ]
        return Reply(200, {"items": rows, "nextCursor": None})

    def _interviewers(self, kw: dict[str, Any]) -> Reply:
        ids = [int(i) for i in kw["params"]["ids"].split(",")]
        names = {87: NAME, 91: "João Exemplo"}
        items = [
            {
                "interviewerId": i,
                "displayName": names[i],
                "pixType": "email",
                "pixKeyMasked": "mar***@exemplo.com",
                "active": True,
            }
            for i in ids
            if i in names
        ]
        return Reply(200, {"items": items, "nextCursor": None})

    def _payment_data(self, kw: dict[str, Any]) -> Reply:
        body = kw["json"]
        to_pay = {i["interviewerId"] for i in self.items.values() if i["status"] == "to_pay"}
        items = [
            {
                "interviewerId": i,
                "name": NAME,
                "pixType": "email",
                "pixKey": PIX_KEY if i == 87 else None,
                "pixKeyUpdatedAt": "2026-09-02T12:00:00Z" if i == 87 else None,
            }
            for i in body["interviewerIds"]
            if i in to_pay
        ]
        return Reply(200, {"items": items})

    def _matches(self, kw: dict[str, Any]) -> Reply:
        known = normalize_pix_key(PIX_KEY)
        rows = [
            {
                "ref": k["ref"],
                "interviewerId": 87 if normalize_pix_key(k["pixKey"]) == known else None,
                "inProject": normalize_pix_key(k["pixKey"]) == known,
            }
            for k in kw["json"]["keys"]
        ]
        return Reply(200, {self.matches_key: rows})

    def _event(self, kind: str, ref: str) -> None:
        if self.emit_events:
            self.events.append(
                {"seq": 100 + len(self.events) + 1, "type": kind, "data": {"paymentRef": ref}}
            )

    def _idempotent(self, kw: dict[str, Any]) -> tuple[str | None, Reply | None]:
        key = kw["headers"].get("Idempotency-Key")
        if not key:
            return None, refuse(422, "validation_error")
        digest = hashlib.sha256(json.dumps(kw["json"], sort_keys=True).encode()).hexdigest()
        if key in self.cache:
            same, reply = self.cache[key]
            if same == digest or not self.enforce_idempotency:
                return key, reply if same == digest else None
            return key, refuse(409, "idempotency_conflict")
        return key, None

    def _pay(self, kw: dict[str, Any]) -> Reply:
        key, early = self._idempotent(kw)
        if early is not None:
            return early
        body = kw["json"]
        ids = body["interviewIds"]
        if any(i not in self.items for i in ids):
            return refuse(422, "not_payable")
        if len({self.items[i]["interviewerId"] for i in ids}) > 1:
            return refuse(422, "mixed_interviewer")
        if any(self.items[i]["status"] == "paid" for i in ids):
            return refuse(409, "already_paid")
        total = sum(float(self.items[i]["amount"]) for i in ids)
        if self.enforce_amount and f"{total:.2f}" != body["amount"]:
            return refuse(422, "amount_mismatch")
        if any(p["e2eId"] == body["e2eId"] for p in self.payments.values()):
            return refuse(409, "duplicate_e2e")
        for i in ids:
            self.items[i].update(status="paid", paidOn=body["paidOn"])
        self.payments[body["paymentRef"]] = {
            "e2eId": body["e2eId"],
            "ids": ids,
            "status": "applied",
            **body,
        }
        self._event("payment.applied", body["paymentRef"])
        reply = Reply(
            201,
            {
                "paymentRef": body["paymentRef"],
                "status": "applied",
                "interviewIds": ids,
                "amount": body["amount"],
                "paidOn": body["paidOn"],
                "appliedAt": "2026-10-15T13:02:11Z",
            },
        )
        assert key
        self.cache[key] = (
            hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
            reply,
        )
        return reply

    def _get_payment(self, ref: str) -> Reply:
        payment = self.payments.get(ref)
        if payment is None:
            return refuse(404, "not_found")
        return Reply(
            200,
            {
                "paymentRef": ref,
                "status": payment["status"],
                "interviewIds": payment["ids"],
                "appliedAt": "2026-10-15T13:02:11Z",
            },
        )

    def _pay_losing_the_answer(self, kw: dict[str, Any]) -> Reply:
        """Aplica a baixa e some com a resposta: o cliente não sabe se foi aplicada."""
        self.lose_first_payment_answer = False
        self._pay(kw)
        raise requests.ReadTimeout("sem resposta")

    def _reverse(self, ref: str, kw: dict[str, Any]) -> Reply:
        if self.fail_first_reversal:
            self.fail_first_reversal = False
            return Reply(500)
        key, early = self._idempotent(kw)
        if early is not None:
            return early
        payment = self.payments.get(ref)
        if payment is None:
            return refuse(404, "not_found")
        if payment["status"] == "reversed" and not self.allow_double_reversal:
            return refuse(409, "not_reversible")
        for i in payment["ids"]:
            self.items[i].update(status="to_pay", paidOn=None)
        payment["status"] = "reversed"
        self._event("payment.reversed", ref)
        reply = Reply(
            200,
            {
                "paymentRef": ref,
                "status": "reversed",
                "interviewIds": payment["ids"],
                "reversedAt": "2026-10-18T10:00:00Z",
            },
        )
        assert key
        self.cache[key] = (
            hashlib.sha256(json.dumps(kw["json"], sort_keys=True).encode()).hexdigest(),
            reply,
        )
        return reply

    def _feed(self, kw: dict[str, Any]) -> Reply:
        after, limit = int(kw["params"]["after"]), int(kw["params"]["limit"])
        items = [e for e in self.events if e["seq"] > after][:limit]
        return Reply(200, {"items": items, "nextCursor": str(items[-1]["seq"]) if items else None})


def make_check(fake: FakeConnectDev) -> DevCheck:
    connect = HttpConnect(BASE, "financeiro-dev", SECRET, session=fake)
    restricted = HttpConnect(BASE, "financeiro-dev", SECRET, session=fake, scope="projects:read")
    return DevCheck(
        connect, restricted=restricted, today=date(2026, 10, 15), wait=0, sleep=lambda _: None
    )


def by_name(steps: list[Step], name: str) -> Step:
    return next(step for step in steps if step.name == name)


# ---------------------------------------- tudo certo


def test_the_whole_script_passes_against_a_connect_that_follows_the_contract() -> None:
    fake = FakeConnectDev()
    check = make_check(fake)
    steps = check.run()
    assert [s.status for s in steps] == ["ok"] * len(steps), [s for s in steps if s.status != "ok"]
    assert len(steps) == 18 and not check.failed
    # o dev volta como estava: a baixa foi desfeita e os itens estão a pagar
    assert all(item["status"] == "to_pay" for item in fake.items.values())
    assert {p["status"] for p in fake.payments.values()} == {"reversed"}
    assert [e["type"] for e in fake.events] == ["payment.applied", "payment.reversed"]


def test_the_script_never_prints_the_key_the_name_or_the_secret() -> None:
    steps = make_check(FakeConnectDev()).run()
    text = " ".join(f"{s.name} {s.detail}" for s in steps)
    for secret in (PIX_KEY, normalize_pix_key(PIX_KEY), NAME, SECRET, "mar***"):
        assert secret not in text


def test_the_payment_uses_the_whole_set_of_items_of_one_person_with_the_exact_sum() -> None:
    fake = FakeConnectDev()
    make_check(fake).run()
    sent = next(
        c["json"] for c in fake.calls if c["path"].endswith("/payments") and c["method"] == "POST"
    )
    assert (
        sent["interviewIds"] == [5531, 5533]
        and sent["amount"] == "80.00"
        and sent["interviewerId"] == 87
    )
    assert (
        sent["paymentRef"].startswith("fin-dev-check-")
        and sent["e2eId"].startswith("E")
        and len(sent["e2eId"]) == 32
    )


# ---------------------------------------- o que o verificador percebe


@pytest.mark.parametrize(
    ("broken", "step", "why"),
    [
        (
            {"enforce_idempotency": False},
            "Mesma chave com corpo diferente é recusada",
            "esperado idempotency_conflict",
        ),
        ({"enforce_amount": False}, "Valor que não bate é recusado", "o Connect aceitou"),
        ({"allow_double_reversal": True}, "Cancelar de novo é recusado", "devia ser recusado"),
        ({"emit_events": False}, "Feed de eventos: baixa e cancelamento", "faltam no feed"),
        ({"enforce_scope": False}, "Token sem o escopo é recusado", "already_paid"),
        (
            {"matches_key": "items"},
            "De quem é a chave (pix-key-matches)",
            "campo ausente na resposta: 'matches'",
        ),
    ],
)
def test_a_connect_that_breaks_the_contract_fails_the_matching_step(
    broken: dict[str, Any], step: str, why: str
) -> None:
    fake = FakeConnectDev(**broken)
    check = make_check(fake)
    steps = check.run()
    result = by_name(steps, step)
    assert result.status == "falhou" and why in result.detail
    assert check.failed
    # mesmo assim o dev volta como estava
    assert all(item["status"] == "to_pay" for item in fake.items.values())


def test_if_the_cancellation_fails_in_the_middle_the_script_undoes_the_payment_at_the_end() -> None:
    fake = FakeConnectDev(fail_first_reversal=True)
    steps = make_check(fake).run()
    assert by_name(steps, "Cancelar a baixa (reversal)").status == "falhou"
    assert "pode ter sido aplicada" in by_name(steps, "Cancelar a baixa (reversal)").detail
    assert by_name(steps, "Limpeza").status == "ok"
    assert all(item["status"] == "to_pay" for item in fake.items.values())


def test_a_payment_whose_answer_was_lost_is_still_undone_at_the_end() -> None:
    fake = FakeConnectDev(lose_first_payment_answer=True)
    steps = make_check(fake).run()
    assert by_name(steps, "Baixa (POST /payments)").status == "falhou"
    assert by_name(steps, "Limpeza").status == "ok"
    assert all(item["status"] == "to_pay" for item in fake.items.values())


def test_with_nothing_to_pay_the_writes_are_skipped_and_nothing_is_sent() -> None:
    fake = FakeConnectDev(with_items=False)
    check = make_check(fake)
    steps = check.run()
    assert by_name(steps, "Itens a pagar do projeto").status == "pulado"
    assert by_name(steps, "Baixa (POST /payments)").status == "pulado"
    assert not check.failed
    assert not [c for c in fake.calls if c["method"] == "POST" and c["path"].endswith("/payments")]
    assert fake.payments == {}


def test_a_token_that_the_connect_refuses_fails_every_call_with_a_clear_reason() -> None:
    class Refusing(FakeConnectDev):
        def _token(self, kwargs: dict[str, Any]) -> Reply:
            return Reply(401, {"code": "invalid_client"})

    steps = make_check(Refusing()).run()
    first = by_name(steps, "Token de serviço")
    assert first.status == "falhou" and "não respondeu como esperado" in first.detail
    assert all(s.status in ("falhou", "pulado") for s in steps)
