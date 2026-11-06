import io
import zipfile
from collections.abc import Callable
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy.orm import Session

from models.payable import Payable, PayableEvent, PayableItem, PayablePayment
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
        ("post", "/payables/1/replace"),
        ("patch", "/payables/1"),
        ("post", "/payables/1/cancel"),
        ("post", "/payables/1/payments"),
        ("post", "/payables/1/payments/1/reverse"),
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
        ("post", "/payables/1/replace"),
        ("patch", "/payables/1"),
        ("post", "/payables/1/cancel"),
        ("post", "/payables/1/payments"),
        ("post", "/payables/1/payments/1/reverse"),
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
    assert lines[2].endswith(";Vence hoje;1,00;0,00;1,00")


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
        "projectId": world["project"].id,
        "categoryId": world["category"].id,
        "companyId": world["company"].id,
        "unitId": world["unit"].id,
        "costCenterId": world["cost_center"].id,
        "paymentMethodId": world["method"].id,
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
        _import_fields(world, projectId=world["closed"].id),
        content,
    )
    assert closed.status_code == 409
    missing = _send(
        client, auth, "/payables/import/preview", _import_fields(world, projectId=99999), content
    )
    assert missing.status_code == 422
    nothing = _xlsx([INCENTIVE_HEADER, ["", None, None, 100, "2026-10-30", None]])
    empty = _send(client, auth, "/payables/import", _import_fields(world), nothing)
    assert empty.status_code == 422
    assert (
        empty.json()["detail"] == "Nenhuma linha da planilha pode entrar. Corrija e envie de novo"
    )


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
