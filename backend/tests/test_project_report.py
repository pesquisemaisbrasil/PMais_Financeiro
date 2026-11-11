# ruff: noqa: F811  (as fixtures importadas são reusadas pelo nome)
"""Relatório do projeto: lançado, pago, a pagar, a parte dele em cada conta e os documentos."""

from collections.abc import Callable
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient

from core.file_vault import MemoryFileStore
from models.user import User
from services.auth import create_access_token
from tests.test_payables import PDF, _attach, auth, create, payment, vault, world  # noqa: F401


def report(client: TestClient, auth: dict[str, str], code: str = "1804") -> dict[str, Any]:
    response = client.get(f"/reports/projects/{code}", headers=auth)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def launch(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    shares: dict[str, str],
    **extra: Any,
) -> Any:
    """Uma conta repartida entre projetos: `shares` é {código do projeto: valor}."""
    projects = {"1804": world["project"], "1790": world["other_project"]}
    allocations = [
        {"projectId": projects[code].id, "amount": value} for code, value in shares.items()
    ]
    total = sum((Decimal(value) for value in shares.values()), Decimal("0"))
    return create(client, auth, world, amount=str(total), allocations=allocations, **extra)


def money(value: Decimal | str) -> Decimal:
    return Decimal(str(value))


def test_the_report_sums_what_was_launched_paid_and_pending(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    first = launch(client, auth, world, {"1804": "1000.00"})
    launch(client, auth, world, {"1804": "500.00"}, description="Segunda conta")
    launch(client, auth, world, {"1790": "700.00"}, description="De outro projeto")
    client.post(
        f"/payables/{first['id']}/payments", json=payment(world, amount="400.00"), headers=auth
    )

    result = report(client, auth)
    assert result["project"]["code"] == "1804"
    assert (money(result["launched"]), money(result["paid"]), money(result["pending"])) == (
        Decimal("1500.00"),
        Decimal("400.00"),
        Decimal("1100.00"),
    )
    assert money(result["totalSpent"]) == money(result["launched"])
    # o orçamento é do Connect e ainda não chega: sem ele, também não há saldo
    assert (result["budget"], result["balance"]) == (None, None)
    # os totais são a soma exata das linhas, e só entram contas do projeto
    assert [line["description"] for line in result["lines"]] == [
        "Impressão de questionários",
        "Segunda conta",
    ]
    assert sum(money(line["amount"]) for line in result["lines"]) == money(result["launched"])
    assert sum(money(line["paid"]) for line in result["lines"]) == money(result["paid"])
    assert sum(money(line["pending"]) for line in result["lines"]) == money(result["pending"])
    # as duas vencem hoje e têm saldo: a situação é a da conta inteira, não a do projeto
    assert [line["situation"] for line in result["lines"]] == ["hoje", "hoje"]


def test_a_conta_split_between_projects_shows_only_each_projects_part(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = launch(client, auth, world, {"1804": "33.33", "1790": "66.67"})
    client.post(
        f"/payables/{created['id']}/payments", json=payment(world, amount="10.00"), headers=auth
    )
    first, second = report(client, auth, "1804"), report(client, auth, "1790")
    assert [money(first[key]) for key in ("launched", "paid", "pending")] == [
        Decimal("33.33"),
        Decimal("3.33"),
        Decimal("30.00"),
    ]
    assert [money(second[key]) for key in ("launched", "paid", "pending")] == [
        Decimal("66.67"),
        Decimal("6.67"),
        Decimal("60.00"),
    ]
    # a diferença de centavos fica com o último: os projetos juntos dão a conta inteira
    for key, whole in (("launched", "100.00"), ("paid", "10.00"), ("pending", "90.00")):
        assert money(first[key]) + money(second[key]) == Decimal(whole)


def test_canceled_replaced_and_deleted_accounts_are_not_spending(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    kept = launch(client, auth, world, {"1804": "100.00"}, description="Fica")
    canceled = launch(client, auth, world, {"1804": "200.00"}, description="Cancelada")
    deleted = launch(client, auth, world, {"1804": "300.00"}, description="Excluída")
    client.post(f"/payables/{canceled['id']}/cancel", json={"reason": "Errada"}, headers=auth)
    client.post("/payables/batch/delete", json={"ids": [deleted["id"]]}, headers=auth)
    result = report(client, auth)
    assert [line["id"] for line in result["lines"]] == [kept["id"]]
    assert money(result["launched"]) == Decimal("100.00")


def test_a_provision_is_shown_apart_and_is_not_spending(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    launch(client, auth, world, {"1804": "100.00"}, description="Conta real")
    provision = launch(
        client, auth, world, {"1804": "300.00"}, type="provisao", description="Folha"
    )
    result = report(client, auth)
    assert money(result["launched"]) == Decimal("100.00")
    assert money(result["provisioned"]) == Decimal("300.00")
    assert [line["id"] for line in result["provisions"]] == [provision["id"]]
    assert [line["description"] for line in result["lines"]] == ["Conta real"]
    # trocar a provisão pelo valor real tira ela de "provisionado" e põe a conta no lançado
    replaced = client.post(
        f"/payables/{provision['id']}/replace",
        json={"supplierId": world["supplier"].id, "amount": "320.00"},
        headers=auth,
    )
    assert replaced.status_code == 200, replaced.text
    after = report(client, auth)
    assert (money(after["provisioned"]), money(after["launched"])) == (
        Decimal("0.00"),
        Decimal("420.00"),
    )


def test_the_documents_of_every_launch_of_the_project_are_listed(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    mine = launch(client, auth, world, {"1804": "100.00"}, description="Gráfica")
    other = launch(client, auth, world, {"1790": "100.00"}, description="De outro projeto")
    _attach(client, auth, mine["id"], name="nota-grafica.pdf", kind="nota")
    removed = _attach(client, auth, mine["id"], content=PDF + b"2", name="velha.pdf").json()
    _attach(client, auth, other["id"], content=PDF + b"3", name="de-outro.pdf")
    stale = next(a for a in removed["attachments"] if a["name"] == "velha.pdf")
    client.post(
        f"/payables/{mine['id']}/attachments/{stale['id']}/remove",
        json={"reason": "Trocada"},
        headers=auth,
    )
    result = report(client, auth)
    (document,) = result["documents"]
    assert (document["name"], document["kind"], document["payableId"]) == (
        "nota-grafica.pdf",
        "nota",
        mine["id"],
    )
    assert (document["payableDescription"], document["uploadedBy"]) == ("Gráfica", "Ana")
    assert result["lines"][0]["documentCount"] == 1


def test_the_list_has_every_project_with_its_totals(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = launch(client, auth, world, {"1804": "250.00"})
    client.post(
        f"/payables/{created['id']}/payments", json=payment(world, amount="50.00"), headers=auth
    )
    launch(client, auth, world, {"1804": "100.00"}, type="provisao", description="Provisão")
    rows = {row["code"]: row for row in client.get("/reports/projects", headers=auth).json()}
    assert set(rows) == {"1804", "1790", "1700"}
    assert [money(rows["1804"][key]) for key in ("launched", "paid", "pending")] == [
        Decimal("250.00"),
        Decimal("50.00"),
        Decimal("200.00"),
    ]
    assert rows["1804"]["payableCount"] == 1  # a provisão não conta
    assert (money(rows["1790"]["launched"]), rows["1790"]["payableCount"]) == (Decimal("0"), 0)
    assert rows["1700"]["status"] == "encerrado"


def test_an_unknown_project_is_404(client: TestClient, auth: dict[str, str]) -> None:
    response = client.get("/reports/projects/9999", headers=auth)
    assert (response.status_code, response.json()["detail"]) == (404, "Projeto não encontrado")


@pytest.mark.parametrize("path", ["/reports/projects", "/reports/projects/1804"])
def test_a_role_without_finance_access_cannot_open_the_report(
    client: TestClient, make_user: Callable[..., User], path: str
) -> None:
    other = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.get(path, headers=headers).status_code == 403
