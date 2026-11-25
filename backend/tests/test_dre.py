# ruff: noqa: F811  (as fixtures importadas de test_fluxo_de_caixa são reusadas pelo nome)
"""DRE (PF-76): cada grupo do plano de contas é uma linha, por competência (decisão do Bruno,
25/11/2026; spec relatorios-e-analises)."""

import io
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from models.reference import ExpenseCategory, ExpenseCategoryGroup, Project
from services.payable import today
from tests.test_fluxo_de_caixa import auth, payable, receivable, world  # noqa: F401

PERIOD = {"start": "2026-09-01", "end": "2026-10-31"}


@pytest.fixture
def plan(db_session: Session, world: dict[str, Any]) -> dict[str, Any]:
    """Dois grupos de despesa (um com duas contas), um de receita e uma conta sem grupo."""
    admin = ExpenseCategoryGroup(code="003", name="Despesas administrativas")
    field = ExpenseCategoryGroup(code="002", name="Custos de campo")
    sales = ExpenseCategoryGroup(code="001", name="Receitas de pesquisa")
    db_session.add_all([admin, field, sales])
    db_session.flush()
    world["expense"].group_id = field.id  # 2.04 Material e gráfica
    world["revenue"].group_id = sales.id  # 1.01 Receita de pesquisa
    rent = ExpenseCategory(code="3.01", name="Aluguel", group_id=admin.id)
    phone = ExpenseCategory(code="3.02", name="Telefonia", group_id=admin.id)
    loose = ExpenseCategory(code="9.99", name="Diversos")
    other_project = Project(code="1790", title="Outra")
    db_session.add_all([rent, phone, loose, other_project])
    db_session.commit()
    return {"rent": rent, "phone": phone, "loose": loose, "other_project": other_project}


def dre(client: TestClient, auth: dict[str, str], **params: Any) -> Any:
    response = client.get("/reports/dre", params={**PERIOD, **params}, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def line(block: dict[str, Any], label: str) -> dict[str, Any]:
    return next(row for row in block["lines"] if row["label"] == label)


def money(values: list[str]) -> list[Decimal]:
    return [Decimal(value) for value in values]


def test_each_group_is_a_line_and_the_line_is_the_sum_of_its_accounts(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    due = today()
    payable(client, auth, world, due, "1000.00", categoryId=plan["rent"].id, competence="2026-09")
    payable(client, auth, world, due, "1000.00", categoryId=plan["rent"].id, competence="2026-10")
    payable(client, auth, world, due, "150.00", categoryId=plan["phone"].id, competence="2026-10")
    payable(client, auth, world, due, "300.00", competence="2026-10")  # 2.04, Custos de campo
    payable(client, auth, world, due, "40.00", categoryId=plan["loose"].id, competence="2026-10")
    receivable(client, auth, world, due, "5000.00", competence="2026-10")
    # fora do DRE: a provisão (estimativa) e o mês que não está no período
    payable(
        client, auth, world, due, "999.00", type="provisao", supplierId=None, competence="2026-10"
    )
    payable(client, auth, world, due, "777.00", categoryId=plan["rent"].id, competence="2026-11")

    data = dre(client, auth)

    assert [m["label"] for m in data["months"]] == ["setembro/2026", "outubro/2026"]
    revenue, expense = data["blocks"]
    assert (revenue["label"], expense["label"]) == ("Receitas", "Despesas")
    assert [row["label"] for row in revenue["lines"]] == ["Receitas de pesquisa"]
    # os grupos na ordem do código, e o que não tem grupo no fim
    assert [row["label"] for row in expense["lines"]] == [
        "Custos de campo",
        "Despesas administrativas",
        "Sem grupo",
    ]
    admin = line(expense, "Despesas administrativas")
    assert money(admin["values"]) == [Decimal("1000.00"), Decimal("1150.00")]
    assert [account["label"] for account in admin["accounts"]] == ["3.01 Aluguel", "3.02 Telefonia"]
    # o DRE do mês bate com a soma das contas analíticas de cada linha
    for block in data["blocks"]:
        for row in block["lines"]:
            sums = [
                sum(column, Decimal(0))
                for column in zip(*(money(a["values"]) for a in row["accounts"]), strict=True)
            ]
            assert money(row["values"]) == sums
    assert money(expense["values"]) == [Decimal("1000.00"), Decimal("1490.00")]
    assert Decimal(expense["total"]) == Decimal("2490.00")
    assert money(data["result"]["values"]) == [Decimal("-1000.00"), Decimal("3510.00")]


def test_without_competence_the_payable_counts_in_the_month_it_was_issued(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    created = payable(client, auth, world, today(), "200.00", categoryId=plan["rent"].id)
    month = created["issueDate"][:7]
    data = dre(client, auth, start=f"{month}-01", end=f"{month}-01")
    expense = data["blocks"][1]
    assert money(line(expense, "Despesas administrativas")["values"]) == [Decimal("200.00")]


def test_a_canceled_title_leaves_the_dre(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    created = payable(
        client, auth, world, today(), "200.00", categoryId=plan["rent"].id, competence="2026-10"
    )
    cancel = client.post(
        f"/payables/{created['id']}/cancel", json={"reason": "Lançada errado"}, headers=auth
    )
    assert cancel.status_code == 200, cancel.text
    assert dre(client, auth)["blocks"][1]["lines"] == []


def test_the_project_filter_takes_only_the_share_of_the_project(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    split = [
        {"projectId": world["project"].id, "amount": "600.00"},
        {"projectId": plan["other_project"].id, "amount": "400.00"},
    ]
    payable(
        client,
        auth,
        world,
        today(),
        "1000.00",
        categoryId=plan["rent"].id,
        competence="2026-10",
        allocations=split,
    )
    mine = dre(client, auth, project=world["project"].id)
    assert Decimal(mine["blocks"][1]["total"]) == Decimal("600.00")
    other = dre(client, auth, project=plan["other_project"].id)
    assert Decimal(other["blocks"][1]["total"]) == Decimal("400.00")
    # empresa, unidade e centro de custo: o título é deles por inteiro
    assert Decimal(dre(client, auth, company=world["company"].id)["blocks"][1]["total"]) == Decimal(
        "1000.00"
    )
    assert dre(client, auth, unit=999)["blocks"][1]["lines"] == []


@pytest.mark.parametrize(
    ("params", "detail_message"),
    [
        ({"start": "2026-10-01", "end": "2026-09-01"}, "A data final vem antes da inicial"),
        ({"start": "2024-01-01", "end": "2026-10-01"}, "Escolha até 24 meses"),
    ],
)
def test_wrong_periods_are_refused_with_the_reason(
    client: TestClient, auth: dict[str, str], params: dict[str, str], detail_message: str
) -> None:
    response = client.get("/reports/dre", params=params, headers=auth)
    assert (response.status_code, response.json()["detail"]) == (422, detail_message)
    assert client.get("/reports/dre", params=params).status_code == 401


def test_export_has_the_lines_the_accounts_and_the_filters(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    payable(
        client, auth, world, today(), "150.00", categoryId=plan["phone"].id, competence="2026-10"
    )
    response = client.get(
        "/reports/dre/export", params={**PERIOD, "project": world["project"].id}, headers=auth
    )
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="dre.xlsx"'
    sheet = load_workbook(io.BytesIO(response.content)).active
    assert "projeto=PRJ-1804" in sheet["A1"].value
    assert [cell.value for cell in sheet[2]] == ["Linha", "setembro/2026", "outubro/2026", "Total"]
    labels = [row[0].value for row in sheet.iter_rows(min_row=3)]
    assert labels == [
        "RECEITAS",
        "DESPESAS",
        "  Despesas administrativas",
        "      3.02 Telefonia",
        "RESULTADO",
    ]
    gone = client.get("/reports/dre/export", params={**PERIOD, "company": 999}, headers=auth)
    assert (gone.status_code, gone.json()["detail"]) == (
        422,
        "O filtro de empresa não existe mais. Limpe e escolha de novo",
    )
