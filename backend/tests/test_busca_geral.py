# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
"""Busca em todo o sistema (pedido do Bruno, 18/11/2026; spec busca-geral): uma palavra acha contas,
notas, projetos e cadastros, separados por grupo, sem acento e em qualquer pedaço."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.payable import Payable
from models.reference import Customer, ExpenseCategory, Project
from models.user import User
from services.auth import create_access_token
from services.payable import today
from services.search import GROUP_LIMIT
from tests.test_payables import auth, body, create, world  # noqa: F401


@pytest.fixture
def customer(db_session: Session) -> Customer:
    found = Customer(
        nickname="Itaú",
        name="Banco Itaú de Teste S.A.",
        document="11222333000181",
        email="contato-sigiloso@exemplo.invalid",
    )
    db_session.add(found)
    db_session.commit()
    return found


def _search(client: TestClient, auth: dict[str, str], term: str) -> Any:
    return client.get("/search", params={"q": term}, headers=auth)


def _groups(response: Any) -> dict[str, Any]:
    assert response.status_code == 200, response.text
    return {group["key"]: group for group in response.json()["groups"]}


def _receivable(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    **fields: Any,
) -> Any:
    revenue = db_session.query(ExpenseCategory).filter_by(kind="receita").first()
    if revenue is None:
        revenue = ExpenseCategory(code="1.01", name="Receita de pesquisa", kind="receita")
        db_session.add(revenue)
        db_session.commit()
    on = today().isoformat()
    payload = {
        "projectId": world["project"].id,
        "companyId": world["company"].id,
        "unitId": world["unit"].id,
        "costCenterId": world["cost_center"].id,
        "categoryId": revenue.id,
        "issueDate": on,
        "dueDate": on,
        "amount": "5000.00",
        **fields,
    }
    response = client.post("/receivables", json=payload, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def test_one_word_finds_each_kind_in_its_own_group(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    customer: Customer,
) -> None:
    payable = create(client, auth, world, description="Tarifa do Itaú · novembro")
    receivable = _receivable(
        client, auth, world, db_session, customerId=customer.id, description="Pesquisa de marca"
    )
    world["project"].customer_id = customer.id
    db_session.commit()

    # Sem acento e sem diferença de maiúscula: "itau" acha "Itaú"
    groups = _groups(_search(client, auth, "itau"))
    assert list(groups) == ["payables", "receivables", "projects", "customers", "bankAccounts"]
    assert groups["payables"]["hits"][0] == {
        "title": "Tarifa do Itaú · novembro",
        "subtitle": f"Gráfica Ponto Certo · vence {today().strftime('%d/%m/%Y')} · R$ 1.000,00",
        "href": f"/contas-a-pagar?modo=tudo&conta={payable['id']}",
    }
    assert groups["receivables"]["hits"][0]["href"] == (
        f"/contas-a-receber?modo=tudo&conta={receivable['id']}"
    )
    assert groups["projects"]["hits"][0] == {
        "title": "PRJ-1804 · Pesquisa",
        "subtitle": "Itaú",
        "href": "/relatorios/projeto?codigo=1804",
    }
    assert groups["customers"]["hits"][0]["title"] == "Itaú"
    assert groups["customers"]["moreHref"] == "/cadastros?aba=customers&busca=itau"
    assert [hit["title"] for hit in groups["bankAccounts"]["hits"]] == ["Itaú · PPlus"]
    # Cada palavra em qualquer pedaço e em qualquer ordem
    assert "suppliers" in _groups(_search(client, auth, "certo pon"))


def test_notes_and_values_are_found_too(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    on = today().isoformat()
    note = create(
        client,
        auth,
        world,
        description="Impressão",
        documentType="NF",
        documentNumber="4521",
        documentDate=on,
    )
    groups = _groups(_search(client, auth, "4521"))
    assert groups["notes"]["hits"][0]["title"] == "NF 4521 · Gráfica Ponto Certo"
    assert groups["notes"]["hits"][0]["subtitle"].startswith("Conta a pagar · R$ 1.000,00")
    assert groups["payables"]["hits"][0]["href"].endswith(f"conta={note['id']}")
    # Um valor acha a conta com ele
    assert _groups(_search(client, auth, "1.000,00"))["payables"]["total"] == 1


def test_each_group_shows_the_first_ones_and_counts_all(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    for number in range(GROUP_LIMIT + 2):
        create(client, auth, world, description=f"Gráfica lote {number}")
    gone = create(client, auth, world, description="Gráfica apagada")
    db_session.get(Payable, gone["id"]).deletedAt = datetime.now(UTC)
    db_session.commit()
    payables = _groups(_search(client, auth, "grafica lote"))["payables"]
    assert (payables["total"], len(payables["hits"])) == (GROUP_LIMIT + 2, GROUP_LIMIT)
    assert payables["moreHref"] == "/contas-a-pagar?modo=tudo&busca=grafica%20lote"
    assert "payables" not in _groups(_search(client, auth, "apagada"))


def test_inactive_records_say_so_and_contacts_are_not_searched(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    customer: Customer,
) -> None:
    db_session.add(Project(code="1950", title="Hábitos", active=False))
    db_session.commit()
    project = _groups(_search(client, auth, "habitos"))["projects"]["hits"][0]
    assert project["subtitle"] == "Sem cliente · inativo"
    # O e-mail do contato do cliente é dado pessoal: a busca não olha
    assert _groups(_search(client, auth, "sigiloso")) == {}


def test_denied_searches(
    client: TestClient, auth: dict[str, str], make_user: Callable[..., User]
) -> None:
    assert client.get("/search", params={"q": "itau"}).status_code == 401
    other = make_user(role="supervisor", email="outro@e2e.invalid")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.get("/search", params={"q": "itau"}, headers=headers).status_code == 403
    short = _search(client, auth, " a ")
    assert (short.status_code, short.json()["detail"]) == (
        422,
        "Digite ao menos 2 letras para buscar",
    )
    long = _search(client, auth, "x" * 81)
    assert (long.status_code, long.json()["detail"]) == (422, "A busca aceita até 80 letras")


def test_registers_have_their_own_groups(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    """Plano de contas, centro de custo, unidade, empresa e conta bancária: cada um no seu grupo."""
    assert _groups(_search(client, auth, "MATERIAL grafica"))["categories"]["hits"][0] == {
        "title": "2.04 Material e gráfica",
        "subtitle": "Despesa",
        "href": "/cadastros?aba=categories&busca=Material%20e%20gr%C3%A1fica",
    }
    assert _groups(_search(client, auth, "campo"))["costCenters"]["hits"][0]["subtitle"] == (
        "Centro principal"
    )
    assert _groups(_search(client, auth, "consumo"))["units"]["hits"][0]["subtitle"] == "PPlus"
    pplus = _groups(_search(client, auth, "pplus"))
    assert [hit["title"] for hit in pplus["companies"]["hits"]] == ["PPlus"]
    assert [hit["title"] for hit in pplus["bankAccounts"]["hits"]] == ["Itaú · PPlus"]
    assert pplus["bankAccounts"]["hits"][0]["subtitle"] == "PPlus"
