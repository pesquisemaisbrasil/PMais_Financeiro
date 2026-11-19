# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
"""Pedidos dos testes com o financeiro de 16/11 (docs/transcricoes/, 2026-11-16): projeto
cadastrado no Financeiro com unidade e centro de custo padrão (A2, A22), projeto obrigatório (A3),
edição com o rateio (A4), busca sem acento e por valor (A10, A11), reclassificar com vencimento e
valor (A12), anexo em várias contas (A13) e o clipe da lista (A15)."""

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.file_vault import MemoryFileStore
from core.text import parse_search_amount
from models.payable import PayableAttachment
from models.reference import BusinessUnit, Company, CostCenter, Customer, Project, RecordEvent
from models.user import User
from services.auth import create_access_token
from services.payable import today
from tests.test_payables import (  # noqa: F401
    PDF,
    _attach,
    _patch,
    auth,
    body,
    create,
    payment,
    vault,
    world,
)

# ---- Projeto cadastrado no Financeiro (A2, A22) ----


def _project(**fields: Any) -> dict[str, Any]:
    return {"code": "1900", "title": "Hábitos de consumo", "hasIncentive": False, **fields}


@pytest.fixture
def filled(world: dict[str, Any], db_session: Session) -> dict[str, int]:
    """Unidade, cliente e centro de custo: obrigatórios no cadastro do projeto desde 18/11."""
    customer = Customer(nickname="Cliente X", name="Cliente X Ltda")
    db_session.add(customer)
    db_session.commit()
    return {
        "unitId": world["unit"].id,
        "customerId": customer.id,
        "costCenterId": world["cost_center"].id,
    }


def test_only_finance_creates_or_edits_a_project(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    assert client.post("/projects", json=_project()).status_code == 401
    other = make_user(role="supervisor", email="outro@e2e.invalid")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.post("/projects", json=_project(), headers=headers).status_code == 403
    assert client.patch("/projects/1", json=_project(), headers=headers).status_code == 403


def test_a_project_is_created_with_the_launch_defaults_and_logged(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    customer = Customer(nickname="Cliente X", name="Cliente X Ltda")
    db_session.add(customer)
    db_session.commit()
    created = client.post(
        "/projects",
        json=_project(
            customerId=customer.id,
            unitId=world["unit"].id,
            costCenterId=world["cost_center"].id,
            projectType="Consumo",
        ),
        headers=auth,
    )
    assert created.status_code == 201, created.text
    project = created.json()
    assert (project["code"], project["status"], project["unitId"], project["costCenterId"]) == (
        "1900",
        "em_andamento",
        world["unit"].id,
        world["cost_center"].id,
    )
    listed = client.get("/reference", headers=auth).json()["projects"]
    mine = next(p for p in listed if p["code"] == "1900")
    assert (mine["unitId"], mine["costCenterId"], mine["customerId"]) == (
        world["unit"].id,
        world["cost_center"].id,
        customer.id,
    )
    event = db_session.query(RecordEvent).filter_by(kind="projects").one()
    assert event.text == "Criou PRJ-1900 · Hábitos de consumo"


def test_a_project_number_does_not_repeat(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    repeated = client.post("/projects", json=_project(code="1804"), headers=auth)
    assert repeated.status_code == 409
    assert repeated.json()["detail"] == "Já existe o projeto PRJ-1804"
    bad = client.post("/projects", json=_project(code="18 04"), headers=auth)
    assert bad.status_code == 422


def test_a_project_refuses_an_inactive_unit_or_an_incentive_without_days(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    filled: dict[str, int],
) -> None:
    world["unit"].active = False
    db_session.commit()
    inactive = client.post("/projects", json=_project(**filled), headers=auth)
    assert inactive.status_code == 422
    assert inactive.json()["detail"] == "Unidade não encontrada ou inativa"
    world["unit"].active = True
    db_session.commit()
    missing_days = client.post(
        "/projects", json=_project(**filled, hasIncentive=True), headers=auth
    )
    assert (missing_days.status_code, missing_days.json()["detail"]) == (
        422,
        "Informe o prazo do incentivo em dias úteis (de 1 a 30)",
    )


def test_editing_a_project_changes_only_the_next_launches(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    filled: dict[str, int],
) -> None:
    launched = create(client, auth, world)
    other_center = CostCenter(name="Comercial")
    db_session.add(other_center)
    db_session.commit()
    project = world["project"]
    edited = client.patch(
        f"/projects/{project.id}",
        json=_project(
            code="1804", title="Pesquisa nova", **{**filled, "costCenterId": other_center.id}
        ),
        headers=auth,
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["costCenterId"] == other_center.id
    still = client.get(f"/payables/{launched['id']}", headers=auth).json()
    assert still["costCenterName"] == "Campo"
    event = db_session.query(RecordEvent).filter_by(kind="projects").one()
    assert event.text.startswith("PRJ-1804 · Pesquisa; cliente —; unidade —; centro —;")
    after = "PRJ-1804 · Pesquisa nova; cliente Cliente X; unidade Consumo SP; centro Comercial;"
    assert after in event.text
    unknown = client.patch("/projects/99999", json=_project(), headers=auth)
    assert unknown.status_code == 404
    clash = client.patch(f"/projects/{project.id}", json=_project(code="1790"), headers=auth)
    assert clash.status_code == 409


def test_a_unit_used_as_a_project_default_is_not_deleted(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    filled: dict[str, int],
) -> None:
    spare = BusinessUnit(company_id=world["company"].id, name="Sem conta ainda")
    db_session.add(spare)
    db_session.commit()
    created = client.post(
        "/projects", json=_project(**{**filled, "unitId": spare.id}), headers=auth
    )
    assert created.status_code == 201, created.text
    response = client.delete(f"/records/units/{spare.id}", headers=auth)
    assert response.status_code == 409


# ---- Projeto obrigatório (A3) ----


def test_every_payable_needs_a_project(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    for kind in ("real", "provisao"):
        response = client.post(
            "/payables", json=body(world, allocations=[], type=kind), headers=auth
        )
        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Escolha o projeto. Toda conta tem projeto, até a administrativa"
        )


# ---- Editar tudo, inclusive o rateio (A4) ----


def test_the_edit_changes_the_project_and_the_split(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    payable = create(client, auth, world)
    split = [
        {"projectId": world["project"].id, "amount": "700.00"},
        {"projectId": world["other_project"].id, "amount": "500.00"},
    ]
    response = _patch(client, auth, payable, amount="1200.00", allocations=split)
    assert response.status_code == 200, response.text
    edited = response.json()
    assert [(a["code"], a["amount"]) for a in edited["allocations"]] == [
        ("1804", "700.00"),
        ("1790", "500.00"),
    ]
    assert (
        "projeto PRJ-1804 → PRJ-1804 R$ 700,00 + PRJ-1790 R$ 500,00"
        in (edited["events"][0]["text"])
    )
    # Sem `allocations`, a divisão fica; mudar o valor de um rateio pede a divisão nova.
    refused = _patch(client, auth, edited, amount="1300.00")
    assert refused.status_code == 409
    assert refused.json()["detail"] == "Conta com rateio: refaça o rateio para mudar o valor"
    back = _patch(
        client,
        auth,
        edited,
        allocations=[{"projectId": world["other_project"].id, "amount": "1200.00"}],
    )
    assert [a["code"] for a in back.json()["allocations"]] == ["1790"]


def test_the_edited_split_must_add_up_and_avoid_closed_projects(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    payable = create(client, auth, world)
    short = [{"projectId": world["other_project"].id, "amount": "900.00"}]
    wrong = _patch(client, auth, payable, allocations=short)
    assert wrong.status_code == 422
    assert "somam R$ 900,00" in wrong.json()["detail"]
    closed = [{"projectId": world["closed"].id, "amount": "1000.00"}]
    refused = _patch(client, auth, payable, allocations=closed)
    assert refused.status_code == 409
    assert _patch(client, auth, payable, allocations=[]).status_code == 422


def test_the_edit_changes_the_unit_and_with_it_the_company(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    other_company = db_session.query(Company).filter(Company.name == "MC").one()
    same = BusinessUnit(company_id=world["company"].id, name="Health")
    elsewhere = BusinessUnit(company_id=other_company.id, name="MC Campo")
    db_session.add_all([same, elsewhere])
    db_session.commit()
    payable = create(client, auth, world)

    moved = _patch(client, auth, payable, unitId=same.id).json()
    assert (moved["unitName"], moved["companyName"]) == ("Health", "PPlus")
    assert "unidade Consumo SP → Health" in moved["events"][0]["text"]

    other = _patch(client, auth, moved, unitId=elsewhere.id).json()
    assert other["companyName"] == "MC"
    assert "empresa PPlus → MC" in other["events"][0]["text"]

    paid = create(client, auth, world)
    client.post(f"/payables/{paid['id']}/payments", json=payment(world), headers=auth)
    refused = _patch(client, auth, paid, unitId=elsewhere.id)
    assert refused.status_code == 409
    assert refused.json()["detail"].startswith("Conta com baixa não muda de empresa")


# ---- Reclassificar com vencimento e valor (A12) ----


def test_reclassify_also_changes_the_due_date_and_the_amount(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = [create(client, auth, world)["id"] for _ in range(2)]
    due = (today() + timedelta(days=10)).isoformat()
    response = client.post(
        "/payables/batch/reclassify",
        json={"ids": ids, "dueDate": due, "amount": "450.00"},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    for payable_id in ids:
        detail = client.get(f"/payables/{payable_id}", headers=auth).json()
        assert (detail["dueDate"], detail["amount"]) == (due, "450.00")
        assert [a["amount"] for a in detail["allocations"]] == ["450.00"]
        assert "valor R$ 1.000,00 → R$ 450,00" in detail["events"][0]["text"]


def test_reclassify_names_the_payable_that_stops_the_batch(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    fine = create(client, auth, world)
    split = [
        {"projectId": world["project"].id, "amount": "600.00"},
        {"projectId": world["other_project"].id, "amount": "400.00"},
    ]
    shared = create(client, auth, world, description="Aluguel rateado", allocations=split)
    response = client.post(
        "/payables/batch/reclassify",
        json={"ids": [fine["id"], shared["id"]], "amount": "300.00"},
        headers=auth,
    )
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Aluguel rateado: Conta com rateio: refaça o rateio para mudar o valor"
    )
    untouched = client.get(f"/payables/{fine['id']}", headers=auth).json()
    assert untouched["amount"] == "1000.00"
    # Mudar o projeto junto deixa a conta inteira nele, e aí o valor muda.
    both = client.post(
        "/payables/batch/reclassify",
        json={"ids": [shared["id"]], "amount": "300.00", "projectId": world["project"].id},
        headers=auth,
    )
    assert both.status_code == 200
    detail = client.get(f"/payables/{shared['id']}", headers=auth).json()
    assert [(a["code"], a["amount"]) for a in detail["allocations"]] == [("1804", "300.00")]


# ---- Anexo em várias contas (A13) e o clipe da lista (A15) ----


def _attach_batch(
    client: TestClient, auth: dict[str, str], ids: list[int], content: bytes = PDF
) -> Any:
    return client.post(
        "/payables/batch/attachments",
        data={"ids": [str(i) for i in ids], "kind": "comprovante"},
        files={"file": ("comprovante.pdf", content, "application/pdf")},
        headers=auth,
    )


def test_one_file_goes_to_every_selected_payable(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    vault: MemoryFileStore,
    db_session: Session,
) -> None:
    ids = [create(client, auth, world)["id"] for _ in range(3)]
    _attach(client, auth, ids[0], name="comprovante.pdf")
    response = _attach_batch(client, auth, ids)
    assert response.status_code == 201, response.text
    assert response.json() == {"count": 2, "skipped": 1}
    rows = db_session.query(PayableAttachment).filter_by(kind="comprovante").all()
    assert sorted(r.payable_id for r in rows) == ids[1:]
    listed = client.get("/payables?mode=tudo", headers=auth).json()["items"]
    assert {row["id"]: row["attachmentCount"] for row in listed} == {i: 1 for i in ids}


def test_the_batch_attachment_is_all_or_nothing(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    vault: MemoryFileStore,
    db_session: Session,
) -> None:
    payable = create(client, auth, world)
    missing = _attach_batch(client, auth, [payable["id"], 99999])
    assert missing.status_code == 404
    assert db_session.query(PayableAttachment).count() == 0
    assert not vault.objects  # nenhuma cópia ficou no cofre
    bad = _attach_batch(client, auth, [payable["id"]], content=b"MZ not a pdf")
    assert bad.status_code == 422
    assert client.post("/payables/batch/attachments").status_code == 401


def test_the_list_counts_only_documents_still_in_the_payable(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    payable = create(client, auth, world)
    assert client.get("/payables", headers=auth).json()["items"][0]["attachmentCount"] == 0
    detail = _attach(client, auth, payable["id"]).json()
    document = detail["attachments"][0]
    assert detail["attachmentCount"] == 1
    client.post(
        f"/payables/{payable['id']}/attachments/{document['id']}/remove",
        json={"reason": "Anexado errado"},
        headers=auth,
    )
    assert client.get("/payables", headers=auth).json()["items"][0]["attachmentCount"] == 0


# ---- Busca sem acento, por pedaço e por valor (A10, A11) ----


def test_the_search_ignores_accents_and_case_and_finds_pieces(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, description="Provisão de professor")
    create(client, auth, world, description="Aluguel de sala")

    def found(term: str) -> int:
        return client.get(f"/payables?mode=tudo&search={term}", headers=auth).json()["total"]

    assert found("grafica") == 2  # o fornecedor é "Gráfica Ponto Certo"
    assert found("GRÁFICA") == 2
    assert found("pro") == 1
    assert found("provisao") == 1
    assert found("sala aluguel") == 1  # cada palavra, em qualquer ordem
    assert found("prj-1804") == 2  # o projeto também entra
    assert found("material") == 2  # e a categoria
    assert found("inexistente") == 0


def test_the_search_finds_a_payable_by_its_value(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, amount="588.22", description="Hotel")
    create(client, auth, world, amount="1200.00", description="Gráfica")

    def found(term: str) -> list[str]:
        items = client.get(f"/payables?mode=tudo&search={term}", headers=auth).json()["items"]
        return [row["description"] for row in items]

    assert found("588,22") == ["Hotel"]
    assert found("588.22") == ["Hotel"]
    assert found("R$%201.200") == ["Gráfica"]
    assert found("1200") == ["Gráfica"]


@pytest.mark.parametrize(
    ("typed", "expected"),
    [
        ("588,22", "588.22"),
        ("R$ 1.200,50", "1200.50"),
        ("1.200", "1200.00"),  # ponto com três casas é milhar
        ("1.20", "1.20"),  # com duas, é centavo
        ("12,345", None),
        ("gráfica", None),
        ("", None),
    ],
)
def test_a_typed_value_is_read_as_brazilian_money(typed: str, expected: str | None) -> None:
    parsed = parse_search_amount(typed)
    assert (str(parsed) if parsed is not None else None) == expected


def test_project_defaults_come_back_in_the_reference_for_old_projects(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    old = db_session.query(Project).filter_by(code="1790").one()
    listed = client.get("/reference", headers=auth).json()["projects"]
    mine = next(p for p in listed if p["id"] == old.id)
    assert (mine["unitId"], mine["costCenterId"], mine["customerId"]) == (None, None, None)
    assert "projectRefId" not in mine  # a ligação com o Connect ficou para depois
