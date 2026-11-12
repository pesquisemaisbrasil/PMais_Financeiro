# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
import itertools
import logging
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.bank_reconciliation import BankReconciliation, BankReconciliationEvent
from models.reference import Customer, ExpenseCategory, Supplier
from models.user import User
from services.auth import create_access_token
from services.payable import today
from tests.test_bank_statements import NAME, ofx, rows, send
from tests.test_payables import (  # noqa: F401
    _import_fields,
    _incentives,
    _send,
    auth,
    create,
    incentive_project,
    payment,
    world,
)


def day(back: int = 0) -> date:
    return today() - timedelta(days=back)


_BANK_IDS = itertools.count(1)


def lines(*items: tuple[date, str, str]) -> bytes:
    """Um OFX com uma linha para cada (data, valor, descrição), cada uma com o seu ID do banco."""
    return ofx(
        *[(d.strftime("%Y%m%d"), amount, f"T{next(_BANK_IDS)}", memo) for d, amount, memo in items]
    )


def load(
    client: TestClient,
    auth: dict[str, str],
    db: Session,
    account_id: int,
    *items: tuple[date, str, str],
) -> list[int]:
    """Importa as linhas e devolve os ids das que entraram, na ordem em que foram escritas."""
    before = {row.id for row in rows(db)}
    response = send(client, auth, account_id, lines(*items))
    assert response.status_code == 201, response.text
    return [row.id for row in rows(db) if row.id not in before]


def paid(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    *,
    amount: str = "450.00",
    back: int = 1,
    description: str = "Impressão de questionários",
    account: Any = None,
) -> int:
    payable = create(client, auth, world, amount=amount, description=description)
    response = client.post(
        f"/payables/{payable['id']}/payments",
        json=payment(
            world,
            amount=amount,
            paidOn=day(back).isoformat(),
            note="baixa do teste",
            bankAccountId=(account or world["account"]).id,
        ),
        headers=auth,
    )
    assert response.status_code == 200, response.text
    return int(payable["id"])


def reconcile(client: TestClient, auth: dict[str, str], transaction_id: int, **body: Any) -> Any:
    payload = {"targetKind": "payable", "classification": "outro", **body}
    return client.post(f"/bank-transactions/{transaction_id}/reconcile", json=payload, headers=auth)


def suggestions(
    client: TestClient, auth: dict[str, str], transaction_id: int
) -> list[dict[str, Any]]:
    response = client.get(f"/bank-transactions/{transaction_id}/suggestions", headers=auth)
    assert response.status_code == 200, response.text
    return list(response.json())


def listed(client: TestClient, auth: dict[str, str], account_id: int, query: str = "") -> Any:
    return client.get(f"/bank-accounts/{account_id}/transactions{query}", headers=auth).json()


@pytest.fixture
def revenue(world: dict[str, Any], db_session: Session) -> dict[str, Any]:
    customer = Customer(nickname="Alfa", name="Alfa Pesquisas Ltda")
    category = ExpenseCategory(code="1.01", name="Receita de pesquisa", kind="receita")
    db_session.add_all([customer, category])
    db_session.commit()
    return {"customer": customer, "category": category}


def receivable(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    revenue: dict[str, Any],
    *,
    amount: str = "800.00",
    received: bool = True,
) -> int:
    on = today().isoformat()
    created = client.post(
        "/receivables",
        json={
            "customerId": revenue["customer"].id,
            "projectId": world["project"].id,
            "companyId": world["company"].id,
            "unitId": world["unit"].id,
            "costCenterId": world["cost_center"].id,
            "categoryId": revenue["category"].id,
            "description": "Pesquisa de satisfação",
            "issueDate": on,
            "dueDate": on,
            "amount": amount,
        },
        headers=auth,
    )
    assert created.status_code == 201, created.text
    if received:
        response = client.post(
            f"/receivables/{created.json()['id']}/receipts",
            json={
                "receivedOn": day(1).isoformat(),
                "amount": amount,
                "bankAccountId": world["account"].id,
                "paymentMethodId": world["method"].id,
                "note": "recebimento do teste",
            },
            headers=auth,
        )
        assert response.status_code == 200, response.text
    return int(created.json()["id"])


# ---------------------------------------- sugestões


def test_the_suggestion_is_a_paid_launch_with_the_same_value_in_the_same_account_within_3_days(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = world["account"].id
    right = paid(client, auth, world, amount="450.00", back=1)
    paid(client, auth, world, amount="451.00", back=1)  # valor diferente: nunca é sugerido
    paid(client, auth, world, amount="450.00", back=6)  # fora dos 3 dias
    paid(client, auth, world, amount="450.00", back=1, account=None)
    other_company = world["other_account"]
    assert other_company.id != account  # a conta de outra empresa nem entra na conta
    (tx,) = load(client, auth, db_session, account, (day(0), "-450.00", "PIX ENVIADO"))

    found = suggestions(client, auth, tx)
    targets = {(s["targetId"], s["itemId"]) for s in found}
    assert (right, None) in targets
    assert all(s["amount"] == "450.00" and s["targetKind"] == "payable" for s in found)
    best = next(s for s in found if s["targetId"] == right)
    assert best["description"] == "Impressão de questionários"
    assert best["paidOn"] == day(1).isoformat()
    assert best["reasons"][:2] == ["valor igual", "1 dia(s) de diferença"]
    assert len(found) == 2  # a de 6 dias fica de fora; as duas de 1 dia entram


def test_the_closest_date_and_the_name_in_the_description_come_first(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    far = paid(client, auth, world, amount="450.00", back=3)
    near = paid(client, auth, world, amount="450.00", back=1)
    (tx,) = load(client, auth, db_session, world["account"].id, (day(0), "-450.00", "PIX ENVIADO"))
    assert [s["targetId"] for s in suggestions(client, auth, tx)] == [near, far]


def test_the_name_in_the_description_weighs_more_than_one_day_of_difference(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    named = paid(client, auth, world, amount="450.00", back=2)  # fornecedor Ponto Certo
    other = Supplier(nickname="Outra Empresa", name="Outra Empresa Ltda")
    db_session.add(other)
    db_session.commit()
    nearer = create(client, auth, world, amount="450.00", supplierId=other.id)
    assert (
        client.post(
            f"/payables/{nearer['id']}/payments",
            json=payment(world, amount="450.00", paidOn=day(1).isoformat(), note="baixa do teste"),
            headers=auth,
        ).status_code
        == 200
    )
    (tx,) = load(
        client,
        auth,
        db_session,
        world["account"].id,
        (day(0), "-450.00", "PIX ENVIADO PONTO CERTO"),
    )
    found = suggestions(client, auth, tx)
    assert [s["targetId"] for s in found] == [named, nearer["id"]]
    assert found[0]["reasons"][-1] == "nome na descrição"
    assert "nome na descrição" not in found[1]["reasons"]


def test_a_line_already_reconciled_has_no_suggestions(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    target = paid(client, auth, world)
    (tx,) = load(client, auth, db_session, world["account"].id, (day(0), "-450.00", "PIX"))
    assert reconcile(client, auth, tx, targetId=target).status_code == 204
    assert suggestions(client, auth, tx) == []


def test_an_incoming_line_is_suggested_a_receivable_not_a_payable(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    revenue: dict[str, Any],
    db_session: Session,
) -> None:
    paid(client, auth, world, amount="800.00")  # uma saída do mesmo valor não serve para entrada
    target = receivable(client, auth, world, revenue)
    (tx,) = load(
        client, auth, db_session, world["account"].id, (day(0), "800.00", "PIX RECEBIDO ALFA")
    )
    (found,) = suggestions(client, auth, tx)
    assert (found["targetKind"], found["targetId"], found["who"]) == ("receivable", target, "Alfa")
    assert found["classification"] == "recebimento" and "nome na descrição" in found["reasons"]


def test_the_suggestion_of_a_launch_with_people_is_one_per_unpaid_person_with_the_same_value(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    incentive_project: Any,
    db_session: Session,
) -> None:
    imported = _send(
        client,
        auth,
        "/payables/import",
        _import_fields(world),
        _incentives(("2026-10-30", 5), value=200),
    )
    assert imported.status_code == 201, imported.text
    payable_id = client.get("/payables?mode=tudo", headers=auth).json()["items"][0]["id"]
    people = client.get(f"/payables/{payable_id}", headers=auth).json()["items"]
    assert (
        client.post(
            f"/payables/{payable_id}/payments",
            json=payment(world, amount="1000.00", paidOn=day(1).isoformat(), note="baixa do teste"),
            headers=auth,
        ).status_code
        == 200
    )
    (tx,) = load(
        client,
        auth,
        db_session,
        world["account"].id,
        (day(0), "-200.00", "PIX ENVIADO RESPONDENTE 003"),
    )
    found = suggestions(client, auth, tx)
    assert sorted(s["itemId"] for s in found) == sorted(p["id"] for p in people)
    assert found[0]["classification"] == "incentivo"  # o tipo da pessoa já classifica
    assert found[0]["who"] == "Respondente 003"  # a que tem o nome na descrição vem primeiro
    assert (
        reconcile(client, auth, tx, targetId=payable_id, itemId=found[0]["itemId"]).status_code
        == 204
    )
    # a pessoa conciliada some das sugestões da próxima linha
    (second,) = load(
        client, auth, db_session, world["account"].id, (day(0), "-200.00", "OUTRO PIX")
    )
    assert len(suggestions(client, auth, second)) == 4


# ---------------------------------------- conciliar


def test_reconciling_shows_in_the_list_with_label_classification_and_who_did_it(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = world["account"].id
    target = paid(client, auth, world)
    first, second = load(
        client,
        auth,
        db_session,
        account,
        (day(0), "-450.00", f"PIX ENVIADO {NAME}"),
        (day(0), "-18.90", "TARIFA"),
    )
    done = reconcile(
        client,
        auth,
        first,
        targetId=target,
        classification="nf",
        nfNumber="5521",
        nfIssuedOn="2026-11-02",
    )
    assert done.status_code == 204, done.text

    result = listed(client, auth, account)
    assert result["counts"] == {"pending": 1, "reconciled": 1, "exceptions": 0}
    by_id = {item["id"]: item for item in result["items"]}
    mine = by_id[first]["reconciliation"]
    assert (mine["kind"], mine["classification"], mine["classificationLabel"]) == (
        "lancamento",
        "nf",
        "Pagamento com NF",
    )
    assert (mine["label"], mine["targetKind"], mine["targetId"]) == (
        "Impressão de questionários",
        "payable",
        target,
    )
    assert (mine["nfNumber"], mine["nfIssuedOn"]) == ("5521", "2026-11-02")
    assert mine["by"]
    assert by_id[second]["reconciliation"] is None

    pending = listed(client, auth, account, "?situation=pendente")
    assert [item["id"] for item in pending["items"]] == [second]
    assert pending["counts"]["reconciled"] == 1  # as contagens ignoram o filtro
    assert [
        item["id"] for item in listed(client, auth, account, "?situation=conciliada")["items"]
    ] == [first]
    assert listed(client, auth, account, "?situation=excecao")["items"] == []


def test_a_nf_classification_asks_for_the_number_and_the_issue_date(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    target = paid(client, auth, world)
    (tx,) = load(client, auth, db_session, world["account"].id, (day(0), "-450.00", "PIX"))
    refused = reconcile(client, auth, tx, targetId=target, classification="nf", nfNumber="5521")
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "Pagamento com NF pede o número e a data de emissão da nota",
    )
    # fora de "nf", número e data que vierem são ignorados, não guardados
    assert (
        reconcile(
            client,
            auth,
            tx,
            targetId=target,
            classification="outro",
            nfNumber="9",
            nfIssuedOn="2026-11-02",
        ).status_code
        == 204
    )
    row = db_session.query(BankReconciliation).one()
    assert (row.nfNumber, row.nfIssuedOn) == (None, None)


def test_the_launch_needs_a_baixa_the_same_company_and_a_direction_that_fits(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    revenue: dict[str, Any],
    db_session: Session,
) -> None:
    account = world["account"].id
    unpaid = create(client, auth, world, amount="450.00")["id"]
    paid_target = paid(client, auth, world, amount="450.00")
    foreign = create(
        client,
        auth,
        world,
        amount="450.00",
        companyId=world["other_company"].id if "other_company" in world else world["company"].id,
    )
    out, into = load(
        client,
        auth,
        db_session,
        account,
        (day(0), "-450.00", "PIX"),
        (day(0), "450.00", "PIX RECEBIDO"),
    )

    no_baixa = reconcile(client, auth, out, targetId=unpaid)
    assert (no_baixa.status_code, no_baixa.json()["detail"]) == (
        409,
        "Esse lançamento ainda não tem baixa: dê a baixa antes de conciliar",
    )
    wrong_way = reconcile(client, auth, into, targetId=paid_target)
    assert (wrong_way.status_code, wrong_way.json()["detail"]) == (
        409,
        "Essa linha é uma entrada: concilie com uma conta a receber",
    )
    wrong_way = reconcile(client, auth, out, targetKind="receivable", targetId=paid_target)
    assert (wrong_way.status_code, wrong_way.json()["detail"]) == (
        409,
        "Essa linha é uma saída: concilie com uma conta a pagar",
    )
    assert (
        foreign
    )  # (as duas empresas do teste dividem o lançamento: o caso "outra empresa" tem teste próprio)


def test_a_launch_of_another_company_cannot_be_reconciled_with_this_account(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    # a baixa e o extrato são da conta da MC, e o lançamento é da PPlus
    other = world["other_account"].id
    target = paid(client, auth, world, amount="450.00")
    (tx,) = load(client, auth, db_session, other, (day(0), "-450.00", "PIX"))
    refused = reconcile(client, auth, tx, targetId=target)
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "O lançamento é de outra empresa, não da dona da conta bancária",
    )


def test_the_lines_of_a_launch_never_add_up_to_more_than_the_launch(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    target = paid(client, auth, world, amount="1000.00")
    first, second, third = load(
        client,
        auth,
        db_session,
        world["account"].id,
        (day(0), "-700.00", "PIX 1"),
        (day(0), "-400.00", "PIX 2"),
        (day(0), "-300.00", "PIX 3"),
    )
    assert reconcile(client, auth, first, targetId=target).status_code == 204
    refused = reconcile(client, auth, second, targetId=target)
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "As linhas somam R$ 1.100,00, mas o lançamento é de R$ 1.000,00",
    )
    assert reconcile(client, auth, third, targetId=target).status_code == 204  # 700 + 300 fecha
    assert db_session.query(BankReconciliation).count() == 2


def test_five_incentives_of_200_match_a_launch_of_1000_one_per_person(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    incentive_project: Any,
    db_session: Session,
) -> None:
    imported = _send(
        client,
        auth,
        "/payables/import",
        _import_fields(world),
        _incentives(("2026-10-30", 5), value=200),
    )
    assert imported.status_code == 201, imported.text
    payable_id = client.get("/payables?mode=tudo", headers=auth).json()["items"][0]["id"]
    people = client.get(f"/payables/{payable_id}", headers=auth).json()["items"]
    client.post(
        f"/payables/{payable_id}/payments",
        json=payment(world, amount="1000.00", paidOn=day(1).isoformat(), note="baixa do teste"),
        headers=auth,
    )
    ids = load(
        client,
        auth,
        db_session,
        world["account"].id,
        *[(day(0), "-200.00", f"PIX {n}") for n in range(6)],
    )

    for person, tx in zip(people, ids, strict=False):
        assert (
            reconcile(
                client,
                auth,
                tx,
                targetId=payable_id,
                itemId=person["id"],
                classification="incentivo",
            ).status_code
            == 204
        )
    counts = listed(client, auth, world["account"].id)["counts"]
    assert counts == {"pending": 1, "reconciled": 5, "exceptions": 0}

    # a mesma pessoa não casa com duas linhas, e o lançamento não aceita uma sexta linha
    repeated = reconcile(
        client,
        auth,
        ids[5],
        targetId=payable_id,
        itemId=people[0]["id"],
        classification="incentivo",
    )
    assert (repeated.status_code, repeated.json()["detail"]) == (
        409,
        "Essa pessoa já foi conciliada com outra linha",
    )
    assert db_session.query(BankReconciliation).count() == 5


def test_a_launch_with_people_asks_for_the_person_and_the_exact_value(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    incentive_project: Any,
    db_session: Session,
) -> None:
    _send(
        client,
        auth,
        "/payables/import",
        _import_fields(world),
        _incentives(("2026-10-30", 2), value=200),
    )
    payable_id = client.get("/payables?mode=tudo", headers=auth).json()["items"][0]["id"]
    people = client.get(f"/payables/{payable_id}", headers=auth).json()["items"]
    client.post(
        f"/payables/{payable_id}/payments",
        json=payment(world, amount="400.00", paidOn=day(1).isoformat(), note="baixa do teste"),
        headers=auth,
    )
    other = create(client, auth, world, amount="450.00")["id"]
    right, wrong = load(
        client,
        auth,
        db_session,
        world["account"].id,
        (day(0), "-200.00", "PIX"),
        (day(0), "-210.00", "PIX"),
    )

    no_person = reconcile(client, auth, right, targetId=payable_id)
    assert (no_person.status_code, no_person.json()["detail"]) == (
        422,
        "Escolha a pessoa do lançamento",
    )
    stranger = reconcile(client, auth, right, targetId=payable_id, itemId=999_999)
    assert (stranger.status_code, stranger.json()["detail"]) == (
        422,
        "Essa pessoa não é deste lançamento",
    )
    value = reconcile(client, auth, wrong, targetId=payable_id, itemId=people[0]["id"])
    assert (value.status_code, value.json()["detail"]) == (
        409,
        "O valor da linha (R$ 210,00) não é o da pessoa (R$ 200,00)",
    )
    # lançamento sem pessoas não aceita pessoa
    assert reconcile(client, auth, right, targetId=other, itemId=people[0]["id"]).status_code in (
        409,
        422,
    )


def test_a_reconciliation_needs_a_valid_classification_and_a_free_line(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    target = paid(client, auth, world)
    (tx,) = load(client, auth, db_session, world["account"].id, (day(0), "-450.00", "PIX"))
    for value, message in (
        ("", "Escolha a classificação da linha"),
        ("inventada", "Classificação inválida"),
    ):
        refused = reconcile(client, auth, tx, targetId=target, classification=value)
        assert (refused.status_code, refused.json()["detail"]) == (422, message)
    assert reconcile(client, auth, tx, targetId=target).status_code == 204
    twice = reconcile(client, auth, tx, targetId=target)
    assert (twice.status_code, twice.json()["detail"]) == (409, "Essa linha já foi conciliada")
    assert db_session.query(BankReconciliation).count() == 1


def test_a_missing_line_or_launch_is_404(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    (tx,) = load(client, auth, db_session, world["account"].id, (day(0), "-450.00", "PIX"))
    assert (r := reconcile(client, auth, 999_999, targetId=1)).status_code == 404
    assert r.json()["detail"] == "Linha do extrato não encontrada"
    assert (r := reconcile(client, auth, tx, targetId=999_999)).status_code == 404
    assert r.json()["detail"] == "Lançamento não encontrado"
    assert client.get("/bank-transactions/999999/suggestions", headers=auth).status_code == 404


def test_an_incoming_line_reconciles_with_a_received_title_and_respects_its_value(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    revenue: dict[str, Any],
    db_session: Session,
) -> None:
    target = receivable(client, auth, world, revenue, amount="800.00")
    unreceived = receivable(client, auth, world, revenue, amount="800.00", received=False)
    first, second = load(
        client,
        auth,
        db_session,
        world["account"].id,
        (day(0), "800.00", "PIX RECEBIDO"),
        (day(0), "100.00", "OUTRO"),
    )
    assert (
        reconcile(
            client,
            auth,
            first,
            targetKind="receivable",
            targetId=target,
            classification="recebimento",
        ).status_code
        == 204
    )
    over = reconcile(
        client, auth, second, targetKind="receivable", targetId=target, classification="recebimento"
    )
    assert (over.status_code, over.json()["detail"]) == (
        409,
        "As linhas somam R$ 900,00, mas o lançamento é de R$ 800,00",
    )
    no_receipt = reconcile(
        client,
        auth,
        second,
        targetKind="receivable",
        targetId=unreceived,
        classification="recebimento",
    )
    assert (no_receipt.status_code, no_receipt.json()["detail"]) == (
        409,
        "Esse lançamento ainda não tem baixa: dê a baixa antes de conciliar",
    )
    shown = listed(client, auth, world["account"].id)["items"]
    assert (
        next(i for i in shown if i["id"] == first)["reconciliation"]["label"]
        == "Pesquisa de satisfação"
    )


# ---------------------------------------- exceção e desfazer


def test_an_exception_needs_a_reason_and_counts_as_reconciled_without_a_launch(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = world["account"].id
    (tx,) = load(client, auth, db_session, account, (day(0), "-18.90", "TARIFA DO MÊS"))
    for reason in ("", "   "):
        refused = client.post(
            f"/bank-transactions/{tx}/exception", json={"reason": reason}, headers=auth
        )
        assert (refused.status_code, refused.json()["detail"]) == (
            422,
            "Informe o motivo da exceção",
        )
    unclassified = client.post(
        f"/bank-transactions/{tx}/exception", json={"reason": "tarifa"}, headers=auth
    )
    assert (unclassified.status_code, unclassified.json()["detail"]) == (
        422,
        "Escolha a classificação da linha",
    )
    bad = client.post(
        f"/bank-transactions/{tx}/exception",
        json={"reason": "tarifa", "classification": "x"},
        headers=auth,
    )
    assert (bad.status_code, bad.json()["detail"]) == (422, "Classificação inválida")

    done = client.post(
        f"/bank-transactions/{tx}/exception",
        json={"reason": "Tarifa do banco", "classification": "tarifa"},
        headers=auth,
    )
    assert done.status_code == 204, done.text
    shown = listed(client, auth, account)
    assert shown["counts"] == {"pending": 0, "reconciled": 0, "exceptions": 1}
    reconciliation = shown["items"][0]["reconciliation"]
    assert (
        reconciliation["kind"],
        reconciliation["label"],
        reconciliation["classificationLabel"],
    ) == (
        "excecao",
        "Exceção: Tarifa do banco",
        "Tarifa",
    )
    assert reconciliation["targetKind"] is None and reconciliation["targetId"] is None
    assert [i["id"] for i in listed(client, auth, account, "?situation=excecao")["items"]] == [tx]
    again = client.post(
        f"/bank-transactions/{tx}/exception", json={"reason": "outra vez"}, headers=auth
    )
    assert (again.status_code, again.json()["detail"]) == (409, "Essa linha já foi conciliada")


def test_undoing_asks_for_a_reason_frees_the_line_and_the_history_keeps_who_and_why(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = world["account"].id
    target = paid(client, auth, world)
    (tx,) = load(client, auth, db_session, account, (day(0), "-450.00", f"PIX {NAME}"))
    not_yet = client.post(f"/bank-transactions/{tx}/undo", json={"reason": "engano"}, headers=auth)
    assert (not_yet.status_code, not_yet.json()["detail"]) == (
        409,
        "Essa linha não está conciliada",
    )

    assert reconcile(client, auth, tx, targetId=target).status_code == 204
    blank = client.post(f"/bank-transactions/{tx}/undo", json={"reason": " "}, headers=auth)
    assert (blank.status_code, blank.json()["detail"]) == (422, "Informe o motivo para desfazer")
    assert (
        client.post(
            f"/bank-transactions/{tx}/undo", json={"reason": "Linha errada"}, headers=auth
        ).status_code
        == 204
    )

    assert listed(client, auth, account)["counts"] == {
        "pending": 1,
        "reconciled": 0,
        "exceptions": 0,
    }
    assert (
        reconcile(client, auth, tx, targetId=target).status_code == 204
    )  # a linha volta a poder ser conciliada
    texts = [
        e.text
        for e in db_session.query(BankReconciliationEvent).order_by(BankReconciliationEvent.id)
    ]
    assert texts == [
        f"Conciliou R$ 450,00 com a conta a pagar #{target} (Outro)",
        "Desfez a conciliação de R$ 450,00: Linha errada",
        f"Conciliou R$ 450,00 com a conta a pagar #{target} (Outro)",
    ]


def test_undoing_an_exception_works_the_same(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    (tx,) = load(client, auth, db_session, world["account"].id, (day(0), "-18.90", "TARIFA"))
    client.post(
        f"/bank-transactions/{tx}/exception",
        json={"reason": "Tarifa", "classification": "tarifa"},
        headers=auth,
    )
    assert (
        client.post(
            f"/bank-transactions/{tx}/undo", json={"reason": "Era outra coisa"}, headers=auth
        ).status_code
        == 204
    )
    texts = [
        e.text
        for e in db_session.query(BankReconciliationEvent).order_by(BankReconciliationEvent.id)
    ]
    assert texts[-1] == "Desfez a exceção de R$ 18,90: Era outra coisa"
    assert db_session.query(BankReconciliation).count() == 0


# ---------------------------------------- dado pessoal e acesso


def test_the_history_never_carries_the_text_of_the_line_nor_the_log(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    target = paid(client, auth, world)
    (tx,) = load(
        client, auth, db_session, world["account"].id, (day(0), "-450.00", f"PIX ENVIADO {NAME}")
    )
    suggestions(client, auth, tx)
    reconcile(client, auth, tx, targetId=target)
    texts = " ".join(e.text for e in db_session.query(BankReconciliationEvent))
    assert NAME not in texts and NAME not in caplog.text


def test_the_reconciliation_routes_need_a_finance_login(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    reader = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(reader.id)}"}
    calls = (
        ("get", "/bank-transactions/1/suggestions", None),
        (
            "post",
            "/bank-transactions/1/reconcile",
            {"targetKind": "payable", "targetId": 1, "classification": "outro"},
        ),
        ("post", "/bank-transactions/1/exception", {"reason": "x", "classification": "tarifa"}),
        ("post", "/bank-transactions/1/undo", {"reason": "x"}),
    )
    for method, path, payload in calls:
        for header, expected in (({}, 401), (headers, 403)):
            response = getattr(client, method)(
                path, headers=header, **({"json": payload} if payload else {})
            )
            assert response.status_code == expected, (method, path, expected)
