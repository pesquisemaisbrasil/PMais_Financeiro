# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
"""Edição em lote, conta por conta (pedido do Bruno, 18/11/2026, com o print "Edição em Lote" do
sistema antigo; spec contas-a-pagar, Ajustes): cada linha marcada muda descrição, fornecedor, valor,
vencimento, pagar em, competência e observação, com as travas da edição de uma conta. Uma linha
recusada não grava nenhuma."""

from collections.abc import Callable
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.reference import Supplier
from models.user import User
from services.auth import create_access_token
from services.payable import today
from tests.test_payables import auth, body, create, payment, world  # noqa: F401

URL = "/payables/batch/edit"


def _day(days: int) -> str:
    return (today() + timedelta(days=days)).isoformat()


def test_each_marked_row_gets_its_own_values(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    first = create(client, auth, world, description="Impressão de questionários")
    second = create(client, auth, world, description="Aluguel da sala")
    other = Supplier(nickname="Exata", name="Contabilidade Exata")
    db_session.add(other)
    db_session.commit()
    rows = [
        {
            "id": first["id"],
            "description": "Impressão de novembro",
            "amount": "1200.00",
            "dueDate": _day(5),
            "supplierId": other.id,
            "payOn": _day(3),
            "competence": "2026-12",
            "notes": "Nota em revisão",
        },
        {
            "id": second["id"],
            "description": "Aluguel da sala",
            "amount": "1000.00",
            "dueDate": _day(10),
        },
    ]
    response = client.post(URL, json={"rows": rows}, headers=auth)
    assert response.status_code == 200, response.text
    assert response.json() == {"count": 2}

    edited = client.get(f"/payables/{first['id']}", headers=auth).json()
    assert (edited["description"], edited["dueDate"], edited["payOn"]) == (
        "Impressão de novembro",
        _day(5),
        _day(3),
    )
    assert (edited["competence"], edited["notes"], edited["supplierId"]) == (
        "2026-12",
        "Nota em revisão",
        other.id,
    )
    history = " ".join(event["text"] for event in edited["events"])
    assert "valor R$ 1.000,00 → R$ 1.200,00" in history
    assert "fornecedor Gráfica Ponto Certo → Contabilidade Exata" in history
    # A linha que só mudou o vencimento muda só ele
    assert client.get(f"/payables/{second['id']}", headers=auth).json()["dueDate"] == _day(10)
    # A lista traz o que a edição em lote mostra de cada conta
    listed = client.get("/payables", params={"mode": "tudo"}, headers=auth).json()["items"]
    mine = next(row for row in listed if row["id"] == first["id"])
    assert (mine["supplierId"], mine["payOn"], mine["competence"], mine["notes"]) == (
        other.id,
        _day(3),
        "2026-12",
        "Nota em revisão",
    )


def test_one_refused_row_saves_nothing(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    paid = create(client, auth, world, description="Conta já paga")
    paying = client.post(f"/payables/{paid['id']}/payments", json=payment(world), headers=auth)
    assert paying.status_code in (200, 201), paying.text
    other = create(client, auth, world, description="Conta em aberto")
    rows = [
        {
            "id": other["id"],
            "description": "Conta em aberto · nova",
            "amount": "1000.00",
            "dueDate": _day(2),
        },
        {"id": paid["id"], "description": "Conta já paga", "amount": "500.00", "dueDate": _day(0)},
    ]
    response = client.post(URL, json={"rows": rows}, headers=auth)
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "Conta já paga: O novo valor é menor do que já foi pago",
    )
    untouched = client.get(f"/payables/{other['id']}", headers=auth).json()
    assert untouched["description"] == "Conta em aberto"


def test_denied_batch_edits(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    make_user: Callable[..., User],
) -> None:
    payable = create(client, auth, world)
    row = {"id": payable["id"], "description": "Outra", "amount": "1000.00", "dueDate": _day(0)}
    assert client.post(URL, json={"rows": [row]}).status_code == 401
    other = make_user(role="supervisor", email="outro@e2e.invalid")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.post(URL, json={"rows": [row]}, headers=headers).status_code == 403
    twice = client.post(URL, json={"rows": [row, row]}, headers=auth)
    assert (twice.status_code, twice.json()["detail"]) == (422, "A mesma conta aparece duas vezes")
    assert client.post(URL, json={"rows": [{**row, "id": 99999}]}, headers=auth).status_code == 404
    bad_month = client.post(URL, json={"rows": [{**row, "competence": "11/2026"}]}, headers=auth)
    assert bad_month.status_code == 422
    assert client.post(URL, json={"rows": []}, headers=auth).status_code == 422
