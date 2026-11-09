from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.document import clean_cnpj, valid_cnpj
from models.payable import Payable
from models.reference import (
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Project,
    RecordEvent,
    Supplier,
)
from models.user import User
from services.auth import create_access_token

VALID_CNPJ = "11.222.333/0001-81"
OTHER_CNPJ = "11.444.777/0001-61"


@pytest.fixture
def auth(make_user: Callable[..., User]) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(make_user().id)}"}


def _supplier(**overrides: Any) -> dict[str, Any]:
    return {"name": "Gráfica Ponto Certo", "nickname": "Ponto Certo", **overrides}


def _post(client: TestClient, auth: dict[str, str], kind: str, **body: Any) -> Any:
    return client.post(f"/records/{kind}", json=body, headers=auth)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (VALID_CNPJ, True),
        ("11222333000181", True),
        ("11222333000182", False),
        ("11111111111111", False),
        ("123", False),
        # Exemplo da Receita para o CNPJ alfanumérico
        ("12.ABC.345/01DE-35", True),
        ("12.ABC.345/01DE-36", False),
    ],
)
def test_cnpj_check_digits(value: str, expected: bool) -> None:
    assert valid_cnpj(clean_cnpj(value)) is expected


def test_only_finance_reaches_the_records(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    assert client.get("/records/suppliers").status_code == 401
    other = make_user(role="supervisor", email="outro@e2e.invalid")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.get("/records/suppliers", headers=headers).status_code == 403
    assert client.post("/records/suppliers", json=_supplier(), headers=headers).status_code == 403
    body = {"hasIncentive": False}
    assert client.patch("/projects/1/incentive", json=body, headers=headers).status_code == 403


def test_unknown_kind_is_refused(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/records/users", headers=auth).status_code == 422


def test_create_and_edit_a_supplier_with_history(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    created = _post(
        client,
        auth,
        "suppliers",
        **_supplier(
            document=VALID_CNPJ,
            contactName="Marta",
            phone="+55 41 99999-0000",
            email="contato@exemplo.invalid",
            paymentTerms="30 dias",
        ),
    )
    assert created.status_code == 201
    record = created.json()
    assert record["document"] == "11222333000181"
    assert record["active"] is True
    assert record["inUse"] is False

    response = client.patch(
        f"/records/suppliers/{record['id']}",
        json=_supplier(nickname="Ponto", document=VALID_CNPJ),
        headers=auth,
    )
    assert response.status_code == 200
    assert response.json()["nickname"] == "Ponto"
    # O campo apagado no formulário fica vazio
    assert response.json()["contactName"] is None
    events = db_session.query(RecordEvent).order_by(RecordEvent.id).all()
    assert [event.text for event in events] == [
        "Cadastrou Gráfica Ponto Certo",
        "Editou Gráfica Ponto Certo",
    ]
    assert {event.kind for event in events} == {"suppliers"}


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"name": "  ", "nickname": "A"}, "Preencha o nome"),
        ({"name": "A", "nickname": " "}, "Preencha o apelido"),
        ({"name": "A", "nickname": "A", "document": "123"}, "CNPJ inválido. Confira os dígitos"),
        (
            {"name": "A", "nickname": "A", "document": "529.982.247-25"},
            "Por enquanto, só CNPJ: CPF não é guardado aqui",
        ),
        ({"name": "A", "nickname": "A", "email": "x@y"}, "E-mail inválido"),
        (
            {"name": "A", "nickname": "A", "phone": "41 9999"},
            "Telefone no formato +55 41 99999-0000",
        ),
    ],
)
def test_supplier_refusals(
    client: TestClient, auth: dict[str, str], body: dict[str, Any], message: str
) -> None:
    response = client.post("/records/suppliers", json=body, headers=auth)
    assert response.status_code == 422
    assert response.json()["detail"] == message


def test_document_is_unique_among_active_suppliers(
    client: TestClient, auth: dict[str, str]
) -> None:
    first = _post(client, auth, "suppliers", **_supplier(document=VALID_CNPJ)).json()
    twin = _post(client, auth, "suppliers", **_supplier(name="Outra", document=VALID_CNPJ))
    assert twin.status_code == 409
    assert twin.json()["detail"] == "Já existe um fornecedor ativo com esse documento"

    client.post(f"/records/suppliers/{first['id']}/active", json={"active": False}, headers=auth)
    second = _post(client, auth, "suppliers", **_supplier(name="Outra", document=VALID_CNPJ))
    assert second.status_code == 201
    # Reativar o primeiro criaria dois ativos com o mesmo documento
    back = client.post(
        f"/records/suppliers/{first['id']}/active", json={"active": True}, headers=auth
    )
    assert back.status_code == 409
    other = _post(client, auth, "suppliers", **_supplier(name="Terceira", document=OTHER_CNPJ))
    assert other.status_code == 201


def _company(db_session: Session, name: str = "PPlus") -> Company:
    company = Company(name=name)
    db_session.add(company)
    db_session.commit()
    return company


def test_names_and_codes_do_not_repeat(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    company = _company(db_session)
    other = _company(db_session, "MC")
    assert _post(client, auth, "costCenters", name="Campo").status_code == 201
    repeated = _post(client, auth, "costCenters", name="CAMPO")
    assert repeated.status_code == 409
    assert repeated.json()["detail"] == "Já existe centro de custo com esse nome"

    assert _post(client, auth, "categories", name="Gráfica", code="2.04").status_code == 201
    code = _post(client, auth, "categories", name="Outra", code="2.04")
    assert code.json()["detail"] == "Já existe uma conta com esse código"
    no_code = _post(client, auth, "categories", name="Outra")
    assert no_code.json()["detail"] == "Preencha o código da conta"

    assert _post(client, auth, "units", name="SP", companyId=company.id).status_code == 201
    assert _post(client, auth, "units", name="SP", companyId=company.id).status_code == 409
    # Outra empresa pode ter unidade com o mesmo nome
    assert _post(client, auth, "units", name="SP", companyId=other.id).status_code == 201
    no_company = _post(client, auth, "units", name="RJ")
    assert no_company.json()["detail"] == "Escolha a empresa"

    long_name = _post(client, auth, "paymentMethods", name="x" * 51)
    assert long_name.status_code == 422
    assert long_name.json()["detail"] == "O nome pode ter até 50 caracteres"


def _world(db_session: Session, user_id: int) -> dict[str, Any]:
    company = _company(db_session)
    unit = BusinessUnit(company_id=company.id, name="SP")
    center = CostCenter(name="Campo")
    category = ExpenseCategory(code="2.04", name="Gráfica")
    method = PaymentMethod(name="Pix")
    supplier = Supplier(nickname="Ponto", name="Ponto Certo")
    db_session.add_all([unit, center, category, method, supplier])
    db_session.flush()
    db_session.add(
        Payable(
            supplier_id=supplier.id,
            category_id=category.id,
            company_id=company.id,
            unit_id=unit.id,
            cost_center_id=center.id,
            payment_method_id=method.id,
            issueDate=date(2026, 11, 4),
            dueDate=date(2026, 11, 4),
            amount=Decimal("10.00"),
            description="Teste",
            created_by_user_id=user_id,
        )
    )
    db_session.commit()
    return {
        "suppliers": supplier,
        "categories": category,
        "companies": company,
        "units": unit,
        "costCenters": center,
        "paymentMethods": method,
    }


@pytest.mark.parametrize(
    "kind", ["suppliers", "categories", "companies", "units", "costCenters", "paymentMethods"]
)
def test_record_in_use_is_inactivated_and_not_deleted(
    client: TestClient,
    db_session: Session,
    make_user: Callable[..., User],
    kind: str,
) -> None:
    user = make_user()
    auth = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    record_id = _world(db_session, user.id)[kind].id

    listed = client.get(f"/records/{kind}", headers=auth).json()
    assert next(r for r in listed if r["id"] == record_id)["inUse"] is True
    response = client.delete(f"/records/{kind}/{record_id}", headers=auth)
    assert response.status_code == 409
    assert response.json()["detail"] == "Esse cadastro tem lançamentos — inative em vez de excluir"

    off = client.post(f"/records/{kind}/{record_id}/active", json={"active": False}, headers=auth)
    assert off.json()["active"] is False
    # Inativo some das listas de escolha e continua no lançamento
    reference = client.get("/reference", headers=auth).json()
    assert record_id not in [r["id"] for r in reference[kind]]
    assert client.get("/payables?mode=tudo", headers=auth).json()["total"] == 1
    on = client.post(f"/records/{kind}/{record_id}/active", json={"active": True}, headers=auth)
    assert on.json()["active"] is True


def test_company_with_units_is_kept(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    company = _company(db_session)
    _post(client, auth, "units", name="SP", companyId=company.id)
    response = client.delete(f"/records/companies/{company.id}", headers=auth)
    assert response.status_code == 409


def test_unit_with_payables_keeps_its_company(
    client: TestClient, db_session: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    auth = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    unit = _world(db_session, user.id)["units"]
    other = _company(db_session, "MC")
    response = client.patch(
        f"/records/units/{unit.id}", json={"name": "SP", "companyId": other.id}, headers=auth
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Esse cadastro tem lançamentos — a empresa não pode mudar"


def test_record_without_use_can_be_deleted_and_history_stays(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    record = _post(client, auth, "costCenters", name="Campo").json()
    assert client.delete(f"/records/costCenters/{record['id']}", headers=auth).status_code == 204
    assert client.get("/records/costCenters", headers=auth).json() == []
    assert client.delete(f"/records/costCenters/{record['id']}", headers=auth).status_code == 404
    last = db_session.query(RecordEvent).order_by(RecordEvent.id.desc()).first()
    assert last is not None
    assert last.text == "Excluiu Campo"


def test_project_incentive_is_marked_and_logged(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    project = Project(code="1804", title="Pesquisa")
    db_session.add(project)
    db_session.commit()
    url = f"/projects/{project.id}/incentive"

    missing = client.patch(url, json={"hasIncentive": True}, headers=auth)
    assert missing.status_code == 422
    assert missing.json()["detail"] == "Informe o prazo do incentivo em dias úteis (de 1 a 30)"
    too_long = client.patch(url, json={"hasIncentive": True, "incentiveDays": 31}, headers=auth)
    assert too_long.status_code == 422

    done = client.patch(
        url,
        json={"projectType": "Health", "hasIncentive": True, "incentiveDays": 10},
        headers=auth,
    )
    assert done.status_code == 200
    assert (done.json()["projectType"], done.json()["incentiveDays"]) == ("Health", 10)
    event = db_session.query(RecordEvent).filter_by(kind="projects").one()
    assert event.text == "PRJ-1804: sem tipo, sem incentivo → Health, incentivo em 10 dias úteis"

    off = client.patch(url, json={"hasIncentive": False, "incentiveDays": 10}, headers=auth)
    assert off.json()["incentiveDays"] is None
    assert (
        client.patch(
            "/projects/99999/incentive", json={"hasIncentive": False}, headers=auth
        ).status_code
        == 404
    )


# ---- Código gerado, apelido e CNPJ (fornecedor, cliente e empresa do Grupo) ----


@pytest.mark.parametrize("kind", ["suppliers", "customers", "companies"])
def test_the_code_is_generated_in_order_and_what_the_screen_sends_is_ignored(
    client: TestClient, auth: dict[str, str], kind: str
) -> None:
    first = _post(client, auth, kind, **_supplier(name="Primeiro", code="MEU-CODIGO")).json()
    second = _post(client, auth, kind, **_supplier(name="Segundo")).json()
    assert (first["code"], second["code"]) == ("0001", "0002")
    listed = {r["name"]: r["code"] for r in client.get(f"/records/{kind}", headers=auth).json()}
    assert (listed["Primeiro"], listed["Segundo"]) == ("0001", "0002")


def test_each_registry_counts_on_its_own(client: TestClient, auth: dict[str, str]) -> None:
    assert _post(client, auth, "suppliers", **_supplier()).json()["code"] == "0001"
    assert _post(client, auth, "customers", **_supplier(name="C")).json()["code"] == "0001"
    assert _post(client, auth, "companies", name="Empresa nova").json()["code"] == "0001"
    assert _post(client, auth, "suppliers", **_supplier(name="Outro")).json()["code"] == "0002"


def test_the_code_never_changes_and_is_never_reused_even_after_deleting_the_last_one(
    client: TestClient, auth: dict[str, str]
) -> None:
    _post(client, auth, "suppliers", **_supplier(name="A"))
    second = _post(client, auth, "suppliers", **_supplier(name="B")).json()
    edited = client.patch(
        f"/records/suppliers/{second['id']}", json=_supplier(name="B novo", code="X"), headers=auth
    ).json()
    assert edited["code"] == "0002"
    off = client.post(
        f"/records/suppliers/{second['id']}/active", json={"active": False}, headers=auth
    ).json()
    assert off["code"] == "0002"
    # excluir o último e cadastrar de novo: o número 0002 não volta
    assert client.delete(f"/records/suppliers/{second['id']}", headers=auth).status_code == 204
    assert _post(client, auth, "suppliers", **_supplier(name="C")).json()["code"] == "0003"


def test_a_hand_typed_code_from_before_never_collides_with_a_new_one(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    db_session.add(Supplier(nickname="Antigo", name="Antigo", code="0001"))
    db_session.commit()
    assert _post(client, auth, "suppliers", **_supplier()).json()["code"] == "0002"


def test_the_plan_of_accounts_still_has_the_code_the_person_picks(
    client: TestClient, auth: dict[str, str]
) -> None:
    created = _post(client, auth, "categories", name="Material de escritório", code="2.77")
    assert (created.status_code, created.json()["code"]) == (201, "2.77")


def test_a_group_company_keeps_nickname_and_cnpj_and_the_old_ones_still_work(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    db_session.add(Company(name="PPlus"))
    db_session.commit()
    old = next(
        r for r in client.get("/records/companies", headers=auth).json() if r["name"] == "PPlus"
    )
    assert (old["code"], old["nickname"], old["document"]) == (None, None, None)

    created = _post(
        client,
        auth,
        "companies",
        name="PESQUISE MAIS COMERCIO DE PESQUISAS LTDA",
        nickname="Pesquise+",
        document=VALID_CNPJ,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert (body["code"], body["nickname"], body["document"]) == (
        "0001",
        "Pesquise+",
        "11222333000181",
    )

    other = _post(client, auth, "companies", name="Outra empresa", document=OTHER_CNPJ)
    assert other.status_code == 201
    assert (other.json()["nickname"], other.json()["code"]) == (None, "0002")


def test_a_group_company_name_can_be_as_long_as_a_legal_name(
    client: TestClient, auth: dict[str, str]
) -> None:
    name = "N" * 200
    assert _post(client, auth, "companies", name=name).status_code == 201
    too_long = _post(client, auth, "companies", name="N" * 201)
    assert too_long.status_code == 422


def test_a_group_company_never_keeps_a_cpf_a_bad_cnpj_or_a_repeated_one(
    client: TestClient, auth: dict[str, str]
) -> None:
    cpf = _post(client, auth, "companies", name="Pessoa", document="123.456.789-09")
    assert (cpf.status_code, cpf.json()["detail"]) == (
        422,
        "Por enquanto, só CNPJ: CPF não é guardado aqui",
    )
    bad = _post(client, auth, "companies", name="Errada", document="11222333000182")
    assert (bad.status_code, bad.json()["detail"]) == (422, "CNPJ inválido. Confira os dígitos")

    first = _post(client, auth, "companies", name="Primeira", document=VALID_CNPJ).json()
    again = _post(client, auth, "companies", name="Segunda", document=VALID_CNPJ)
    assert (again.status_code, again.json()["detail"]) == (
        409,
        "Já existe uma empresa ativa com esse documento",
    )
    # inativa a primeira: a segunda passa, e a primeira não volta enquanto a segunda estiver ativa
    client.post(f"/records/companies/{first['id']}/active", json={"active": False}, headers=auth)
    assert _post(client, auth, "companies", name="Segunda", document=VALID_CNPJ).status_code == 201
    back = client.post(
        f"/records/companies/{first['id']}/active", json={"active": True}, headers=auth
    )
    assert (back.status_code, back.json()["detail"]) == (
        409,
        "Já existe uma empresa ativa com esse documento",
    )


# ---- Tipo de pessoa (física ou jurídica) ----


@pytest.mark.parametrize("kind", ["suppliers", "customers", "companies"])
def test_the_person_type_is_kept_and_only_a_legal_entity_has_a_cnpj(
    client: TestClient, auth: dict[str, str], kind: str
) -> None:
    legal = _post(
        client, auth, kind, **_supplier(name="Com CNPJ", personType="PJ", document=VALID_CNPJ)
    )
    assert legal.status_code == 201, legal.text
    assert (legal.json()["personType"], legal.json()["document"]) == ("PJ", "11222333000181")
    person = _post(client, auth, kind, **_supplier(name="Pessoa", personType="PF")).json()
    assert (person["personType"], person["document"]) == ("PF", None)
    unknown = _post(client, auth, kind, **_supplier(name="Sem tipo")).json()
    assert unknown["personType"] is None
    listed = {
        r["name"]: r["personType"] for r in client.get(f"/records/{kind}", headers=auth).json()
    }
    assert listed == {"Com CNPJ": "PJ", "Pessoa": "PF", "Sem tipo": None}


@pytest.mark.parametrize("document", [VALID_CNPJ, "123.456.789-09"])
def test_an_individual_never_has_a_document_not_even_a_cnpj_by_mistake(
    client: TestClient, auth: dict[str, str], document: str
) -> None:
    refused = _post(client, auth, "suppliers", **_supplier(personType="PF", document=document))
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "Pessoa física fica sem documento: o CPF não é guardado aqui",
    )
    assert client.get("/records/suppliers", headers=auth).json() == []


def test_the_person_type_can_change_and_an_individual_loses_the_document(
    client: TestClient, auth: dict[str, str]
) -> None:
    created = _post(
        client, auth, "suppliers", **_supplier(personType="PJ", document=VALID_CNPJ)
    ).json()
    url = f"/records/suppliers/{created['id']}"
    still_with_document = client.patch(
        url, json=_supplier(personType="PF", document=VALID_CNPJ), headers=auth
    )
    assert still_with_document.status_code == 422
    individual = client.patch(url, json=_supplier(personType="PF"), headers=auth).json()
    assert (individual["personType"], individual["document"]) == ("PF", None)
    back = client.patch(
        url, json=_supplier(personType="PJ", document=OTHER_CNPJ), headers=auth
    ).json()
    assert (back["personType"], back["document"]) == ("PJ", "11444777000161")


def test_an_unknown_person_type_is_refused(client: TestClient, auth: dict[str, str]) -> None:
    assert _post(client, auth, "suppliers", **_supplier(personType="XX")).status_code == 422
