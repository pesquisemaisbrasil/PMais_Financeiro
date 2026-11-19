# ruff: noqa: F811
"""Impostos retidos: os percentuais que toda conta a pagar nova já traz (Bruno, 19/11/2026)."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.reference import RecordEvent, TaxRate
from models.user import User
from services.auth import create_access_token
from tests.test_payables import auth, world  # noqa: F401

URL = "/tax-rates"


def _rates(response: Any) -> dict[str, str]:
    return {row["code"]: row["rate"] for row in response.json()}


def test_without_any_change_the_system_defaults_apply(
    client: TestClient, auth: dict[str, str]
) -> None:
    response = client.get(URL, headers=auth)
    assert response.status_code == 200
    assert [(row["code"], row["name"]) for row in response.json()] == [
        ("pis", "PIS"),
        ("cofins", "COFINS"),
        ("csll", "CSLL"),
        ("ir", "IR"),
    ]
    assert _rates(response) == {"pis": "0.65", "cofins": "3.00", "csll": "1.00", "ir": "1.50"}


def test_the_new_account_form_receives_the_rates(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    reference = client.get("/reference", headers=auth).json()
    assert [row["code"] for row in reference["taxRates"]] == ["pis", "cofins", "csll", "ir"]


def test_changing_a_rate_is_saved_for_everyone_and_kept_in_the_history(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    body = {"rates": [{"code": "ir", "rate": "1.00"}, {"code": "pis", "rate": "0.65"}]}
    response = client.put(URL, json=body, headers=auth)
    assert response.status_code == 200
    assert _rates(response)["ir"] == "1.00"
    assert _rates(client.get(URL, headers=auth))["ir"] == "1.00"
    # o que não mudou não entra no histórico
    events = db_session.query(RecordEvent).filter(RecordEvent.kind == "taxRates").all()
    assert [event.text for event in events] == ["Impostos retidos: IR 1,5% → 1%"]

    # mandar de novo o mesmo valor não cria outra linha nem outro histórico
    assert client.put(URL, json=body, headers=auth).status_code == 200
    assert db_session.query(TaxRate).filter(TaxRate.code == "ir").count() == 1
    assert db_session.query(RecordEvent).filter(RecordEvent.kind == "taxRates").count() == 1


def test_a_rate_can_be_zero(client: TestClient, auth: dict[str, str]) -> None:
    response = client.put(URL, json={"rates": [{"code": "csll", "rate": "0"}]}, headers=auth)
    assert response.status_code == 200
    assert _rates(response)["csll"] == "0.00"


@pytest.mark.parametrize(
    ("rate", "code", "message"),
    [
        ("-1", "pis", "Use um percentual entre 0 e 100, com até 2 casas, como 1,5"),
        ("100.01", "pis", "Use um percentual entre 0 e 100, com até 2 casas, como 1,5"),
        ("1.555", "pis", "Use um percentual entre 0 e 100, com até 2 casas, como 1,5"),
        ("1", "icms", "Imposto desconhecido"),
    ],
)
def test_invalid_rates_are_refused_in_plain_words(
    client: TestClient,
    auth: dict[str, str],
    db_session: Session,
    rate: str,
    code: str,
    message: str,
) -> None:
    response = client.put(URL, json={"rates": [{"code": code, "rate": rate}]}, headers=auth)
    assert response.status_code == 422
    assert response.json()["detail"] == message
    assert db_session.query(TaxRate).count() == 0


def test_the_same_tax_twice_is_refused(client: TestClient, auth: dict[str, str]) -> None:
    body = {"rates": [{"code": "ir", "rate": "1"}, {"code": "ir", "rate": "2"}]}
    response = client.put(URL, json=body, headers=auth)
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Cada imposto aparece uma vez só",
    )


@pytest.mark.parametrize("who", ["sem_acesso", "sem_login"])
def test_only_the_finance_team_reads_and_changes_the_rates(
    client: TestClient, make_user: Callable[..., User], who: str
) -> None:
    headers = {}
    if who == "sem_acesso":
        user = make_user(email="outro@pesquisemais.com.br", role="auditor")
        headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    expected = 403 if who == "sem_acesso" else 401
    assert client.get(URL, headers=headers).status_code == expected
    body = {"rates": [{"code": "ir", "rate": "1"}]}
    assert client.put(URL, json=body, headers=headers).status_code == expected
