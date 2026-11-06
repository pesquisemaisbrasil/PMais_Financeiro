# ruff: noqa: F811  (as fixtures importadas de test_receivables são reusadas pelo nome)
"""Acréscimos, descontos e impostos do título a receber: o líquido é o que se recebe."""

from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.test_receivables import auth, create, days, receipt, world  # noqa: F401

NET_ZERO = "O valor líquido precisa ser maior que zero: os descontos e impostos passam do valor"


def line(kind: str, description: str, amount: str) -> dict[str, str]:
    return {"kind": kind, "description": description, "amount": amount}


LINES = [
    line("acrescimo", "Correção monetária", "20.00"),
    line("desconto", "Desconto combinado", "50.00"),
    line("imposto", "ISS retido", "30.00"),
]


def detail(client: TestClient, auth: dict[str, str], title_id: int) -> Any:
    return client.get(f"/receivables/{title_id}", headers=auth).json()


def edit(client: TestClient, auth: dict[str, str], title: Any, **fields: Any) -> Any:
    payload = {
        "description": title["description"],
        "amount": str(title["amount"]),
        "dueDate": title["dueDate"],
        **fields,
    }
    return client.patch(f"/receivables/{title['id']}", json=payload, headers=auth)


def test_the_net_is_gross_plus_surcharges_minus_discounts_and_taxes(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00", adjustments=LINES)
    assert (Decimal(title["amount"]), Decimal(title["net"]), Decimal(title["pending"])) == (
        Decimal("1000.00"),
        Decimal("940.00"),
        Decimal("940.00"),
    )
    opened = detail(client, auth, title["id"])
    assert [(a["kind"], a["description"], Decimal(a["amount"])) for a in opened["adjustments"]] == [
        ("acrescimo", "Correção monetária", Decimal("20.00")),
        ("desconto", "Desconto combinado", Decimal("50.00")),
        ("imposto", "ISS retido", Decimal("30.00")),
    ]


def test_receiving_follows_the_net(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00", adjustments=LINES)
    path = f"/receivables/{title['id']}/receipts"
    refused = client.post(path, json=receipt(world, amount="940.01"), headers=auth)
    assert refused.status_code == 409
    assert "940,00" in refused.json()["detail"]
    assert client.post(path, json=receipt(world, amount="940.00"), headers=auth).status_code == 200
    assert detail(client, auth, title["id"])["situation"] == "recebido"


@pytest.mark.parametrize("amount", ["1000.00", "1500.00"])
def test_a_zero_or_negative_net_is_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], amount: str
) -> None:
    from tests.test_receivables import body

    response = client.post(
        "/receivables",
        json=body(world, amount="1000.00", adjustments=[line("desconto", "Tudo", amount)]),
        headers=auth,
    )
    assert (response.status_code, response.json()["detail"]) == (422, NET_ZERO)


def test_editing_replaces_the_list_and_the_history_says_what_changed(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00", adjustments=LINES)
    response = edit(
        client,
        auth,
        title,
        adjustments=[line("acrescimo", "Juros", "5.00"), line("imposto", "ISS retido", "30.00")],
    )
    assert response.status_code == 200, response.text
    opened = response.json()
    assert Decimal(opened["net"]) == Decimal("975.00")
    assert opened["events"][0]["text"] == (
        "Alterada: acréscimos R$ 20,00 → R$ 5,00; descontos R$ 50,00 → R$ 0,00"
    )


def test_not_sending_the_list_keeps_it_and_an_empty_list_clears_it(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00", adjustments=LINES)
    assert edit(client, auth, title, description="Outro nome").status_code == 200
    assert Decimal(detail(client, auth, title["id"])["net"]) == Decimal("940.00")
    assert edit(client, auth, title, adjustments=[]).status_code == 200
    cleared = detail(client, auth, title["id"])
    assert (Decimal(cleared["net"]), cleared["adjustments"]) == (Decimal("1000.00"), [])


def test_the_net_cannot_drop_below_what_was_received(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    title = create(client, auth, world, amount="1000.00", dueDate=days(5))
    client.post(
        f"/receivables/{title['id']}/receipts", json=receipt(world, amount="900.00"), headers=auth
    )
    response = edit(client, auth, title, adjustments=[line("imposto", "ISS retido", "150.00")])
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "O novo valor é menor do que já foi recebido",
    )


def test_the_export_has_the_gross_the_three_totals_and_the_net(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, amount="1000.00", adjustments=LINES)
    text = client.get("/receivables/export?mode=tudo", headers=auth).content.decode("utf-8")
    lines = text.lstrip("﻿").split("\r\n")
    header = lines[1].split(";")
    row = dict(zip(header, lines[2].split(";"), strict=True))
    assert (row["Bruto"], row["Acréscimos"], row["Descontos"], row["Impostos"], row["Líquido"]) == (
        "1.000,00",
        "20,00",
        "50,00",
        "30,00",
        "940,00",
    )
