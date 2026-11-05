# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.payable import Payable, PayableSeries
from tests.test_payables import auth, body, payment, world  # noqa: F401


def recurring(
    world: dict[str, Any], kind: str = "mensal", count: int = 6, **overrides: Any
) -> dict[str, Any]:
    extra = {k: overrides.pop(k) for k in ("occurrences", "estimated") if k in overrides}
    return {
        **body(world, **overrides),
        "recurrence": {"kind": kind, "count": count, **extra},
    }


def create_series(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], **kwargs: Any
) -> list[int]:
    response = client.post("/payables/recurrence", json=recurring(world, **kwargs), headers=auth)
    assert response.status_code == 201, response.text
    return list(response.json()["ids"])


def detail(client: TestClient, auth: dict[str, str], payable_id: int) -> Any:
    return client.get(f"/payables/{payable_id}", headers=auth).json()


def pay(client: TestClient, auth: dict[str, str], world: dict[str, Any], payable_id: int) -> None:
    response = client.post(
        f"/payables/{payable_id}/payments",
        json=payment(world, amount=str(detail(client, auth, payable_id)["amount"])),
        headers=auth,
    )
    assert response.status_code == 200, response.text


# ---- Simular ----


def simulate(client: TestClient, auth: dict[str, str], **fields: Any) -> list[dict[str, Any]]:
    payload = {"kind": "mensal", "startDate": "2026-01-31", "count": 6, "amount": "100.00"}
    response = client.post(
        "/payables/recurrence/simulate", json={**payload, **fields}, headers=auth
    )
    assert response.status_code == 200, response.text
    return list(response.json())


def test_day_31_goes_to_the_last_day_of_each_month_then_to_the_next_business_day(
    client: TestClient, auth: dict[str, str]
) -> None:
    # 31/01/2026 e 28/02/2026 caem num sábado, 31/05 num domingo: vão para a segunda
    dates = [o["dueDate"] for o in simulate(client, auth)]
    assert dates == [
        "2026-02-02",
        "2026-03-02",
        "2026-03-31",
        "2026-04-30",
        "2026-06-01",
        "2026-06-30",
    ]


def test_the_day_comes_from_the_start_date_not_from_the_previous_occurrence(
    client: TestClient, auth: dict[str, str]
) -> None:
    # 31/01 → 28/02 → 31/03: o dia 31 volta, não fica preso no 28
    base = simulate(client, auth, startDate="2027-01-31", count=3)
    assert [o["dueDate"] for o in base] == ["2027-02-01", "2027-03-01", "2027-03-31"]


def test_a_series_crosses_the_new_year(client: TestClient, auth: dict[str, str]) -> None:
    dates = [o["dueDate"] for o in simulate(client, auth, startDate="2026-11-30", count=4)]
    assert dates == ["2026-11-30", "2026-12-30", "2027-02-01", "2027-03-01"]


def test_a_holiday_goes_to_the_next_business_day(client: TestClient, auth: dict[str, str]) -> None:
    # 15/11/2026 é domingo e feriado (Proclamação da República): vai para a segunda, dia 16
    assert simulate(client, auth, startDate="2026-11-15", count=2)[0]["dueDate"] == "2026-11-16"


def test_weekly_adds_seven_days_across_the_year(client: TestClient, auth: dict[str, str]) -> None:
    dates = [
        o["dueDate"]
        for o in simulate(client, auth, kind="semanal", startDate="2026-12-28", count=3)
    ]
    assert dates == ["2026-12-28", "2027-01-04", "2027-01-11"]


def test_installments_split_the_total_and_the_rounding_goes_to_the_last(
    client: TestClient, auth: dict[str, str]
) -> None:
    rows = simulate(
        client, auth, kind="parcelado", startDate="2026-12-15", count=3, amount="100.00"
    )
    assert [Decimal(str(o["amount"])) for o in rows] == [
        Decimal("33.33"),
        Decimal("33.33"),
        Decimal("33.34"),
    ]
    assert [o["dueDate"] for o in rows] == ["2026-12-15", "2027-01-15", "2027-02-15"]


@pytest.mark.parametrize("count", [1, 61])
def test_the_quantity_must_be_between_2_and_60(
    client: TestClient, auth: dict[str, str], count: int
) -> None:
    response = client.post(
        "/payables/recurrence/simulate",
        json={"kind": "mensal", "startDate": "2026-01-31", "count": count, "amount": "10.00"},
        headers=auth,
    )
    assert response.status_code == 422


# ---- Criar a série ----


def test_creating_a_series_makes_one_payable_per_occurrence(
    client: TestClient, db_session: Session, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=4, dueDate="2026-11-30", amount="250.00")

    assert len(ids) == 4
    rows = [detail(client, auth, i) for i in ids]
    assert [r["dueDate"] for r in rows] == ["2026-11-30", "2026-12-30", "2027-02-01", "2027-03-01"]
    assert [r["series"]["index"] for r in rows] == [1, 2, 3, 4]
    assert all(r["series"]["count"] == 4 and r["series"]["kind"] == "mensal" for r in rows)
    assert {Decimal(str(r["amount"])) for r in rows} == {Decimal("250.00")}
    # cada ocorrência tem a competência do próprio mês, e o histórico diz de qual série veio
    assert [r["competence"] for r in rows] == ["2026-11", "2026-12", "2027-02", "2027-03"]
    assert any("Ocorrência 3 de 4" in e["text"] for e in rows[2]["events"])
    assert db_session.query(PayableSeries).one().count == 4


def test_only_the_first_occurrence_carries_the_document(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(
        client,
        auth,
        world,
        count=3,
        dueDate="2026-12-30",
        documentType="NF",
        documentNumber="1203",
        documentDate="2026-12-01",
    )
    rows = [detail(client, auth, i) for i in ids]
    assert [(r["documentType"], r["documentNumber"]) for r in rows] == [
        ("NF", "1203"),
        ("Sem documento", None),
        ("Sem documento", None),
    ]


def test_the_table_can_be_edited_before_saving(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(
        client,
        auth,
        world,
        count=3,
        dueDate="2026-12-30",
        amount="150.00",
        occurrences=[{"index": 2, "amount": "163.40"}, {"index": 3, "dueDate": "2027-02-10"}],
    )
    rows = [detail(client, auth, i) for i in ids]
    assert [Decimal(str(r["amount"])) for r in rows] == [
        Decimal("150.00"),
        Decimal("163.40"),
        Decimal("150.00"),
    ]
    assert rows[2]["dueDate"] == "2027-02-10"


def test_installments_with_a_wrong_sum_are_refused_and_nothing_is_created(
    client: TestClient, db_session: Session, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post(
        "/payables/recurrence",
        json=recurring(
            world,
            kind="parcelado",
            count=2,
            amount="100.00",
            occurrences=[{"index": 1, "amount": "10.00"}],
        ),
        headers=auth,
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "A soma das parcelas precisa ser igual ao valor total"
    assert db_session.query(Payable).count() == 0 and db_session.query(PayableSeries).count() == 0


def test_installments_split_the_project_split_too(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(
        client,
        auth,
        world,
        kind="parcelado",
        count=3,
        amount="100.00",
        dueDate="2026-12-15",
        allocations=[
            {"projectId": world["project"].id, "amount": "60.00"},
            {"projectId": world["other_project"].id, "amount": "40.00"},
        ],
    )
    for payable_id in ids:
        row = detail(client, auth, payable_id)
        assert sum(Decimal(str(a["amount"])) for a in row["allocations"]) == Decimal(
            str(row["amount"])
        )


def test_a_provision_does_not_repeat(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post(
        "/payables/recurrence", json=recurring(world, type="provisao"), headers=auth
    )
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Só conta real se repete: provisão não tem série",
    )


def test_a_failure_in_one_occurrence_creates_none(
    client: TestClient, db_session: Session, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post(
        "/payables/recurrence", json=recurring(world, supplierId=99999), headers=auth
    )
    assert response.status_code == 422
    assert db_session.query(Payable).count() == 0 and db_session.query(PayableSeries).count() == 0


def test_the_series_shows_up_in_the_list(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create_series(client, auth, world, count=2, dueDate="2026-12-30")
    create_series(client, auth, world, count=2, dueDate="2026-12-30")
    client.post("/payables", json=body(world, dueDate="2026-12-30"), headers=auth)
    rows = client.get("/payables", params={"mode": "tudo", "pageSize": 50}, headers=auth).json()[
        "items"
    ]
    singles = [r for r in rows if r["series"] is None]
    assert len(rows) == 5 and len(singles) == 1


# ---- Editar a série ----


def edit(client: TestClient, auth: dict[str, str], payable_id: int, **fields: Any) -> Any:
    return client.patch(f"/payables/{payable_id}/series", json=fields, headers=auth)


def amounts(client: TestClient, auth: dict[str, str], ids: list[int]) -> list[Decimal]:
    return [Decimal(str(detail(client, auth, i)["amount"])) for i in ids]


def test_an_estimated_bill_is_replaced_by_the_real_value_without_touching_the_next(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    # luz estimada em R$ 150 por 12 meses; a de outubro vem R$ 163,40 e só ela muda
    ids = create_series(
        client, auth, world, count=12, amount="150.00", dueDate="2026-01-12", estimated=True
    )
    october = ids[9]
    response = edit(client, auth, october, scope="only", amount="163.40")
    assert (response.status_code, response.json()) == (200, {"count": 1})
    values = amounts(client, auth, ids)
    assert values[9] == Decimal("163.40")
    assert {v for i, v in enumerate(values) if i != 9} == {Decimal("150.00")}
    assert detail(client, auth, ids[0])["series"]["estimated"] is True


def test_this_and_the_following_skip_what_was_already_paid(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=6, amount="100.00", dueDate="2026-12-30")
    pay(client, auth, world, ids[3])  # a 4ª já foi paga

    response = edit(client, auth, ids[2], scope="following", amount="120.00")

    assert response.json() == {"count": 3}  # 3ª, 5ª e 6ª; a 4ª está paga
    assert amounts(client, auth, ids) == [
        Decimal("100.00"),
        Decimal("100.00"),
        Decimal("120.00"),
        Decimal("100.00"),
        Decimal("120.00"),
        Decimal("120.00"),
    ]


def test_all_open_changes_every_occurrence_without_a_payment(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=4, amount="100.00", dueDate="2026-12-30")
    pay(client, auth, world, ids[0])
    response = edit(client, auth, ids[1], scope="open", description="Aluguel da sala")
    assert response.json() == {"count": 3}
    assert detail(client, auth, ids[0])["description"] == "Impressão de questionários"
    assert {detail(client, auth, i)["description"] for i in ids[1:]} == {"Aluguel da sala"}


def test_a_paid_occurrence_is_never_changed_by_the_series(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=3, amount="100.00", dueDate="2026-12-30")
    pay(client, auth, world, ids[0])
    response = edit(client, auth, ids[0], scope="only", amount="500.00")
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "Ocorrências pagas não são alteradas pela série",
    )
    assert detail(client, auth, ids[0])["amount"] == "100.00"


def test_a_partly_paid_occurrence_is_skipped_too(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=3, amount="100.00", dueDate="2026-12-30")
    client.post(f"/payables/{ids[1]}/payments", json=payment(world, amount="40.00"), headers=auth)
    assert edit(client, auth, ids[0], scope="open", amount="90.00").json() == {"count": 2}
    assert detail(client, auth, ids[1])["amount"] == "100.00"


def test_a_standalone_payable_has_no_series(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    single = client.post("/payables", json=body(world), headers=auth).json()["id"]
    response = edit(client, auth, single, scope="open", amount="10.00")
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "Essa conta não faz parte de uma série",
    )
    assert edit(client, auth, 9999, scope="only", amount="10.00").status_code == 404


def test_a_bad_value_in_the_series_changes_nothing(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=3, amount="100.00", dueDate="2026-12-30")
    response = edit(client, auth, ids[0], scope="open", amount="0")
    assert response.status_code == 422
    assert amounts(client, auth, ids) == [Decimal("100.00")] * 3


# ---- Cancelar a série ----


def cancel(client: TestClient, auth: dict[str, str], payable_id: int, **fields: Any) -> Any:
    return client.post(
        f"/payables/{payable_id}/series/cancel",
        json={"reason": "Contrato encerrado", **fields},
        headers=auth,
    )


def canceled(client: TestClient, auth: dict[str, str], ids: list[int]) -> list[bool]:
    return [detail(client, auth, i)["situation"] == "cancelado" for i in ids]


def test_canceling_the_following_keeps_what_was_paid_and_what_came_before(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=5, amount="100.00", dueDate="2026-12-30")
    pay(client, auth, world, ids[3])

    response = cancel(client, auth, ids[2], scope="following")

    assert response.json() == {"count": 2}  # 3ª e 5ª; a 4ª está paga
    assert canceled(client, auth, ids) == [False, False, True, False, True]
    assert detail(client, auth, ids[3])["situation"] == "pago"


def test_canceling_all_open_leaves_the_paid_ones(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=3, amount="100.00", dueDate="2026-12-30")
    pay(client, auth, world, ids[0])
    assert cancel(client, auth, ids[1], scope="open").json() == {"count": 2}
    assert canceled(client, auth, ids) == [False, True, True]


def test_canceled_occurrences_are_skipped_by_later_edits(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=3, amount="100.00", dueDate="2026-12-30")
    cancel(client, auth, ids[2], scope="following")
    assert edit(client, auth, ids[0], scope="open", amount="80.00").json() == {"count": 2}
    assert detail(client, auth, ids[2])["amount"] == "100.00"


def test_canceling_needs_a_reason_and_a_valid_scope(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=2, amount="100.00", dueDate="2026-12-30")
    no_reason = client.post(
        f"/payables/{ids[0]}/series/cancel", json={"scope": "open"}, headers=auth
    )
    assert no_reason.status_code == 422
    assert cancel(client, auth, ids[0], scope="only").status_code == 422


def test_the_new_routes_ask_for_login(client: TestClient) -> None:
    for method, path in [
        ("post", "/payables/recurrence/simulate"),
        ("post", "/payables/recurrence"),
        ("patch", "/payables/1/series"),
        ("post", "/payables/1/series/cancel"),
    ]:
        assert getattr(client, method)(path, json={}).status_code == 401


def test_dates_far_apart_keep_the_issue_date_offset(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = create_series(client, auth, world, count=2, dueDate="2026-12-30", issueDate="2026-12-10")
    issued = [date.fromisoformat(detail(client, auth, i)["issueDate"]) for i in ids]
    due = [date.fromisoformat(detail(client, auth, i)["dueDate"]) for i in ids]
    assert (due[1] - issued[1]) == (due[0] - issued[0])
