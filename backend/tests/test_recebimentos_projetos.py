# ruff: noqa: F811  (as fixtures importadas são reusadas pelo nome)
"""Recebimentos de projetos × ano (PF-76): o que entrou de cada projeto, mês a mês, no ano
(spec relatorios-e-analises)."""

import io
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from models.receivable import Receivable
from models.reference import Project
from services.payable import today
from tests.test_fluxo_de_caixa import auth, receivable, world  # noqa: F401

YEAR = today().year
MONTH = today().month - 1  # posição do mês de hoje na lista do ano


def received(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], amount: str, **kw: Any
) -> Any:
    title = receivable(client, auth, world, today(), amount, **kw)
    response = client.post(
        f"/receivables/{title['id']}/receipts",
        json={
            "receivedOn": today().isoformat(),
            "amount": amount,
            "bankAccountId": world["account"].id,
            "paymentMethodId": world["method"].id,
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text
    return response.json()


def receipts(client: TestClient, auth: dict[str, str], **params: Any) -> Any:
    response = client.get(
        "/reports/project-receipts", params={"year": YEAR, **params}, headers=auth
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_one_row_per_project_by_month_with_the_total(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    small = Project(code="999", title="Antiga")
    db_session.add(small)
    db_session.commit()
    received(client, auth, world, "1000.00")
    received(client, auth, world, "500.00")
    received(client, auth, world, "200.00", projectId=small.id)
    loose = received(client, auth, world, "50.00")
    db_session.query(Receivable).filter(Receivable.id == loose["id"]).update({"project_id": None})
    db_session.commit()
    # estornado: o dinheiro voltou, não conta
    undone = received(client, auth, world, "70.00")
    reverse = client.post(
        f"/receivables/{undone['id']}/receipts/{undone['payments'][0]['id']}/reverse",
        json={"reason": "Voltou"},
        headers=auth,
    )
    assert reverse.status_code == 200, reverse.text
    # em aberto: ainda não entrou
    receivable(client, auth, world, today(), "300.00")

    data = receipts(client, auth)

    assert len(data["months"]) == 12
    assert data["months"][0]["label"] == f"janeiro/{YEAR}"
    # o projeto 999 vem antes do 1804, e o título sem projeto vai para o fim
    assert [(row["label"], row["total"]) for row in data["rows"]] == [
        ("PRJ-999 · Antiga", "200.00"),
        ("PRJ-1804 · Pesquisa", "1500.00"),
        ("Sem projeto", "50.00"),
    ]
    assert data["rows"][1]["values"][MONTH] == "1500.00"
    assert data["total"]["values"][MONTH] == "1750.00"
    assert data["total"]["total"] == "1750.00"


def test_other_years_and_other_companies_are_left_out(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    received(client, auth, world, "1000.00")
    assert receipts(client, auth, year=YEAR - 1)["rows"] == []
    assert receipts(client, auth, company=999)["rows"] == []
    assert len(receipts(client, auth, company=world["company"].id)["rows"]) == 1


def test_a_year_out_of_range_and_no_login_are_refused(
    client: TestClient, auth: dict[str, str]
) -> None:
    response = client.get("/reports/project-receipts", params={"year": 1999}, headers=auth)
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Escolha um ano entre 2000 e 2100",
    )
    assert client.get("/reports/project-receipts", params={"year": YEAR}).status_code == 401


def test_export_has_the_months_and_the_total_row(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    received(client, auth, world, "1000.00")
    response = client.get(
        "/reports/project-receipts/export",
        params={"year": YEAR, "company": world["company"].id},
        headers=auth,
    )
    assert response.status_code == 200
    assert response.headers["content-disposition"] == (
        f'attachment; filename="recebimentos-de-projetos-{YEAR}.xlsx"'
    )
    sheet = load_workbook(io.BytesIO(response.content)).active
    assert sheet["A1"].value == f"Recebimentos de projetos · {YEAR} · filtros: empresa=PPlus"
    headers = [cell.value for cell in sheet[2]]
    assert (headers[0], headers[1], headers[-1], len(headers)) == (
        "Projeto",
        f"janeiro/{YEAR}",
        "Total",
        14,
    )
    assert [cell.value for cell in sheet[3]][0] == "PRJ-1804 · Pesquisa"
    total = [cell.value for cell in sheet[4]]
    assert (total[0], total[-1]) == ("Total", Decimal("1000.00"))
    gone = client.get(
        "/reports/project-receipts/export", params={"year": YEAR, "company": 999}, headers=auth
    )
    assert (gone.status_code, gone.json()["detail"]) == (
        422,
        "O filtro de empresa não existe mais. Limpe e escolha de novo",
    )
