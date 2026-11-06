# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
"""Acréscimos, descontos e impostos da conta a pagar: o líquido é o que se paga."""

from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.payable import Payable, PayableItem
from tests.test_payables import auth, body, create, payment, world  # noqa: F401
from tests.test_recurrence import recurring

NET_ZERO = "O valor líquido precisa ser maior que zero: os descontos e impostos passam do valor"


def line(kind: str, description: str, amount: str) -> dict[str, str]:
    return {"kind": kind, "description": description, "amount": amount}


LINES = [
    line("acrescimo", "Multa por atraso", "20.00"),
    line("desconto", "Desconto combinado", "50.00"),
    line("imposto", "ISS retido", "30.00"),
]


def detail(client: TestClient, auth: dict[str, str], payable_id: int) -> Any:
    return client.get(f"/payables/{payable_id}", headers=auth).json()


def edit(client: TestClient, auth: dict[str, str], created: Any, **fields: Any) -> Any:
    payload = {
        "description": created["description"],
        "amount": str(created["grossAmount"]),
        "dueDate": created["dueDate"],
        **fields,
    }
    return client.patch(f"/payables/{created['id']}", json=payload, headers=auth)


def test_the_net_is_gross_plus_surcharges_minus_discounts_and_taxes(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, amount="1000.00", adjustments=LINES)
    assert (Decimal(created["amount"]), Decimal(created["grossAmount"])) == (
        Decimal("940.00"),
        Decimal("1000.00"),
    )
    assert Decimal(created["pending"]) == Decimal("940.00")
    opened = detail(client, auth, created["id"])
    assert [(a["kind"], a["description"], Decimal(a["amount"])) for a in opened["adjustments"]] == [
        ("acrescimo", "Multa por atraso", Decimal("20.00")),
        ("desconto", "Desconto combinado", Decimal("50.00")),
        ("imposto", "ISS retido", Decimal("30.00")),
    ]
    assert opened["events"][0]["text"].endswith(
        "(líquido R$ 940,00) · vence "
        + opened["dueDate"][8:]
        + "/"
        + opened["dueDate"][5:7]
        + "/"
        + opened["dueDate"][:4]
    )


def test_a_conta_without_adjustments_is_unchanged(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, amount="1000.00")
    assert (created["amount"], created["grossAmount"], created["pending"]) == (
        "1000.00",
        "1000.00",
        "1000.00",
    )
    assert detail(client, auth, created["id"])["adjustments"] == []


def test_payment_and_situation_follow_the_net(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, amount="1000.00", adjustments=LINES)
    path = f"/payables/{created['id']}/payments"
    refused = client.post(path, json=payment(world, amount="940.01"), headers=auth)
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "O valor passa do saldo pendente (R$ 940,00)",
    )
    assert client.post(path, json=payment(world, amount="940.00"), headers=auth).status_code == 200
    paid = detail(client, auth, created["id"])
    assert (paid["situation"], paid["pending"], paid["paid"]) == ("pago", "0.00", "940.00")


def test_the_list_totals_and_the_filtered_sum_use_the_net(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, amount="1000.00", adjustments=LINES)
    create(client, auth, world, amount="100.00")
    listing = client.get("/payables?mode=tudo", headers=auth).json()
    assert Decimal(listing["filteredAmount"]) == Decimal("1040.00")
    assert Decimal(listing["filteredPending"]) == Decimal("1040.00")
    assert {Decimal(row["amount"]) for row in listing["items"]} == {
        Decimal("940.00"),
        Decimal("100.00"),
    }


def test_the_export_has_the_gross_the_three_totals_and_the_net(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, amount="1000.00", adjustments=LINES)
    lines = client.get("/payables/export?mode=tudo", headers=auth).text.lstrip("﻿").splitlines()
    assert "Valor bruto;Acréscimos;Descontos;Impostos;Valor líquido;Pago;Pendente" in lines[1]
    assert lines[2].endswith(";1.000,00;20,00;50,00;30,00;940,00;0,00;940,00") or lines[2].endswith(
        ";1000,00;20,00;50,00;30,00;940,00;0,00;940,00"
    )


@pytest.mark.parametrize(
    ("adjustments", "message"),
    [
        ([line("desconto", "Tudo", "1000.00")], NET_ZERO),
        ([line("imposto", "Muito", "1500.00")], NET_ZERO),
    ],
)
def test_a_zero_or_negative_net_is_refused(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    adjustments: list[dict[str, str]],
    message: str,
) -> None:
    response = client.post(
        "/payables", json=body(world, amount="1000.00", adjustments=adjustments), headers=auth
    )
    assert (response.status_code, response.json()["detail"]) == (422, message)


@pytest.mark.parametrize(
    "bad",
    [
        line("juros", "Tipo que não existe", "10.00"),
        line("imposto", "", "10.00"),
        line("imposto", "Sem valor", "0.00"),
        line("imposto", "Negativo", "-5.00"),
        line("imposto", "Muitas casas", "1.234"),
    ],
)
def test_malformed_lines_are_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], bad: dict[str, str]
) -> None:
    response = client.post("/payables", json=body(world, adjustments=[bad]), headers=auth)
    assert response.status_code == 422


def test_editing_replaces_the_whole_list_and_the_history_says_what_changed(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, amount="1000.00", adjustments=LINES)
    response = edit(
        client,
        auth,
        created,
        adjustments=[line("acrescimo", "Juros", "5.00"), line("imposto", "ISS retido", "30.00")],
    )
    assert response.status_code == 200, response.text
    opened = detail(client, auth, created["id"])
    assert Decimal(opened["amount"]) == Decimal("975.00")
    assert [a["description"] for a in opened["adjustments"]] == ["Juros", "ISS retido"]
    assert opened["events"][0]["text"] == (
        "Alterada: acréscimos R$ 20,00 → R$ 5,00; descontos R$ 50,00 → R$ 0,00"
    )


def test_not_sending_the_list_keeps_it_and_an_empty_list_clears_it(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, amount="1000.00", adjustments=LINES)
    assert edit(client, auth, created, notes="Só uma observação").status_code == 200
    assert Decimal(detail(client, auth, created["id"])["amount"]) == Decimal("940.00")
    assert edit(client, auth, created, adjustments=[]).status_code == 200
    cleared = detail(client, auth, created["id"])
    assert (Decimal(cleared["amount"]), cleared["adjustments"]) == (Decimal("1000.00"), [])


def test_the_same_list_again_is_not_a_change(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, amount="1000.00", adjustments=LINES)
    before = len(detail(client, auth, created["id"])["events"])
    assert edit(client, auth, created, adjustments=LINES).status_code == 200
    assert len(detail(client, auth, created["id"])["events"]) == before


def test_the_net_cannot_drop_below_what_was_already_paid(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, amount="1000.00")
    client.post(
        f"/payables/{created['id']}/payments", json=payment(world, amount="900.00"), headers=auth
    )
    response = edit(client, auth, created, adjustments=[line("imposto", "ISS retido", "150.00")])
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "O novo valor é menor do que já foi pago",
    )
    assert (
        edit(
            client, auth, created, adjustments=[line("imposto", "ISS retido", "100.00")]
        ).status_code
        == 200
    )


def test_a_zero_net_on_edit_is_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, amount="1000.00")
    response = edit(client, auth, created, adjustments=[line("desconto", "Tudo", "1000.00")])
    assert (response.status_code, response.json()["detail"]) == (422, NET_ZERO)


def test_a_lancamento_with_people_has_no_adjustments(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    created = create(client, auth, world, amount="100.00")
    payable = db_session.get(Payable, created["id"])
    assert payable is not None
    payable.items.append(PayableItem(name="Ana", documentType="Sem NF", amount=Decimal("100.00")))
    db_session.commit()
    response = edit(client, auth, created, adjustments=[line("imposto", "INSS", "10.00")])
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "Lançamento com itens: acréscimos, descontos e impostos não se aplicam",
    )


def test_duplicating_copies_the_adjustments(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    created = create(client, auth, world, amount="1000.00", adjustments=LINES)
    response = client.post("/payables/batch/duplicate", json={"ids": [created["id"]]}, headers=auth)
    assert response.status_code == 200, response.text
    copy_id = max(
        row["id"] for row in client.get("/payables?mode=tudo", headers=auth).json()["items"]
    )
    copied = detail(client, auth, copy_id)
    assert Decimal(copied["amount"]) == Decimal("940.00")
    assert len(copied["adjustments"]) == 3


def test_monthly_repetition_repeats_the_lines_and_installments_refuse_them(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ok = client.post(
        "/payables/recurrence",
        json=recurring(world, "mensal", 3, amount="1000.00", adjustments=LINES),
        headers=auth,
    )
    assert ok.status_code == 201, ok.text
    for payable_id in ok.json()["ids"]:
        assert Decimal(detail(client, auth, payable_id)["amount"]) == Decimal("940.00")
    refused = client.post(
        "/payables/recurrence",
        json=recurring(world, "parcelado", 3, amount="1000.00", adjustments=LINES),
        headers=auth,
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "Em conta parcelada, lance acréscimos, descontos e impostos em cada parcela depois",
    )
