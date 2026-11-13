# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.reference import BankAccount
from models.user import User
from services.auth import create_access_token
from tests.test_bank_reconciliation import load, reconcile
from tests.test_payables import auth, create, payment, world  # noqa: F401

# Datas fixas e passadas: a baixa de data passada é aceita com observação, e o teste não depende do
# dia em que roda.
AUG, SEP, OCT, NOV = "2026-08", "2026-09", "2026-10", "2026-11"


def pay(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    on: date,
    *,
    amount: str = "300.00",
    description: str = "Impressão de questionários",
    account: Any = None,
) -> tuple[int, int]:
    """Cria um lançamento e dá a baixa dele na data. Devolve o id do lançamento e o da baixa."""
    payable = create(client, auth, world, amount=amount, description=description)
    response = client.post(
        f"/payables/{payable['id']}/payments",
        json=payment(
            world,
            amount=amount,
            paidOn=on.isoformat(),
            note="baixa do teste",
            bankAccountId=(account or world["account"]).id,
        ),
        headers=auth,
    )
    assert response.status_code == 200, response.text
    detail = client.get(f"/payables/{payable['id']}", headers=auth).json()
    return int(payable["id"]), int(detail["payments"][-1]["id"])


def difference(client: TestClient, auth: dict[str, str], account_id: int, month: str) -> Any:
    response = client.get(f"/bank-accounts/{account_id}/difference?month={month}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def balances(client: TestClient, auth: dict[str, str], month: str) -> Any:
    response = client.get(f"/bank-balances?month={month}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


# ----------------------------------------------------------------------------- extrato × sistema


def test_the_difference_compares_the_exits_of_the_extract_with_the_payments_day_by_day(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = world["account"].id
    pay(client, auth, world, date(2026, 10, 5), amount="450.00")
    pay(client, auth, world, date(2026, 10, 8), amount="100.00")
    load(
        client,
        auth,
        db_session,
        account,
        (date(2026, 10, 5), "-450.00", "PIX GRAFICA"),
        (date(2026, 10, 8), "-120.00", "PIX OUTRO"),  # R$ 20 a mais que a baixa
        (date(2026, 10, 9), "-35.00", "TARIFA"),  # sem baixa no sistema
        (date(2026, 10, 9), "500.00", "PIX RECEBIDO"),  # entrada: não é saída
        (date(2026, 11, 2), "-999.00", "OUTRO MES"),
    )
    result = difference(client, auth, account, OCT)
    assert result["imported"] is True
    assert [(d["day"], d["extract"], d["system"], d["difference"]) for d in result["byDay"]] == [
        ("2026-10-05", "450.00", "450.00", "0.00"),
        ("2026-10-08", "120.00", "100.00", "20.00"),
        ("2026-10-09", "35.00", "0.00", "35.00"),
    ]
    assert (result["extractTotal"], result["systemTotal"], result["difference"]) == (
        "605.00",
        "550.00",
        "55.00",
    )
    # sem par: as duas saídas sem lançamento, ainda pendentes
    group = result["linesWithoutPair"]
    assert (group["count"], group["total"]) == (3, "605.00")
    assert {item["note"] for item in group["items"]} == {"pendente"}
    # as baixas do sistema não têm linha conciliada ainda
    assert result["paymentsWithoutLine"]["count"] == 2
    assert result["returns"] == {"count": 0, "total": "0.00", "items": []}


def test_a_reconciled_line_stops_being_unpaired_and_its_payment_gets_a_line(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = world["account"].id
    payable_id, _ = pay(client, auth, world, date(2026, 10, 5), amount="450.00")
    paid_line, fee = load(
        client,
        auth,
        db_session,
        account,
        (date(2026, 10, 5), "-450.00", "PIX GRAFICA"),
        (date(2026, 10, 6), "-35.00", "TARIFA"),
    )
    assert reconcile(client, auth, paid_line, targetId=payable_id).status_code == 204
    result = difference(client, auth, account, OCT)
    assert result["paymentsWithoutLine"]["count"] == 0
    assert [(i["description"], i["note"]) for i in result["linesWithoutPair"]["items"]] == [
        ("TARIFA", "pendente")
    ]
    # exceção também é saída sem par no sistema, mas diz que já foi resolvida
    client.post(
        f"/bank-transactions/{fee}/exception",
        json={"reason": "Tarifa", "classification": "tarifa"},
        headers=auth,
    )
    items = difference(client, auth, account, OCT)["linesWithoutPair"]["items"]
    assert [(i["description"], i["note"]) for i in items] == [("TARIFA", "exceção")]
    assert difference(client, auth, account, OCT)["difference"] == "35.00"


def test_a_pix_returned_in_august_and_paid_again_in_september_is_a_return_in_august_only(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = world["account"].id
    payable_id, first = pay(client, auth, world, date(2026, 8, 10), amount="300.00")
    back = client.post(
        f"/payables/{payable_id}/payments/{first}/reverse",
        json={"kind": "devolucao", "on": "2026-08-12", "reason": "Pix devolvido pelo banco"},
        headers=auth,
    )
    assert back.status_code == 200, back.text
    assert (
        client.post(
            f"/payables/{payable_id}/payments",
            json=payment(world, amount="300.00", paidOn="2026-09-03", note="pago de novo"),
            headers=auth,
        ).status_code
        == 200
    )
    aug_out, aug_in, sep_out = load(
        client,
        auth,
        db_session,
        account,
        (date(2026, 8, 10), "-300.00", "PIX GRAFICA"),
        (date(2026, 8, 12), "300.00", "DEVOLUCAO PIX"),
        (date(2026, 9, 3), "-300.00", "PIX GRAFICA DE NOVO"),
    )
    assert aug_in  # a devolução entra como crédito, que não é saída

    august = difference(client, auth, account, AUG)
    # a saída do extrato não tem baixa válida no sistema (ela foi devolvida): a diferença é a volta
    assert (august["extractTotal"], august["systemTotal"], august["difference"]) == (
        "300.00",
        "0.00",
        "300.00",
    )
    assert (august["returns"]["count"], august["returns"]["total"]) == (1, "300.00")
    assert august["returns"]["items"][0] == {
        "on": "2026-08-12",
        "description": "Impressão de questionários",
        "amount": "300.00",
        "note": None,
    }

    assert reconcile(client, auth, sep_out, targetId=payable_id).status_code == 204
    assert aug_out
    september = difference(client, auth, account, SEP)
    assert (september["extractTotal"], september["systemTotal"], september["difference"]) == (
        "300.00",
        "300.00",
        "0.00",
    )
    assert september["returns"]["count"] == 0
    assert (
        september["paymentsWithoutLine"]["count"] == 0
        and september["linesWithoutPair"]["count"] == 0
    )


def test_a_returned_pix_does_not_use_up_the_ceiling_of_the_payment_made_again(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = world["account"].id
    payable_id, first = pay(client, auth, world, date(2026, 8, 10), amount="300.00")
    (aug_out,) = load(
        client, auth, db_session, account, (date(2026, 8, 10), "-300.00", "PIX GRAFICA")
    )
    assert reconcile(client, auth, aug_out, targetId=payable_id).status_code == 204
    back = client.post(
        f"/payables/{payable_id}/payments/{first}/reverse",
        json={"kind": "devolucao", "on": "2026-08-12", "reason": "Pix devolvido pelo banco"},
        headers=auth,
    )
    assert back.status_code == 200, back.text
    again = client.post(
        f"/payables/{payable_id}/payments",
        json=payment(world, amount="300.00", paidOn="2026-09-03", note="pago de novo"),
        headers=auth,
    )
    assert again.status_code == 200, again.text
    (sep_out,) = load(
        client, auth, db_session, account, (date(2026, 9, 3), "-300.00", "PIX GRAFICA DE NOVO")
    )

    # as duas saídas são reais: o extrato tem R$ 600 para um lançamento de R$ 300
    assert reconcile(client, auth, sep_out, targetId=payable_id).status_code == 204


def test_a_line_of_another_account_does_not_match_a_payment_made_in_the_first_account(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    second = BankAccount(company_id=world["company"].id, name="Itaú · reserva")
    db_session.add(second)
    db_session.commit()
    payable_id, _ = pay(client, auth, world, date(2026, 10, 5), amount="450.00")
    (line,) = load(
        client, auth, db_session, second.id, (date(2026, 10, 5), "-450.00", "PIX GRAFICA")
    )

    response = reconcile(client, auth, line, targetId=payable_id)

    assert response.status_code == 409
    assert response.json()["detail"] == "A baixa desse lançamento foi em outra conta bancária"


def test_the_difference_ignores_other_accounts_and_an_empty_month_says_not_imported(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account, other = world["account"].id, world["other_account"].id
    pay(client, auth, world, date(2026, 10, 5), amount="450.00")
    load(client, auth, db_session, other, (date(2026, 10, 5), "-450.00", "PIX DA OUTRA CONTA"))
    mine = difference(client, auth, account, OCT)
    assert mine["imported"] is False and mine["extractTotal"] == "0.00"
    assert mine["systemTotal"] == "450.00"  # a baixa é desta conta, e o extrato dela não veio
    assert difference(client, auth, other, OCT)["systemTotal"] == "0.00"
    assert difference(client, auth, account, NOV)["byDay"] == []


def test_the_difference_refuses_a_missing_account_and_a_bad_month(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    missing = client.get(f"/bank-accounts/9999/difference?month={OCT}", headers=auth)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Conta bancária não encontrada")
    for bad in ("2026-13", "outubro", "2026-1", ""):
        response = client.get(
            f"/bank-accounts/{world['account'].id}/difference?month={bad}", headers=auth
        )
        assert response.status_code == 422, bad


# ----------------------------------------------------------------------------- saldo do mês


def test_the_balance_starts_from_the_opening_balance_and_counts_only_what_comes_after_its_date(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = db_session.get(BankAccount, world["account"].id)
    account.openingBalance = Decimal("1000.00")
    account.openingDate = date(2026, 10, 1)
    db_session.commit()
    ids = load(
        client,
        auth,
        db_session,
        account.id,
        (date(2026, 9, 28), "50.00", "ANTES DO SALDO INICIAL"),  # já está dentro do saldo inicial
        (date(2026, 10, 5), "500.00", "PIX RECEBIDO"),
        (date(2026, 10, 6), "-200.00", "TARIFA E OUTROS"),
        (date(2026, 11, 2), "-100.00", "NOVEMBRO"),
    )
    october = next(a for a in balances(client, auth, OCT)["accounts"] if a["id"] == account.id)
    assert (october["opening"], october["income"], october["expense"], october["closing"]) == (
        "1000.00",
        "500.00",
        "200.00",
        "1300.00",
    )
    # nada conferido ainda: pelo sistema o saldo fica no inicial, e tudo está "a conferir"
    assert (october["bySystem"], october["toCheck"], october["imported"]) == (
        "1000.00",
        "300.00",
        True,
    )

    # a saída vira exceção (conferida) e a entrada segue pendente
    client.post(
        f"/bank-transactions/{ids[2]}/exception",
        json={"reason": "Tarifa", "classification": "tarifa"},
        headers=auth,
    )
    october = next(a for a in balances(client, auth, OCT)["accounts"] if a["id"] == account.id)
    assert (october["bySystem"], october["toCheck"]) == ("800.00", "500.00")

    # o mês seguinte começa de onde o anterior terminou
    november = next(a for a in balances(client, auth, NOV)["accounts"] if a["id"] == account.id)
    assert (november["opening"], november["expense"], november["closing"]) == (
        "1300.00",
        "100.00",
        "1200.00",
    )


def test_the_balance_without_an_opening_date_counts_every_line_and_totals_the_accounts(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    first = db_session.get(BankAccount, world["account"].id)
    first.openingBalance = Decimal("100.00")
    second = db_session.get(BankAccount, world["other_account"].id)
    second.openingBalance = Decimal("50.00")
    db_session.commit()
    load(client, auth, db_session, first.id, (date(2026, 10, 3), "25.50", "PIX"))
    load(client, auth, db_session, second.id, (date(2026, 10, 4), "-10.25", "PIX"))
    result = balances(client, auth, OCT)
    by_id = {a["id"]: a for a in result["accounts"]}
    assert by_id[first.id]["closing"] == "125.50" and by_id[second.id]["closing"] == "39.75"
    assert by_id[first.id]["company"] == "PPlus" and by_id[second.id]["company"] == "MC"
    assert result["total"]["opening"] == "150.00"
    assert result["total"]["income"] == "25.50" and result["total"]["expense"] == "10.25"
    assert result["total"]["closing"] == "165.25"
    # uma conta sem extrato no mês continua na lista, dizendo que não foi importada
    empty = {a["id"]: a for a in balances(client, auth, NOV)["accounts"]}
    assert empty[first.id]["imported"] is False and empty[first.id]["closing"] == "125.50"


def test_an_inactive_account_only_shows_when_it_has_lines_in_the_month(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    other = db_session.get(BankAccount, world["other_account"].id)
    load(client, auth, db_session, other.id, (date(2026, 10, 4), "10.00", "PIX"))
    other.active = False
    db_session.commit()
    assert other.id in {a["id"] for a in balances(client, auth, OCT)["accounts"]}
    assert other.id not in {a["id"] for a in balances(client, auth, NOV)["accounts"]}


def test_the_report_routes_need_a_finance_login(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    reader = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(reader.id)}"}
    for path in (f"/bank-accounts/1/difference?month={OCT}", f"/bank-balances?month={OCT}"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers=headers).status_code == 403
