# ruff: noqa: F811  (as fixtures importadas de test_fluxo_de_caixa são reusadas pelo nome)
"""DRE (PF-76): linhas fixas com subtotais, ligadas pelo plano de contas (decisão do Bruno,
27/11/2026, ADR 0030; spec relatorios-e-analises)."""

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
    """Grupos ligados a linhas do DRE, uma conta fora do resultado (com linha própria dentro das
    administrativas) e uma conta sem grupo nem linha."""
    admin = ExpenseCategoryGroup(
        code="003", name="Despesas administrativas", dreLine="administrativas"
    )
    field = ExpenseCategoryGroup(code="002", name="Custos de campo", dreLine="custos")
    sales = ExpenseCategoryGroup(code="001", name="Receitas de pesquisa", dreLine="receita")
    taxes = ExpenseCategoryGroup(code="004", name="Impostos", dreLine="impostos")
    db_session.add_all([admin, field, sales, taxes])
    db_session.flush()
    world["expense"].group_id = field.id  # 2.04 Material e gráfica
    world["revenue"].group_id = sales.id  # 1.01 Receita de pesquisa
    rent = ExpenseCategory(code="3.01", name="Aluguel", group_id=admin.id)
    phone = ExpenseCategory(code="3.02", name="Telefonia", group_id=admin.id)
    loan = ExpenseCategory(code="3.99", name="Empréstimo", group_id=admin.id, dreLine="fora")
    iss = ExpenseCategory(code="4.01", name="ISS", group_id=taxes.id)
    loose = ExpenseCategory(code="9.99", name="Diversos")
    other_project = Project(code="1790", title="Outra")
    db_session.add_all([rent, phone, loan, iss, loose, other_project])
    db_session.commit()
    return {
        "rent": rent,
        "phone": phone,
        "loan": loan,
        "iss": iss,
        "loose": loose,
        "other_project": other_project,
    }


def dre(client: TestClient, auth: dict[str, str], **params: Any) -> Any:
    response = client.get("/reports/dre", params={**PERIOD, **params}, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def line(block: dict[str, Any], label: str) -> dict[str, Any]:
    return next(row for row in block["lines"] if row["label"] == label)


def row(data: dict[str, Any], key: str) -> dict[str, Any]:
    return next(item for item in data["rows"] if item["key"] == key)


def money(values: list[str]) -> list[Decimal]:
    return [Decimal(value) for value in values]


def amounts(*values: str) -> list[Decimal]:
    return [Decimal(value) for value in values]


def test_the_lines_and_subtotals_in_order_with_what_stays_out_of_the_result(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    due = today()
    for category, amount, competence in (
        ("rent", "1000.00", "2026-09"),
        ("rent", "1000.00", "2026-10"),
        ("phone", "150.00", "2026-10"),
        ("loan", "700.00", "2026-10"),
        ("iss", "200.00", "2026-10"),
        ("loose", "40.00", "2026-10"),
    ):
        payable(
            client, auth, world, due, amount, categoryId=plan[category].id, competence=competence
        )
    payable(client, auth, world, due, "300.00", competence="2026-10")  # 2.04, Custos de campo
    receivable(client, auth, world, due, "5000.00", competence="2026-10")
    # fora do DRE: a provisão (estimativa) e o mês que não está no período
    payable(
        client, auth, world, due, "999.00", type="provisao", supplierId=None, competence="2026-10"
    )
    payable(client, auth, world, due, "777.00", categoryId=plan["rent"].id, competence="2026-11")

    data = dre(client, auth)

    assert [m["label"] for m in data["months"]] == ["setembro/2026", "outubro/2026"]
    expected = [
        ("receita", "+", ("0", "5000.00")),
        ("impostos", "-", ("0", "200.00")),
        ("receita_liquida", "=", ("0", "4800.00")),
        ("custos", "-", ("0", "300.00")),
        ("lucro_bruto", "=", ("0", "4500.00")),
        ("pessoal", "-", ("0", "0")),
        ("administrativas", "-", ("1000.00", "1150.00")),
        ("resultado_operacional", "=", ("-1000.00", "3350.00")),
        ("bancarias", "-", ("0", "0")),
        ("outras_receitas", "+", ("0", "0")),
        ("sem_linha", "±", ("0", "-40.00")),
        ("resultado", "=", ("-1000.00", "3310.00")),
    ]
    assert [(r["key"], r["sign"], money(r["values"])) for r in data["rows"]] == [
        (key, sign, amounts(*values)) for key, sign, values in expected
    ]
    assert data["unmapped"] == 1
    assert Decimal(row(data, "resultado")["total"]) == Decimal("2310.00")
    admin = row(data, "administrativas")
    assert [group["label"] for group in admin["groups"]] == ["003 Despesas administrativas"]
    assert [a["label"] for a in admin["groups"][0]["accounts"]] == [
        "3.01 Aluguel",
        "3.02 Telefonia",
    ]
    # o empréstimo tem linha própria: aparece à parte, com o sinal do dinheiro, e não soma
    outside = data["outside"]
    assert money(outside["values"]) == amounts("0", "-700.00")
    assert [a["label"] for a in outside["groups"][0]["accounts"]] == ["3.99 Empréstimo"]
    # cada linha bate com a soma dos grupos, e cada grupo com a das contas
    for item in [*data["rows"], outside]:
        for parent, children in [(item, item["groups"])] + [
            (group, group["accounts"]) for group in item["groups"]
        ]:
            if children:
                columns = zip(*(money(child["values"]) for child in children), strict=True)
                assert money(parent["values"]) == [sum(c, Decimal(0)) for c in columns]


def test_without_competence_the_payable_counts_in_the_month_it_was_issued(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], plan: dict[str, Any]
) -> None:
    created = payable(client, auth, world, today(), "200.00", categoryId=plan["rent"].id)
    month = created["issueDate"][:7]
    data = dre(client, auth, start=f"{month}-01", end=f"{month}-01")
    assert money(row(data, "administrativas")["values"]) == amounts("200.00")


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
    data = dre(client, auth)
    assert all(not item["groups"] for item in data["rows"])
    assert (data["outside"], data["unmapped"]) == (None, 0)


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

    def result(**params: Any) -> Decimal:
        return Decimal(row(dre(client, auth, **params), "resultado")["total"])

    assert result(project=world["project"].id) == Decimal("-600.00")
    assert result(project=plan["other_project"].id) == Decimal("-400.00")
    # empresa, unidade e centro de custo: o título é deles por inteiro
    assert result(company=world["company"].id) == Decimal("-1000.00")
    assert result(unit=999) == Decimal("0")


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
    labels = [line[0].value for line in sheet.iter_rows(min_row=3)]
    assert labels == [
        "(+) Receita operacional",
        "(−) Impostos",
        "(=) Receita líquida",
        "(−) Custos dos serviços",
        "(=) Lucro bruto",
        "(−) Despesas com pessoal",
        "(−) Despesas administrativas",
        "  003 Despesas administrativas",
        "      3.02 Telefonia",
        "(=) Resultado operacional",
        "(−) Despesas bancárias",
        "(+) Outras receitas",
        "(=) Resultado do período",
    ]
    gone = client.get("/reports/dre/export", params={**PERIOD, "company": 999}, headers=auth)
    assert (gone.status_code, gone.json()["detail"]) == (
        422,
        "O filtro de empresa não existe mais. Limpe e escolha de novo",
    )
