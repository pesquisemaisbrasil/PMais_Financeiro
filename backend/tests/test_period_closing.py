# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
import io
from collections.abc import Callable
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from models.period_closing import PeriodClosing, PeriodClosingEvent
from models.user import User
from services.auth import create_access_token
from services.payable import today
from tests.test_bank_reconciliation import lines, load, reconcile, revenue  # noqa: F401
from tests.test_bank_reports import pay
from tests.test_bank_statements import send
from tests.test_payables import auth, body, create, payment, world  # noqa: F401

OCT = "2026-10"
CLOSED = "O período de outubro/2026 está fechado. Só um administrador pode reabrir"


@pytest.fixture
def admin(make_user: Callable[..., User]) -> dict[str, str]:
    user = make_user(email="admin@exemplo.com", role="admin")
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def status_of(client: TestClient, auth: dict[str, str], month: str = OCT) -> Any:
    response = client.get(f"/period-closings?month={month}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def company(result: Any, name: str) -> Any:
    return next(c for c in result["companies"] if c["name"] == name)


def close(client: TestClient, auth: dict[str, str], company_id: int, month: str = OCT) -> Any:
    return client.post(f"/period-closings/{company_id}/{month}/close", headers=auth)


def october(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db: Session
) -> dict[str, Any]:
    """Outubro da PPlus pronto: uma saída conciliada com a baixa e a tarifa como exceção."""
    payable_id, payment_id = pay(client, auth, world, date(2026, 10, 5), amount="450.00")
    paid_line, fee = load(
        client,
        auth,
        db,
        world["account"].id,
        (date(2026, 10, 5), "-450.00", "PIX GRAFICA"),
        (date(2026, 10, 6), "-35.00", "TARIFA DO BANCO"),
    )
    assert (
        reconcile(
            client,
            auth,
            paid_line,
            targetId=payable_id,
            classification="nf",
            nfNumber="5521",
            nfIssuedOn="2026-10-01",
        ).status_code
        == 204
    )
    assert (
        client.post(
            f"/bank-transactions/{fee}/exception",
            json={"reason": "Tarifa do banco", "classification": "tarifa"},
            headers=auth,
        ).status_code
        == 204
    )
    return {"payable": payable_id, "payment": payment_id, "paid_line": paid_line, "fee": fee}


# ---------------------------------------- o que falta para fechar


def test_the_status_lists_each_company_with_a_bank_account_and_what_is_missing(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    empty = status_of(client, auth)
    assert [c["name"] for c in empty["companies"]] == ["MC", "PPlus"]
    pplus = company(empty, "PPlus")
    assert pplus["closed"] is False and pplus["ready"] is False
    assert pplus["notImported"] == ["Itaú · PPlus"] and pplus["lines"] == 0

    load(
        client,
        auth,
        db_session,
        world["account"].id,
        (date(2026, 10, 5), "-450.00", "PIX"),
        (date(2026, 10, 6), "-35.00", "TARIFA"),
    )
    pending = company(status_of(client, auth), "PPlus")
    assert (pending["notImported"], pending["lines"], pending["withoutPair"]) == ([], 2, 2)
    assert pending["ready"] is False
    assert company(status_of(client, auth), "MC")["notImported"] == ["Bradesco · MC"]
    # outro mês: o extrato de outubro não vale para novembro
    assert company(status_of(client, auth, "2026-11"), "PPlus")["notImported"] == ["Itaú · PPlus"]


def test_a_month_is_ready_when_every_line_is_reconciled_or_an_exception_with_a_class(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    october(client, auth, world, db_session)
    ready = company(status_of(client, auth), "PPlus")
    assert (ready["lines"], ready["withoutPair"], ready["withoutClassification"]) == (2, 0, 0)
    assert ready["ready"] is True


def test_closing_is_refused_until_the_extract_is_imported_and_every_line_is_resolved(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    company_id = world["company"].id
    no_extract = close(client, auth, company_id)
    assert (no_extract.status_code, no_extract.json()["detail"]) == (
        409,
        "Importe o extrato de Itaú · PPlus antes de fechar",
    )
    load(
        client,
        auth,
        db_session,
        world["account"].id,
        (date(2026, 10, 5), "-450.00", "PIX"),
        (date(2026, 10, 6), "-35.00", "TARIFA"),
    )
    unresolved = close(client, auth, company_id)
    assert (unresolved.status_code, unresolved.json()["detail"]) == (
        409,
        "Há 2 linhas não conciliadas ou sem classificação em PPlus",
    )
    assert db_session.query(PeriodClosing).count() == 0


def test_a_month_that_has_not_started_and_a_missing_company_are_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    future = close(client, auth, world["company"].id, "2099-01")
    assert (future.status_code, future.json()["detail"]) == (422, "Esse mês ainda não começou")
    missing = close(client, auth, 9999)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Empresa não encontrada")
    for bad in ("2026-13", "outubro"):
        assert (
            client.post(
                f"/period-closings/{world['company'].id}/{bad}/close", headers=auth
            ).status_code
            == 422
        )


def test_closing_marks_the_month_closed_for_that_company_only_and_writes_the_history(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    october(client, auth, world, db_session)
    assert close(client, auth, world["company"].id).status_code == 204
    result = status_of(client, auth)
    pplus = company(result, "PPlus")
    assert pplus["closed"] is True and pplus["closedBy"] and pplus["closedAt"]
    assert company(result, "MC")["closed"] is False
    assert [(c["company"], c["month"]) for c in result["closings"]] == [("PPlus", OCT)]
    texts = [e.text for e in db_session.query(PeriodClosingEvent)]
    assert texts == ["Fechou outubro/2026"]
    again = close(client, auth, world["company"].id)
    assert (again.status_code, again.json()["detail"]) == (409, "Esse mês já está fechado")


# ---------------------------------------- a trava


def test_a_closed_month_refuses_baixa_in_batch_estorno_devolucao_and_new_entries(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    done = october(client, auth, world, db_session)
    unpaid = create(client, auth, world, amount="200.00")["id"]
    assert close(client, auth, world["company"].id).status_code == 204

    def refused(response: Any) -> None:
        assert (response.status_code, response.json()["detail"]) == (409, CLOSED)

    # baixa com data de outubro
    refused(
        client.post(
            f"/payables/{unpaid}/payments",
            json=payment(world, amount="200.00", paidOn="2026-10-20", note="atrasada"),
            headers=auth,
        )
    )
    # baixa em lote com data de outubro
    refused(
        client.post(
            "/payables/batch/payments",
            json={
                "ids": [unpaid],
                "paidOn": "2026-10-20",
                "bankAccountId": world["account"].id,
                "paymentMethodId": world["method"].id,
                "note": "atrasada",
            },
            headers=auth,
        )
    )
    # estorno e Pix devolvido de uma baixa de outubro
    refused(
        client.post(
            f"/payables/{done['payable']}/payments/{done['payment']}/reverse",
            json={"kind": "estorno", "reason": "baixa errada"},
            headers=auth,
        )
    )
    refused(
        client.post(
            f"/payables/{done['payable']}/payments/{done['payment']}/reverse",
            json={"kind": "devolucao", "on": "2026-10-25", "reason": "devolvido"},
            headers=auth,
        )
    )
    # lançamento com emissão em outubro
    refused(
        client.post(
            "/payables",
            json=body(world, issueDate="2026-10-10", dueDate="2026-10-31"),
            headers=auth,
        )
    )
    # o mês seguinte segue aberto: baixa de hoje passa
    assert (
        client.post(
            f"/payables/{unpaid}/payments", json=payment(world, amount="200.00"), headers=auth
        ).status_code
        == 200
    )


def test_a_closed_month_refuses_receipts_estorno_and_new_titles_too(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    revenue: dict[str, Any],
    db_session: Session,
) -> None:
    october(client, auth, world, db_session)
    title = {
        "customerId": revenue["customer"].id,
        "projectId": world["project"].id,
        "companyId": world["company"].id,
        "unitId": world["unit"].id,
        "costCenterId": world["cost_center"].id,
        "categoryId": revenue["category"].id,
        "description": "Pesquisa de satisfação",
        "issueDate": "2026-11-01",
        "dueDate": "2026-11-12",
        "amount": "800.00",
    }
    open_title = client.post("/receivables", json=title, headers=auth).json()["id"]
    received = client.post(
        f"/receivables/{open_title}/receipts",
        json={
            "receivedOn": "2026-10-03",
            "amount": "800.00",
            "bankAccountId": world["account"].id,
            "paymentMethodId": world["method"].id,
            "note": "antes de fechar",
        },
        headers=auth,
    )
    assert received.status_code == 200, received.text  # outubro ainda aberto
    receipt_id = client.get(f"/receivables/{open_title}", headers=auth).json()["payments"][0]["id"]
    other = client.post("/receivables", json={**title, "amount": "100.00"}, headers=auth).json()[
        "id"
    ]
    assert close(client, auth, world["company"].id).status_code == 204

    def refused(response: Any) -> None:
        assert (response.status_code, response.json()["detail"]) == (409, CLOSED)

    refused(
        client.post(
            f"/receivables/{other}/receipts",
            json={
                "receivedOn": "2026-10-20",
                "amount": "100.00",
                "bankAccountId": world["account"].id,
                "paymentMethodId": world["method"].id,
                "note": "atrasado",
            },
            headers=auth,
        )
    )
    refused(
        client.post(
            f"/receivables/{open_title}/receipts/{receipt_id}/reverse",
            json={"reason": "recebimento errado"},
            headers=auth,
        )
    )
    refused(client.post("/receivables", json={**title, "issueDate": "2026-10-10"}, headers=auth))


def test_a_closed_month_refuses_to_reconcile_undo_or_receive_new_extract_lines(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    done = october(client, auth, world, db_session)
    assert close(client, auth, world["company"].id).status_code == 204
    account = world["account"].id

    undo = client.post(
        f"/bank-transactions/{done['fee']}/undo", json={"reason": "engano"}, headers=auth
    )
    assert (undo.status_code, undo.json()["detail"]) == (409, CLOSED)
    # linha nova de outubro no extrato ficaria pendente para sempre
    late = send(client, auth, account, lines((date(2026, 10, 20), "-12.00", "LINHA TARDIA")))
    assert (late.status_code, late.json()["detail"]) == (409, CLOSED)
    # novembro continua recebendo linhas
    assert (
        send(client, auth, account, lines((date(2026, 11, 3), "-12.00", "NOVEMBRO"))).status_code
        == 201
    )


# ---------------------------------------- reabrir


def test_only_an_administrator_reopens_with_a_reason_and_the_lock_is_released(
    client: TestClient,
    auth: dict[str, str],
    admin: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
) -> None:
    october(client, auth, world, db_session)
    company_id = world["company"].id
    assert close(client, auth, company_id).status_code == 204
    url = f"/period-closings/{company_id}/{OCT}/reopen"

    not_admin = client.post(url, json={"reason": "erro"}, headers=auth)
    assert (not_admin.status_code, not_admin.json()["detail"]) == (
        403,
        "Só um administrador pode reabrir um período fechado",
    )
    no_reason = client.post(url, json={"reason": "  "}, headers=admin)
    assert (no_reason.status_code, no_reason.json()["detail"]) == (
        422,
        "Informe o motivo para reabrir",
    )
    assert (
        client.post(url, json={"reason": "Nota fiscal chegou depois"}, headers=admin).status_code
        == 204
    )

    assert company(status_of(client, auth), "PPlus")["closed"] is False
    assert db_session.query(PeriodClosing).count() == 0
    texts = [e.text for e in db_session.query(PeriodClosingEvent).order_by(PeriodClosingEvent.id)]
    assert texts == ["Fechou outubro/2026", "Reabriu outubro/2026: Nota fiscal chegou depois"]
    # solta a trava: dá para baixar com data de outubro de novo
    unpaid = create(client, auth, world, amount="200.00")["id"]
    assert (
        client.post(
            f"/payables/{unpaid}/payments",
            json=payment(world, amount="200.00", paidOn="2026-10-20", note="atrasada"),
            headers=auth,
        ).status_code
        == 200
    )
    again = client.post(url, json={"reason": "outra vez"}, headers=admin)
    assert (again.status_code, again.json()["detail"]) == (409, "Esse mês não está fechado")


# ---------------------------------------- planilha da contabilidade


def test_the_accounting_sheet_has_one_row_per_line_with_class_nf_and_the_launch(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    october(client, auth, world, db_session)
    load(
        client,
        auth,
        db_session,
        world["account"].id,
        (date(2026, 10, 9), "-7.00", "LINHA PENDENTE"),
    )
    response = client.get(f"/period-closings/{world['company'].id}/{OCT}/sheet", headers=auth)
    assert response.status_code == 200
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="conciliacao-pplus-2026-10.xlsx"'
    )
    assert response.headers["cache-control"] == "no-store"
    book = load_workbook(io.BytesIO(response.content))
    rows = [list(row) for row in book.active.iter_rows(values_only=True)]
    assert rows[0][0] == "Conciliação bancária · PPlus · outubro/2026"
    assert rows[1] == [
        "Data",
        "Conta",
        "Descrição no extrato",
        "Valor (R$)",
        "Classificação",
        "Número da NF",
        "Emissão da NF",
        "Lançamento no sistema",
        "Situação",
    ]
    paid_row, fee_row, pending_row = rows[2], rows[3], rows[4]
    assert paid_row[1:3] == ["Itaú · PPlus", "PIX GRAFICA"]
    assert (paid_row[4], paid_row[5], paid_row[7], paid_row[8]) == (
        "Pagamento com NF",
        "5521",
        "Impressão de questionários",
        "Conferida",
    )
    assert paid_row[6].date() == date(2026, 10, 1)
    assert (fee_row[4], fee_row[7], fee_row[8]) == ("Tarifa", None, "Exceção: Tarifa do banco")
    assert (pending_row[4], pending_row[8]) == (None, "Pendente")
    assert rows[5][3] == -492  # o total no fim, só na coluna de dinheiro: 450 + 35 + 7 de saída
    # o download fica no histórico, sem o texto das linhas
    texts = [e.text for e in db_session.query(PeriodClosingEvent)]
    assert texts == ["Baixou a planilha da contabilidade de outubro/2026 (3 linhas)"]


def test_the_sheet_of_a_company_without_lines_is_empty_and_a_missing_company_is_404(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    other = world["other_account"].company_id
    empty = client.get(f"/period-closings/{other}/{OCT}/sheet", headers=auth)
    assert empty.status_code == 200
    rows = [
        list(r) for r in load_workbook(io.BytesIO(empty.content)).active.iter_rows(values_only=True)
    ]
    assert rows[0][0] == "Conciliação bancária · MC · outubro/2026"
    assert len(rows) == 2  # só o título e os cabeçalhos
    missing = client.get(f"/period-closings/9999/{OCT}/sheet", headers=auth)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Empresa não encontrada")


def test_the_closing_routes_need_a_finance_login(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    reader = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(reader.id)}"}
    calls = (
        ("get", f"/period-closings?month={OCT}", None),
        ("post", f"/period-closings/1/{OCT}/close", None),
        ("post", f"/period-closings/1/{OCT}/reopen", {"reason": "x"}),
        ("get", f"/period-closings/1/{OCT}/sheet", None),
    )
    for method, path, payload in calls:
        for header, expected in (({}, 401), (headers, 403)):
            kwargs: dict[str, Any] = {"json": payload} if payload else {}
            assert getattr(client, method)(path, headers=header, **kwargs).status_code == expected


# ---- Lançamento novo nasce com emissão de hoje: mês fechado não recebe (achado da revisão) ----


def _close_current_month(db: Session, world: dict[str, Any]) -> None:
    closer = db.query(User).first()
    assert closer is not None
    db.add(
        PeriodClosing(
            company_id=world["company"].id, month=today().strftime("%Y-%m"), closed_by_id=closer.id
        )
    )
    db.commit()


def test_duplicate_is_refused_when_this_month_is_closed(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    source = create(client, auth, world)
    _close_current_month(db_session, world)

    response = client.post("/payables/batch/duplicate", json={"ids": [source["id"]]}, headers=auth)

    assert response.status_code == 409
    assert "está fechado. Só um administrador pode reabrir" in response.json()["detail"]


def test_replacing_a_provision_with_a_new_real_one_is_refused_when_this_month_is_closed(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    allocations = [{"projectId": world["project"].id, "amount": "1000.00"}]
    provision = create(client, auth, world, type="provisao", allocations=allocations)
    _close_current_month(db_session, world)

    response = client.post(
        f"/payables/{provision['id']}/replace",
        json={"amount": "900.00", "supplierId": world["supplier"].id},
        headers=auth,
    )

    assert response.status_code == 409
    assert "está fechado. Só um administrador pode reabrir" in response.json()["detail"]
