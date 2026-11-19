# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
"""Cadastro de projeto como na tela antiga (pedido do Bruno, 18/11/2026, com os prints de
"Inclusão de Projetos" e "Alteração da Projeto"): código, nome, unidade, cliente e centro de custo
obrigatórios; na edição, Inativo e Excluir (spec projetos-financeiros, Ajustes)."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.reference import Customer, Project, RecordEvent
from models.user import User
from services.auth import create_access_token
from tests.test_payables import (  # noqa: F401
    _patch,
    auth,
    body,
    create,
    world,
)

INACTIVE = "Projeto PRJ-1804 está inativo: reative em Cadastros para lançar nele"
IN_USE = "Esse projeto tem lançamentos — inative em vez de excluir"


@pytest.fixture
def filled(world: dict[str, Any], db_session: Session) -> dict[str, Any]:
    """Projeto com tudo o que o cadastro pede."""
    customer = Customer(nickname="Cliente X", name="Cliente X Ltda")
    db_session.add(customer)
    db_session.commit()
    return {
        "code": "1900",
        "title": "Hábitos de consumo",
        "hasIncentive": False,
        "unitId": world["unit"].id,
        "customerId": customer.id,
        "costCenterId": world["cost_center"].id,
    }


def _same(filled: dict[str, Any], **fields: Any) -> dict[str, Any]:
    """O projeto 1804 do `world` com o cadastro completo."""
    return {**filled, "code": "1804", "title": "Pesquisa", **fields}


def test_a_project_needs_unit_customer_and_cost_center(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], filled: dict[str, Any]
) -> None:
    bare = {"code": "1900", "title": "Hábitos", "hasIncentive": False}
    missing = client.post("/projects", json=bare, headers=auth)
    assert (missing.status_code, missing.json()["detail"]) == (
        422,
        "Falta preencher: unidade, cliente, centro de custo",
    )
    no_center = client.post("/projects", json={**filled, "costCenterId": None}, headers=auth)
    assert no_center.json()["detail"] == "Falta preencher: centro de custo"
    assert client.post("/projects", json={**filled, "title": " "}, headers=auth).status_code == 422
    assert client.post("/projects", json={**filled, "code": ""}, headers=auth).status_code == 422
    # A edição pede o mesmo: o projeto antigo, sem os três, só salva quando completar
    edit = client.patch(
        f"/projects/{world['project'].id}", json={**bare, "code": "1804"}, headers=auth
    )
    assert (edit.status_code, edit.json()["detail"]) == (
        422,
        "Falta preencher: unidade, cliente, centro de custo",
    )
    created = client.post("/projects", json=filled, headers=auth)
    assert created.status_code == 201, created.text
    assert created.json()["active"] is True


def test_an_inactive_project_leaves_new_launches_and_keeps_the_old_ones(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    filled: dict[str, Any],
    db_session: Session,
) -> None:
    launched = create(client, auth, world)  # conta no PRJ-1804 antes de inativar
    project = world["project"]
    off = client.patch(f"/projects/{project.id}", json=_same(filled, active=False), headers=auth)
    assert off.status_code == 200, off.text
    assert off.json()["active"] is False
    listed = client.get("/reference", headers=auth).json()["projects"]
    assert next(p for p in listed if p["id"] == project.id)["active"] is False
    event = db_session.query(RecordEvent).filter_by(kind="projects").one()
    assert event.text.endswith("; inativo")

    # Conta nova nele, não
    refused = client.post("/payables", json=body(world), headers=auth)
    assert (refused.status_code, refused.json()["detail"]) == (409, INACTIVE)
    # A conta que já estava nele continua: muda o valor sem trocar de projeto
    kept = _patch(
        client,
        auth,
        launched,
        amount="1200.00",
        allocations=[{"projectId": project.id, "amount": "1200.00"}],
    )
    assert kept.status_code == 200, kept.text
    # Levar outra conta para ele, pela edição ou pelo lote, não
    other = create(
        client,
        auth,
        world,
        allocations=[{"projectId": world["other_project"].id, "amount": "1000.00"}],
    )
    moved = _patch(
        client, auth, other, allocations=[{"projectId": project.id, "amount": "1000.00"}]
    )
    assert (moved.status_code, moved.json()["detail"]) == (409, INACTIVE)
    batch = client.post(
        "/payables/batch/reclassify",
        json={"ids": [other["id"]], "projectId": project.id},
        headers=auth,
    )
    assert batch.status_code == 409
    assert batch.json()["detail"].endswith(INACTIVE)

    # Reativado, volta a receber conta
    on = client.patch(f"/projects/{project.id}", json=_same(filled, active=True), headers=auth)
    assert on.json()["active"] is True
    assert client.post("/payables", json=body(world), headers=auth).status_code == 201


def test_only_a_project_without_launches_is_deleted(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    filled: dict[str, Any],
    db_session: Session,
    make_user: Callable[..., User],
) -> None:
    fresh = client.post("/projects", json=filled, headers=auth).json()
    assert client.delete(f"/projects/{fresh['id']}").status_code == 401
    other = make_user(role="supervisor", email="outro@e2e.invalid")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.delete(f"/projects/{fresh['id']}", headers=headers).status_code == 403

    assert client.delete(f"/projects/{fresh['id']}", headers=auth).status_code == 204
    db_session.expire_all()
    assert db_session.query(Project).filter_by(id=fresh["id"]).first() is None
    texts = [e.text for e in db_session.query(RecordEvent).filter_by(record_id=fresh["id"])]
    assert "Excluiu PRJ-1900 · Hábitos de consumo" in texts

    create(client, auth, world)
    used = client.delete(f"/projects/{world['project'].id}", headers=auth)
    assert (used.status_code, used.json()["detail"]) == (409, IN_USE)
    assert client.delete("/projects/99999", headers=auth).status_code == 404
