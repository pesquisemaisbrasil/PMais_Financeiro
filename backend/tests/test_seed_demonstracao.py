"""A versão de demonstração (backend no navegador) precisa ter o que mostrar em todas as telas,
só com dados fictícios."""

import re
import time
from collections.abc import Iterator

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.bank_statement import BankTransaction
from models.period_closing import PeriodClosing
from models.user import User
from scripts.seed_demonstracao import (
    DEMO_EMAIL,
    DEMO_PASSWORD,
    DEMO_TOTP_SECRET,
    seed_demonstracao,
)
from services.payable import today


@pytest.fixture
def demo(db_session: Session, client: TestClient) -> Iterator[dict[str, str]]:
    seed_demonstracao(db_session)
    mfa = client.post("/auth/token", data={"username": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert mfa.status_code == 200
    code = pyotp.TOTP(DEMO_TOTP_SECRET).at(int(time.time()))
    token = client.post(
        "/auth/token/mfa",
        json={"code": code},
        headers={"Authorization": f"Bearer {mfa.json()['mfa_token']}"},
    )
    assert token.status_code == 200
    yield {"Authorization": f"Bearer {token.json()['access_token']}"}


def test_demo_user_is_an_admin_with_mfa_and_a_fictitious_address(
    db_session: Session, demo: dict[str, str]
) -> None:
    user = db_session.query(User).filter_by(email=DEMO_EMAIL).one()

    assert user.role == "admin"
    assert user.mfaEnabledAt is not None
    assert DEMO_EMAIL.endswith(".invalid")


def test_payables_cover_every_situation(client: TestClient, demo: dict[str, str]) -> None:
    listing = client.get("/payables", params={"mode": "tudo"}, headers=demo).json()
    situations = {row["situation"] for row in listing["items"]}

    assert {"vencido", "hoje", "a_vencer", "pago", "parcial"} <= situations
    cancelled = client.get(
        "/payables", params={"mode": "tudo", "situation": "cancelado"}, headers=demo
    ).json()
    assert [row["description"] for row in cancelled["items"]] == ["Licenças de software"]


def test_bank_screens_have_reconciled_pending_and_exception_lines(
    client: TestClient, db_session: Session, demo: dict[str, str]
) -> None:
    accounts = {
        row["name"]: row["id"] for row in client.get("/records/bankAccounts", headers=demo).json()
    }
    itau = accounts["Itaú · PPlus"]
    month = today().strftime("%Y-%m")

    by_situation = {}
    for situation in ("conciliada", "pendente", "excecao"):
        listing = client.get(
            f"/bank-accounts/{itau}/transactions",
            params={"situation": situation, "from": f"{month}-01"},
            headers=demo,
        )
        assert listing.status_code == 200
        by_situation[situation] = listing.json()["total"]
    assert by_situation["conciliada"] >= 3
    assert by_situation["pendente"] >= 2
    assert by_situation["excecao"] == 1

    pending = client.get(
        f"/bank-accounts/{itau}/transactions",
        params={"situation": "pendente", "from": f"{month}-01"},
        headers=demo,
    ).json()["items"]
    with_suggestion = [
        row
        for row in pending
        if client.get(f"/bank-transactions/{row['id']}/suggestions", headers=demo).json()
    ]
    assert with_suggestion, "uma linha pendente precisa ter sugestão para a demonstração"
    # a Conferência abre na primeira conta da lista (Bradesco): ela também precisa ter extrato
    bradesco = client.get(
        f"/bank-accounts/{accounts['Bradesco · MC']}/transactions",
        params={"from": f"{month}-01"},
        headers=demo,
    ).json()
    assert bradesco["total"] >= 2
    assert db_session.query(BankTransaction).count() >= 8


def test_previous_month_is_closed_and_balances_are_filled(
    client: TestClient, db_session: Session, demo: dict[str, str]
) -> None:
    assert db_session.query(PeriodClosing).count() == 1
    month = today().strftime("%Y-%m")

    balances = client.get("/bank-balances", params={"month": month}, headers=demo)
    closings = client.get("/period-closings", params={"month": month}, headers=demo)

    assert balances.status_code == 200 and closings.status_code == 200
    assert any(row["opening"] != "0.00" for row in _rows(balances.json()))


def _rows(payload: object) -> list[dict[str, str]]:
    """Linhas com saldo, em qualquer lugar da resposta."""
    found: list[dict[str, str]] = []
    if isinstance(payload, dict):
        if "opening" in payload:
            found.append(payload)  # type: ignore[arg-type]
        for value in payload.values():
            found += _rows(value)
    elif isinstance(payload, list):
        for value in payload:
            found += _rows(value)
    return found


def test_receivables_incentives_holidays_and_reports_are_filled(
    client: TestClient, demo: dict[str, str]
) -> None:
    receivables = client.get("/receivables", params={"mode": "tudo"}, headers=demo).json()
    assert {row["situation"] for row in receivables["items"]} >= {"vencido", "recebido", "a_vencer"}

    agenda = client.get("/incentives/agenda", params={"mode": "tudo"}, headers=demo)
    assert agenda.status_code == 200
    assert len({row["dueDate"] for row in agenda.json()["rows"]}) >= 2

    holidays = client.get("/holidays", headers=demo).json()
    assert any(h["scope"] == "municipal" for h in holidays)

    for path in ("/home", "/reference", "/reports/projects", "/receivables/delinquency"):
        assert client.get(path, headers=demo).status_code == 200, path


def test_nothing_in_the_demo_looks_like_real_personal_data(
    client: TestClient, demo: dict[str, str]
) -> None:
    text = " ".join(
        [
            client.get("/payables", params={"mode": "tudo"}, headers=demo).text,
            client.get("/receivables", params={"mode": "tudo"}, headers=demo).text,
            client.get("/records/customers", headers=demo).text,
            client.get("/records/suppliers", headers=demo).text,
        ]
    )

    assert not re.search(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", text), "CPF nunca"
    assert "@" not in re.sub(r"[\w.]+@pesquisemais\.invalid", "", text)
