from collections.abc import Callable
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.receivable import Receivable
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    PaymentMethod,
    Project,
)
from models.user import User
from services.auth import create_access_token
from services.payable import today

CNPJ = "11.222.333/0001-81"


@pytest.fixture
def world(db_session: Session) -> dict[str, Any]:
    company = Company(name="PPlus")
    other_company = Company(name="MC")
    db_session.add_all([company, other_company])
    db_session.flush()
    things = {
        "company": company,
        "other_company": other_company,
        "unit": BusinessUnit(company_id=company.id, name="Consumo SP"),
        "other_unit": BusinessUnit(company_id=other_company.id, name="Matriz"),
        "account": BankAccount(company_id=company.id, name="Itaú · PPlus"),
        "other_account": BankAccount(company_id=other_company.id, name="Bradesco · MC"),
        "cost_center": CostCenter(name="Comercial"),
        "category": ExpenseCategory(code="1.01", name="Receita de pesquisa", kind="receita"),
        "expense": ExpenseCategory(code="2.04", name="Material e gráfica"),
        "method": PaymentMethod(name="Pix"),
        "customer": Customer(nickname="Alfa", name="Alfa Pesquisas Ltda"),
        "other_customer": Customer(nickname="Beta", name="Beta Consultoria"),
        "project": Project(code="1804", title="Satisfação · varejo"),
        "other_project": Project(code="1790", title="Tracking de marca"),
        "closed": Project(code="1700", title="Encerrado", status="encerrado"),
    }
    db_session.add_all(list(things.values())[2:])
    db_session.commit()
    return things


@pytest.fixture
def auth(make_user: Callable[..., User]) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(make_user().id)}"}


def body(world: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    on = today()
    return {
        "customerId": world["customer"].id,
        "projectId": world["project"].id,
        "companyId": world["company"].id,
        "unitId": world["unit"].id,
        "costCenterId": world["cost_center"].id,
        "categoryId": world["category"].id,
        "description": "Pesquisa de satisfação · 1ª parcela",
        "issueDate": on.isoformat(),
        "dueDate": on.isoformat(),
        "amount": "1000.00",
        **overrides,
    }


def receipt(world: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    return {
        "receivedOn": today().isoformat(),
        "amount": "1000.00",
        "bankAccountId": world["account"].id,
        "paymentMethodId": world["method"].id,
        **overrides,
    }


def create(client: TestClient, auth: dict[str, str], world: dict[str, Any], **kw: Any) -> Any:
    response = client.post("/receivables", json=body(world, **kw), headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def days(count: int) -> str:
    return (today() + timedelta(days=count)).isoformat()


def listing(client: TestClient, auth: dict[str, str], **params: Any) -> Any:
    response = client.get("/receivables", params={"mode": "tudo", **params}, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


# ---- Acesso ----


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/receivables"),
        ("get", "/receivables/delinquency"),
        ("get", "/receivables/1"),
        ("post", "/receivables"),
        ("patch", "/receivables/1"),
        ("post", "/receivables/1/receipts"),
        ("post", "/receivables/1/receipts/1/reverse"),
        ("post", "/receivables/1/cancel"),
        ("delete", "/receivables/1"),
    ],
)
def test_every_route_asks_for_login(client: TestClient, method: str, path: str) -> None:
    assert getattr(client, method)(path).status_code == 401


def test_a_user_without_the_finance_role_is_refused(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    other = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.get("/receivables", headers=headers).status_code == 403


# ---- Lançar ----


def test_creating_keeps_the_gross_the_withholding_and_the_net(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(
        client,
        auth,
        world,
        amount="1000.00",
        withheld="115.00",
        contract="CT-2026-14",
        documentType="NF",
        documentNumber="5521",
        documentDate=today().isoformat(),
    )
    assert (Decimal(title["amount"]), Decimal(title["withheld"]), Decimal(title["net"])) == (
        Decimal("1000.00"),
        Decimal("115.00"),
        Decimal("885.00"),
    )
    assert Decimal(title["pending"]) == Decimal("885.00")
    assert (title["customer"], title["projectCode"], title["contract"]) == (
        "Alfa Pesquisas Ltda",
        "1804",
        "CT-2026-14",
    )
    assert title["competence"] == today().strftime("%Y-%m")
    assert title["events"][0]["text"].startswith("Lançada: Pesquisa de satisfação")


@pytest.mark.parametrize(
    ("overrides", "status", "detail"),
    [
        ({"projectId": None}, 422, "Informe o projeto da receita"),
        (
            {"withheld": "1000.00"},
            422,
            "Os abatimentos não podem ser iguais nem maiores que o valor",
        ),
        ({"documentType": "NF"}, 422, "Informe o número e a data de emissão da nota"),
        ({"customerId": 9999}, 422, "Cliente não encontrado ou inativo"),
        ({"projectId": 9999}, 422, "Projeto não encontrado"),
        ({"amount": "0"}, 422, None),
    ],
)
def test_denied_titles(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    overrides: dict[str, Any],
    status: int,
    detail: str | None,
) -> None:
    response = client.post("/receivables", json=body(world, **overrides), headers=auth)
    assert response.status_code == status
    if detail:
        assert response.json()["detail"] == detail


def test_a_closed_project_takes_no_new_revenue(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post(
        "/receivables", json=body(world, projectId=world["closed"].id), headers=auth
    )
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "Projeto fechado — peça a reabertura a um administrador",
    )


def test_receivables_use_a_revenue_account_and_payables_use_an_expense_account(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    wrong = client.post(
        "/receivables", json=body(world, categoryId=world["expense"].id), headers=auth
    )
    assert (wrong.status_code, wrong.json()["detail"]) == (
        422,
        "Contas a receber usam conta de receita",
    )
    on = today().isoformat()
    payable = client.post(
        "/payables",
        json={
            "issueDate": on,
            "dueDate": on,
            "amount": "10.00",
            "supplierId": None,
            "type": "provisao",
            "categoryId": world["category"].id,
            "companyId": world["company"].id,
            "unitId": world["unit"].id,
            "costCenterId": world["cost_center"].id,
            "paymentMethodId": world["method"].id,
            "description": "Teste",
        },
        headers=auth,
    )
    assert (payable.status_code, payable.json()["detail"]) == (
        422,
        "Contas a pagar usam conta de despesa",
    )


def test_the_unit_must_belong_to_the_company(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post(
        "/receivables", json=body(world, unitId=world["other_unit"].id), headers=auth
    )
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "A unidade não é dessa empresa",
    )


# ---- Situações e indicadores ----


def test_each_situation_and_indicator_counts_the_right_titles(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    late = create(client, auth, world, dueDate=days(-10), amount="100.00")
    create(client, auth, world, dueDate=days(0), amount="200.00")
    create(client, auth, world, dueDate=days(5), amount="300.00")
    paid = create(client, auth, world, dueDate=days(2), amount="400.00")
    partial = create(client, auth, world, dueDate=days(8), amount="500.00")
    canceled = create(client, auth, world, dueDate=days(8), amount="999.00")
    client.post(
        f"/receivables/{paid['id']}/receipts", json=receipt(world, amount="400.00"), headers=auth
    )
    client.post(
        f"/receivables/{partial['id']}/receipts", json=receipt(world, amount="200.00"), headers=auth
    )
    client.post(f"/receivables/{canceled['id']}/cancel", json={"reason": "Erro"}, headers=auth)

    body_ = listing(client, auth)
    ind = body_["indicators"]
    values = {k: (v["count"], Decimal(str(v["value"]))) for k, v in ind.items()}
    assert values == {
        "total": (5, Decimal("1500.00")),  # o cancelado não conta
        "recebidos": (1, Decimal("400.00")),  # só o título recebido por inteiro, como "Pagos"
        "pendentes": (4, Decimal("900.00")),  # 100 + 200 + 300 + 300
        "vencidos": (1, Decimal("100.00")),
        "hoje": (1, Decimal("200.00")),
        "avencer": (2, Decimal("600.00")),  # a vencer (300) e parcial (300)
        "cancelados": (1, Decimal("999.00")),
    }
    by_id = {
        r["id"]: r
        for r in client.get(
            "/receivables", params={"mode": "tudo", "pageSize": 50}, headers=auth
        ).json()["items"]
    }
    assert by_id[late["id"]]["situation"] == "vencido" and by_id[late["id"]]["daysLate"] == 10
    assert by_id[paid["id"]]["situation"] == "recebido" and by_id[paid["id"]]["daysLate"] is None
    assert by_id[partial["id"]]["situation"] == "parcial"
    assert canceled["id"] not in by_id  # o cancelado sai do total
    (gone,) = listing(client, auth, indicator="cancelados")["items"]
    assert (gone["id"], gone["situation"]) == (canceled["id"], "cancelado")


def test_clicking_overdue_opens_the_list_with_the_same_count_and_total(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, dueDate=days(-3), amount="100.00")
    create(client, auth, world, dueDate=days(-9), amount="250.00")
    create(client, auth, world, dueDate=days(4), amount="500.00")
    summary = listing(client, auth)["indicators"]["vencidos"]
    opened = listing(client, auth, indicator="vencidos")
    assert opened["total"] == summary["count"] == 2
    assert (
        Decimal(str(opened["filteredPending"]))
        == Decimal(str(summary["value"]))
        == Decimal("350.00")
    )


def test_a_partial_receipt_keeps_the_balance_and_shows_as_partial(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, dueDate=days(7), amount="1000.00")
    response = client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world, amount="400.00"), headers=auth
    )
    assert response.status_code == 200, response.text
    detail = response.json()
    assert (detail["situation"], Decimal(detail["pending"]), Decimal(detail["received"])) == (
        "parcial",
        Decimal("600.00"),
        Decimal("400.00"),
    )
    second = client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world, amount="600.00"), headers=auth
    ).json()
    assert (second["situation"], Decimal(second["pending"])) == ("recebido", Decimal("0.00"))
    assert second["canReceive"] is False


# ---- Filtros ----


def test_filters_combine_as_an_intersection_and_clearing_brings_everything_back(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    a = create(client, auth, world, dueDate=days(-5), description="Alfa vencida")
    create(
        client,
        auth,
        world,
        dueDate=days(-5),
        customerId=world["other_customer"].id,
        description="Beta vencida",
    )
    create(
        client,
        auth,
        world,
        dueDate=days(-5),
        projectId=world["other_project"].id,
        description="Outro projeto",
    )
    create(client, auth, world, dueDate=days(9), description="Alfa futura")

    everything = listing(client, auth)
    assert everything["total"] == 4
    narrowed = listing(
        client,
        auth,
        customer=world["customer"].id,
        project=world["project"].id,
        situation="vencido",
    )
    assert [r["id"] for r in narrowed["items"]] == [a["id"]]
    assert listing(client, auth)["total"] == 4


def test_each_filter_takes_several_options_or_inside_and_between_filters(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, dueDate=days(-5), description="Alfa vencida")
    create(
        client,
        auth,
        world,
        dueDate=days(-5),
        customerId=world["other_customer"].id,
        description="Beta vencida",
    )
    create(
        client,
        auth,
        world,
        dueDate=days(9),
        projectId=world["other_project"].id,
        description="Outro projeto",
    )
    alfa, beta = world["customer"].id, world["other_customer"].id

    assert listing(client, auth, customer=beta)["total"] == 1
    assert listing(client, auth, customer=f"{alfa},{beta}")["total"] == 3  # "ou" dentro do filtro
    assert listing(client, auth, situation="vencido,a_vencer")["total"] == 3
    assert listing(client, auth, situation="a_vencer,hoje")["total"] == 1
    both_projects = f"{world['project'].id},{world['other_project'].id}"
    assert listing(client, auth, project=both_projects)["total"] == 3
    # "e" entre filtros
    assert listing(client, auth, customer=f"{alfa},{beta}", situation="vencido")["total"] == 2
    assert listing(client, auth, customer=beta, project=world["project"].id)["total"] == 1


@pytest.mark.parametrize(
    "query",
    ["customer=abc", "project=1,x", "company=0", "situation=vencido,errada", "unit=99999999999"],
)
def test_filter_lists_with_bad_values_are_refused(
    client: TestClient, auth: dict[str, str], query: str
) -> None:
    response = client.get(f"/receivables?{query}", headers=auth)
    assert response.status_code == 422
    assert response.json()["detail"] == "Filtro inválido"


def test_export_names_every_chosen_option(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, dueDate=days(-5))
    ids = f"{world['customer'].id},{world['other_customer'].id}"
    first_line = (
        client.get(f"/receivables/export?customer={ids}&situation=vencido,parcial", headers=auth)
        .text.lstrip("﻿")
        .splitlines()[0]
    )
    assert "situação=Vencida ou Parcial" in first_line
    assert " ou " in first_line.split("cliente=")[1].split(",")[0]


def test_company_period_and_keyword_filters(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(
        client, auth, world, dueDate=days(0), description="Consultoria de teste", contract="CT-77"
    )
    create(client, auth, world, dueDate=days(0), description="Outra coisa")
    create(
        client,
        auth,
        world,
        dueDate=days(0),
        companyId=world["other_company"].id,
        unitId=world["other_unit"].id,
        description="Consultoria da MC",
    )
    by_company = listing(client, auth, company=world["company"].id, search="consultoria")
    assert [r["description"] for r in by_company["items"]] == ["Consultoria de teste"]
    assert listing(client, auth, search="CT-77")["total"] == 1  # procura também no contrato
    assert listing(client, auth, search="beta")["total"] == 0
    assert listing(client, auth, mode="dia")["total"] == 3
    assert listing(client, auth, mode="periodo", start=days(5), end=days(9))["total"] == 0


def test_the_period_can_use_competence_or_the_day_the_money_came_in(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, dueDate=days(40), competence="2020-01")
    client.post(
        f"/receivables/{title['id']}/receipts",
        json=receipt(world, amount="1000.00", receivedOn=today().isoformat()),
        headers=auth,
    )
    by_competence = listing(
        client, auth, mode="periodo", dateField="competencia", start="2020-01-01", end="2020-01-31"
    )
    assert by_competence["total"] == 1
    by_receipt = listing(
        client, auth, mode="periodo", dateField="recebimento", start=days(0), end=days(0)
    )
    assert by_receipt["total"] == 1
    assert (
        listing(client, auth, mode="periodo", dateField="recebimento", start=days(1), end=days(2))[
            "total"
        ]
        == 0
    )


def test_period_validations(client: TestClient, auth: dict[str, str]) -> None:
    missing = client.get("/receivables", params={"mode": "periodo"}, headers=auth)
    assert (missing.status_code, missing.json()["detail"]) == (
        422,
        "Escolha a data inicial e a data final",
    )
    backwards = client.get(
        "/receivables",
        params={"mode": "periodo", "start": days(5), "end": days(1)},
        headers=auth,
    )
    assert backwards.status_code == 422


# ---- Receber ----


def test_receiving_more_than_the_balance_is_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00", withheld="100.00")
    response = client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world, amount="950.00"), headers=auth
    )
    assert response.status_code == 409
    assert response.json()["detail"].startswith("O valor recebido passa do saldo pendente (R$")
    assert "900,00" in response.json()["detail"]  # o saldo é o líquido: 1000 − 100


@pytest.mark.parametrize(
    ("overrides", "status", "detail"),
    [
        (
            {"receivedOn": days(1)},
            422,
            "O recebimento é o dia em que o dinheiro entrou: não pode ser no futuro",
        ),
        ({"receivedOn": days(-3)}, 422, "Recebimento com data no passado precisa de observação"),
    ],
)
def test_receipt_dates(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    overrides: dict[str, Any],
    status: int,
    detail: str,
) -> None:
    title = create(client, auth, world)
    response = client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world, **overrides), headers=auth
    )
    assert (response.status_code, response.json()["detail"]) == (status, detail)
    ok = client.post(
        f"/receivables/{title['id']}/receipts",
        json=receipt(world, receivedOn=days(-3), note="Entrou no extrato de sexta"),
        headers=auth,
    )
    assert ok.status_code == 200


def test_the_bank_account_must_be_of_the_company_and_the_title_must_be_open(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world)
    wrong = client.post(
        f"/receivables/{title['id']}/receipts",
        json=receipt(world, bankAccountId=world["other_account"].id),
        headers=auth,
    )
    assert (wrong.status_code, wrong.json()["detail"]) == (
        422,
        "A conta bancária não é da empresa desse título",
    )
    client.post(f"/receivables/{title['id']}/cancel", json={"reason": "Erro"}, headers=auth)
    canceled = client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world), headers=auth
    )
    assert (canceled.status_code, canceled.json()["detail"]) == (409, "Título cancelado não recebe")


def test_the_same_bank_transaction_cannot_be_received_twice_until_it_is_reversed(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    a = create(client, auth, world, amount="100.00")
    b = create(client, auth, world, amount="100.00")
    first = client.post(
        f"/receivables/{a['id']}/receipts",
        json=receipt(world, amount="100.00", transactionId="TX-1"),
        headers=auth,
    ).json()
    again = client.post(
        f"/receivables/{b['id']}/receipts",
        json=receipt(world, amount="100.00", transactionId="TX-1"),
        headers=auth,
    )
    assert (again.status_code, again.json()["detail"]) == (
        409,
        "Esse ID de transação já foi usado em outro recebimento",
    )
    original = first["payments"][0]["id"]
    client.post(
        f"/receivables/{a['id']}/receipts/{original}/reverse",
        json={"reason": "Voltou"},
        headers=auth,
    )
    assert (
        client.post(
            f"/receivables/{b['id']}/receipts",
            json=receipt(world, amount="100.00", transactionId="TX-1"),
            headers=auth,
        ).status_code
        == 200
    )


def test_reversing_returns_the_balance_and_keeps_both_lines(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00")
    paid = client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world, amount="600.00"), headers=auth
    ).json()
    original = paid["payments"][0]["id"]
    undone = client.post(
        f"/receivables/{title['id']}/receipts/{original}/reverse",
        json={"reason": "Pix devolvido pelo banco"},
        headers=auth,
    ).json()
    assert Decimal(undone["pending"]) == Decimal("1000.00")
    assert [(p["kind"], p["reversed"]) for p in undone["payments"]] == [
        ("recebimento", True),
        ("estorno", False),
    ]
    assert undone["payments"][1]["note"] == "Pix devolvido pelo banco"
    again = client.post(
        f"/receivables/{title['id']}/receipts/{original}/reverse",
        json={"reason": "De novo"},
        headers=auth,
    )
    assert (again.status_code, again.json()["detail"]) == (409, "Esse recebimento já foi estornado")
    missing = client.post(
        f"/receivables/{title['id']}/receipts/9999/reverse", json={"reason": "x"}, headers=auth
    )
    assert missing.status_code == 404


# ---- Editar, cancelar e excluir ----


def test_editing_changes_value_due_date_and_description_and_records_it(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00")
    response = client.patch(
        f"/receivables/{title['id']}",
        json={
            "description": "Nova descrição",
            "amount": "1200.00",
            "withheld": "100.00",
            "dueDate": days(15),
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text
    detail = response.json()
    assert (detail["description"], Decimal(detail["net"]), detail["dueDate"]) == (
        "Nova descrição",
        Decimal("1100.00"),
        days(15),
    )
    assert detail["events"][0]["text"].startswith("Alterada: valor")


def test_the_value_cannot_drop_below_what_was_received(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00")
    client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world, amount="700.00"), headers=auth
    )
    response = client.patch(
        f"/receivables/{title['id']}",
        json={"description": "x", "amount": "500.00", "withheld": "0", "dueDate": days(3)},
        headers=auth,
    )
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "O novo valor é menor do que já foi recebido",
    )


def test_a_title_with_receipts_is_not_deleted_or_canceled(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00")
    client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world, amount="100.00"), headers=auth
    )
    deleted = client.delete(f"/receivables/{title['id']}", headers=auth)
    assert (deleted.status_code, deleted.json()["detail"]) == (
        409,
        "Esse título tem recebimentos — estorne antes de excluir ou cancele",
    )
    canceled = client.post(f"/receivables/{title['id']}/cancel", json={"reason": "x"}, headers=auth)
    assert (canceled.status_code, canceled.json()["detail"]) == (
        409,
        "Esse título tem recebimentos — estorne antes de cancelar",
    )


def test_deleting_is_logical_and_the_title_leaves_every_list(
    client: TestClient, db_session: Session, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world)
    assert client.delete(f"/receivables/{title['id']}", headers=auth).status_code == 204
    assert client.get(f"/receivables/{title['id']}", headers=auth).status_code == 404
    assert listing(client, auth)["total"] == 0
    row = db_session.get(Receivable, title["id"])
    assert row is not None and row.deletedAt is not None  # a auditoria ainda aponta para ele


def test_canceling_twice_and_unknown_titles(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world)
    assert (
        client.post(
            f"/receivables/{title['id']}/cancel", json={"reason": "x"}, headers=auth
        ).status_code
        == 200
    )
    again = client.post(f"/receivables/{title['id']}/cancel", json={"reason": "x"}, headers=auth)
    assert (again.status_code, again.json()["detail"]) == (409, "Esse título já está cancelado")
    assert client.get("/receivables/9999", headers=auth).status_code == 404
    edit = client.patch(
        f"/receivables/{title['id']}",
        json={"description": "x", "amount": "10", "withheld": "0", "dueDate": days(1)},
        headers=auth,
    )
    assert (edit.status_code, edit.json()["detail"]) == (
        409,
        "Título cancelado não pode ser alterado",
    )


# ---- Inadimplência ----


def test_delinquency_groups_overdue_titles_by_customer(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, dueDate=days(-30), amount="1000.00", description="Parcela 1")
    create(client, auth, world, dueDate=days(-5), amount="500.00", description="Parcela 2")
    create(
        client,
        auth,
        world,
        dueDate=days(-2),
        amount="300.00",
        customerId=world["other_customer"].id,
    )
    create(client, auth, world, dueDate=days(10), amount="999.00")  # a vencer: fora
    received = create(client, auth, world, dueDate=days(-8), amount="700.00")  # recebida: fora
    client.post(
        f"/receivables/{received['id']}/receipts",
        json=receipt(world, amount="700.00"),
        headers=auth,
    )

    rows = client.get("/receivables/delinquency", headers=auth).json()

    assert [
        (r["customer"], r["count"], r["maxDaysLate"], Decimal(str(r["total"]))) for r in rows
    ] == [
        ("Alfa Pesquisas Ltda", 2, 30, Decimal("1500.00")),
        ("Beta Consultoria", 1, 2, Decimal("300.00")),
    ]
    assert [(t["description"], t["daysLate"]) for t in rows[0]["titles"]] == [
        ("Parcela 1", 30),
        ("Parcela 2", 5),
    ]


def test_delinquency_splits_the_balance_into_late_bands_with_exact_limits(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    # 1 e 30 dias; 31 e 60; 61 e 90; 91
    for late, amount in ((1, "10.00"), (30, "20.00"), (31, "30.00"), (60, "40.00")):
        create(client, auth, world, dueDate=days(-late), amount=amount)
    for late, amount in ((61, "50.00"), (90, "60.00"), (91, "70.00")):
        create(client, auth, world, dueDate=days(-late), amount=amount)

    (row,) = client.get("/receivables/delinquency", headers=auth).json()

    assert [(b["id"], b["count"], Decimal(str(b["total"]))) for b in row["bands"]] == [
        ("1-30", 2, Decimal("30.00")),
        ("31-60", 2, Decimal("70.00")),
        ("61-90", 2, Decimal("110.00")),
        ("90+", 1, Decimal("70.00")),
    ]
    assert {t["daysLate"]: t["band"] for t in row["titles"]} == {
        91: "90+",
        90: "61-90",
        61: "61-90",
        60: "31-60",
        31: "31-60",
        30: "1-30",
        1: "1-30",
    }
    # as faixas somam o total do cliente
    assert sum(Decimal(str(b["total"])) for b in row["bands"]) == Decimal(str(row["total"]))


def test_empty_bands_still_come_back_in_order(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, dueDate=days(-3), amount="100.00")
    (row,) = client.get("/receivables/delinquency", headers=auth).json()
    assert [(b["id"], b["count"]) for b in row["bands"]] == [
        ("1-30", 1),
        ("31-60", 0),
        ("61-90", 0),
        ("90+", 0),
    ]


def test_a_partly_received_overdue_title_is_delinquent_only_for_the_balance(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, dueDate=days(-4), amount="1000.00")
    client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world, amount="250.00"), headers=auth
    )
    (row,) = client.get("/receivables/delinquency", headers=auth).json()
    assert Decimal(str(row["total"])) == Decimal("750.00")


def test_nothing_is_delinquent_on_the_due_date_itself(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, dueDate=days(0))
    assert client.get("/receivables/delinquency", headers=auth).json() == []


# ---- Cadastros: cliente e conta de receita ----


def test_a_customer_is_registered_like_a_supplier_and_never_with_a_cpf(
    client: TestClient, auth: dict[str, str]
) -> None:
    created = client.post(
        "/records/customers",
        json={"name": "Gama Ltda", "nickname": "Gama", "document": CNPJ, "email": "fin@gama.com"},
        headers=auth,
    )
    assert created.status_code == 201, created.text
    assert created.json()["document"] == "11222333000181"
    duplicate = client.post(
        "/records/customers",
        json={"name": "Outra", "nickname": "Outra", "document": CNPJ},
        headers=auth,
    )
    assert (duplicate.status_code, duplicate.json()["detail"]) == (
        409,
        "Já existe um cliente ativo com esse documento",
    )
    cpf = client.post(
        "/records/customers",
        json={"name": "Pessoa", "nickname": "Pessoa", "document": "123.456.789-09"},
        headers=auth,
    )
    assert (cpf.status_code, cpf.json()["detail"]) == (
        422,
        "Por enquanto, só CNPJ: CPF não é guardado aqui",
    )
    assert [c["name"] for c in client.get("/records/customers", headers=auth).json()] == [
        "Gama Ltda"
    ]


def test_a_customer_with_titles_is_deactivated_not_deleted(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world)
    customer_id = world["customer"].id
    listed = {c["id"]: c for c in client.get("/records/customers", headers=auth).json()}
    assert listed[customer_id]["inUse"] is True
    deleted = client.delete(f"/records/customers/{customer_id}", headers=auth)
    assert (deleted.status_code, deleted.json()["detail"]) == (
        409,
        "Esse cadastro tem lançamentos — inative em vez de excluir",
    )
    assert (
        client.post(
            f"/records/customers/{customer_id}/active", json={"active": False}, headers=auth
        ).status_code
        == 200
    )
    blocked = client.post("/receivables", json=body(world), headers=auth)
    assert (blocked.status_code, blocked.json()["detail"]) == (
        422,
        "Cliente não encontrado ou inativo",
    )


def test_the_chart_of_accounts_has_expense_and_revenue_accounts(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = client.post(
        "/records/categories",
        json={"name": "Receita de consultoria", "code": "1.02", "kind": "receita"},
        headers=auth,
    )
    assert (created.status_code, created.json()["kind"]) == (201, "receita")
    default = client.post(
        "/records/categories", json={"name": "Aluguel", "code": "3.01"}, headers=auth
    )
    assert default.json()["kind"] == "despesa"
    reference = client.get("/reference", headers=auth).json()
    kinds = {c["code"]: c["kind"] for c in reference["categories"]}
    assert kinds == {"1.01": "receita", "1.02": "receita", "2.04": "despesa", "3.01": "despesa"}
    assert [c["nickname"] for c in reference["customers"]] == ["Alfa", "Beta"]


def test_an_account_in_use_cannot_change_from_revenue_to_expense(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world)
    response = client.patch(
        f"/records/categories/{world['category'].id}",
        json={"name": "Receita de pesquisa", "code": "1.01", "kind": "despesa"},
        headers=auth,
    )
    assert response.status_code == 409
    assert (
        response.json()["detail"]
        == "Essa conta tem lançamentos — o tipo (despesa ou receita) não pode mudar"
    )
