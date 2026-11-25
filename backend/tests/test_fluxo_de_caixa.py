"""Fluxo de caixa (PF-74): previsto × realizado e o saldo projetado (spec relatorios-e-analises)."""

import io
from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    PaymentMethod,
    Project,
    Supplier,
)
from models.user import User
from services.auth import create_access_token
from services.payable import today

MONDAY = today() - timedelta(days=today().weekday())
NEXT_MONDAY = MONDAY + timedelta(days=7)
NEXT_SUNDAY = NEXT_MONDAY + timedelta(days=6)


@pytest.fixture
def world(db_session: Session) -> dict[str, Any]:
    company = Company(name="PPlus")
    db_session.add(company)
    db_session.flush()
    things = {
        "unit": BusinessUnit(company_id=company.id, name="Consumo SP"),
        # saldo de R$ 1.000,00 dez dias antes da semana: o que veio antes disso já está nele
        "account": BankAccount(
            company_id=company.id,
            name="Itaú · PPlus",
            openingBalance=Decimal("1000.00"),
            openingDate=MONDAY - timedelta(days=10),
        ),
        # cartão: fora do fluxo de caixa
        "card": BankAccount(
            company_id=company.id,
            name="Cartão · PPlus",
            accountType="credito",
            impactsCashFlow=False,
        ),
        "cost_center": CostCenter(name="Campo"),
        "expense": ExpenseCategory(code="2.04", name="Material e gráfica"),
        "revenue": ExpenseCategory(code="1.01", name="Receita de pesquisa", kind="receita"),
        "method": PaymentMethod(name="Pix"),
        "supplier": Supplier(nickname="Ponto Certo", name="Gráfica Ponto Certo"),
        "customer": Customer(nickname="Alfa", name="Alfa Pesquisas Ltda"),
        "project": Project(code="1804", title="Pesquisa"),
    }
    db_session.add_all(things.values())
    db_session.commit()
    return {"company": company, **things}


@pytest.fixture
def auth(make_user: Callable[..., User]) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(make_user().id)}"}


def payable(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    due: date,
    amount: str,
    **kw: Any,
) -> Any:
    body = {
        "issueDate": min(due, today()).isoformat(),
        "dueDate": due.isoformat(),
        "amount": amount,
        "supplierId": world["supplier"].id,
        "categoryId": world["expense"].id,
        "companyId": world["company"].id,
        "unitId": world["unit"].id,
        "costCenterId": world["cost_center"].id,
        "paymentMethodId": world["method"].id,
        "description": "Impressão de questionários",
        "allocations": [{"projectId": world["project"].id, "amount": amount}],
        **kw,
    }
    response = client.post("/payables", json=body, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def pay(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], title: Any, account: Any = None
) -> Any:
    response = client.post(
        f"/payables/{title['id']}/payments",
        json={
            "paidOn": today().isoformat(),
            "amount": title["amount"],
            "bankAccountId": (account or world["account"]).id,
            "paymentMethodId": world["method"].id,
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text
    return response.json()


def receivable(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    due: date,
    amount: str,
    **kw: Any,
) -> Any:
    body = {
        "customerId": world["customer"].id,
        "projectId": world["project"].id,
        "companyId": world["company"].id,
        "unitId": world["unit"].id,
        "costCenterId": world["cost_center"].id,
        "categoryId": world["revenue"].id,
        "description": "Pesquisa de satisfação",
        "issueDate": min(due, today()).isoformat(),
        "dueDate": due.isoformat(),
        "amount": amount,
        **kw,
    }
    response = client.post("/receivables", json=body, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def receive(client: TestClient, auth: dict[str, str], world: dict[str, Any], title: Any) -> None:
    response = client.post(
        f"/receivables/{title['id']}/receipts",
        json={
            "receivedOn": today().isoformat(),
            "amount": title["amount"],
            "bankAccountId": world["account"].id,
            "paymentMethodId": world["method"].id,
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text


def flow(client: TestClient, auth: dict[str, str], **params: Any) -> Any:
    params = {"start": MONDAY.isoformat(), "end": NEXT_SUNDAY.isoformat(), **params}
    response = client.get("/reports/cash-flow", params=params, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def detail(client: TestClient, auth: dict[str, str], start: date, end: date) -> Any:
    response = client.get(
        "/reports/cash-flow/detail",
        params={"start": start.isoformat(), "end": end.isoformat()},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    return response.json()


def money(value: str) -> Decimal:
    return Decimal(value)


def test_forecast_lists_open_titles_by_due_date_and_actual_lists_the_payments(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    # o que vence na semana que vem e ainda está em aberto: o previsto
    payable(client, auth, world, NEXT_MONDAY + timedelta(days=1), "300.00", description="Aluguel")
    payable(
        client,
        auth,
        world,
        NEXT_MONDAY + timedelta(days=2),
        "150.00",
        type="provisao",
        supplierId=None,
        description="Provisão de campo",
    )
    receivable(client, auth, world, NEXT_MONDAY + timedelta(days=3), "500.00")
    # o que foi pago e recebido hoje: o realizado desta semana
    pay(client, auth, world, payable(client, auth, world, today(), "200.00", description="Gráfica"))
    receive(client, auth, world, receivable(client, auth, world, today(), "400.00"))
    # vencido antes da semana e ainda em aberto: entra no saldo, sem sumir da conta
    payable(client, auth, world, MONDAY - timedelta(days=3), "100.00", description="Atrasada")

    data = flow(client, auth)

    assert money(data["opening"]) == Decimal("1000.00")
    assert (money(data["lateIn"]), money(data["lateOut"])) == (Decimal("0"), Decimal("100.00"))
    this_week, next_week = data["periods"]
    assert this_week["label"] == f"{MONDAY:%d/%m} a {MONDAY + timedelta(days=6):%d/%m}"
    assert (money(this_week["actualIn"]), money(this_week["actualOut"])) == (
        Decimal("400.00"),
        Decimal("200.00"),
    )
    assert (money(this_week["forecastIn"]), money(this_week["forecastOut"])) == (0, 0)
    assert (money(next_week["forecastIn"]), money(next_week["forecastOut"])) == (
        Decimal("500.00"),
        Decimal("450.00"),
    )
    # 1.000 − 100 em atraso + 400 − 200 nesta semana; depois + 500 − 450
    assert money(this_week["balance"]) == Decimal("1100.00")
    assert money(next_week["balance"]) == Decimal("1150.00")
    assert money(data["closing"]) == Decimal("1150.00")
    # a conta: só o realizado, porque o previsto não tem conta até a baixa
    assert data["accounts"] == [
        {
            "id": world["account"].id,
            "name": "Itaú · PPlus",
            "opening": "1000.00",
            "inflow": "400.00",
            "outflow": "200.00",
            "closing": "1200.00",
        }
    ]

    # o detalhe da semana que vem lista os títulos em aberto pelo vencimento
    upcoming = detail(client, auth, NEXT_MONDAY, NEXT_SUNDAY)
    assert [
        (line["kind"], line["description"], line["amount"], line["provision"])
        for line in upcoming["forecast"]
    ] == [
        ("pagar", "Aluguel", "300.00", False),
        ("pagar", "Provisão de campo", "150.00", True),
        ("receber", "Pesquisa de satisfação", "500.00", False),
    ]
    assert upcoming["actual"] == []
    # e o desta semana lista as baixas, com a conta
    done = detail(client, auth, MONDAY, MONDAY + timedelta(days=6))
    assert sorted((line["kind"], line["amount"], line["account"]) for line in done["actual"]) == [
        ("pagar", "200.00", "Itaú · PPlus"),
        ("receber", "400.00", "Itaú · PPlus"),
    ]


def test_reversed_payments_and_accounts_out_of_the_cash_flow_do_not_count(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = payable(client, auth, world, today(), "250.00", description="Estornada")
    paid = pay(client, auth, world, title)
    reverse = client.post(
        f"/payables/{title['id']}/payments/{paid['payments'][0]['id']}/reverse",
        json={"kind": "estorno", "reason": "Pago em dobro"},
        headers=auth,
    )
    assert reverse.status_code == 200, reverse.text
    # paga no cartão, que está fora do fluxo de caixa
    pay(client, auth, world, payable(client, auth, world, today(), "80.00"), account=world["card"])

    data = flow(client, auth, end=(MONDAY + timedelta(days=6)).isoformat())

    (week,) = data["periods"]
    # o estorno anula a baixa, e a conta volta ao previsto; o cartão não entra
    assert money(week["actualOut"]) == Decimal("0")
    assert money(week["forecastOut"]) == Decimal("250.00")
    assert [account["name"] for account in data["accounts"]] == ["Itaú · PPlus"]


def test_an_account_that_starts_inside_the_period_enters_on_its_opening_date(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    world["account"].openingDate = NEXT_MONDAY
    world["account"].openingBalance = Decimal("700.00")
    db_session.commit()

    data = flow(client, auth)

    assert money(data["opening"]) == Decimal("0")
    this_week, next_week = data["periods"]
    assert money(this_week["balance"]) == Decimal("0")
    assert money(next_week["balance"]) == Decimal("700.00")


def test_periods_by_day_and_by_month(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    by_day = flow(client, auth, group="dia", end=(MONDAY + timedelta(days=2)).isoformat())
    assert [row["label"] for row in by_day["periods"]] == [
        f"{MONDAY + timedelta(days=n):%d/%m/%Y}" for n in range(3)
    ]
    by_month = flow(client, auth, group="mes", start="2026-10-15", end="2026-12-03")
    assert [(row["label"], row["start"], row["end"]) for row in by_month["periods"]] == [
        ("outubro/2026", "2026-10-15", "2026-10-31"),
        ("novembro/2026", "2026-11-01", "2026-11-30"),
        ("dezembro/2026", "2026-12-01", "2026-12-03"),
    ]


@pytest.mark.parametrize(
    ("params", "detail_message"),
    [
        ({"start": "2026-11-30", "end": "2026-11-01"}, "A data final vem antes da inicial"),
        ({"start": "2020-01-01", "end": "2026-11-01"}, "Escolha um período de até 3 anos"),
        (
            {"start": "2025-01-01", "end": "2026-11-01", "group": "dia"},
            "Períodos demais: agrupe por semana ou mês",
        ),
    ],
)
def test_wrong_periods_are_refused_with_the_reason(
    client: TestClient, auth: dict[str, str], params: dict[str, str], detail_message: str
) -> None:
    response = client.get("/reports/cash-flow", params=params, headers=auth)
    assert (response.status_code, response.json()["detail"]) == (422, detail_message)


def test_unknown_grouping_and_no_login_are_refused(
    client: TestClient, auth: dict[str, str]
) -> None:
    params = {"start": "2026-11-01", "end": "2026-11-30"}
    assert (
        client.get(
            "/reports/cash-flow", params={**params, "group": "ano"}, headers=auth
        ).status_code
        == 422
    )
    assert client.get("/reports/cash-flow", params=params).status_code == 401
    assert client.get("/reports/cash-flow/detail", params=params).status_code == 401


def test_export_has_the_periods_and_the_totals_without_summing_the_balance(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    payable(client, auth, world, NEXT_MONDAY, "300.00")
    response = client.get(
        "/reports/cash-flow/export",
        params={"start": MONDAY.isoformat(), "end": NEXT_SUNDAY.isoformat()},
        headers=auth,
    )
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="fluxo-de-caixa.xlsx"'
    sheet = load_workbook(io.BytesIO(response.content)).active
    assert "saldo inicial R$ 1.000,00" in sheet["A1"].value
    assert [cell.value for cell in sheet[2]] == [
        "Período",
        "Entradas previstas",
        "Saídas previstas",
        "Entradas realizadas",
        "Saídas realizadas",
        "Saldo projetado",
    ]
    total = [cell.value for cell in sheet[5]]
    assert total[0] == "Total"
    assert Decimal(str(total[2])) == Decimal("300.00")
    assert total[5] is None
