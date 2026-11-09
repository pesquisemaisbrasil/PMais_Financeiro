import base64
import io
import os
import zipfile
from collections.abc import Callable
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session

from core import config, file_vault
from core.file_vault import MemoryFileStore
from models.payable import Payable, PayableAttachment, PayableEvent, PayableItem, PayablePayment
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Project,
    Supplier,
)
from models.user import User
from services import attachments
from services.auth import create_access_token
from services.payable import period_range, today


@pytest.fixture
def world(db_session: Session) -> dict[str, Any]:
    company = Company(name="PPlus")
    other_company = Company(name="MC")
    db_session.add_all([company, other_company])
    db_session.flush()
    unit = BusinessUnit(company_id=company.id, name="Consumo SP")
    account = BankAccount(company_id=company.id, name="Itaú · PPlus")
    other_account = BankAccount(company_id=other_company.id, name="Bradesco · MC")
    cost_center = CostCenter(name="Campo")
    category = ExpenseCategory(code="2.04", name="Material e gráfica")
    method = PaymentMethod(name="Pix")
    supplier = Supplier(nickname="Ponto Certo", name="Gráfica Ponto Certo")
    project = Project(code="1804", title="Pesquisa")
    other_project = Project(code="1790", title="Outra")
    closed = Project(code="1700", title="Encerrado", status="encerrado")
    db_session.add_all(
        [
            unit,
            account,
            other_account,
            cost_center,
            category,
            method,
            supplier,
            project,
            other_project,
            closed,
        ]
    )
    db_session.commit()
    return {
        "company": company,
        "unit": unit,
        "account": account,
        "other_account": other_account,
        "cost_center": cost_center,
        "category": category,
        "method": method,
        "supplier": supplier,
        "project": project,
        "other_project": other_project,
        "closed": closed,
    }


@pytest.fixture
def auth(make_user: Callable[..., User]) -> dict[str, str]:
    user = make_user()
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def body(world: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    on = today()
    return {
        "issueDate": on.isoformat(),
        "dueDate": on.isoformat(),
        "amount": "1000.00",
        "supplierId": world["supplier"].id,
        "categoryId": world["category"].id,
        "companyId": world["company"].id,
        "unitId": world["unit"].id,
        "costCenterId": world["cost_center"].id,
        "paymentMethodId": world["method"].id,
        "description": "Impressão de questionários",
        **overrides,
    }


def payment(world: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    return {
        "paidOn": today().isoformat(),
        "amount": "1000.00",
        "bankAccountId": world["account"].id,
        "paymentMethodId": world["method"].id,
        **overrides,
    }


def create(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], **overrides: Any
) -> Any:
    response = client.post("/payables", json=body(world, **overrides), headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


# ---- Acesso ----


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/home"),
        ("get", "/reference"),
        ("get", "/payables"),
        ("get", "/payables/1"),
        ("post", "/payables"),
        ("post", "/payables/batch/payments"),
        ("post", "/payables/batch/delete"),
        ("post", "/payables/import"),
        ("post", "/payables/import/preview"),
        ("post", "/payables/batch/reclassify"),
        ("post", "/payables/batch/duplicate"),
        ("get", "/payables/export"),
        ("get", "/payables/print"),
        ("post", "/payables/1/replace"),
        ("patch", "/payables/1"),
        ("post", "/payables/1/cancel"),
        ("post", "/payables/1/payments"),
        ("post", "/payables/1/payments/1/reverse"),
        ("post", "/payables/1/attachments"),
        ("get", "/payables/1/attachments/1/download"),
        ("patch", "/payables/1/attachments/1"),
        ("post", "/payables/1/attachments/1/remove"),
        ("get", "/payables/1/series"),
    ],
)
def test_every_route_requires_a_session(client: TestClient, method: str, path: str) -> None:
    assert getattr(client, method)(path).status_code == 401


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/home"),
        ("get", "/reference"),
        ("get", "/payables"),
        ("get", "/payables/1"),
        ("post", "/payables"),
        ("post", "/payables/batch/payments"),
        ("post", "/payables/batch/delete"),
        ("post", "/payables/import"),
        ("post", "/payables/import/preview"),
        ("post", "/payables/batch/reclassify"),
        ("post", "/payables/batch/duplicate"),
        ("get", "/payables/export"),
        ("get", "/payables/print"),
        ("post", "/payables/1/replace"),
        ("patch", "/payables/1"),
        ("post", "/payables/1/cancel"),
        ("post", "/payables/1/payments"),
        ("post", "/payables/1/payments/1/reverse"),
        ("post", "/payables/1/attachments"),
        ("get", "/payables/1/attachments/1/download"),
        ("patch", "/payables/1/attachments/1"),
        ("post", "/payables/1/attachments/1/remove"),
        ("get", "/payables/1/series"),
    ],
)
def test_role_without_finance_access_is_refused(
    client: TestClient, make_user: Callable[..., User], method: str, path: str
) -> None:
    user = make_user(email="outro@pesquisemais.com.br", role="auditor")
    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    kwargs: dict[str, Any] = {} if method == "get" else {"json": {}}
    assert getattr(client, method)(path, headers=headers, **kwargs).status_code == 403


def test_inactive_user_is_refused(client: TestClient, make_user: Callable[..., User]) -> None:
    user = make_user(email="saiu@pesquisemais.com.br", status="inactive")
    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    assert client.get("/payables", headers=headers).status_code == 401


# ---- Lançamento ----


def test_create_records_who_and_what(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    created = create(client, auth, world)
    assert created["situation"] == "hoje"
    assert created["pending"] == "1000.00"
    assert created["payee"] == "Gráfica Ponto Certo"
    event = db_session.query(PayableEvent).one()
    assert "R$ 1.000,00" in event.text


def test_nf_needs_number_and_date(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post("/payables", json=body(world, documentType="NF"), headers=auth)
    assert response.status_code == 422
    assert "emissão da nota" in response.json()["detail"]


def test_unit_must_belong_to_company(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    other = db_session.query(Company).filter(Company.name == "MC").one()
    response = client.post("/payables", json=body(world, companyId=other.id), headers=auth)
    assert response.status_code == 422


def test_allocation_must_match_the_total(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    allocations = [{"projectId": world["project"].id, "amount": "990.00"}]
    response = client.post("/payables", json=body(world, allocations=allocations), headers=auth)
    assert response.status_code == 422
    assert "somam R$ 990,00" in response.json()["detail"]


def test_allocation_between_two_projects(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    allocations = [
        {"projectId": world["project"].id, "amount": "600.00"},
        {"projectId": world["other_project"].id, "amount": "400.00"},
    ]
    created = create(client, auth, world, allocations=allocations)
    assert [a["code"] for a in created["allocations"]] == ["1804", "1790"]


def test_closed_project_refuses_new_payable(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    allocations = [{"projectId": world["closed"].id, "amount": "1000.00"}]
    response = client.post("/payables", json=body(world, allocations=allocations), headers=auth)
    assert response.status_code == 409
    assert "Projeto fechado" in response.json()["detail"]


@pytest.mark.parametrize("amount", ["0", "-1", "10.999"])
def test_invalid_amount_is_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], amount: str
) -> None:
    response = client.post("/payables", json=body(world, amount=amount), headers=auth)
    assert response.status_code == 422


def test_edit_keeps_before_and_after(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    new_due = today() + timedelta(days=5)
    response = client.patch(
        f"/payables/{created['id']}",
        json={"description": "Novo", "amount": "1200.00", "dueDate": new_due.isoformat()},
        headers=auth,
    )
    assert response.status_code == 200
    text = response.json()["events"][0]["text"]
    assert "R$ 1.000,00 → R$ 1.200,00" in text
    assert "descrição" in text and "vencimento" in text


def _patch(client: TestClient, auth: dict[str, str], payable: dict[str, Any], **fields: Any) -> Any:
    """Edita mantendo descrição, valor e vencimento da conta, e mudando só o que for passado."""
    body = {
        "description": payable["description"],
        "amount": payable["amount"],
        "dueDate": payable["dueDate"],
        **fields,
    }
    return client.patch(f"/payables/{payable['id']}", json=body, headers=auth)


@pytest.fixture
def other_registers(world: dict[str, Any], db_session: Session) -> dict[str, Any]:
    extra = {
        "supplier": Supplier(nickname="Papel Forte", name="Papel Forte Ltda"),
        "category": ExpenseCategory(code="2.05", name="Transporte"),
        "revenue": ExpenseCategory(code="1.01", name="Receita", kind="receita"),
        "center": CostCenter(name="Tecnologia"),
        "method": PaymentMethod(name="Boleto"),
        "inactive": CostCenter(name="Antigo", active=False),
    }
    db_session.add_all(extra.values())
    db_session.commit()
    return extra


def test_edit_changes_the_classification_document_and_extras_with_one_audit_line(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    other_registers: dict[str, Any],
) -> None:
    created = create(client, auth, world)
    response = _patch(
        client,
        auth,
        created,
        supplierId=other_registers["supplier"].id,
        categoryId=other_registers["category"].id,
        costCenterId=other_registers["center"].id,
        paymentMethodId=other_registers["method"].id,
        documentType="NF",
        documentNumber="123",
        documentDate="2026-11-01",
        barcode="23793381286000000000000000000000000000000000",
        competence="2026-12",
        docsReceivedOn="2026-11-02",
        notes="Combinado por telefone",
        isTransfer=True,
    )
    assert response.status_code == 200, response.text
    detail = response.json()
    assert detail["payee"] == "Papel Forte Ltda"
    assert detail["supplierId"] == other_registers["supplier"].id
    assert (detail["categoryName"], detail["costCenterName"], detail["paymentMethodName"]) == (
        "Transporte",
        "Tecnologia",
        "Boleto",
    )
    assert (detail["documentType"], detail["documentNumber"], detail["documentDate"]) == (
        "NF",
        "123",
        "2026-11-01",
    )
    assert (detail["competence"], detail["docsReceivedOn"], detail["notes"]) == (
        "2026-12",
        "2026-11-02",
        "Combinado por telefone",
    )
    assert detail["isTransfer"] is True
    assert detail["barcode"] == "23793381286000000000000000000000000000000000"
    # uma só linha de auditoria, com o antes e o depois
    text = detail["events"][0]["text"]
    assert text.startswith("Alterada: ")
    for piece in (
        "fornecedor Gráfica Ponto Certo → Papel Forte Ltda",
        "categoria Material e gráfica → Transporte",
        "centro Campo → Tecnologia",
        "forma Pix → Boleto",
        "documento Sem documento → NF",
        "competência",
        "observações alteradas",
        "marcada como transferência",
    ):
        assert piece in text
    assert len(detail["events"]) == 2  # a criação e esta alteração


def test_edit_sends_only_what_changes_and_leaves_the_rest(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, notes="Obs", barcode="123")
    detail = _patch(client, auth, created, description="Só a descrição").json()
    assert detail["description"] == "Só a descrição"
    assert (detail["notes"], detail["barcode"], detail["categoryName"]) == (
        "Obs",
        "123",
        "Material e gráfica",
    )
    # mandar o mesmo valor não gera linha de auditoria
    same = _patch(client, auth, detail, categoryId=world["category"].id)
    assert same.status_code == 200
    assert len(same.json()["events"]) == len(detail["events"])


def test_edit_can_clear_text_and_dates_with_null(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(
        client,
        auth,
        world,
        notes="Obs",
        barcode="123",
        documentNumber="9",
        docsReceivedOn="2026-11-02",
    )
    detail = _patch(
        client, auth, created, notes=None, barcode=None, documentNumber=None, docsReceivedOn=None
    ).json()
    assert (detail["notes"], detail["barcode"], detail["documentNumber"]) == (None, None, None)
    assert detail["docsReceivedOn"] is None


def test_edit_refuses_what_the_launch_would_refuse(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    other_registers: dict[str, Any],
) -> None:
    created = create(client, auth, world)
    nf = _patch(client, auth, created, documentType="NF")
    assert (nf.status_code, nf.json()["detail"]) == (
        422,
        "Informe o número e a data de emissão da nota",
    )
    revenue = _patch(client, auth, created, categoryId=other_registers["revenue"].id)
    assert revenue.json()["detail"] == "Contas a pagar usam conta de despesa"
    inactive = _patch(client, auth, created, costCenterId=other_registers["inactive"].id)
    assert inactive.json()["detail"] == "Centro de custo não encontrado ou inativo"
    no_supplier = _patch(client, auth, created, supplierId=None)
    assert no_supplier.json()["detail"] == "Escolha o fornecedor"
    assert _patch(client, auth, created, competence="2026-13").status_code == 422
    # nada disso gravou: a conta continua como estava
    again = client.get(f"/payables/{created['id']}", headers=auth).json()
    assert (again["documentType"], again["categoryName"], again["costCenterName"]) == (
        "Sem documento",
        "Material e gráfica",
        "Campo",
    )


def test_edit_does_not_change_the_classification_of_a_closed_project(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    other_registers: dict[str, Any],
    db_session: Session,
) -> None:
    allocations = [{"projectId": world["project"].id, "amount": "1000.00"}]
    created = create(client, auth, world, allocations=allocations)
    world["project"].status = "encerrado"
    db_session.commit()
    refused = _patch(client, auth, created, categoryId=other_registers["category"].id)
    assert refused.status_code == 409
    assert "Projeto fechado" in refused.json()["detail"]
    # a forma de pagamento, que não mexe na carteira do projeto, continua livre
    assert (
        _patch(client, auth, created, paymentMethodId=other_registers["method"].id).status_code
        == 200
    )


def test_a_provision_gets_a_supplier_and_loses_the_provision_name(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    other_registers: dict[str, Any],
) -> None:
    provision = create(client, auth, world, type="provisao", supplierId=None)
    assert provision["payee"] == "Provisão"
    detail = _patch(client, auth, provision, supplierId=other_registers["supplier"].id).json()
    assert detail["payee"] == "Papel Forte Ltda"
    # provisão pode ficar sem fornecedor; a conta real não
    assert _patch(client, auth, detail, supplierId=None).status_code == 200


def test_the_supplier_of_a_payable_with_items_is_not_changed_here(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    other_registers: dict[str, Any],
    db_session: Session,
) -> None:
    created = create(client, auth, world)
    db_session.add(
        PayableItem(
            payable_id=created["id"], name="Pessoa", documentType="NF", amount=Decimal("1000")
        )
    )
    db_session.commit()
    response = _patch(
        client,
        auth,
        created,
        supplierId=other_registers["supplier"].id,
        description="Mesma",
    )
    # o valor não mudou, então só o fornecedor é recusado
    assert response.status_code == 409
    assert response.json()["detail"] == "Lançamento com itens: o fornecedor não muda aqui"


def test_edit_cannot_go_below_paid(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    client.post(
        f"/payables/{created['id']}/payments", json=payment(world, amount="600.00"), headers=auth
    )
    response = client.patch(
        f"/payables/{created['id']}",
        json={
            "description": "Novo",
            "amount": "500.00",
            "dueDate": today().isoformat(),
        },
        headers=auth,
    )
    assert response.status_code == 409


# ---- Baixa ----


def test_partial_then_full_payment(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, dueDate=(today() + timedelta(days=9)).isoformat())
    path = f"/payables/{created['id']}/payments"
    partial = client.post(path, json=payment(world, amount="400.00"), headers=auth).json()
    assert partial["situation"] == "parcial"
    assert partial["pending"] == "600.00"
    full = client.post(path, json=payment(world, amount="600.00"), headers=auth).json()
    assert full["situation"] == "pago"
    assert full["pending"] == "0.00"


def test_payment_cannot_exceed_pending(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    path = f"/payables/{created['id']}/payments"
    response = client.post(path, json=payment(world, amount="1000.01"), headers=auth)
    assert response.status_code == 409
    assert response.json()["detail"] == "O valor passa do saldo pendente (R$ 1.000,00)"


def test_surcharge_and_discount_change_what_is_due(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    path = f"/payables/{created['id']}/payments"
    paid = client.post(
        path, json=payment(world, amount="1050.00", surcharge="50.00"), headers=auth
    ).json()
    assert paid["situation"] == "pago"
    assert paid["pending"] == "0.00"

    other = create(client, auth, world)
    paid_other = client.post(
        f"/payables/{other['id']}/payments",
        json=payment(world, amount="900.00", discount="100.00"),
        headers=auth,
    ).json()
    assert paid_other["situation"] == "pago"


def test_discount_lowers_the_limit_of_the_payment(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    response = client.post(
        f"/payables/{created['id']}/payments",
        json=payment(world, amount="1000.00", discount="100.00"),
        headers=auth,
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "O valor passa do saldo pendente (R$ 900,00)"


def test_edit_counts_discount_and_surcharge_already_paid(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    today_iso = today().isoformat()
    edit = {"description": "Novo", "dueDate": today_iso}
    with_discount = create(client, auth, world)
    client.post(
        f"/payables/{with_discount['id']}/payments",
        json=payment(world, amount="900.00", discount="100.00"),
        headers=auth,
    )
    refused = client.patch(
        f"/payables/{with_discount['id']}", json={**edit, "amount": "950.00"}, headers=auth
    )
    assert refused.status_code == 409

    with_surcharge = create(client, auth, world)
    client.post(
        f"/payables/{with_surcharge['id']}/payments",
        json=payment(world, amount="1050.00", surcharge="50.00"),
        headers=auth,
    )
    accepted = client.patch(
        f"/payables/{with_surcharge['id']}", json={**edit, "amount": "1020.00"}, headers=auth
    )
    assert accepted.status_code == 200
    assert accepted.json()["pending"] == "20.00"


def test_edit_refused_when_the_payable_has_items(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    created = create(client, auth, world)
    db_session.add(
        PayableItem(
            payable_id=created["id"], name="Pessoa", documentType="NF", amount=Decimal("1000")
        )
    )
    db_session.commit()
    response = client.patch(
        f"/payables/{created['id']}",
        json={"description": "Novo", "amount": "1200.00", "dueDate": today().isoformat()},
        headers=auth,
    )
    assert response.status_code == 409


def test_same_transaction_id_does_not_pay_twice(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    first = create(client, auth, world)
    second = create(client, auth, world)
    body_with_id = payment(world, amount="400.00", transactionId="E0001")
    paid = client.post(f"/payables/{first['id']}/payments", json=body_with_id, headers=auth).json()
    again = client.post(f"/payables/{first['id']}/payments", json=body_with_id, headers=auth)
    assert again.status_code == 409
    other = client.post(f"/payables/{second['id']}/payments", json=body_with_id, headers=auth)
    assert other.status_code == 409
    client.post(
        f"/payables/{first['id']}/payments/{paid['payments'][0]['id']}/reverse",
        json={"kind": "estorno", "reason": "Errado"},
        headers=auth,
    )
    after_reversal = client.post(
        f"/payables/{first['id']}/payments", json=body_with_id, headers=auth
    )
    assert after_reversal.status_code == 200


def test_past_date_needs_a_note(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    path = f"/payables/{created['id']}/payments"
    yesterday = (today() - timedelta(days=1)).isoformat()
    refused = client.post(path, json=payment(world, paidOn=yesterday), headers=auth)
    assert refused.status_code == 422
    accepted = client.post(path, json=payment(world, paidOn=yesterday, note="Atraso"), headers=auth)
    assert accepted.status_code == 200


def test_future_date_is_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    tomorrow = (today() + timedelta(days=1)).isoformat()
    response = client.post(
        f"/payables/{created['id']}/payments", json=payment(world, paidOn=tomorrow), headers=auth
    )
    assert response.status_code == 422


def test_bank_account_must_belong_to_the_company(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    response = client.post(
        f"/payables/{created['id']}/payments",
        json=payment(world, bankAccountId=world["other_account"].id),
        headers=auth,
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "value", "detail"),
    [
        ("type", "provisao", "Provisão não é paga"),
        ("origin", "connect", "PDF de comprovantes"),
    ],
)
def test_provision_and_connect_are_not_paid_here(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    field: str,
    value: str,
    detail: str,
) -> None:
    created = create(client, auth, world)
    payable = db_session.get(Payable, created["id"])
    setattr(payable, field, value)
    db_session.commit()
    response = client.post(f"/payables/{created['id']}/payments", json=payment(world), headers=auth)
    assert response.status_code == 409
    assert detail in response.json()["detail"]


def test_reversal_returns_the_amount_and_keeps_both_lines(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    paid = client.post(
        f"/payables/{created['id']}/payments",
        json=payment(world, amount="1050.00", surcharge="50.00"),
        headers=auth,
    ).json()
    payment_id = paid["payments"][0]["id"]
    path = f"/payables/{created['id']}/payments/{payment_id}/reverse"
    reversed_ = client.post(path, json={"kind": "estorno", "reason": "Errado"}, headers=auth).json()
    assert reversed_["pending"] == "1000.00"
    assert [p["kind"] for p in reversed_["payments"]] == ["pagamento", "estorno"]
    assert reversed_["payments"][0]["reversed"] is True
    again = client.post(path, json={"kind": "estorno", "reason": "De novo"}, headers=auth)
    assert again.status_code == 409


def test_returned_pix_marks_as_returned(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    paid = client.post(
        f"/payables/{created['id']}/payments", json=payment(world), headers=auth
    ).json()
    returned = client.post(
        f"/payables/{created['id']}/payments/{paid['payments'][0]['id']}/reverse",
        json={"kind": "devolucao", "reason": "Chave errada"},
        headers=auth,
    ).json()
    assert returned["situation"] == "devolvido"
    assert returned["pending"] == "1000.00"


def test_returned_stays_returned_after_an_unrelated_reversal(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    path = f"/payables/{created['id']}/payments"
    first = client.post(path, json=payment(world, amount="400.00"), headers=auth).json()
    client.post(
        f"{path}/{first['payments'][0]['id']}/reverse",
        json={"kind": "devolucao", "reason": "Chave errada"},
        headers=auth,
    )
    second = client.post(path, json=payment(world, amount="100.00"), headers=auth).json()
    new_payment = next(p for p in second["payments"] if p["amount"] == "100.00")
    assert second["situation"] != "devolvido"
    after = client.post(
        f"{path}/{new_payment['id']}/reverse",
        json={"kind": "estorno", "reason": "Errado"},
        headers=auth,
    ).json()
    assert after["situation"] == "devolvido"


def test_batch_payment_pays_each_pending(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    ids = [create(client, auth, world, amount=amount)["id"] for amount in ("100.00", "200.00")]
    response = client.post(
        "/payables/batch/payments",
        json={
            "ids": ids,
            "paidOn": today().isoformat(),
            "bankAccountId": world["account"].id,
            "paymentMethodId": world["method"].id,
        },
        headers=auth,
    )
    assert response.status_code == 200
    assert response.json() == {"total": "300.00", "count": 2}
    assert db_session.query(PayablePayment).count() == 2
    assert (
        db_session.query(PayableEvent).filter(PayableEvent.text.like("Baixa em lote%")).count() == 2
    )


def test_batch_payment_is_all_or_nothing(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    good = create(client, auth, world)["id"]
    bad = create(client, auth, world)["id"]
    db_session.get(Payable, bad).type = "provisao"
    db_session.commit()
    response = client.post(
        "/payables/batch/payments",
        json={
            "ids": [good, bad],
            "paidOn": today().isoformat(),
            "bankAccountId": world["account"].id,
            "paymentMethodId": world["method"].id,
        },
        headers=auth,
    )
    assert response.status_code == 409
    assert db_session.query(PayablePayment).count() == 0


# ---- Cancelar e excluir ----


def test_cancel_refused_with_payment_and_accepted_after_reversal(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    paid = client.post(
        f"/payables/{created['id']}/payments", json=payment(world), headers=auth
    ).json()
    path = f"/payables/{created['id']}/cancel"
    assert client.post(path, json={"reason": "Errada"}, headers=auth).status_code == 409
    client.post(
        f"/payables/{created['id']}/payments/{paid['payments'][0]['id']}/reverse",
        json={"kind": "estorno", "reason": "Errado"},
        headers=auth,
    )
    canceled = client.post(path, json={"reason": "Errada"}, headers=auth).json()
    assert canceled["situation"] == "cancelado"
    assert canceled["pending"] == "0"
    listed = client.get("/payables?indicator=cancelados", headers=auth).json()
    assert [row["id"] for row in listed["items"]] == [created["id"]]
    assert listed["indicators"]["total"]["count"] == 0


def test_delete_hides_the_payable_but_keeps_the_history(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    created = create(client, auth, world)
    assert (
        client.post(
            "/payables/batch/delete", json={"ids": [created["id"]]}, headers=auth
        ).status_code
        == 200
    )
    assert client.get(f"/payables/{created['id']}", headers=auth).status_code == 404
    assert client.get("/payables", headers=auth).json()["total"] == 0
    assert db_session.query(PayableEvent).filter(PayableEvent.text.like("Excluída%")).count() == 1


def test_delete_refused_with_payment(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    client.post(f"/payables/{created['id']}/payments", json=payment(world), headers=auth)
    response = client.post("/payables/batch/delete", json={"ids": [created["id"]]}, headers=auth)
    assert response.status_code == 409
    assert "1 títulos têm baixa" in response.json()["detail"]


# ---- Lista ----


def test_list_opens_on_today_and_period_widens(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world)
    create(client, auth, world, dueDate=(today() + timedelta(days=40)).isoformat())
    assert client.get("/payables", headers=auth).json()["total"] == 1
    assert client.get("/payables?mode=tudo", headers=auth).json()["total"] == 2


def test_indicators_count_what_each_click_would_show(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    on = today()
    create(client, auth, world, amount="100.00", dueDate=(on - timedelta(days=2)).isoformat())
    create(client, auth, world, amount="200.00")
    create(client, auth, world, amount="400.00", dueDate=(on + timedelta(days=3)).isoformat())
    provision = create(
        client, auth, world, amount="800.00", dueDate=(on + timedelta(days=4)).isoformat()
    )
    db_session.get(Payable, provision["id"]).type = "provisao"
    db_session.commit()
    paid = create(client, auth, world, amount="50.00", dueDate=(on + timedelta(days=5)).isoformat())
    client.post(
        f"/payables/{paid['id']}/payments", json=payment(world, amount="50.00"), headers=auth
    )

    data = client.get("/payables?mode=tudo", headers=auth).json()
    indicators = data["indicators"]
    assert indicators["total"] == {"value": "1550.00", "count": 5}
    assert indicators["pagos"] == {"value": "50.00", "count": 1}
    assert indicators["pendentes"] == {"value": "700.00", "count": 3}
    assert indicators["vencidos"] == {"value": "100.00", "count": 1}
    assert indicators["hoje"] == {"value": "200.00", "count": 1}
    assert indicators["avencer"] == {"value": "400.00", "count": 1}
    assert indicators["provisoes"] == {"value": "800.00", "count": 1}

    only_overdue = client.get("/payables?mode=tudo&indicator=vencidos", headers=auth).json()
    assert only_overdue["total"] == 1
    # o indicador não encolhe a si mesmo: continua mostrando quanto daria cada um
    assert only_overdue["indicators"]["total"]["count"] == 5


def test_tabs_separate_grouped_provision_and_connect(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    grouped = create(client, auth, world)["id"]
    db_session.add(
        PayableItem(
            payable_id=grouped, name="Pessoa", documentType="Incentivo", amount=Decimal("10")
        )
    )
    connect = create(client, auth, world)["id"]
    db_session.get(Payable, connect).origin = "connect"
    db_session.add(
        PayableItem(payable_id=connect, name="Pessoa", documentType="NF", amount=Decimal("10"))
    )
    provision = create(client, auth, world)["id"]
    db_session.get(Payable, provision).type = "provisao"
    db_session.commit()

    data = client.get("/payables", headers=auth).json()
    assert data["tabs"] == {"todas": 3, "agrupados": 1, "provisoes": 1, "connect": 1}
    assert client.get("/payables?tab=agrupados", headers=auth).json()["items"][0]["id"] == grouped
    row = client.get("/payables?tab=connect", headers=auth).json()["items"][0]
    assert row["itemCount"] == 1
    assert row["canPayDirectly"] is False


def test_filters_are_combined(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    allocations = [{"projectId": world["project"].id, "amount": "1000.00"}]
    create(client, auth, world, allocations=allocations, description="Com projeto")
    create(client, auth, world, description="Sem projeto")
    project = world["project"].id
    assert client.get(f"/payables?project={project}", headers=auth).json()["total"] == 1
    assert client.get("/payables?search=com%20proj", headers=auth).json()["total"] == 1
    assert client.get("/payables?search=ponto", headers=auth).json()["total"] == 2
    assert client.get("/payables?search=%25", headers=auth).json()["total"] == 0
    both = client.get(f"/payables?project={project}&search=sem", headers=auth).json()
    assert both["total"] == 0


def test_list_paginates_and_sorts(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    for value in range(1, 15):
        create(client, auth, world, amount=f"{value}.00")
    first = client.get("/payables?sort=valor&descending=true", headers=auth).json()
    assert len(first["items"]) == 12
    assert first["items"][0]["amount"] == "14.00"
    assert first["total"] == 14
    assert first["filteredAmount"] == "105.00"
    second = client.get("/payables?sort=valor&descending=true&page=2", headers=auth).json()
    assert [i["amount"] for i in second["items"]] == ["2.00", "1.00"]


def test_docs_late_when_less_than_three_days_before_due(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    on = today()
    late = create(client, auth, world, docsReceivedOn=(on - timedelta(days=2)).isoformat())
    on_time = create(client, auth, world, docsReceivedOn=(on - timedelta(days=3)).isoformat())
    assert late["docsLate"] is True
    assert on_time["docsLate"] is False


def test_custom_period_includes_both_ends(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    on = today()
    for days in (0, 5, 10, 11):
        create(client, auth, world, dueDate=(on + timedelta(days=days)).isoformat())
    query = f"mode=periodo&start={on.isoformat()}&end={(on + timedelta(days=10)).isoformat()}"
    data = client.get(f"/payables?{query}", headers=auth).json()
    assert data["total"] == 3
    assert data["rangeStart"] == on.isoformat()


@pytest.mark.parametrize(
    ("query", "detail"),
    [
        ("mode=periodo", "Escolha a data inicial e a data final"),
        ("mode=periodo&start=2026-01-01", "Escolha a data inicial e a data final"),
        (
            "mode=periodo&start=2026-02-01&end=2026-01-01",
            "A data inicial precisa ser igual ou anterior à data final",
        ),
        ("mode=periodo&start=2026-01-01&end=9999-12-31", "Data fora do intervalo aceito"),
    ],
)
def test_custom_period_refuses_bad_dates(
    client: TestClient, auth: dict[str, str], query: str, detail: str
) -> None:
    response = client.get(f"/payables?{query}", headers=auth)
    assert response.status_code == 422
    assert response.json()["detail"] == detail


def test_extreme_date_is_refused(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/payables?mode=mes&ref=9999-12-01", headers=auth).status_code == 422


def test_write_routes_are_rate_limited(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("core.limiter.limiter.enabled", True)
    statuses = {
        client.post("/payables/1/cancel", json={"reason": "x"}, headers=auth).status_code
        for _ in range(61)
    }
    assert statuses == {404, 429}


def test_period_range_covers_each_mode() -> None:
    ref = today().replace(year=2026, month=2, day=18)
    assert period_range("dia", ref) == (ref, ref)
    assert period_range("semana", ref) == (date(2026, 2, 16), date(2026, 2, 22))
    assert period_range("mes", ref) == (date(2026, 2, 1), date(2026, 2, 28))
    assert period_range("ano", ref) == (date(2026, 1, 1), date(2026, 12, 31))
    assert period_range("tudo", ref) == (None, None)


# ---- Início ----


def test_home_summarizes_what_needs_attention(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    on = today()
    create(client, auth, world, amount="100.00", dueDate=(on - timedelta(days=2)).isoformat())
    today_one = create(client, auth, world, amount="200.00", description="Hoje")
    create(client, auth, world, amount="400.00", dueDate=(on + timedelta(days=3)).isoformat())
    provision = create(
        client, auth, world, amount="800.00", dueDate=(on + timedelta(days=4)).isoformat()
    )
    db_session.get(Payable, provision["id"]).type = "provisao"
    db_session.commit()

    data = client.get("/home", headers=auth).json()
    assert data["overdue"] == {"value": "100.00", "count": 1}
    assert data["nextSevenDays"] == {"value": "600.00", "count": 2}
    assert data["payablesBadge"] == 2
    kinds = [item["kind"] for item in data["attention"]]
    assert kinds == ["vencidas", "hoje", "provisoes"]
    assert data["attention"][1]["link"] == f"/contas-a-pagar?conta={today_one['id']}"
    assert data["cashflow"][0] == {"label": "Atrasadas", "outflow": "100.00", "provision": "0"}
    first_week = data["cashflow"][1]
    assert first_week["outflow"] == "1400.00"
    assert first_week["provision"] == "800.00"
    assert [entry["pending"] for entry in data["upcoming"]] == [
        "100.00",
        "200.00",
        "400.00",
        "800.00",
    ]


def test_home_is_calm_without_payables(client: TestClient, auth: dict[str, str]) -> None:
    data = client.get("/home", headers=auth).json()
    assert data["attention"] == []
    assert data["upcoming"] == []
    assert data["overdue"]["count"] == 0
    assert len(data["cashflow"]) == 5


def test_reference_lists_only_active_records(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    db_session.add(Supplier(nickname="Velho", name="Fornecedor antigo", active=False))
    db_session.commit()
    data = client.get("/reference", headers=auth).json()
    assert [s["nickname"] for s in data["suppliers"]] == ["Ponto Certo"]
    assert data["categories"][0]["code"] == "2.04"
    assert data["units"][0]["companyId"] == world["company"].id


# ---- Filtros novos ----


def test_filter_by_unit_kind_and_situation(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    other_unit = BusinessUnit(company_id=world["company"].id, name="Health")
    db_session.add(other_unit)
    db_session.commit()
    on = today()
    create(client, auth, world, amount="100.00", dueDate=(on - timedelta(days=1)).isoformat())
    create(client, auth, world, amount="200.00", unitId=other_unit.id)
    create(client, auth, world, amount="300.00", type="provisao")

    def total(query: str) -> int:
        return client.get(f"/payables?mode=tudo&{query}", headers=auth).json()["total"]

    assert total(f"unit={other_unit.id}") == 1
    assert total("kind=provisao") == 1
    assert total("kind=real") == 2
    assert total("situation=vencido") == 1
    assert total("situation=hoje") == 2
    assert client.get("/payables?situation=errada", headers=auth).status_code == 422


def test_each_filter_takes_several_options_or_inside_and_between_filters(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    other_unit = BusinessUnit(company_id=world["company"].id, name="Health")
    db_session.add(other_unit)
    db_session.commit()
    on = today()
    both_projects = [
        {"projectId": world["project"].id, "amount": "100.00"},
        {"projectId": world["other_project"].id, "amount": "100.00"},
    ]
    create(
        client,
        auth,
        world,
        amount="200.00",
        dueDate=(on - timedelta(days=1)).isoformat(),
        allocations=both_projects,
    )
    create(
        client,
        auth,
        world,
        amount="200.00",
        unitId=other_unit.id,
        allocations=[{"projectId": world["other_project"].id, "amount": "200.00"}],
    )
    create(client, auth, world, amount="300.00", type="provisao")

    def total(query: str) -> int:
        return client.get(f"/payables?mode=tudo&{query}", headers=auth).json()["total"]

    unit, other = world["unit"].id, other_unit.id
    assert total(f"unit={other}") == 1
    assert total(f"unit={unit},{other}") == 3  # "ou" dentro do filtro
    assert total("situation=vencido,hoje") == 3
    assert total("situation=vencido,devolvido") == 1
    assert total("kind=real,provisao") == 3
    assert total(f"project={world['project'].id}") == 1
    # Um título rateado em dois projetos aparece uma vez só, não duas.
    assert total(f"project={world['project'].id},{world['other_project'].id}") == 2
    # "e" entre filtros: das 3 contas, só uma é da unidade Health e está vencida.
    assert total(f"unit={unit},{other}&situation=vencido") == 1
    assert total(f"unit={other}&situation=vencido") == 0
    # Repetido e com espaço vale como uma opção só.
    assert total(f"unit={other},{other}") == 1
    assert total(f"unit={other}%2C") == 1


@pytest.mark.parametrize(
    "query",
    [
        "unit=abc",
        "unit=1,x",
        "unit=0",
        "unit=-3",
        "unit=99999999999",
        "situation=vencido,errada",
        "kind=real,outro",
        f"project={','.join(str(n) for n in range(1, 52))}",
    ],
)
def test_filter_lists_with_bad_values_are_refused(
    client: TestClient, auth: dict[str, str], query: str
) -> None:
    response = client.get(f"/payables?{query}", headers=auth)
    assert response.status_code == 422
    assert response.json()["detail"] == "Filtro inválido"


def test_export_names_every_chosen_option(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world)
    query = f"project={world['project'].id},{world['other_project'].id}&situation=hoje,vencido"
    first_line = (
        client.get(f"/payables/export?{query}", headers=auth).text.lstrip("﻿").splitlines()[0]
    )
    assert "situação=Vence hoje ou Vencida" in first_line
    assert " ou " in first_line.split("projeto=")[1].split(",")[0]


def test_period_can_follow_payment_date_or_competence(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    on = today()
    yesterday = on - timedelta(days=1)
    created = create(client, auth, world, dueDate=(on + timedelta(days=60)).isoformat())
    paid = client.post(
        f"/payables/{created['id']}/payments",
        json=payment(world, paidOn=yesterday.isoformat(), note="Ontem"),
        headers=auth,
    ).json()
    day = f"mode=periodo&start={yesterday.isoformat()}&end={yesterday.isoformat()}"
    assert client.get(f"/payables?{day}", headers=auth).json()["total"] == 0
    assert client.get(f"/payables?{day}&dateField=baixa", headers=auth).json()["total"] == 1
    client.post(
        f"/payables/{created['id']}/payments/{paid['payments'][0]['id']}/reverse",
        json={"kind": "estorno", "reason": "Errado"},
        headers=auth,
    )
    # Baixa estornada não conta como dinheiro que saiu.
    assert client.get(f"/payables?{day}&dateField=baixa", headers=auth).json()["total"] == 0

    due = on + timedelta(days=60)
    span = f"mode=periodo&start={due.isoformat()}&end={due.isoformat()}&dateField=competencia"
    assert client.get(f"/payables?{span}", headers=auth).json()["total"] == 1


# ---- Exportar ----


def test_export_brings_all_filtered_rows_with_filters_on_top(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    for value in range(1, 15):
        create(client, auth, world, amount=f"{value}.00")
    response = client.get(f"/payables/export?supplier={world['supplier'].id}", headers=auth)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert response.headers["cache-control"] == "no-store"
    assert response.text.startswith("\ufeff")
    lines = response.text.lstrip("\ufeff").splitlines()
    assert "fornecedor=Gráfica Ponto Certo" in lines[0]
    assert lines[1].startswith("Vencimento;Fornecedor;")
    assert len(lines) == 16
    assert lines[2].endswith(";Vence hoje;1,00;0,00;0,00;0,00;1,00;0,00;1,00")


def _sheet(content: bytes) -> Any:
    return load_workbook(io.BytesIO(content)).active


def test_export_to_excel_keeps_numbers_dates_and_the_filters_on_top(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    for value in (10, 20, 30):
        create(client, auth, world, amount=f"{value}.50", description=f"Conta {value}")
    response = client.get(
        f"/payables/export?format=xlsx&supplier={world['supplier'].id}", headers=auth
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert response.headers["content-disposition"] == 'attachment; filename="contas-a-pagar.xlsx"'
    assert response.headers["cache-control"] == "no-store"
    sheet = _sheet(response.content)
    assert "fornecedor=Gráfica Ponto Certo" in sheet["A1"].value
    assert [cell.value for cell in sheet[2]][:3] == ["Vencimento", "Fornecedor", "Descrição"]
    # dinheiro e data são de verdade, para o Excel somar e ordenar
    first = [cell for cell in sheet[3]]
    assert isinstance(first[0].value, datetime)
    assert first[0].number_format == "DD/MM/YYYY"
    assert Decimal(str(first[10].value)) in (Decimal("10.50"), Decimal("20.50"), Decimal("30.50"))
    assert first[10].number_format == "#,##0.00"
    assert isinstance(first[10].value, int | float)
    # uma linha por conta, mais o total no fim
    assert [row[1].value for row in sheet.iter_rows(min_row=3, max_row=5)] == [
        "Gráfica Ponto Certo"
    ] * 3
    totals = [cell.value for cell in sheet[6]]
    assert totals[0] == "Total"
    assert Decimal(str(totals[10])) == Decimal("61.50")
    assert Decimal(str(totals[16])) == Decimal("61.50")
    assert sheet.auto_filter.ref == "A2:Q5"
    assert sheet.freeze_panes == "A3"


def test_excel_export_follows_the_same_filters_as_the_list(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, description="Aluguel")
    create(client, auth, world, description="Telefone")
    both = _sheet(client.get("/payables/export?format=xlsx&mode=tudo", headers=auth).content)
    only = _sheet(
        client.get("/payables/export?format=xlsx&mode=tudo&search=alug", headers=auth).content
    )
    assert [row[2].value for row in both.iter_rows(min_row=3, max_row=4)] == ["Aluguel", "Telefone"]
    assert [row[2].value for row in only.iter_rows(min_row=3, max_row=3)] == ["Aluguel"]
    assert "busca: alug" in only["A1"].value
    # sem linha nenhuma, não há total nem filtro de coluna
    empty = _sheet(
        client.get("/payables/export?format=xlsx&search=nada-assim", headers=auth).content
    )
    assert empty.max_row == 2
    assert empty.auto_filter.ref in (None, "")


def test_excel_export_never_turns_text_into_a_formula(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, description='=HYPERLINK("http://x")')
    cell = _sheet(client.get("/payables/export?format=xlsx", headers=auth).content)["C3"]
    assert cell.value == '=HYPERLINK("http://x")'
    assert cell.data_type == "s"


def test_the_export_format_must_be_csv_or_xlsx(client: TestClient, auth: dict[str, str]) -> None:
    assert client.get("/payables/export?format=pdf", headers=auth).status_code == 422
    assert (
        client.get("/payables/export", headers=auth).headers["content-type"].startswith("text/csv")
    )


def test_export_neutralizes_spreadsheet_formulas(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, description='=HYPERLINK("http://x")')
    text = client.get("/payables/export", headers=auth).text
    assert "'=HYPERLINK" in text.replace('""', '"')


# ---- Reclassificar ----


def test_reclassify_records_one_line_per_payable(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    ids = [create(client, auth, world)["id"] for _ in range(3)]
    new_center = CostCenter(name="Comercial")
    db_session.add(new_center)
    db_session.commit()
    response = client.post(
        "/payables/batch/reclassify",
        json={"ids": ids, "projectId": world["project"].id, "costCenterId": new_center.id},
        headers=auth,
    )
    assert response.json() == {"count": 3}
    detail = client.get(f"/payables/{ids[0]}", headers=auth).json()
    assert detail["costCenterName"] == "Comercial"
    assert [a["amount"] for a in detail["allocations"]] == ["1000.00"]
    assert "sem projeto" in detail["events"][0]["text"]
    assert "PRJ-1804" in detail["events"][0]["text"]
    assert (
        db_session.query(PayableEvent).filter(PayableEvent.text.like("Reclassificada%")).count()
        == 3
    )


def test_reclassify_needs_a_change_and_refuses_closed_project(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    empty = client.post("/payables/batch/reclassify", json={"ids": [created["id"]]}, headers=auth)
    assert empty.status_code == 422
    closed = client.post(
        "/payables/batch/reclassify",
        json={"ids": [created["id"]], "projectId": world["closed"].id},
        headers=auth,
    )
    assert closed.status_code == 409


# ---- Duplicar ----


def test_duplicate_goes_to_next_month_without_payments(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    allocations = [{"projectId": world["project"].id, "amount": "1000.00"}]
    created = create(
        client,
        auth,
        world,
        dueDate="2027-01-31",
        allocations=allocations,
        documentType="Boleto",
        documentNumber="123",
        barcode="999",
    )
    client.post(f"/payables/{created['id']}/payments", json=payment(world), headers=auth)
    response = client.post("/payables/batch/duplicate", json={"ids": [created["id"]]}, headers=auth)
    assert response.json() == {"count": 1}
    copy = client.get("/payables?mode=mes&ref=2027-02-01", headers=auth).json()["items"][0]
    assert copy["dueDate"] == "2027-02-28"
    assert copy["paid"] == "0"
    assert copy["pending"] == "1000.00"
    assert copy["documentNumber"] is None
    assert copy["barcode"] is None
    assert copy["allocations"][0]["code"] == "1804"


def test_connect_is_not_duplicated_nor_reclassified(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    created = create(client, auth, world)
    db_session.get(Payable, created["id"]).origin = "connect"
    db_session.commit()
    ids = {"ids": [created["id"]]}
    assert client.post("/payables/batch/duplicate", json=ids, headers=auth).status_code == 409
    assert (
        client.post(
            "/payables/batch/reclassify",
            json={**ids, "costCenterId": world["cost_center"].id},
            headers=auth,
        ).status_code
        == 409
    )


# ---- Provisão ----


def test_provision_needs_no_supplier_but_real_does(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    provision = client.post(
        "/payables", json=body(world, type="provisao", supplierId=None), headers=auth
    )
    assert provision.status_code == 201
    assert provision.json()["payee"] == "Provisão"
    real = client.post("/payables", json=body(world, supplierId=None), headers=auth)
    assert real.status_code == 422
    assert real.json()["detail"] == "Escolha o fornecedor"


def _provision(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], **fields: Any
) -> Any:
    allocations = [{"projectId": world["project"].id, "amount": "1000.00"}]
    return create(client, auth, world, type="provisao", allocations=allocations, **fields)


def _replace(client: TestClient, auth: dict[str, str], provision_id: int, **fields: Any) -> Any:
    return client.post(f"/payables/{provision_id}/replace", json=fields, headers=auth)


def test_replacing_provision_keeps_classification_and_leaves_the_totals(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    allocations = [
        {"projectId": world["project"].id, "amount": "600.00"},
        {"projectId": world["other_project"].id, "amount": "400.00"},
    ]
    provision = create(client, auth, world, type="provisao", allocations=allocations)
    assert provision["canReplace"] is True
    assert provision["canPayDirectly"] is False
    response = _replace(
        client, auth, provision["id"], supplierId=world["supplier"].id, amount="1100.01"
    )
    assert response.status_code == 200
    real = response.json()
    assert real["type"] == "real"
    assert real["dueDate"] == provision["dueDate"]
    assert real["categoryName"] == provision["categoryName"]
    assert [a["amount"] for a in real["allocations"]] == ["660.01", "440.00"]
    assert real["replaces"] == "1000.00"

    old = client.get(f"/payables/{provision['id']}", headers=auth).json()
    assert old["situation"] == "substituido"
    assert old["pending"] == "0"
    assert old["canReplace"] is False

    data = client.get("/payables", headers=auth).json()
    assert data["indicators"]["total"] == {"value": "1100.01", "count": 1}
    assert data["indicators"]["provisoes"]["count"] == 0
    assert data["tabs"]["provisoes"] == 0
    home = client.get("/home", headers=auth).json()
    assert [entry["id"] for entry in home["upcoming"]] == [real["id"]]

    again = _replace(client, auth, provision["id"], supplierId=world["supplier"].id, amount="1.00")
    assert again.status_code == 409
    assert again.json()["detail"] == "Essa conta não é uma provisão em aberto"


def test_tiny_real_value_never_creates_negative_share(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    allocations = [
        {"projectId": world["project"].id, "amount": "500.00"},
        {"projectId": world["other_project"].id, "amount": "500.00"},
    ]
    provision = create(client, auth, world, type="provisao", allocations=allocations)
    real = _replace(
        client, auth, provision["id"], supplierId=world["supplier"].id, amount="0.01"
    ).json()
    shares = [Decimal(a["amount"]) for a in real["allocations"]]
    assert sum(shares) == Decimal("0.01")
    assert all(share > 0 for share in shares)


def test_new_real_needs_value_and_supplier(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    provision = _provision(client, auth, world)
    response = _replace(client, auth, provision["id"], amount="10.00")
    assert response.status_code == 422
    assert response.json()["detail"] == "Informe o valor real e o fornecedor"


def test_provision_can_point_to_a_real_already_launched(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    allocations = [{"projectId": world["project"].id, "amount": "1000.00"}]
    provision = _provision(client, auth, world)
    other = _provision(client, auth, world)
    real = create(client, auth, world, description="Gráfica real", allocations=allocations)
    create(client, auth, world, description="Sem projeto")
    url = f"/payables/{provision['id']}/replacement-candidates"
    assert [c["id"] for c in client.get(url, headers=auth).json()] == [real["id"]]

    assert _replace(client, auth, provision["id"], realId=real["id"]).status_code == 200
    row = client.get(f"/payables/{real['id']}", headers=auth).json()
    assert row["replaces"] == "1000.00"

    # Uma conta real só substitui uma provisão
    twice = _replace(client, auth, other["id"], realId=real["id"])
    assert twice.status_code == 409
    assert twice.json()["detail"] == "Essa conta não pode substituir a provisão"
    url = f"/payables/{other['id']}/replacement-candidates"
    assert client.get(url, headers=auth).json() == []


def test_real_from_another_project_cannot_replace(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    provision = _provision(client, auth, world)
    allocations = [{"projectId": world["other_project"].id, "amount": "1000.00"}]
    real = create(client, auth, world, allocations=allocations)
    assert _replace(client, auth, provision["id"], realId=real["id"]).status_code == 409
    assert _replace(client, auth, provision["id"], realId=99999).status_code == 404


@pytest.mark.parametrize("how", ["cancel", "delete"])
def test_provision_comes_back_when_the_real_goes_away(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], how: str
) -> None:
    provision = _provision(client, auth, world)
    real = _replace(
        client, auth, provision["id"], supplierId=world["supplier"].id, amount="900.00"
    ).json()
    if how == "cancel":
        client.post(f"/payables/{real['id']}/cancel", json={"reason": "Engano"}, headers=auth)
    else:
        client.post("/payables/batch/delete", json={"ids": [real["id"]]}, headers=auth)
    back = client.get(f"/payables/{provision['id']}", headers=auth).json()
    assert back["canReplace"] is True
    assert back["pending"] == "1000.00"
    assert "Voltou a valer" in back["events"][0]["text"]


def test_replaced_provision_stays_only_in_the_history(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    provision = _provision(client, auth, world)
    _replace(client, auth, provision["id"], supplierId=world["supplier"].id, amount="900.00")
    url = f"/payables/{provision['id']}"
    edit = client.patch(
        url,
        json={"description": "Outra", "amount": "1.00", "dueDate": provision["dueDate"]},
        headers=auth,
    )
    cancel = client.post(f"{url}/cancel", json={"reason": "Engano"}, headers=auth)
    delete = client.post("/payables/batch/delete", json={"ids": [provision["id"]]}, headers=auth)
    for response in (edit, cancel, delete):
        assert response.status_code == 409
        assert (
            response.json()["detail"]
            == "Essa provisão já foi substituída — ela fica só no histórico"
        )


def test_only_a_provision_can_be_replaced(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    response = _replace(client, auth, created["id"], supplierId=world["supplier"].id, amount="1.00")
    assert response.status_code == 409
    url = f"/payables/{created['id']}/replacement-candidates"
    assert client.get(url, headers=auth).status_code == 409


# ---- Importar planilha ----

INCENTIVE_HEADER = ["Nome", "CPF", "Chave Pix", "Valor", "Data da pesquisa", "Data de pagamento"]
FAKE_CPF = "000.000.000-00"
FAKE_PIX = "pessoa-ficticia@exemplo.invalid"


def _xlsx(rows: list[list[Any]]) -> bytes:
    book = Workbook()
    for row in rows:
        book.active.append(row)
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


def _incentives(*dates: tuple[str, int], value: Any = 120, pay: str = "") -> bytes:
    rows: list[list[Any]] = [INCENTIVE_HEADER]
    number = 0
    for day, count in dates:
        for _ in range(count):
            number += 1
            rows.append([f"Respondente {number:03}", FAKE_CPF, FAKE_PIX, value, day, pay or None])
    return _xlsx(rows)


def _import_fields(world: dict[str, Any], **overrides: Any) -> dict[str, Any]:
    return {
        "kind": "incentivos",
        "projectIds": str(world["project"].id),
        "categoryIds": str(world["category"].id),
        "companyIds": str(world["company"].id),
        "unitIds": str(world["unit"].id),
        "costCenterIds": str(world["cost_center"].id),
        "paymentMethodIds": str(world["method"].id),
        **overrides,
    }


def _send(
    client: TestClient,
    auth: dict[str, str],
    url: str,
    fields: dict[str, Any],
    content: bytes,
    name: str = "planilha.xlsx",
) -> Any:
    return client.post(url, data=fields, files={"file": (name, content)}, headers=auth)


@pytest.fixture
def incentive_project(world: dict[str, Any], db_session: Session) -> Project:
    project = world["project"]
    project.projectType = "Health"
    project.hasIncentive = True
    project.incentiveDays = 10
    db_session.commit()
    return project


def test_incentives_of_one_date_become_one_group_with_all_people(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    incentive_project: Project,
    db_session: Session,
) -> None:
    content = _incentives(("2026-10-30", 14), value=200)
    response = _send(client, auth, "/payables/import", _import_fields(world), content)
    assert response.status_code == 201
    assert response.json() == {"count": 1, "items": 14, "total": "2800.00"}
    payable = db_session.query(Payable).one()
    assert payable.origin == "incentivo"
    assert payable.payeeName == "Incentivos (14 pessoas)"
    assert payable.amount == Decimal("2800.00")
    assert payable.dueDate == date(2026, 11, 16)
    assert len(payable.items) == 14
    assert payable.items[0].documentType == "Incentivo"


def test_each_payment_date_is_one_payable_and_the_sum_matches(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    incentive_project: Project,
    db_session: Session,
) -> None:
    content = _incentives(
        ("2026-10-22", 5), ("2026-10-23", 4), ("2026-10-26", 3), ("2026-10-27", 3)
    )
    preview = _send(client, auth, "/payables/import/preview", _import_fields(world), content).json()
    assert preview["goodCount"] == 15
    assert preview["total"] == "1800.00"
    assert [(g["payDate"], g["count"], g["source"]) for g in preview["groups"]] == [
        ("2026-11-06", 5, "calculada pelo prazo"),
        ("2026-11-09", 4, "calculada pelo prazo"),
        ("2026-11-10", 3, "calculada pelo prazo"),
        ("2026-11-11", 3, "calculada pelo prazo"),
    ]
    # Conferir não grava nada
    assert db_session.query(Payable).count() == 0

    result = _send(client, auth, "/payables/import", _import_fields(world), content).json()
    assert result["count"] == 4
    payables = db_session.query(Payable).order_by(Payable.dueDate).all()
    assert [p.dueDate for p in payables] == [
        g["payDate"] and date.fromisoformat(g["payDate"]) for g in preview["groups"]
    ]
    assert sum(p.amount for p in payables) == Decimal("1800.00")
    assert payables[0].description == "Incentivos · PRJ-1804 · pagar 06/11"
    assert payables[0].competence == "2026-10"
    event = db_session.query(PayableEvent).filter_by(payable_id=payables[0].id).one()
    assert "planilha.xlsx: 5 incentivos das pesquisas de 22/10" in event.text


def test_date_given_by_the_sheet_wins_over_the_deadline(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    incentive_project: Project,
    db_session: Session,
) -> None:
    content = _incentives(("", 200), value=50, pay="2026-10-30")
    result = _send(client, auth, "/payables/import", _import_fields(world), content).json()
    assert result == {"count": 1, "items": 200, "total": "10000.00"}
    assert db_session.query(Payable).one().dueDate == date(2026, 10, 30)


def test_excel_dates_and_text_dates_both_work(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    content = _xlsx(
        [
            INCENTIVE_HEADER,
            ["Pessoa A", None, None, 10.5, datetime(2026, 10, 30), None],
            ["Pessoa B", None, None, "1.234,56", "30/10/2026", None],
        ]
    )
    preview = _send(client, auth, "/payables/import/preview", _import_fields(world), content).json()
    assert preview["errorCount"] == 0
    assert [line["amount"] for line in preview["lines"]] == ["10.50", "1234.56"]
    assert preview["total"] == "1245.06"


def test_personal_data_outside_the_columns_is_never_kept(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    content = _incentives(("2026-10-30", 2))
    preview = _send(client, auth, "/payables/import/preview", _import_fields(world), content)
    assert FAKE_CPF not in preview.text
    assert FAKE_PIX not in preview.text
    _send(client, auth, "/payables/import", _import_fields(world), content)
    listed = client.get("/payables?mode=tudo", headers=auth).json()["items"][0]
    detail = client.get(f"/payables/{listed['id']}", headers=auth)
    assert FAKE_CPF not in detail.text
    assert FAKE_PIX not in detail.text


def test_bad_lines_stay_out_and_say_why(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    incentive_project: Project,
    db_session: Session,
) -> None:
    content = _xlsx(
        [
            INCENTIVE_HEADER,
            ["Pessoa boa", None, None, 100, "2026-10-30", None],
            ["", None, None, 100, "2026-10-30", None],
            ["Com real", None, None, "R$ 400", "2026-10-30", None],
            ["Sem data", None, None, 100, None, None],
            ["Data ruim", None, None, 100, "ontem", None],
            ["Pago antes", None, None, 100, "2026-10-30", "2026-10-01"],
            ["Três casas", None, None, 10.555, "2026-10-30", None],
            ["Zero", None, None, 0, "2026-10-30", None],
        ]
    )
    preview = _send(client, auth, "/payables/import/preview", _import_fields(world), content).json()
    assert preview["goodCount"] == 1
    assert preview["errorCount"] == 7
    assert [line["errors"] for line in preview["lines"][1:]] == [
        ["Nome vazio"],
        ["Use só números no valor"],
        ["Sem data de pagamento e sem data da pesquisa"],
        ["Data da pesquisa inválida"],
        ["Pagamento antes da data da pesquisa"],
        ["Valor inválido"],
        ["Valor inválido"],
    ]
    assert preview["lines"][1]["line"] == 3
    result = _send(client, auth, "/payables/import", _import_fields(world), content).json()
    assert result["items"] == 1
    assert db_session.query(PayableItem).count() == 1


def test_project_without_deadline_refuses_lines_without_date(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    content = _incentives(("2026-10-30", 2))
    preview = _send(client, auth, "/payables/import/preview", _import_fields(world), content).json()
    assert preview["missingDeadline"] is True
    assert preview["groups"] == []
    response = _send(client, auth, "/payables/import", _import_fields(world), content)
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Defina o prazo do incentivo no projeto antes de importar a planilha"
    )
    assert db_session.query(Payable).count() == 0
    # Com a data na planilha, o prazo não faz falta
    given = _incentives(("", 2), pay="2026-10-30")
    assert _send(client, auth, "/payables/import", _import_fields(world), given).status_code == 201


def test_sheet_without_the_required_columns_is_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    url = "/payables/import/preview"
    fields = _import_fields(world)
    no_date = _send(client, auth, url, fields, _xlsx([["Nome", "Valor"], ["Ana", 10]]))
    assert no_date.status_code == 422
    assert no_date.json()["detail"] == 'A planilha precisa da coluna "data da pesquisa"'
    no_value = _send(client, auth, url, fields, _xlsx([["Nome", "Data da pesquisa"]]))
    assert no_value.json()["detail"] == 'A planilha precisa da coluna "valor"'
    only_pay = _xlsx([["Nome", "Valor", "Data de pagamento"], ["Ana", 10, "2026-10-30"]])
    assert _send(client, auth, url, fields, only_pay).json()["goodCount"] == 1


def test_closed_project_and_empty_results_are_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    content = _incentives(("2026-10-30", 1))
    closed = _send(
        client,
        auth,
        "/payables/import",
        _import_fields(world, projectIds=str(world["closed"].id)),
        content,
    )
    assert closed.status_code == 409
    missing = _send(
        client, auth, "/payables/import/preview", _import_fields(world, projectIds="99999"), content
    )
    assert missing.status_code == 422
    nothing = _xlsx([INCENTIVE_HEADER, ["", None, None, 100, "2026-10-30", None]])
    empty = _send(client, auth, "/payables/import", _import_fields(world), nothing)
    assert empty.status_code == 422
    assert (
        empty.json()["detail"] == "Nenhuma linha da planilha pode entrar. Corrija e envie de novo"
    )


# ---- Importar planilha com vários projetos ----

PROJECT_HEADER = ["Nome", "Valor", "Data da pesquisa", "Projeto"]


@pytest.fixture
def two_incentive_projects(
    world: dict[str, Any], incentive_project: Project, db_session: Session
) -> tuple[Project, Project]:
    other = world["other_project"]
    other.hasIncentive = True
    other.incentiveDays = 5
    db_session.commit()
    return incentive_project, other


def _by_project(db_session: Session) -> dict[str, list[tuple[date, Decimal]]]:
    found: dict[str, list[tuple[date, Decimal]]] = {}
    for payable in db_session.query(Payable).order_by(Payable.dueDate, Payable.id).all():
        code = payable.allocations[0].project.code
        found.setdefault(code, []).append((payable.dueDate, payable.amount))
    return found


def test_a_project_column_splits_one_sheet_into_one_payable_per_project_and_date(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    two_incentive_projects: tuple[Project, Project],
    db_session: Session,
) -> None:
    content = _xlsx(
        [
            PROJECT_HEADER,
            ["Ana", 100, "2026-10-30", "1804"],
            ["Bia", 100, "2026-10-30", "PRJ-1804"],  # com o prefixo
            ["Caio", 50, "2026-10-30", 1790],  # célula numérica
            ["Dani", 50, "2026-10-30", 1790.0],  # xlsx guarda número como decimal
        ]
    )
    fields = _import_fields(world, projectIds="")  # nada marcado = todos os da planilha
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert preview["hasProjectColumn"] is True
    assert preview["goodCount"] == 4
    assert [
        (p["code"], p["count"], p["total"], p["deadlineDays"]) for p in preview["projects"]
    ] == [
        ("1790", 2, "100.00", 5),
        ("1804", 2, "200.00", 10),
    ]
    # Cada projeto conta o seu prazo: 5 e 10 dias úteis depois de 30/10 (02/11 é feriado)
    assert [(g["projectCode"], g["payDate"], g["count"]) for g in preview["groups"]] == [
        ("1790", "2026-11-09", 2),
        ("1804", "2026-11-16", 2),
    ]
    assert db_session.query(Payable).count() == 0

    result = _send(client, auth, "/payables/import", fields, content).json()
    assert result == {"count": 2, "items": 4, "total": "300.00"}
    assert _by_project(db_session) == {
        "1790": [(date(2026, 11, 9), Decimal("100.00"))],
        "1804": [(date(2026, 11, 16), Decimal("200.00"))],
    }
    descriptions = sorted(p.description for p in db_session.query(Payable).all())
    assert descriptions == [
        "Incentivos · PRJ-1790 · pagar 09/11",
        "Incentivos · PRJ-1804 · pagar 16/11",
    ]


def test_choosing_some_projects_leaves_the_others_out_without_calling_them_errors(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    two_incentive_projects: tuple[Project, Project],
    db_session: Session,
) -> None:
    content = _xlsx(
        [
            PROJECT_HEADER,
            ["Ana", 100, "2026-10-30", "1804"],
            ["Caio", 50, "2026-10-30", "1790"],
            ["Eli", 70, "2026-10-30", "1790"],
        ]
    )
    fields = _import_fields(world, projectIds=str(world["other_project"].id))
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert (preview["goodCount"], preview["errorCount"], preview["skippedCount"]) == (2, 0, 1)
    skipped = [line for line in preview["lines"] if line["skipped"]]
    assert [(line["name"], line["errors"]) for line in skipped] == [("Ana", [])]
    result = _send(client, auth, "/payables/import", fields, content).json()
    assert result == {"count": 1, "items": 2, "total": "120.00"}
    assert list(_by_project(db_session)) == ["1790"]

    # Marcando os dois, entra tudo
    both = f"{world['project'].id},{world['other_project'].id}"
    preview = _send(
        client, auth, "/payables/import/preview", _import_fields(world, projectIds=both), content
    ).json()
    assert (preview["goodCount"], preview["skippedCount"]) == (3, 0)


def test_blank_project_cell_uses_the_single_chosen_project_and_is_an_error_otherwise(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    two_incentive_projects: tuple[Project, Project],
) -> None:
    content = _xlsx(
        [
            PROJECT_HEADER,
            ["Ana", 100, "2026-10-30", None],
            ["Caio", 50, "2026-10-30", "1790"],
        ]
    )
    url = "/payables/import/preview"
    one = _send(client, auth, url, _import_fields(world), content).json()  # só o 1804 marcado
    assert (one["goodCount"], one["skippedCount"]) == (1, 1)
    assert [(g["projectCode"], g["count"]) for g in one["groups"]] == [("1804", 1)]

    none = _send(client, auth, url, _import_fields(world, projectIds=""), content).json()
    assert none["goodCount"] == 1
    assert none["lines"][0]["errors"] == ["Sem projeto na linha"]


def test_unknown_and_closed_projects_in_the_sheet_are_line_errors(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    two_incentive_projects: tuple[Project, Project],
) -> None:
    content = _xlsx(
        [
            PROJECT_HEADER,
            ["Ana", 100, "2026-10-30", "1804"],
            ["Bia", 100, "2026-10-30", "9999"],
            ["Caio", 100, "2026-10-30", "1700"],  # encerrado
        ]
    )
    preview = _send(
        client,
        auth,
        "/payables/import/preview",
        _import_fields(world, projectIds=""),
        content,
    ).json()
    assert preview["goodCount"] == 1
    assert [line["errors"] for line in preview["lines"]] == [
        [],
        ["Projeto 9999 não existe"],
        ["Projeto PRJ-1700 está fechado"],
    ]


def test_sheet_without_a_project_column_needs_exactly_one_chosen_project(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    two_incentive_projects: tuple[Project, Project],
) -> None:
    content = _incentives(("2026-10-30", 1))
    url = "/payables/import/preview"
    expected = (
        'A planilha não tem a coluna "projeto". Escolha um só projeto na tela '
        "ou inclua a coluna na planilha"
    )
    for chosen in ("", f"{world['project'].id},{world['other_project'].id}"):
        response = _send(client, auth, url, _import_fields(world, projectIds=chosen), content)
        assert response.status_code == 422
        assert response.json()["detail"] == expected
    assert (
        _send(client, auth, url, _import_fields(world), content).json()["hasProjectColumn"] is False
    )


def test_a_project_without_deadline_blocks_only_when_it_has_lines_that_need_it(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    incentive_project: Project,
    db_session: Session,
) -> None:
    # O 1790 não tem prazo; a linha dele sem data de pagamento não tem como ser calculada.
    content = _xlsx(
        [PROJECT_HEADER, ["Ana", 100, "2026-10-30", "1804"], ["Caio", 50, "2026-10-30", "1790"]]
    )
    fields = _import_fields(world, projectIds="")
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert preview["missingDeadline"] is True
    assert [(p["code"], p["missingDeadline"]) for p in preview["projects"]] == [
        ("1790", True),
        ("1804", False),
    ]
    response = _send(client, auth, "/payables/import", fields, content)
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Defina o prazo do incentivo no projeto antes de importar a planilha"
    )
    assert db_session.query(Payable).count() == 0
    # Marcando só o 1804, a planilha entra: o 1790 ficou fora
    only = _import_fields(world, projectIds=str(world["project"].id))
    assert _send(client, auth, "/payables/import", only, content).status_code == 201


def test_two_projects_without_deadline_are_named_together(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    content = _xlsx(
        [PROJECT_HEADER, ["Ana", 100, "2026-10-30", "1804"], ["Caio", 50, "2026-10-30", "1790"]]
    )
    response = _send(
        client, auth, "/payables/import", _import_fields(world, projectIds=""), content
    )
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Defina o prazo do incentivo nos projetos PRJ-1790, PRJ-1804 antes de importar a planilha"
    )


def test_payroll_with_several_projects_makes_one_payable_per_project(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    content = _xlsx(
        [
            ["Nome", "Documento", "Valor", "Projeto"],
            ["Ana", "NF", 600, "1804"],
            ["Bia", "RPA", 1000, "1804"],
            ["Caio", "Sem NF", 300, "1790"],
        ]
    )
    fields = _import_fields(
        world,
        kind="folha",
        projectIds="",
        description="Equipe de campo · novembro",
        dueDate="2026-11-20",
    )
    result = _send(client, auth, "/payables/import", fields, content).json()
    assert result == {"count": 2, "items": 3, "total": "1790.00"}
    payables = {p.allocations[0].project.code: p for p in db_session.query(Payable).all()}
    assert payables["1804"].description == "Equipe de campo · novembro · PRJ-1804"
    assert payables["1804"].amount == Decimal("1490.00")  # 600 + 1000 menos 11% de INSS
    assert payables["1790"].amount == Decimal("300.00")
    assert payables["1790"].payeeName == "Folha de campo (1 pessoa)"


# ---- Importar planilha com empresa, unidade, centro de custo, categoria e forma em coluna ----


@pytest.fixture
def more_registers(world: dict[str, Any], db_session: Session) -> dict[str, Any]:
    """Um segundo cadastro de cada campo, e uma conta de receita que não serve ao Contas a pagar."""
    other_company = db_session.query(Company).filter_by(name="MC").one()  # já vem do `world`
    extra = {
        "other_company": other_company,
        "unit_mc": BusinessUnit(company_id=other_company.id, name="Consumo SP"),  # mesmo nome
        "other_unit": BusinessUnit(company_id=world["company"].id, name="Health"),
        "other_center": CostCenter(name="Administrativo"),
        "other_category": ExpenseCategory(code="2.05", name="Transporte"),
        "revenue": ExpenseCategory(code="1.01", name="Receita de pesquisa", kind="receita"),
        "inactive_center": CostCenter(name="Antigo", active=False),
        "other_method": PaymentMethod(name="Boleto"),
    }
    db_session.add_all([value for key, value in extra.items() if key != "other_company"])
    db_session.commit()
    return extra


COLUMNS_HEADER = [
    "Nome",
    "Valor",
    "Data de pagamento",
    "Empresa",
    "Unidade",
    "Centro de custo",
    "Categoria",
    "Forma de pagamento",
]


def _classified(
    world: dict[str, Any], rows: list[list[Any]], **over: Any
) -> tuple[dict[str, Any], bytes]:
    """Planilha com as cinco colunas de classificação; por padrão nada marcado na tela."""
    cleared = {
        "companyIds": "",
        "unitIds": "",
        "costCenterIds": "",
        "categoryIds": "",
        "paymentMethodIds": "",
    }
    return _import_fields(world, **{**cleared, **over}), _xlsx([COLUMNS_HEADER, *rows])


def test_each_classification_column_splits_the_sheet_into_payables(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    more_registers: dict[str, Any],
    db_session: Session,
) -> None:
    fields, content = _classified(
        world,
        [
            ["Ana", 100, "2026-11-20", "PPlus", "Consumo SP", "Campo", "2.04", "Pix"],
            ["Bia", 50, "2026-11-20", "PPlus", "Health", "Campo", "2.04 Material e gráfica", "pix"],
            [
                "Caio",
                70,
                "2026-11-20",
                "MC",
                "Consumo SP",
                "Administrativo",
                "Transporte",
                "Boleto",
            ],
            ["Dani", 30, "2026-11-20", "PPlus", "Consumo SP", "Campo", "2.04", "Pix"],
        ],
    )
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert preview["columns"] == [
        "empresa",
        "unidade",
        "centro de custo",
        "categoria",
        "forma de pagamento",
    ]
    assert preview["hasClassificationColumns"] is True
    assert preview["goodCount"] == 4
    assert preview["payableCount"] == 3
    # Ana e Dani têm a mesma classificação e a mesma data: um lançamento só
    assert sorted((g["classification"], g["count"]) for g in preview["groups"]) == [
        ("MC · Consumo SP · Administrativo · 2.05 Transporte · Boleto", 1),
        ("PPlus · Consumo SP · Campo · 2.04 Material e gráfica · Pix", 2),
        ("PPlus · Health · Campo · 2.04 Material e gráfica · Pix", 1),
    ]
    assert preview["lines"][0]["classification"] == "PPlus · Consumo SP · Campo · 2.04 · Pix"

    result = _send(client, auth, "/payables/import", fields, content).json()
    assert result == {"count": 3, "items": 4, "total": "250.00"}
    made = {
        (p.company.name, p.unit.name, p.cost_center.name, p.category.code, p.payment_method.name): p
        for p in db_session.query(Payable).all()
    }
    assert set(made) == {
        ("PPlus", "Consumo SP", "Campo", "2.04", "Pix"),
        ("PPlus", "Health", "Campo", "2.04", "Pix"),
        ("MC", "Consumo SP", "Administrativo", "2.05", "Boleto"),
    }
    assert made[("PPlus", "Consumo SP", "Campo", "2.04", "Pix")].amount == Decimal("130.00")


def test_choosing_some_registers_leaves_the_other_lines_out(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    more_registers: dict[str, Any],
) -> None:
    fields, content = _classified(
        world,
        [
            ["Ana", 100, "2026-11-20", "PPlus", "Consumo SP", "Campo", "2.04", "Pix"],
            [
                "Caio",
                70,
                "2026-11-20",
                "MC",
                "Consumo SP",
                "Administrativo",
                "Transporte",
                "Boleto",
            ],
        ],
        companyIds=str(more_registers["other_company"].id),
    )
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert (preview["goodCount"], preview["errorCount"], preview["skippedCount"]) == (1, 0, 1)
    assert [line["skipped"] for line in preview["lines"]] == [True, False]
    # O mesmo vale para a categoria e para a forma de pagamento
    both_methods = f"{world['method'].id},{more_registers['other_method'].id}"
    fields["companyIds"] = ""
    fields["paymentMethodIds"] = both_methods
    kept = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert (kept["goodCount"], kept["skippedCount"]) == (2, 0)


def test_blank_cells_use_the_single_chosen_register(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], more_registers: dict[str, Any]
) -> None:
    fields, content = _classified(
        world,
        [["Ana", 100, "2026-11-20", "PPlus", "Consumo SP", None, None, None]],
        costCenterIds=str(world["cost_center"].id),
        categoryIds=str(world["category"].id),
        paymentMethodIds="",
    )
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    # centro de custo e categoria vêm do que foi marcado; a forma não tem de onde vir
    assert preview["lines"][0]["errors"] == ["Sem forma de pagamento na linha"]
    fields["paymentMethodIds"] = str(world["method"].id)
    ok = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert ok["goodCount"] == 1
    assert ok["groups"][0]["classification"] == (
        "PPlus · Consumo SP · Campo · 2.04 Material e gráfica · Pix"
    )


def test_unknown_inactive_and_wrong_kind_registers_are_line_errors(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], more_registers: dict[str, Any]
) -> None:
    fields, content = _classified(
        world,
        [
            ["Ana", 100, "2026-11-20", "PPlus", "Consumo SP", "Campo", "2.04", "Pix"],
            ["Bia", 100, "2026-11-20", "Fantasma", "Consumo SP", "Campo", "2.04", "Pix"],
            ["Caio", 100, "2026-11-20", "PPlus", "Consumo SP", "Antigo", "2.04", "Pix"],
            ["Dani", 100, "2026-11-20", "PPlus", "Consumo SP", "Campo", "1.01", "Pix"],
            ["Eli", 100, "2026-11-20", "PPlus", "Inexistente", "Campo", "2.04", "Pix"],
        ],
    )
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert preview["goodCount"] == 1
    assert [line["errors"] for line in preview["lines"]] == [
        [],
        ["Empresa Fantasma não existe"],
        ["Centro de custo Antigo: cadastro inativo"],
        ["Categoria Receita de pesquisa: contas a pagar usam conta de despesa"],
        ["Unidade Inexistente não existe"],
    ]


def test_a_unit_is_looked_up_inside_its_company_and_must_belong_to_it(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], more_registers: dict[str, Any]
) -> None:
    fields, content = _classified(
        world,
        [
            # "Consumo SP" existe nas duas empresas: a empresa da linha decide
            ["Ana", 100, "2026-11-20", "MC", "Consumo SP", "Campo", "2.04", "Pix"],
            # "Health" só existe na PPlus
            ["Bia", 100, "2026-11-20", "MC", "Health", "Campo", "2.04", "Pix"],
        ],
    )
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert preview["goodCount"] == 1
    assert preview["lines"][0]["errors"] == []
    assert preview["lines"][1]["errors"] == ["Unidade Health não existe"]
    # Sem a coluna da empresa, a empresa marcada na tela decide qual "Consumo SP" vale
    no_company = _xlsx(
        [
            ["Nome", "Valor", "Data de pagamento", "Unidade"],
            ["Ana", 100, "2026-11-20", "Consumo SP"],
        ]
    )
    plain = _import_fields(world, unitIds="")
    chosen = _send(client, auth, "/payables/import/preview", plain, no_company).json()
    assert chosen["goodCount"] == 1
    assert chosen["groups"][0]["classification"].startswith("PPlus · Consumo SP")


def test_fields_without_a_column_need_exactly_one_chosen_register(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], more_registers: dict[str, Any]
) -> None:
    content = _incentives(("2026-10-30", 1), pay="2026-11-20")
    url = "/payables/import/preview"
    for field, label, article in (
        ("companyIds", "empresa", "uma só empresa"),
        ("unitIds", "unidade", "uma só unidade"),
        ("costCenterIds", "centro de custo", "um só centro de custo"),
        ("categoryIds", "categoria", "uma só categoria"),
        ("paymentMethodIds", "forma de pagamento", "uma só forma de pagamento"),
    ):
        response = _send(client, auth, url, _import_fields(world, **{field: ""}), content)
        assert response.status_code == 422
        assert response.json()["detail"] == (
            f'A planilha não tem a coluna "{label}". '
            f"Escolha {article} na tela ou inclua a coluna na planilha"
        )
    # Marcados a unidade de uma empresa e a empresa de outra: recusa, como sempre foi
    wrong = _import_fields(world, unitIds=str(more_registers["unit_mc"].id))
    refused = _send(client, auth, url, wrong, content)
    assert refused.status_code == 422
    assert refused.json()["detail"] == "A unidade não é dessa empresa"


def test_selected_registers_are_checked(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], more_registers: dict[str, Any]
) -> None:
    content = _incentives(("2026-10-30", 1), pay="2026-11-20")
    url = "/payables/import/preview"
    inactive = _send(
        client,
        auth,
        url,
        _import_fields(world, costCenterIds=str(more_registers["inactive_center"].id)),
        content,
    )
    assert (inactive.status_code, inactive.json()["detail"]) == (
        422,
        "Centro de custo não encontrado ou inativo",
    )
    revenue = _send(
        client,
        auth,
        url,
        _import_fields(world, categoryIds=str(more_registers["revenue"].id)),
        content,
    )
    assert revenue.json()["detail"] == "Contas a pagar usam conta de despesa"
    missing = _send(client, auth, url, _import_fields(world, paymentMethodIds="99999"), content)
    assert missing.json()["detail"] == "Forma de pagamento não encontrado ou inativo"


def test_payroll_with_two_companies_makes_one_payable_per_combination(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    more_registers: dict[str, Any],
    db_session: Session,
) -> None:
    content = _xlsx(
        [
            ["Nome", "Documento", "Valor", "Empresa", "Unidade"],
            ["Ana", "NF", 600, "PPlus", "Consumo SP"],
            ["Bia", "NF", 400, "MC", "Consumo SP"],
        ]
    )
    fields = _import_fields(
        world,
        kind="folha",
        companyIds="",
        unitIds="",
        description="Equipe de campo",
        dueDate="2026-11-20",
    )
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert (preview["payableCount"], preview["groups"]) == (2, [])
    result = _send(client, auth, "/payables/import", fields, content).json()
    assert result == {"count": 2, "items": 2, "total": "1000.00"}
    # Mesmo projeto nos dois: a classificação entra na descrição para diferenciar
    descriptions = sorted(p.description for p in db_session.query(Payable).all())
    assert descriptions[0].startswith("Equipe de campo · PRJ-1804 · MC · Consumo SP")
    assert descriptions[1].startswith("Equipe de campo · PRJ-1804 · PPlus · Consumo SP")


def test_same_file_warns_that_it_was_imported(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    content = _incentives(("2026-10-30", 2))
    url = "/payables/import/preview"
    assert (
        _send(client, auth, url, _import_fields(world), content).json()["alreadyImported"] is False
    )
    _send(client, auth, "/payables/import", _import_fields(world), content)
    assert (
        _send(client, auth, url, _import_fields(world), content).json()["alreadyImported"] is True
    )


def test_payroll_makes_one_payable_with_net_rpa_and_nf_status(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
) -> None:
    content = _xlsx(
        [
            ["Nome", "Documento", "Valor", "Número da NF", "Emissão"],
            ["Ana Ribeiro", "NF", 600, "58", datetime(2026, 10, 27)],
            ["Bruno Lima", "nf", 600, None, None],
            ["Carla Mendes", "RPA", 1000, None, None],
            ["Pessoa", "Recibo", 100, None, None],
        ]
    )
    fields = _import_fields(
        world, kind="folha", description="Equipe de campo · novembro", dueDate="2026-11-20"
    )
    preview = _send(client, auth, "/payables/import/preview", fields, content).json()
    assert preview["errorCount"] == 1
    assert preview["lines"][2]["gross"] == "1000.00"
    assert preview["lines"][2]["amount"] == "890.00"
    assert preview["lines"][3]["errors"] == ["Documento inválido: use NF, RPA, Incentivo ou Sem NF"]
    assert preview["groups"] == []

    result = _send(client, auth, "/payables/import", fields, content).json()
    assert result == {"count": 1, "items": 3, "total": "2090.00"}
    payable = db_session.query(Payable).one()
    assert payable.origin == "folha"
    assert payable.payeeName == "Folha de campo (3 pessoas)"
    items = {item.name: item for item in payable.items}
    assert items["Ana Ribeiro"].invoiceStatus == "Recebida"
    assert items["Ana Ribeiro"].invoiceDate == date(2026, 10, 27)
    assert items["Bruno Lima"].invoiceStatus == "Pendente"
    assert items["Carla Mendes"].grossAmount == Decimal("1000.00")
    assert items["Carla Mendes"].amount == Decimal("890.00")


def test_payroll_needs_description_and_due_date(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    content = _xlsx([["Nome", "Documento", "Valor"], ["Ana", "RPA", 100]])
    fields = _import_fields(world, kind="folha")
    response = _send(client, auth, "/payables/import", fields, content)
    assert response.json()["detail"] == "Informe a descrição do lançamento"
    fields["description"] = "Equipe"
    response = _send(client, auth, "/payables/import", fields, content)
    assert response.json()["detail"] == "Informe o vencimento"


def test_csv_saved_by_excel_is_accepted(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    text = "Nome;Valor;Data da pesquisa\r\nJoão;1.200,50;30/10/2026\r\n;;\r\n"
    response = _send(
        client,
        auth,
        "/payables/import/preview",
        _import_fields(world),
        text.encode("cp1252"),
        "planilha.csv",
    )
    assert response.json()["lines"] == [
        {
            "line": 2,
            "name": "João",
            "documentType": "Incentivo",
            "invoiceNumber": None,
            "gross": None,
            "amount": "1200.50",
            "surveyDate": "2026-10-30",
            "payDate": "2026-11-16",
            "payDateGiven": False,
            "projectCode": "1804",
            "classification": None,
            "skipped": False,
            "errors": [],
        }
    ]


def test_bad_files_are_refused_without_breaking(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    url = "/payables/import/preview"
    fields = _import_fields(world)
    wrong = _send(client, auth, url, fields, b"%PDF", "comprovante.pdf")
    assert wrong.status_code == 422
    assert wrong.json()["detail"] == "Envie a planilha em .xlsx ou .csv"
    broken = _send(client, auth, url, fields, b"isto nao e um zip")
    assert broken.status_code == 422
    assert "Não foi possível ler" in broken.json()["detail"]

    too_big = _send(client, auth, url, fields, b"x" * (5 * 1024 * 1024 + 1))
    assert too_big.status_code == 413
    assert too_big.json()["detail"] == "A planilha passa de 5 MB"

    bomb = io.BytesIO()
    with zipfile.ZipFile(bomb, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", b"0" * (50 * 1024 * 1024 + 1))
    response = _send(client, auth, url, fields, bomb.getvalue())
    assert response.status_code == 422
    assert "Não foi possível ler" in response.json()["detail"]

    monkeypatch.setattr("services.payable_import.MAX_ROWS", 1)
    many = _send(client, auth, url, fields, _incentives(("2026-10-30", 3)))
    assert many.status_code == 422
    assert "passa de 1 linhas" in many.json()["detail"]


def test_reference_exposes_the_incentive_deadline(
    client: TestClient, auth: dict[str, str], incentive_project: Project
) -> None:
    projects = client.get("/reference", headers=auth).json()["projects"]
    found = next(p for p in projects if p["code"] == "1804")
    assert (found["projectType"], found["hasIncentive"], found["incentiveDays"]) == (
        "Health",
        True,
        10,
    )


# ---- Detalhes de cada pessoa ----


def _first_detail(client: TestClient, auth: dict[str, str]) -> Any:
    listed = client.get("/payables?mode=tudo", headers=auth).json()["items"][0]
    return client.get(f"/payables/{listed['id']}", headers=auth).json()


def test_each_incentive_keeps_its_survey_date(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    content = _incentives(("2026-10-30", 2), ("2026-10-26", 1))
    _send(client, auth, "/payables/import", _import_fields(world), content)
    details = [
        client.get(f"/payables/{row['id']}", headers=auth).json()
        for row in client.get("/payables?mode=tudo&sort=vencimento", headers=auth).json()["items"]
    ]
    assert [[i["surveyDate"] for i in d["items"]] for d in details] == [
        ["2026-10-26"],
        ["2026-10-30", "2026-10-30"],
    ]
    assert details[0]["items"][0]["grossAmount"] is None


def test_rpa_and_invoice_details_reach_the_screen(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    content = _xlsx(
        [
            ["Nome", "Documento", "Valor", "Número da NF", "Emissão"],
            ["Ana Ribeiro", "NF", 600, "58", datetime(2026, 10, 27)],
            ["Carla Mendes", "RPA", 1000, None, None],
        ]
    )
    fields = _import_fields(world, kind="folha", description="Equipe", dueDate="2026-11-20")
    _send(client, auth, "/payables/import", fields, content)
    items = {i["name"]: i for i in _first_detail(client, auth)["items"]}
    assert (items["Ana Ribeiro"]["invoiceNumber"], items["Ana Ribeiro"]["invoiceDate"]) == (
        "58",
        "2026-10-27",
    )
    assert items["Ana Ribeiro"]["grossAmount"] is None
    assert (items["Carla Mendes"]["grossAmount"], items["Carla Mendes"]["amount"]) == (
        "1000.00",
        "890.00",
    )


def test_duplicate_keeps_the_rpa_gross_but_not_the_month_details(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    content = _xlsx(
        [
            ["Nome", "Documento", "Valor", "Número da NF", "Emissão"],
            ["Ana Ribeiro", "NF", 600, "58", datetime(2026, 10, 27)],
            ["Carla Mendes", "RPA", 1000, None, None],
        ]
    )
    fields = _import_fields(world, kind="folha", description="Equipe", dueDate="2026-11-20")
    _send(client, auth, "/payables/import", fields, content)
    original = _first_detail(client, auth)
    client.post("/payables/batch/duplicate", json={"ids": [original["id"]]}, headers=auth)
    copy = client.get("/payables?mode=mes&ref=2026-12-01", headers=auth).json()["items"][0]
    items = {
        i["name"]: i for i in client.get(f"/payables/{copy['id']}", headers=auth).json()["items"]
    }
    assert items["Carla Mendes"]["grossAmount"] == "1000.00"
    assert items["Ana Ribeiro"]["invoiceNumber"] is None
    assert items["Ana Ribeiro"]["invoiceDate"] is None
    assert items["Ana Ribeiro"]["invoiceStatus"] == "Pendente"
    assert items["Ana Ribeiro"]["surveyDate"] is None


# ---- Anexos ----

PDF = b"%PDF-1.4\n%nota fiscal de teste\n"


@pytest.fixture
def vault(monkeypatch: pytest.MonkeyPatch) -> MemoryFileStore:
    """O cofre de arquivos na memória, com uma chave-mestra nova a cada teste."""
    store = MemoryFileStore()
    monkeypatch.setattr(config, "FILES_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    monkeypatch.setattr(file_vault, "get_store", lambda: store)
    return store


def _attach(
    client: TestClient,
    auth: dict[str, str],
    payable_id: int,
    content: bytes = PDF,
    name: str = "nota.pdf",
    kind: str | None = None,
) -> Any:
    return client.post(
        f"/payables/{payable_id}/attachments",
        files={"file": (name, content)},
        data={"kind": kind} if kind else None,
        headers=auth,
    )


def test_a_document_is_attached_stored_encrypted_and_listed(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    response = _attach(client, auth, created["id"], name="Nota fiscal 58.pdf")
    assert response.status_code == 201, response.text
    (document,) = response.json()["attachments"]
    assert (document["name"], document["size"], document["contentType"]) == (
        "Nota fiscal 58.pdf",
        len(PDF),
        "application/pdf",
    )
    assert document["uploadedBy"] == "Ana"
    assert response.json()["events"][0]["text"] == "Documento incluído: Nota fiscal 58.pdf (0 KB)"
    # o que vai para o cofre é o arquivo cifrado, nunca o original
    ((body, metadata),) = vault.objects.values()
    assert body != PDF and PDF not in body
    assert set(metadata) == {"dek", "dek-nonce", "nonce", "key-version", "sha256"}
    row = client.get(f"/payables/{created['id']}", headers=auth).json()
    assert [a["name"] for a in row["attachments"]] == ["Nota fiscal 58.pdf"]


def test_download_returns_the_same_bytes_and_is_audited(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    attached = _attach(client, auth, created["id"], name="Nota São João.pdf").json()
    document = attached["attachments"][0]
    response = client.get(
        f"/payables/{created['id']}/attachments/{document['id']}/download", headers=auth
    )
    assert response.status_code == 200
    assert response.content == PDF
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment; filename=")
    assert "filename*=UTF-8''Nota%20S%C3%A3o%20Jo%C3%A3o.pdf" in disposition
    events = client.get(f"/payables/{created['id']}", headers=auth).json()["events"]
    assert events[0]["text"] == "Documento baixado: Nota São João.pdf"


def test_removing_a_document_is_logical_and_needs_a_reason(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    document = _attach(client, auth, created["id"]).json()["attachments"][0]
    url = f"/payables/{created['id']}/attachments/{document['id']}"
    assert client.post(f"{url}/remove", json={"reason": ""}, headers=auth).status_code == 422
    removed = client.post(f"{url}/remove", json={"reason": "Nota errada"}, headers=auth)
    assert removed.status_code == 200
    assert removed.json()["attachments"] == []
    assert removed.json()["events"][0]["text"] == "Documento removido: nota.pdf — Nota errada"
    # sai da conta e não baixa mais, mas o arquivo continua no cofre
    assert client.get(f"{url}/download", headers=auth).status_code == 404
    assert client.post(f"{url}/remove", json={"reason": "De novo"}, headers=auth).status_code == 404
    assert len(vault.objects) == 1


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("falso.pdf", b"MZ\x90\x00 isto e um executavel"),
        ("programa.exe", b"MZ\x90\x00"),
        ("foto.png", PDF),
        ("foto.jpg", b"%PDF-1.4"),
        ("vazio.pdf", b""),
        ("planilha.xlsx", b"PK\x03\x04 isto nao e uma planilha"),
        ("sem-extensao", PDF),
        ("entidade.xml", b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>'),
        ("quebrado.xml", b"<nota><aberta></nota>"),
    ],
)
def test_files_of_the_wrong_type_or_content_are_refused(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    vault: MemoryFileStore,
    name: str,
    content: bytes,
) -> None:
    created = create(client, auth, world)
    response = _attach(client, auth, created["id"], content=content, name=name)
    assert response.status_code == 422
    assert response.json()["detail"] == "Envie PDF, imagem, planilha, documento ou XML de até 20 MB"
    assert vault.objects == {}


def test_each_allowed_type_is_accepted_by_its_real_content(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    docx = io.BytesIO()
    with zipfile.ZipFile(docx, "w") as archive:
        archive.writestr("word/document.xml", "<w/>")
    files = {
        "a.pdf": PDF,
        "b.jpg": b"\xff\xd8\xff\xe0 dados",
        "c.jpeg": b"\xff\xd8\xff\xe1 outros dados",
        "d.png": b"\x89PNG\r\n\x1a\n dados",
        "e.xlsx": _xlsx([["a", 1]]),
        "f.docx": docx.getvalue(),
        "g.xml": b"<?xml version='1.0'?><nota><numero>1</numero></nota>",
        "H.PDF": PDF + b"outro",
    }
    for name, content in files.items():
        assert (
            _attach(client, auth, created["id"], content=content, name=name).status_code == 201
        ), name
    types = {
        a["name"]: a["contentType"]
        for a in client.get(f"/payables/{created['id']}", headers=auth).json()["attachments"]
    }
    assert types["b.jpg"] == types["c.jpeg"] == "image/jpeg"
    assert types["g.xml"] == "application/xml"


def test_the_file_name_never_carries_a_path(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    response = _attach(client, auth, created["id"], name="..\\..\\etc/passwd.pdf")
    assert response.status_code == 201
    assert response.json()["attachments"][0]["name"] == "passwd.pdf"
    # o cliente de teste codifica o byte nulo no envio, então a limpeza é conferida direto
    assert attachments._clean_name("no\x00ta\n fiscal \x7f.pdf") == "nota fiscal .pdf"
    assert attachments._clean_name("a" * 300 + ".pdf") == "a" * 196 + ".pdf"


def test_the_size_and_count_limits_are_refused(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    vault: MemoryFileStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created = create(client, auth, world)
    monkeypatch.setattr(attachments, "MAX_BYTES", len(PDF) + 5)
    big = _attach(client, auth, created["id"], content=PDF + b"x" * 6)
    assert (big.status_code, big.json()["detail"]) == (
        422,
        "Envie PDF, imagem, planilha, documento ou XML de até 20 MB",
    )
    monkeypatch.setattr(attachments, "MAX_PER_OWNER", 2)
    assert _attach(client, auth, created["id"], content=PDF + b"1").status_code == 201
    assert _attach(client, auth, created["id"], content=PDF + b"2").status_code == 201
    third = _attach(client, auth, created["id"], content=PDF + b"3")
    assert (third.status_code, third.json()["detail"]) == (409, "Esta conta já tem 2 documentos")


def test_the_same_file_is_not_attached_twice_but_can_come_back_after_removal(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    first = _attach(client, auth, created["id"]).json()["attachments"][0]
    again = _attach(client, auth, created["id"], name="outro-nome.pdf")
    assert (again.status_code, again.json()["detail"]) == (
        409,
        "Este arquivo já está anexado a esta conta",
    )
    client.post(
        f"/payables/{created['id']}/attachments/{first['id']}/remove",
        json={"reason": "Trocar"},
        headers=auth,
    )
    assert _attach(client, auth, created["id"]).status_code == 201


def test_a_document_of_one_account_cannot_be_read_through_another(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    first = create(client, auth, world)
    second = create(client, auth, world)
    document = _attach(client, auth, first["id"]).json()["attachments"][0]
    stolen = client.get(
        f"/payables/{second['id']}/attachments/{document['id']}/download", headers=auth
    )
    assert (stolen.status_code, stolen.json()["detail"]) == (404, "Documento não encontrado")
    missing = _attach(client, auth, 99999)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Conta não encontrada")


def test_without_the_vault_attaching_says_so_and_the_account_still_opens(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created = create(client, auth, world)
    monkeypatch.setattr(config, "FILES_MASTER_KEY", "")
    monkeypatch.setattr(file_vault, "get_store", lambda: MemoryFileStore())
    response = _attach(client, auth, created["id"])
    assert (response.status_code, response.json()["detail"]) == (
        503,
        "Os anexos não estão disponíveis agora. Avise quem cuida do sistema.",
    )
    assert client.get(f"/payables/{created['id']}", headers=auth).status_code == 200
    # nada ficou pela metade
    assert db_count(client, auth, created["id"]) == 0


def db_count(client: TestClient, auth: dict[str, str], payable_id: int) -> int:
    return len(client.get(f"/payables/{payable_id}", headers=auth).json()["attachments"])


def test_a_tampered_file_is_never_delivered(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    document = _attach(client, auth, created["id"]).json()["attachments"][0]
    (key,) = vault.objects
    body, metadata = vault.objects[key]
    vault.objects[key] = (body[:-1] + bytes([body[-1] ^ 1]), metadata)
    response = client.get(
        f"/payables/{created['id']}/attachments/{document['id']}/download", headers=auth
    )
    assert response.status_code == 500
    assert "não confere" in response.json()["detail"]
    events = client.get(f"/payables/{created['id']}", headers=auth).json()["events"]
    assert not any("baixado" in event["text"] for event in events)


def test_the_database_keeps_who_and_when_but_never_the_file(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    vault: MemoryFileStore,
    db_session: Session,
) -> None:
    created = create(client, auth, world)
    _attach(client, auth, created["id"], name="boleto.pdf")
    row = db_session.query(PayableAttachment).one()
    assert (row.name, row.size, row.uploaded_by_user_id) == ("boleto.pdf", len(PDF), 1)
    assert row.fileKey.startswith(f"payable/{created['id']}/") and row.fileKey.endswith(".bin")
    assert len(row.fileSha256) == 64
    assert row.deletedAt is None


def test_the_detail_says_who_created_and_who_changed_last_and_a_download_is_not_a_change(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    detail = client.get(f"/payables/{created['id']}", headers=auth).json()
    assert (detail["createdBy"], detail["updatedBy"]) == ("Ana", "Ana")
    assert detail["createdAt"] and detail["updatedAt"]
    document = _attach(client, auth, created["id"]).json()["attachments"][0]
    client.get(f"/payables/{created['id']}/attachments/{document['id']}/download", headers=auth)
    after = client.get(f"/payables/{created['id']}", headers=auth).json()
    included = next(e for e in after["events"] if e["text"].startswith("Documento incluído"))
    assert after["events"][0]["text"].startswith("Documento baixado")
    assert after["updatedAt"] == included["createdAt"]


# ---- Tipo e nome do documento ----


def _document_url(payable_id: int, document: dict[str, Any]) -> str:
    return f"/payables/{payable_id}/attachments/{document['id']}"


def test_the_document_type_is_other_unless_chosen_and_a_wrong_one_is_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    plain = _attach(client, auth, created["id"]).json()["attachments"][0]
    assert plain["kind"] == "outro"
    boleto = _attach(
        client, auth, created["id"], content=PDF + b"2", name="boleto.pdf", kind="boleto"
    )
    assert boleto.status_code == 201
    assert [a["kind"] for a in boleto.json()["attachments"]] == ["outro", "boleto"]
    wrong = _attach(client, auth, created["id"], content=PDF + b"3", name="x.pdf", kind="foto")
    assert (wrong.status_code, wrong.json()["detail"]) == (422, "Escolha o tipo do documento")
    assert len(vault.objects) == 2  # o recusado nem chegou ao cofre


def test_renaming_keeps_the_extension_and_the_stored_file_and_is_audited(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    document = _attach(client, auth, created["id"]).json()["attachments"][0]
    url = _document_url(created["id"], document)

    renamed = client.patch(url, json={"name": "Nota fiscal 58"}, headers=auth)
    assert renamed.status_code == 200, renamed.text
    assert [a["name"] for a in renamed.json()["attachments"]] == ["Nota fiscal 58.pdf"]
    assert renamed.json()["events"][0]["text"] == (
        "Documento renomeado: nota.pdf → Nota fiscal 58.pdf"
    )
    # o arquivo guardado é o mesmo: só o nome mudou
    assert len(vault.objects) == 1
    downloaded = client.get(f"{url}/download", headers=auth)
    assert downloaded.content == PDF
    assert "filename*=UTF-8''Nota%20fiscal%2058.pdf" in downloaded.headers["content-disposition"]

    for typed, expected in [
        ("nota.PDF", "nota.PDF"),  # já termina com a extensão: fica como veio
        ("nota.exe", "nota.exe.pdf"),  # renomear nunca troca a extensão do arquivo
        ("..\\..\\etc/passwd", "passwd.pdf"),  # sem pasta
        ("a" * 250, "a" * 196 + ".pdf"),  # até 200 letras, com a extensão
    ]:
        out = client.patch(url, json={"name": typed}, headers=auth)
        assert out.json()["attachments"][0]["name"] == expected, typed

    for blank in ["", "   ", "..."]:
        refused = client.patch(url, json={"name": blank}, headers=auth)
        assert (refused.status_code, refused.json()["detail"]) == (
            422,
            "Informe o nome do documento",
        )


def test_changing_the_type_is_audited_and_changing_nothing_is_not(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    created = create(client, auth, world)
    document = _attach(client, auth, created["id"]).json()["attachments"][0]
    url = _document_url(created["id"], document)

    changed = client.patch(url, json={"kind": "boleto"}, headers=auth)
    assert changed.json()["attachments"][0]["kind"] == "boleto"
    assert (
        changed.json()["events"][0]["text"] == "Tipo do documento mudou: nota.pdf (Outro → Boleto)"
    )

    events = len(changed.json()["events"])
    same = client.patch(url, json={"kind": "boleto", "name": "nota.pdf"}, headers=auth)
    assert same.status_code == 200 and len(same.json()["events"]) == events

    both = client.patch(url, json={"name": "boleto de março", "kind": "nota"}, headers=auth)
    assert [e["text"] for e in both.json()["events"][:2]] == [
        "Tipo do documento mudou: boleto de março.pdf (Boleto → Nota fiscal)",
        "Documento renomeado: nota.pdf → boleto de março.pdf",
    ]

    empty = client.patch(url, json={}, headers=auth)
    assert (empty.status_code, empty.json()["detail"]) == (
        422,
        "Mude o nome ou o tipo do documento",
    )
    wrong = client.patch(url, json={"kind": "foto"}, headers=auth)
    assert (wrong.status_code, wrong.json()["detail"]) == (422, "Escolha o tipo do documento")
    assert (
        client.get(f"/payables/{created['id']}", headers=auth).json()["attachments"][0]["kind"]
        == "nota"
    )


def test_a_removed_or_foreign_document_cannot_be_renamed(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    first = create(client, auth, world)
    second = create(client, auth, world)
    document = _attach(client, auth, first["id"]).json()["attachments"][0]
    url = _document_url(first["id"], document)

    foreign = client.patch(
        f"/payables/{second['id']}/attachments/{document['id']}", json={"name": "x"}, headers=auth
    )
    assert (foreign.status_code, foreign.json()["detail"]) == (404, "Documento não encontrado")
    client.post(f"{url}/remove", json={"reason": "Trocar"}, headers=auth)
    gone = client.patch(url, json={"name": "x"}, headers=auth)
    assert (gone.status_code, gone.json()["detail"]) == (404, "Documento não encontrado")
    missing = client.patch("/payables/99999/attachments/1", json={"name": "x"}, headers=auth)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Conta não encontrada")


# ---- Imprimir resultados ----


def test_print_brings_all_filtered_rows_in_the_columns_that_fit_a_page_with_totals(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    for value in range(1, 15):  # 14 contas: mais que uma página da lista
        create(client, auth, world, amount=f"{value}.00")
    response = client.get(f"/payables/print?supplier={world['supplier'].id}", headers=auth)
    assert response.status_code == 200
    table = response.json()
    assert "fornecedor=Gráfica Ponto Certo" in table["title"]
    assert table["headers"] == [
        "Vencimento",
        "Fornecedor",
        "Descrição",
        "Documento",
        "Projeto",
        "Situação",
        "Valor líquido",
        "Pago",
        "Pendente",
    ]
    assert len(table["rows"]) == 14
    first = table["rows"][0]
    assert first[0] == today().strftime("%d/%m/%Y")
    assert first[5:] == ["Vence hoje", "1,00", "0,00", "1,00"]
    assert table["totals"] == ["", "", "", "", "", "", "105,00", "0,00", "105,00"]


def test_print_follows_the_filters_and_shows_net_paid_and_pending(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    paid = create(
        client,
        auth,
        world,
        description="Aluguel da sala",
        amount="1000.00",
        adjustments=[{"kind": "desconto", "description": "Pontualidade", "amount": "100.00"}],
    )
    client.post(
        f"/payables/{paid['id']}/payments", json=payment(world, amount="300.00"), headers=auth
    )
    create(client, auth, world, description="Outra conta", amount="50.00")

    table = client.get("/payables/print?search=aluguel", headers=auth).json()

    assert "busca: aluguel" in table["title"]
    assert [row[2] for row in table["rows"]] == ["Aluguel da sala"]
    assert table["rows"][0][6:] == ["900,00", "300,00", "600,00"]
    assert table["totals"][6:] == ["900,00", "300,00", "600,00"]


def test_print_with_no_result_has_no_rows_and_zeroed_totals(
    client: TestClient, auth: dict[str, str]
) -> None:
    table = client.get("/payables/print?search=nada-assim-existe", headers=auth).json()
    assert table["rows"] == []
    assert table["totals"][6:] == ["0,00", "0,00", "0,00"]


# ---- Pagar em ----


def test_pay_on_starts_empty_and_is_set_only_by_editing(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    # a nova conta não pede nem guarda "Pagar em": ele entra só na edição
    created = create(client, auth, world, payOn="2026-11-12")
    assert client.get(f"/payables/{created['id']}", headers=auth).json()["payOn"] is None

    edited = _patch(client, auth, created, payOn="2026-11-12")
    assert edited.status_code == 200, edited.text
    assert edited.json()["payOn"] == "2026-11-12"
    assert edited.json()["events"][0]["text"] == "Alterada: pagar em — → 12/11/2026"


def test_pay_on_can_change_be_cleared_and_is_left_alone_when_not_sent(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    _patch(client, auth, created, payOn="2026-11-12")

    untouched = _patch(client, auth, created, notes="Só uma observação").json()
    assert untouched["payOn"] == "2026-11-12"

    again = _patch(client, auth, created, payOn="2026-11-12").json()  # igual: nada a registrar
    assert not any("pagar em" in e["text"] for e in again["events"][:1])

    moved = _patch(client, auth, created, payOn="2026-11-20").json()
    assert moved["events"][0]["text"] == "Alterada: pagar em 12/11/2026 → 20/11/2026"

    cleared = _patch(client, auth, created, payOn=None).json()
    assert cleared["payOn"] is None
    assert cleared["events"][0]["text"] == "Alterada: pagar em 20/11/2026 → —"


def test_pay_on_only_informs_it_does_not_move_the_due_date_the_list_or_the_situation(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    before = client.get("/payables", headers=auth).json()
    _patch(client, auth, created, payOn="2030-01-31")
    after = client.get("/payables", headers=auth).json()
    assert after["items"] == before["items"]
    assert after["indicators"] == before["indicators"]
    detail = client.get(f"/payables/{created['id']}", headers=auth).json()
    assert (detail["dueDate"], detail["situation"]) == (created["dueDate"], created["situation"])
