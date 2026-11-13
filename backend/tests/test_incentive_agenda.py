# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
from collections.abc import Callable
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient

from models.reference import Project
from models.user import User
from services.auth import create_access_token
from tests.test_payables import (  # noqa: F401
    _import_fields,
    _incentives,
    _send,
    auth,
    body,
    incentive_project,
    payment,
    world,
)

TODAY = date(2026, 11, 10)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("services.incentives.today", lambda: TODAY)


def import_dates(client: TestClient, auth: dict[str, str], world: dict[str, Any]) -> dict[str, int]:
    """Quatro datas de pagamento (06/11, 09/11, 10/11, 11/11), com 5, 4, 3 e 3 pessoas de R$ 120."""
    content = _incentives(
        ("2026-10-22", 5), ("2026-10-23", 4), ("2026-10-26", 3), ("2026-10-27", 3)
    )
    assert (
        _send(client, auth, "/payables/import", _import_fields(world), content).status_code == 201
    )
    rows = client.get("/incentives/agenda?mode=tudo", headers=auth).json()["rows"]
    return {row["dueDate"]: row["id"] for row in rows}


def agenda(client: TestClient, auth: dict[str, str], query: str = "mode=tudo") -> Any:
    response = client.get(f"/incentives/agenda?{query}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def test_the_agenda_lists_each_payment_date_with_people_total_and_situation(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    import_dates(client, auth, world)
    result = agenda(client, auth)
    assert [
        (r["dueDate"], r["people"], r["amount"], r["pending"], r["situation"], r["projectCodes"])
        for r in result["rows"]
    ] == [
        ("2026-11-06", 5, "600.00", "600.00", "vencido", ["1804"]),
        ("2026-11-09", 4, "480.00", "480.00", "vencido", ["1804"]),
        ("2026-11-10", 3, "360.00", "360.00", "hoje", ["1804"]),
        ("2026-11-11", 3, "360.00", "360.00", "a_vencer", ["1804"]),
    ]
    assert result["summary"] == {
        "a_vencer": {"count": 1, "people": 3, "total": "360.00"},
        "hoje": {"count": 1, "people": 3, "total": "360.00"},
        "vencido": {"count": 2, "people": 9, "total": "1080.00"},
        "pago": {"count": 0, "people": 0, "total": "0.00"},
    }
    assert result["overdueAll"] == {"count": 2, "people": 9, "total": "1080.00"}


def test_a_paid_date_moves_to_paid_and_leaves_the_overdue(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    ids = import_dates(client, auth, world)
    paid = client.post(
        f"/payables/{ids['2026-11-09']}/payments",
        json=payment(world, amount="480.00"),
        headers=auth,
    )
    assert paid.status_code == 200, paid.text
    result = agenda(client, auth)
    assert result["summary"]["pago"] == {"count": 1, "people": 4, "total": "480.00"}
    assert result["summary"]["vencido"] == {"count": 1, "people": 5, "total": "600.00"}
    assert result["overdueAll"] == {"count": 1, "people": 5, "total": "600.00"}


def test_the_period_limits_the_rows_but_the_overdue_stays_visible(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    import_dates(client, auth, world)
    day = agenda(client, auth, "mode=dia&ref=2026-11-10")
    assert [r["dueDate"] for r in day["rows"]] == ["2026-11-10"]
    assert day["summary"]["hoje"]["people"] == 3
    # o vencido de outras datas continua aparecendo no aviso do topo
    assert day["overdueAll"]["count"] == 2

    custom = agenda(client, auth, "mode=periodo&start=2026-11-09&end=2026-11-10")
    assert [r["dueDate"] for r in custom["rows"]] == ["2026-11-09", "2026-11-10"]


def test_canceled_and_other_kinds_of_payable_are_not_in_the_agenda(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    ids = import_dates(client, auth, world)
    manual = client.post("/payables", json=body(world, dueDate="2026-11-10"), headers=auth)
    assert manual.status_code == 201, manual.text
    canceled = client.post(
        f"/payables/{ids['2026-11-11']}/cancel", json={"reason": "Planilha errada"}, headers=auth
    )
    assert canceled.status_code == 200, canceled.text
    rows = agenda(client, auth)["rows"]
    assert [r["dueDate"] for r in rows] == ["2026-11-06", "2026-11-09", "2026-11-10"]


def test_an_empty_period_gives_zeros_and_no_rows(client: TestClient, auth: dict[str, str]) -> None:
    result = agenda(client, auth, "mode=dia&ref=2030-01-02")
    assert result["rows"] == []
    assert result["summary"]["hoje"] == {"count": 0, "people": 0, "total": "0.00"}
    assert result["overdueAll"] == {"count": 0, "people": 0, "total": "0.00"}


def test_the_agenda_needs_a_finance_login(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    assert client.get("/incentives/agenda").status_code == 401
    other = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.get("/incentives/agenda", headers=headers).status_code == 403
