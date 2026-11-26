# ruff: noqa: F811  (as fixtures importadas são reusadas pelo nome)
"""Fluxo mensal (PF-76): as linhas do DRE pelo mês do pagamento, com as baixas e os recebimentos que
valem nas contas do fluxo de caixa (spec relatorios-e-analises)."""

import io
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from services.payable import today
from tests.test_dre import line, plan  # noqa: F401
from tests.test_fluxo_de_caixa import auth, pay, payable, receivable, receive, world  # noqa: F401

THIS_MONTH = {"start": today().replace(day=1).isoformat(), "end": today().isoformat()}


def monthly(client: TestClient, auth: dict[str, str], **params: Any) -> Any:
    response = client.get("/reports/monthly-flow", params={**THIS_MONTH, **params}, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def pay_part(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], title: Any, amount: str
) -> None:
    response = client.post(
        f"/payables/{title['id']}/payments",
        json={
            "paidOn": today().isoformat(),
            "amount": amount,
            "bankAccountId": world["account"].id,
            "paymentMethodId": world["method"].id,
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text


def test_the_month_is_the_payment_month_not_the_competence(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    # competência de setembro, paga hoje: no fluxo mensal entra no mês de hoje
    rent = payable(
        client, auth, world, today(), "1000.00", categoryId=plan["rent"].id, competence="2026-09"
    )
    pay(client, auth, world, rent)
    # em aberto: não saiu dinheiro, não entra
    payable(client, auth, world, today(), "150.00", categoryId=plan["phone"].id)
    sale = receivable(client, auth, world, today(), "400.00")
    receive(client, auth, world, sale)

    data = monthly(client, auth)

    assert [m["month"] for m in data["months"]] == [today().strftime("%Y-%m")]
    revenue, expense = data["blocks"]
    assert line(revenue, "Receitas de pesquisa")["total"] == "400.00"
    admin = line(expense, "Despesas administrativas")
    assert [a["label"] for a in admin["accounts"]] == ["3.01 Aluguel"]
    assert admin["total"] == "1000.00"
    assert data["result"]["total"] == "-600.00"
    # o DRE do mesmo período não vê o aluguel: a competência é setembro
    dre = client.get("/reports/dre", params=THIS_MONTH, headers=auth).json()
    assert [row["label"] for row in dre["blocks"][1]["lines"]] == ["Despesas administrativas"]
    assert dre["blocks"][1]["total"] == "150.00"


def test_reversed_payments_and_accounts_out_of_the_cash_flow_do_not_count(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    title = payable(client, auth, world, today(), "250.00", categoryId=plan["rent"].id)
    paid = pay(client, auth, world, title)
    reverse = client.post(
        f"/payables/{title['id']}/payments/{paid['payments'][0]['id']}/reverse",
        json={"kind": "estorno", "reason": "Pago em dobro"},
        headers=auth,
    )
    assert reverse.status_code == 200, reverse.text
    card = payable(client, auth, world, today(), "80.00", categoryId=plan["phone"].id)
    pay(client, auth, world, card, account=world["card"])

    assert monthly(client, auth)["blocks"][1]["lines"] == []


def test_the_project_filter_takes_the_project_share_of_each_payment(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    split = [
        {"projectId": world["project"].id, "amount": "600.00"},
        {"projectId": plan["other_project"].id, "amount": "400.00"},
    ]
    title = payable(
        client, auth, world, today(), "1000.00", categoryId=plan["rent"].id, allocations=split
    )
    pay_part(client, auth, world, title, "500.00")

    assert monthly(client, auth)["blocks"][1]["total"] == "500.00"
    assert monthly(client, auth, project=world["project"].id)["blocks"][1]["total"] == "300.00"
    other = monthly(client, auth, project=plan["other_project"].id)
    assert other["blocks"][1]["total"] == "200.00"


def test_export_names_the_monthly_flow_and_needs_login(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    pay(client, auth, world, payable(client, auth, world, today(), "90.00"))
    response = client.get("/reports/monthly-flow/export", params=THIS_MONTH, headers=auth)
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="fluxo-mensal.xlsx"'
    sheet = load_workbook(io.BytesIO(response.content)).active
    assert sheet.title == "Fluxo mensal"
    assert sheet["A1"].value.startswith("Fluxo mensal pelo pagamento · ")
    assert [row[0].value for row in sheet.iter_rows(min_row=3)][-1] == "RESULTADO"
    assert sheet.cell(row=sheet.max_row, column=3).value == Decimal("-90.00")
    assert client.get("/reports/monthly-flow", params=THIS_MONTH).status_code == 401
