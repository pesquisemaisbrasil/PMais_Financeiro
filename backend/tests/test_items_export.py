# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
import io
from collections.abc import Callable
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from core import xlsx
from models.payable import PayableEvent
from models.reference import Project
from models.user import User
from services.auth import create_access_token
from tests.test_payables import (  # noqa: F401
    FAKE_CPF,
    FAKE_PIX,
    INCENTIVE_HEADER,
    _import_fields,
    _incentives,
    _send,
    _xlsx,
    auth,
    body,
    incentive_project,
    payment,
    world,
)


def imported(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], content: bytes
) -> int:
    response = _send(client, auth, "/payables/import", _import_fields(world), content)
    assert response.status_code == 201, response.text
    return int(client.get("/payables?mode=tudo", headers=auth).json()["items"][0]["id"])


def export(client: TestClient, auth: dict[str, str], payable_id: int) -> Any:
    return client.get(f"/payables/{payable_id}/items/export", headers=auth)


def sheet(response: Any) -> list[list[Any]]:
    book = load_workbook(io.BytesIO(response.content))
    return [list(row) for row in book.active.iter_rows(values_only=True)]


def test_the_people_of_an_incentive_come_out_in_excel_with_the_masked_key(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    payable_id = imported(client, auth, world, _incentives(("2026-10-30", 2), value=120))
    response = export(client, auth, payable_id)
    assert response.status_code == 200
    assert response.headers["content-type"] == xlsx.MEDIA_TYPE
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="incentivos-PRJ-1804-2026-11-16.xlsx"'
    )
    assert response.headers["cache-control"] == "no-store"

    rows = sheet(response)
    assert (
        rows[0][0]
        == "Incentivos · PRJ-1804 · pagar 16/11 · PRJ-1804 · vence 16/11/2026 · 2 pessoas"
    )
    assert rows[1] == [
        "Pessoa",
        "Chave Pix (mascarada)",
        "Data da pesquisa",
        "Nota",
        "Valor",
        "Situação",
    ]
    first, second = rows[2], rows[3]
    assert (first[0], first[1], first[3], first[4], first[5]) == (
        "Respondente 001",
        "pes***@exemplo.invalid",
        "Sem nota",
        Decimal("120"),
        "A pagar",
    )
    assert second[0] == "Respondente 002"
    assert rows[4][4] == 240  # o total no fim, só na coluna de dinheiro


def test_the_complete_key_and_the_cpf_never_reach_the_spreadsheet(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    payable_id = imported(client, auth, world, _incentives(("2026-10-30", 2)))
    response = export(client, auth, payable_id)
    text = " ".join(str(cell) for row in sheet(response) for cell in row if cell is not None)
    assert FAKE_PIX not in text and FAKE_CPF not in text
    assert FAKE_PIX.encode() not in response.content and FAKE_CPF.encode() not in response.content


def test_a_name_that_looks_like_a_formula_stays_text(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    # "+" e "@" chegam como texto pela importação, mas o Excel os leria como fórmula ao abrir
    content = _xlsx(
        [
            ["Nome", "Valor", "Data de pagamento"],
            ["+SUM(1+1)", 10, "2026-11-16"],
            ["@SUM(1+1)", 10, "2026-11-16"],
        ]
    )
    payable_id = imported(client, auth, world, content)
    book = load_workbook(io.BytesIO(export(client, auth, payable_id).content))
    cells = [book.active["A3"], book.active["A4"]]
    assert [(c.data_type, c.value) for c in cells] == [("s", "+SUM(1+1)"), ("s", "@SUM(1+1)")]


def test_who_was_paid_shows_in_the_situation_column(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], incentive_project: Project
) -> None:
    payable_id = imported(client, auth, world, _incentives(("2026-10-30", 2), value=100))
    paid = client.post(
        f"/payables/{payable_id}/payments", json=payment(world, amount="200.00"), headers=auth
    )
    assert paid.status_code == 200, paid.text
    statuses = {row[0]: row[5] for row in sheet(export(client, auth, payable_id))[2:4]}
    assert all(text.startswith("Paga em ") for text in statuses.values())


def test_every_download_is_written_in_the_history_without_counting_as_a_change(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    incentive_project: Project,
    db_session: Session,
) -> None:
    payable_id = imported(client, auth, world, _incentives(("2026-10-30", 2)))
    before = client.get(f"/payables/{payable_id}", headers=auth).json()["updatedAt"]
    export(client, auth, payable_id)
    export(client, auth, payable_id)
    texts = [e.text for e in db_session.query(PayableEvent).filter_by(payable_id=payable_id)]
    assert texts.count("Documento baixado: planilha das pessoas (2 pessoas)") == 2
    # baixar não muda a conta: a data de "atualizado em" é a mesma
    assert client.get(f"/payables/{payable_id}", headers=auth).json()["updatedAt"] == before


def test_a_payable_without_people_and_a_missing_one_are_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    manual = client.post("/payables", json=body(world), headers=auth).json()["id"]
    refused = export(client, auth, manual)
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "Esse lançamento não tem pessoas",
    )
    missing = export(client, auth, 9999)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Conta não encontrada")


def test_the_spreadsheet_needs_a_finance_login(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    assert client.get("/payables/1/items/export").status_code == 401
    other = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.get("/payables/1/items/export", headers=headers).status_code == 403
