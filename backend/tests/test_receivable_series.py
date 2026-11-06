# ruff: noqa: F811  (as fixtures importadas de test_receivables são reusadas pelo nome)
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.text import format_brl
from models.payable import PayableSeries
from models.receivable import Receivable
from tests.test_receivables import auth, body, create, days, listing, receipt, world  # noqa: F401


def recurring(
    world: dict[str, Any], kind: str = "parcelado", count: int = 3, **overrides: Any
) -> dict[str, Any]:
    extra = {k: overrides.pop(k) for k in ("occurrences", "estimated") if k in overrides}
    return {**body(world, **overrides), "recurrence": {"kind": kind, "count": count, **extra}}


def make_series(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], **kwargs: Any
) -> list[int]:
    response = client.post("/receivables/recurrence", json=recurring(world, **kwargs), headers=auth)
    assert response.status_code == 201, response.text
    return list(response.json()["ids"])


def detail(client: TestClient, auth: dict[str, str], receivable_id: int) -> Any:
    return client.get(f"/receivables/{receivable_id}", headers=auth).json()


def amounts(client: TestClient, auth: dict[str, str], ids: list[int]) -> list[Decimal]:
    return [Decimal(str(detail(client, auth, i)["amount"])) for i in ids]


def receive(client: TestClient, auth: dict[str, str], world: dict[str, Any], rid: int) -> None:
    net = Decimal(str(detail(client, auth, rid)["net"]))
    response = client.post(
        f"/receivables/{rid}/receipts", json=receipt(world, amount=str(net)), headers=auth
    )
    assert response.status_code == 200, response.text


# ---- Receita parcelada ----


def test_a_revenue_split_in_three_has_its_own_number_due_date_value_and_status(
    client: TestClient, db_session: Session, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client,
        auth,
        world,
        kind="parcelado",
        count=3,
        amount="1000.00",
        dueDate="2026-12-15",
    )
    rows = [detail(client, auth, i) for i in ids]

    assert [r["series"]["index"] for r in rows] == [1, 2, 3]
    assert all(r["series"]["count"] == 3 and r["series"]["kind"] == "parcelado" for r in rows)
    assert [r["dueDate"] for r in rows] == ["2026-12-15", "2027-01-15", "2027-02-15"]
    assert [Decimal(str(r["amount"])) for r in rows] == [
        Decimal("333.33"),
        Decimal("333.33"),
        Decimal("333.34"),
    ]
    # a soma das parcelas fecha com o título
    assert sum(Decimal(str(r["amount"])) for r in rows) == Decimal("1000.00")
    assert {r["situation"] for r in rows} == {"a_vencer"}
    assert db_session.query(PayableSeries).one().count == 3


def test_thirty_percent_on_approval_and_seventy_on_delivery(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client,
        auth,
        world,
        kind="parcelado",
        count=2,
        amount="10000.00",
        dueDate="2026-12-15",
        occurrences=[
            {"index": 1, "amount": "3000.00"},
            {"index": 2, "amount": "7000.00", "dueDate": "2027-03-10"},
        ],
    )
    rows = [detail(client, auth, i) for i in ids]
    assert [Decimal(str(r["amount"])) for r in rows] == [Decimal("3000.00"), Decimal("7000.00")]
    assert rows[1]["dueDate"] == "2027-03-10"


def test_installments_that_do_not_add_up_are_refused_and_nothing_is_saved(
    client: TestClient, db_session: Session, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post(
        "/receivables/recurrence",
        json=recurring(
            world,
            count=2,
            amount="1000.00",
            occurrences=[{"index": 1, "amount": "400.00"}, {"index": 2, "amount": "590.00"}],
        ),
        headers=auth,
    )
    assert response.status_code == 422
    assert response.json()["detail"] == (
        f"As parcelas somam {format_brl(Decimal('990.00'))}, "
        f"mas o título é de {format_brl(Decimal('1000.00'))}"
    )
    assert db_session.query(Receivable).count() == 0
    assert db_session.query(PayableSeries).count() == 0


def test_a_monthly_revenue_repeats_the_whole_value_each_month(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client,
        auth,
        world,
        kind="mensal",
        count=4,
        amount="800.00",
        adjustments=[{"kind": "imposto", "description": "Retenção", "amount": "50.00"}],
        dueDate="2026-11-30",
        documentType="NF",
        documentNumber="55",
        documentDate=days(0),
    )
    rows = [detail(client, auth, i) for i in ids]
    # 30/11 → 30/12 → 30/01 (sábado, vai para segunda 01/02) → 28/02 (domingo, vai para 01/03)
    assert [r["dueDate"] for r in rows] == ["2026-11-30", "2026-12-30", "2027-02-01", "2027-03-01"]
    assert {Decimal(str(r["amount"])) for r in rows} == {Decimal("800.00")}
    assert {Decimal(str(r["net"])) for r in rows} == {Decimal("750.00")}
    assert [r["competence"] for r in rows] == ["2026-11", "2026-12", "2027-02", "2027-03"]
    # só a primeira leva a nota
    assert [(r["documentType"], r["documentNumber"]) for r in rows] == [
        ("NF", "55"),
        ("Sem documento", None),
        ("Sem documento", None),
        ("Sem documento", None),
    ]


def test_a_failure_in_one_installment_creates_none(
    client: TestClient, db_session: Session, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post(
        "/receivables/recurrence",
        json=recurring(world, projectId=world["closed"].id),
        headers=auth,
    )
    assert response.status_code == 409
    assert (
        db_session.query(Receivable).count() == 0 and db_session.query(PayableSeries).count() == 0
    )
    no_project = client.post(
        "/receivables/recurrence", json=recurring(world, projectId=None), headers=auth
    )
    assert (no_project.status_code, no_project.json()["detail"]) == (
        422,
        "Informe o projeto da receita",
    )


def test_installments_may_not_swallow_the_value_in_withholdings(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post(
        "/receivables/recurrence",
        json=recurring(
            world,
            kind="mensal",
            amount="100.00",
            adjustments=[{"kind": "imposto", "description": "Retenção", "amount": "100.00"}],
        ),
        headers=auth,
    )
    assert response.status_code == 422


def test_the_series_shows_in_the_list_and_titles_without_one_have_none(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    make_series(client, auth, world, count=2, dueDate="2026-12-15")
    create(client, auth, world, dueDate="2026-12-15")
    rows = listing(client, auth)["items"]
    assert sorted((r["series"] or {}).get("index", 0) for r in rows) == [0, 1, 2]


# ---- Editar e cancelar a série ----


def edit(client: TestClient, auth: dict[str, str], rid: int, **fields: Any) -> Any:
    return client.patch(f"/receivables/{rid}/series", json=fields, headers=auth)


def cancel(client: TestClient, auth: dict[str, str], rid: int, **fields: Any) -> Any:
    return client.post(
        f"/receivables/{rid}/series/cancel",
        json={"reason": "Contrato rescindido", **fields},
        headers=auth,
    )


def test_editing_this_and_the_following_skips_what_already_has_a_receipt(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client, auth, world, kind="mensal", count=5, amount="100.00", dueDate="2026-12-15"
    )
    receive(client, auth, world, ids[3])  # a 4ª já foi recebida

    response = edit(client, auth, ids[2], scope="following", amount="120.00")

    assert response.json() == {"count": 2}  # a 3ª e a 5ª; a 4ª tem recebimento
    assert amounts(client, auth, ids) == [Decimal(v) for v in ("100", "100", "120", "100", "120")]


def test_a_title_with_a_receipt_is_never_changed_by_the_series(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client, auth, world, kind="mensal", count=3, amount="100.00", dueDate="2026-12-15"
    )
    receive(client, auth, world, ids[0])
    response = edit(client, auth, ids[0], scope="only", amount="500.00")
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "Títulos com recebimento não são alterados pela série",
    )
    assert detail(client, auth, ids[0])["amount"] == "100.00"
    assert edit(client, auth, ids[1], scope="open", amount="90.00").json() == {"count": 2}


def test_one_installment_can_change_alone_and_the_description_goes_to_all_open(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client, auth, world, kind="mensal", count=3, amount="100.00", dueDate="2026-12-15"
    )
    assert edit(client, auth, ids[1], scope="only", amount="163.40").json() == {"count": 1}
    assert amounts(client, auth, ids) == [Decimal("100.00"), Decimal("163.40"), Decimal("100.00")]
    edit(client, auth, ids[0], scope="open", description="Mensalidade da pesquisa")
    assert {detail(client, auth, i)["description"] for i in ids} == {"Mensalidade da pesquisa"}


def test_a_value_that_would_leave_nothing_to_receive_changes_nothing(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client,
        auth,
        world,
        kind="mensal",
        count=2,
        amount="100.00",
        adjustments=[{"kind": "imposto", "description": "Retenção", "amount": "40.00"}],
        dueDate="2026-12-15",
    )
    response = edit(client, auth, ids[0], scope="open", amount="30.00")
    assert response.status_code == 422
    assert amounts(client, auth, ids) == [Decimal("100.00")] * 2


def test_canceling_the_following_keeps_what_was_received(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client, auth, world, kind="mensal", count=4, amount="100.00", dueDate="2026-12-15"
    )
    receive(client, auth, world, ids[2])
    assert cancel(client, auth, ids[1], scope="following").json() == {"count": 2}  # 2ª e 4ª
    situations = [detail(client, auth, i)["situation"] for i in ids]
    assert situations == ["a_vencer", "cancelado", "recebido", "cancelado"]


def test_series_actions_need_a_series_a_reason_and_a_valid_scope(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    single = create(client, auth, world)
    refused = edit(client, auth, single["id"], scope="open", amount="10.00")
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "Esse título não faz parte de uma série",
    )
    assert cancel(client, auth, single["id"], scope="open").status_code == 409
    assert edit(client, auth, 9999, scope="only", amount="10.00").status_code == 404
    ids = make_series(client, auth, world, kind="mensal", count=2, dueDate="2026-12-15")
    no_reason = client.post(
        f"/receivables/{ids[0]}/series/cancel", json={"scope": "open"}, headers=auth
    )
    assert no_reason.status_code == 422
    assert cancel(client, auth, ids[0], scope="only").status_code == 422


def series_of(client: TestClient, auth: dict[str, str], receivable_id: int) -> Any:
    return client.get(f"/receivables/{receivable_id}/series", headers=auth)


def test_the_series_lists_every_title_in_order_with_what_happened_to_each(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client, auth, world, kind="mensal", count=4, amount="100.00", dueDate="2026-12-15"
    )
    receive(client, auth, world, ids[0])
    cancel(client, auth, ids[3], scope="following")

    response = series_of(client, auth, ids[2])

    assert response.status_code == 200
    rows = response.json()
    assert [r["id"] for r in rows] == ids
    assert [r["index"] for r in rows] == [1, 2, 3, 4]
    assert [r["situation"] for r in rows] == ["recebido", "a_vencer", "a_vencer", "cancelado"]
    assert [r["amount"] for r in rows] == ["100.00"] * 4
    assert rows == series_of(client, auth, ids[0]).json()


def test_the_series_listing_shows_the_net_value_when_there_are_adjustments(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    ids = make_series(
        client,
        auth,
        world,
        kind="mensal",
        count=2,
        amount="1000.00",
        dueDate="2026-12-15",
        adjustments=[{"kind": "imposto", "description": "ISS", "amount": "50.00"}],
    )
    assert [r["amount"] for r in series_of(client, auth, ids[0]).json()] == ["950.00", "950.00"]


def test_the_series_listing_refuses_a_standalone_title_and_an_unknown_one(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    single = create(client, auth, world)
    refused = series_of(client, auth, single["id"])
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "Esse título não faz parte de uma série",
    )
    assert series_of(client, auth, 9999).status_code == 404


def test_the_new_routes_ask_for_login(client: TestClient) -> None:
    assert client.get("/receivables/1/series").status_code == 401
    for method, path in [
        ("post", "/receivables/recurrence"),
        ("patch", "/receivables/1/series"),
        ("post", "/receivables/1/series/cancel"),
        ("get", "/receivables/export"),
    ]:
        assert getattr(client, method)(path).status_code == 401


# ---- Exportação ----


def export(client: TestClient, auth: dict[str, str], **params: Any) -> Any:
    return client.get("/receivables/export", params={"mode": "tudo", **params}, headers=auth)


def test_the_export_carries_the_filters_on_the_first_line_and_one_row_per_title(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(
        client,
        auth,
        world,
        dueDate=days(-4),
        amount="1000.00",
        adjustments=[{"kind": "imposto", "description": "Retenção", "amount": "100.00"}],
        contract="CT-9",
    )
    create(client, auth, world, dueDate=days(3), customerId=world["other_customer"].id)
    response = export(client, auth, customer=world["customer"].id, search="satisfação")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert 'filename="contas-a-receber.csv"' in response.headers["content-disposition"]
    text = response.content.decode("utf-8")
    assert text.startswith("﻿")  # o Excel só lê os acentos com BOM
    lines = text.lstrip("﻿").split("\r\n")
    assert lines[0] == (
        "Contas a receber · todo o período por vencimento · Total · "
        "filtros: cliente=Alfa Pesquisas Ltda · busca: satisfação"
    )
    assert lines[1].split(";")[:3] == ["Vencimento", "Cliente", "Descrição"]
    rows = [line.split(";") for line in lines[2:] if line]
    assert len(rows) == 1  # só o título do cliente filtrado
    row = dict(zip(lines[1].split(";"), rows[0], strict=True))
    assert (row["Cliente"], row["Contrato"], row["Situação"], row["Dias de atraso"]) == (
        "Alfa Pesquisas Ltda",
        "CT-9",
        "Vencida",
        "4",
    )
    assert (
        row["Valor principal"],
        row["Acréscimos"],
        row["Descontos"],
        row["Impostos"],
        row["Líquido"],
    ) == (
        "1.000,00",
        "0,00",
        "0,00",
        "100,00",
        "900,00",
    )


def test_the_export_follows_the_indicator_and_neutralizes_formulas(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    create(client, auth, world, dueDate=days(-2), description="=SOMA(A1:A9)")
    create(client, auth, world, dueDate=days(8), description="Outra")
    late = export(client, auth, indicator="vencidos").content.decode("utf-8")
    assert "Vencidos" in late.split("\r\n")[0]
    assert "'=SOMA(A1:A9)" in late and "Outra" not in late


def test_an_export_with_a_bad_period_is_refused_like_the_list(
    client: TestClient, auth: dict[str, str]
) -> None:
    response = client.get("/receivables/export", params={"mode": "periodo"}, headers=auth)
    assert response.status_code == 422


def test_installments_refuse_adjustments_and_monthly_repeats_them(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    lines = [{"kind": "acrescimo", "description": "Correção", "amount": "10.00"}]
    refused = client.post(
        "/receivables/recurrence",
        json=recurring(world, kind="parcelado", count=3, amount="900.00", adjustments=lines),
        headers=auth,
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "Em título parcelado, lance acréscimos, descontos e impostos em cada parcela depois",
    )
    ids = make_series(
        client, auth, world, kind="mensal", count=2, amount="900.00", adjustments=lines
    )
    assert {Decimal(str(detail(client, auth, i)["net"])) for i in ids} == {Decimal("910.00")}
