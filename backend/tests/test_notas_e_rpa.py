# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
"""Notas e RPA (PF-60): a NF pendente, com o registro da nota que chegou, e a lista de RPA pelo
mês do pagamento (decisões do Bruno, 26/11/2026; spec documentos-fiscais)."""

import io
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from models.payable import Payable, PayableEvent, PayableItem
from models.user import User
from services.auth import create_access_token
from services.payable import today
from tests.test_payables import _import_fields, _send, _xlsx, auth, world  # noqa: F401

HEADER = ["Nome", "Documento", "Valor", "Número da NF", "Emissão"]
THIS_MONTH = today().strftime("%Y-%m")


def payroll(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    rows: list[list[Any]],
    description: str = "Equipe de campo · novembro",
) -> Payable:
    fields = _import_fields(world, kind="folha", description=description, dueDate="2026-11-20")
    response = _send(client, auth, "/payables/import", fields, _xlsx([HEADER, *rows]))
    assert response.status_code == 201, response.text
    return db_session.query(Payable).filter(Payable.description == description).one()


def person(payable: Payable, name: str) -> PayableItem:
    return next(item for item in payable.items if item.name == name)


def pay(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], payable: Payable, amount: str
) -> None:
    response = client.post(
        f"/payables/{payable.id}/payments",
        json={
            "paidOn": today().isoformat(),
            "amount": amount,
            "bankAccountId": world["account"].id,
            "paymentMethodId": world["method"].id,
        },
        headers=auth,
    )
    assert response.status_code == 200, response.text


def pending(client: TestClient, auth: dict[str, str], **params: Any) -> Any:
    response = client.get("/fiscal/pending-invoices", params=params, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def rpa(client: TestClient, auth: dict[str, str], **params: Any) -> Any:
    response = client.get("/fiscal/rpa", params={"month": THIS_MONTH, **params}, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def test_nf_pending_lists_who_has_no_note_and_registering_the_note_removes_the_warning(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    team = payroll(
        client,
        auth,
        world,
        db_session,
        [
            ["Ana Ribeiro", "NF", 600, "58", datetime(2026, 10, 27)],
            ["Bruno Lima", "NF", 600, None, None],
            ["Carla Mendes", "RPA", 1000, None, None],
            ["Davi Souza", "NF", 300, None, None],
        ],
    )
    # recebida pelo status, mesmo sem o número (como vem do Connect): não é pendente
    person(team, "Davi Souza").invoiceStatus = "Recebida"
    db_session.commit()

    data = pending(client, auth)

    assert [(r["name"], r["project"], r["amount"], r["situation"]) for r in data["rows"]] == [
        ("Bruno Lima", "PRJ-1804", "600.00", "A pagar")
    ]
    assert data["rows"][0]["payableId"] == team.id
    assert data["total"] == "600.00"
    assert pending(client, auth, search="lima bruno")["rows"] != []
    assert pending(client, auth, search="carla")["rows"] == []
    assert pending(client, auth, project=world["other_project"].id)["rows"] == []

    bruno = person(team, "Bruno Lima")
    response = client.put(
        f"/fiscal/items/{bruno.id}/invoice",
        json={"number": " 77 ", "issueDate": today().isoformat()},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    assert response.json()["invoiceNumber"] == "77"
    assert pending(client, auth)["rows"] == []
    db_session.refresh(bruno)
    assert (bruno.invoiceStatus, bruno.invoiceNumber, bruno.invoiceDate) == (
        "Recebida",
        "77",
        today(),
    )
    history = [e.text for e in db_session.query(PayableEvent).filter_by(payable_id=team.id)]
    assert f"NF 77 registrada para Bruno Lima, emitida em {today():%d/%m/%Y}" in history


def test_registering_a_note_is_refused_with_the_reason(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    team = payroll(
        client,
        auth,
        world,
        db_session,
        [["Bruno Lima", "NF", 600, None, None], ["Carla Mendes", "RPA", 1000, None, None]],
    )
    bruno, carla = person(team, "Bruno Lima"), person(team, "Carla Mendes")
    tomorrow = (today() + timedelta(days=1)).isoformat()
    cases = [
        (bruno.id, {"number": "  ", "issueDate": today().isoformat()}, 422, None),
        (bruno.id, {"number": "77"}, 422, None),
        (bruno.id, {"number": "77", "issueDate": tomorrow}, 422, "after"),
        (carla.id, {"number": "77", "issueDate": today().isoformat()}, 422, "rpa"),
        (999999, {"number": "77", "issueDate": today().isoformat()}, 404, "missing"),
    ]
    details = {
        None: "Informe o número e a data de emissão da nota",
        "after": "A data de emissão não pode ser depois de hoje",
        "rpa": "Essa pessoa não recebe por NF",
        "missing": "Pessoa não encontrada",
    }
    for item_id, body, code, reason in cases:
        response = client.put(f"/fiscal/items/{item_id}/invoice", json=body, headers=auth)
        assert (response.status_code, response.json()["detail"]) == (code, details[reason])
    assert client.put(f"/fiscal/items/{bruno.id}/invoice", json={"number": "1"}).status_code == 401

    # lançamento cancelado: sai da lista e não aceita a nota
    team.canceledAt = datetime.now(UTC)
    db_session.commit()
    assert pending(client, auth)["rows"] == []
    response = client.put(
        f"/fiscal/items/{bruno.id}/invoice",
        json={"number": "77", "issueDate": today().isoformat()},
        headers=auth,
    )
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "Esse lançamento foi cancelado",
    )


def test_rpa_month_lists_who_was_paid_in_the_month_with_gross_inss_and_net(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    team = payroll(
        client,
        auth,
        world,
        db_session,
        [["Carla Mendes", "RPA", 1000, None, None], ["Davi Souza", "RPA", 500, None, None]],
    )
    later = payroll(
        client,
        auth,
        world,
        db_session,
        [["Eva Martins", "RPA", 300, None, None], ["Fábio Reis", "NF", 100, "9", None]],
        description="Equipe de campo · segunda quinzena",
    )
    # ainda não pago: não entra
    assert rpa(client, auth)["rows"] == []

    pay(client, auth, world, team, "1335.00")
    # baixa parcial do outro lançamento: não dá para saber quem recebeu
    pay(client, auth, world, later, "50.00")

    data = rpa(client, auth)

    assert [(r["name"], r["gross"], r["inss"], r["net"]) for r in data["rows"]] == [
        ("Carla Mendes", "1000.00", "110.00", "890.00"),
        ("Davi Souza", "500.00", "55.00", "445.00"),
    ]
    assert data["rows"][0]["paidOn"] == today().isoformat()
    assert data["rows"][0]["description"] == "Equipe de campo · novembro"
    assert (data["gross"], data["inss"], data["net"]) == ("1500.00", "165.00", "1335.00")
    assert rpa(client, auth, company=world["company"].id)["rows"] != []

    # a pessoa paga pelo comprovante sabe o próprio dia, mesmo com o lançamento em baixa parcial
    person(later, "Eva Martins").paidOn = today()
    db_session.commit()
    assert [r["name"] for r in rpa(client, auth)["rows"]] == [
        "Carla Mendes",
        "Davi Souza",
        "Eva Martins",
    ]
    other = (today().replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    assert rpa(client, auth, month=other)["rows"] == []
    response = client.get("/fiscal/rpa", params={"month": "2026-13"}, headers=auth)
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Escolha o mês no formato AAAA-MM",
    )


def test_the_inss_rate_comes_from_the_registers_and_counts_for_new_imports(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    make_user: Callable[..., User],
) -> None:
    admin = make_user(email="admin@pesquisemais.com.br", role="admin")
    admin_auth = {"Authorization": f"Bearer {create_access_token(admin.id)}"}
    body = {"rates": [{"code": "inss", "rate": "10.00"}]}
    assert client.put("/tax-rates", json=body, headers=admin_auth).status_code == 200
    # o INSS do RPA não é retenção da conta a pagar: o formulário da conta não o recebe
    reference = client.get("/reference", headers=auth).json()
    assert "inss" not in [row["code"] for row in reference["taxRates"]]

    team = payroll(client, auth, world, db_session, [["Carla Mendes", "RPA", 1000, None, None]])

    carla = person(team, "Carla Mendes")
    assert (carla.grossAmount, carla.amount) == (Decimal("1000.00"), Decimal("900.00"))


def test_export_has_the_people_the_totals_and_the_month(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    team = payroll(client, auth, world, db_session, [["Carla Mendes", "RPA", 1000, None, None]])
    pay(client, auth, world, team, "890.00")

    response = client.get("/fiscal/rpa/export", params={"month": THIS_MONTH}, headers=auth)

    assert response.status_code == 200
    assert response.headers["content-disposition"] == (
        f'attachment; filename="rpa-{THIS_MONTH}.xlsx"'
    )
    sheet = load_workbook(io.BytesIO(response.content)).active
    assert sheet["A1"].value.startswith("Lista de RPA · pagos em ")
    assert [cell.value for cell in sheet[2]] == [
        "Pessoa",
        "Projeto",
        "Nº do lançamento",
        "Pago em",
        "Bruto",
        "INSS",
        "Líquido",
    ]
    assert [cell.value for cell in sheet[3]][:3] == ["Carla Mendes", "PRJ-1804", team.id]
    total = [cell.value for cell in sheet[4]]
    assert (total[0], total[4], total[5], total[6]) == ("Total", 1000, 110, 890)
    assert client.get("/fiscal/rpa", params={"month": THIS_MONTH}).status_code == 401
