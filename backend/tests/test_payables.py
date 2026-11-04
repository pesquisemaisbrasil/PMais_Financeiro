from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
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
        ("patch", "/payables/1"),
        ("post", "/payables/1/cancel"),
        ("post", "/payables/1/payments"),
        ("post", "/payables/1/payments/1/reverse"),
    ],
)
def test_every_route_requires_a_session(client: TestClient, method: str, path: str) -> None:
    assert getattr(client, method)(path).status_code == 401


def test_role_without_finance_access_is_refused(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    user = make_user(email="outro@pesquisemais.com.br", role="auditor")
    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    assert client.get("/payables", headers=headers).status_code == 403


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
    assert "passa do saldo" in response.json()["detail"]


def test_surcharge_and_discount_change_what_is_due(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world)
    path = f"/payables/{created['id']}/payments"
    paid = client.post(
        path, json=payment(world, amount="1050.00", surcharge="50.00"), headers=auth
    ).json()
    assert paid["situation"] == "pago"

    other = create(client, auth, world)
    paid_other = client.post(
        f"/payables/{other['id']}/payments",
        json=payment(world, amount="900.00", discount="100.00"),
        headers=auth,
    ).json()
    assert paid_other["situation"] == "pago"


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
    assert client.get("/payables?search=100%25", headers=auth).json()["total"] == 0
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
