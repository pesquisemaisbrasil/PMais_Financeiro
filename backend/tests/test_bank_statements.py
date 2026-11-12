# ruff: noqa: F811  (as fixtures importadas de test_payables são reusadas pelo nome)
import hashlib
import logging
from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core import statement
from core.statement import UNREADABLE, StatementError, parse_amount, parse_statement
from main import app
from models.bank_statement import BankStatement, BankTransaction
from models.reference import BankAccount, RecordEvent
from models.user import User
from services import bank_statement
from services.auth import create_access_token
from tests.test_payables import auth, world  # noqa: F401

NAME = "MARIA EXEMPLO DA SILVA"  # fictício: o nome de quem pagou, que vai na descrição do Pix


def ofx(*lines: tuple[str, str, str, str], account: str = "12345-6") -> bytes:
    """Um OFX no estilo SGML dos bancos brasileiros (sem tag de fechamento nos valores)."""
    body = "".join(
        f"<STMTTRN>\n<TRNTYPE>OTHER\n<DTPOSTED>{day}120000[-3:BRT]\n<TRNAMT>{amount}\n"
        f"<FITID>{fitid}\n<MEMO>{memo}\n</STMTTRN>\n"
        for day, amount, fitid, memo in lines
    )
    text = (
        "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n"
        "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>341\n"
        f"<ACCTID>{account}\n<ACCTTYPE>CHECKING\n</BANKACCTFROM><BANKTRANLIST>\n{body}"
        "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n"
    )
    return text.encode("cp1252")


STATEMENT = ofx(
    ("20261105", "-200.00", "A1", f"PIX ENVIADO {NAME}"),
    ("20261106", "1500.50", "A2", "PIX RECEBIDO Conciliação"),
    ("20261109", "-18.90", "A3", "TARIFA DO MÊS"),
)

ITAU_CSV = (
    "Extrato de conta corrente;;;;\n"
    "Ag./Conta: 1234/12345-6;;;;\n"
    ";;;;\n"
    "data;lançamento;ag./origem;valor (R$);saldos (R$)\n"
    "05/11/2026;SALDO ANTERIOR;;;1.000,00\n"
    f"05/11/2026;PIX ENVIADO {NAME};;-200,00;\n"
    "06/11/2026;PIX RECEBIDO Conciliação;;1.500,50;\n"
    "06/11/2026;SALDO TOTAL DISPONÍVEL DIA;;;2.300,50\n"
).encode("cp1252")


def send(
    client: TestClient, auth: dict[str, str], account_id: int, content: bytes, *, path: str = ""
) -> Any:
    return client.post(
        f"/bank-accounts/{account_id}/statements{path}",
        files={"file": ("extrato.ofx", content)},
        headers=auth,
    )


def rows(db: Session) -> list[BankTransaction]:
    db.expire_all()
    return db.query(BankTransaction).order_by(BankTransaction.id).all()


# ----------------------------------------------------------------------------- leitores


def test_ofx_is_read_with_accents_sign_and_the_bank_id() -> None:
    parsed = parse_statement(STATEMENT)
    assert parsed.file_format == "ofx"
    assert parsed.account_digits == "123456"
    assert [(line.posted_on, line.amount, line.external_id) for line in parsed.lines] == [
        (date(2026, 11, 5), Decimal("-200.00"), "A1"),
        (date(2026, 11, 6), Decimal("1500.50"), "A2"),
        (date(2026, 11, 9), Decimal("-18.90"), "A3"),
    ]
    assert parsed.lines[1].description == "PIX RECEBIDO Conciliação"
    assert parsed.lines[2].description == "TARIFA DO MÊS"


def test_ofx_in_xml_form_with_closing_tags_is_read_too() -> None:
    content = (
        b"<?xml version='1.0'?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>"
        b"<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261110</DTPOSTED><TRNAMT>-5.00</TRNAMT>"
        b"<FITID>X1</FITID><NAME>Tarifa</NAME><MEMO>Tarifa</MEMO></STMTTRN>"
        b"</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"
    )
    (line,) = parse_statement(content).lines
    assert (line.posted_on, line.amount, line.description) == (
        date(2026, 11, 10),
        Decimal("-5.00"),
        "Tarifa",  # NAME e MEMO iguais não repetem
    )


def test_ofx_entities_are_never_expanded() -> None:
    # o leitor não é um parser de XML: o que parece entidade externa é só texto
    content = (
        b'<!DOCTYPE OFX [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><OFX><BANKTRANLIST><STMTTRN>'
        b"<DTPOSTED>20261110<TRNAMT>-5.00<FITID>X1<MEMO>&xxe;</STMTTRN></BANKTRANLIST></OFX>"
    )
    assert parse_statement(content).lines[0].description == "&xxe;"


def test_csv_of_the_bank_finds_the_header_and_skips_balance_lines() -> None:
    parsed = parse_statement(ITAU_CSV)
    assert parsed.file_format == "csv"
    assert [(line.posted_on, line.amount) for line in parsed.lines] == [
        (date(2026, 11, 5), Decimal("-200.00")),
        (date(2026, 11, 6), Decimal("1500.50")),
    ]
    assert parsed.lines[1].description == "PIX RECEBIDO Conciliação"


def test_csv_with_separate_credit_and_debit_columns() -> None:
    content = (
        "Data,Histórico,Crédito,Débito\n"
        '10/11/2026,DEPÓSITO,"1.200,00",\n'
        '11/11/2026,PAGAMENTO,,"350,25"\n'
    ).encode()
    assert [line.amount for line in parse_statement(content).lines] == [
        Decimal("1200.00"),
        Decimal("-350.25"),
    ]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1.234,56", "1234.56"),
        ("-1234.56", "-1234.56"),
        ("(1.234,56)", "-1234.56"),
        ("1.234,56-", "-1234.56"),
        ("R$ 50,00", "50.00"),
        ("1.234", "1234.00"),
        ("+10", "10.00"),
        ("0,5", "0.50"),
    ],
)
def test_amounts_are_read_the_way_the_bank_writes_them(raw: str, expected: str) -> None:
    assert parse_amount(raw) == Decimal(expected)


@pytest.mark.parametrize("raw", ["", "abc", "1,234,56x", "10,005", "--5"])
def test_amounts_that_cannot_be_read_are_refused(raw: str) -> None:
    with pytest.raises(StatementError):
        parse_amount(raw)


@pytest.mark.parametrize(
    "content",
    [
        b"",
        b"isto nao e um extrato",
        b"\x00\x01\x02\xff\xfe",
        b"<OFX><STMTTRN><TRNAMT>-5.00</STMTTRN></OFX>",  # sem data
        b"<OFX><STMTTRN><DTPOSTED>20261340<TRNAMT>-5.00</STMTTRN></OFX>",  # data impossível
        b"<OFX><STMTTRN><DTPOSTED>20261110<TRNAMT>-5.005</STMTTRN></OFX>",  # 3 casas
        b"<OFX></OFX>",  # nenhuma linha
        b"data;lancamento\n10/11/2026;sem valor",  # sem coluna de valor
        b"data;lancamento;valor\n",  # só o cabeçalho
    ],
)
def test_a_file_that_is_not_a_statement_is_refused_with_the_standard_message(
    content: bytes,
) -> None:
    with pytest.raises(StatementError) as refused:
        parse_statement(content)
    assert str(refused.value) == UNREADABLE


def test_a_statement_with_too_many_lines_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(statement, "MAX_LINES", 2)
    with pytest.raises(StatementError, match="importe por períodos menores"):
        parse_statement(ofx(*[("20261105", "-1.00", f"F{n}", "x") for n in range(3)]))


# ----------------------------------------------------------------------------- a conta


def account_body(world: dict[str, Any], **over: Any) -> dict[str, Any]:
    return {
        "name": "Itaú · Conta nova",
        "companyId": world["company"].id,
        "bankName": "Itaú",
        "agency": "1234",
        "accountNumber": "12345-6",
        "accountType": "corrente",
        "openingBalance": "1000.00",
        "openingDate": "2026-11-01",
        **over,
    }


def test_the_bank_account_keeps_bank_agency_account_type_and_opening_balance(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    response = client.post("/records/bankAccounts", json=account_body(world), headers=auth)
    assert response.status_code == 201, response.text
    created = response.json()
    assert (created["bankName"], created["agency"], created["accountNumber"]) == (
        "Itaú",
        "1234",
        "12345-6",
    )
    assert (created["accountType"], created["openingBalance"], created["openingDate"]) == (
        "corrente",
        "1000.00",
        "2026-11-01",
    )
    # o tipo e o saldo têm padrão: corrente e zero
    minimal = client.post(
        "/records/bankAccounts",
        json={"name": "Caixa", "companyId": world["company"].id, "bankName": "Caixa interno"},
        headers=auth,
    ).json()
    assert (minimal["accountType"], minimal["openingBalance"]) == ("corrente", "0.00")


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"bankName": " "}, "Preencha o banco"),
        ({"bankName": None}, "Preencha o banco"),
        ({"agency": "12 34 abc"}, "A agência tem só números, hífen e o dígito (pode ser X)"),
        ({"accountNumber": "conta"}, "A conta tem só números, hífen e o dígito (pode ser X)"),
        ({"openingDate": None}, "Informe a data do saldo inicial"),
        ({"accountType": "poupanca"}, None),
    ],
)
def test_bank_account_data_that_makes_no_sense_is_refused(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    change: dict[str, Any],
    message: str | None,
) -> None:
    response = client.post(
        "/records/bankAccounts", json=account_body(world, **change), headers=auth
    )
    assert response.status_code == 422
    if message:
        assert response.json()["detail"] == message


def test_a_bank_account_with_a_statement_is_in_use_and_cannot_be_deleted(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    account_id = world["account"].id
    assert send(client, auth, account_id, STATEMENT).status_code == 201
    listed = {row["id"]: row for row in client.get("/records/bankAccounts", headers=auth).json()}
    assert listed[account_id]["inUse"] is True
    refused = client.delete(f"/records/bankAccounts/{account_id}", headers=auth)
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "Esse cadastro tem lançamentos — inative em vez de excluir",
    )


# ----------------------------------------------------------------------------- importar


def test_the_preview_counts_what_would_enter_and_writes_nothing(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    response = send(client, auth, world["account"].id, STATEMENT, path="/preview")
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["fileFormat"], body["lines"], body["newLines"], body["duplicateLines"]) == (
        "ofx",
        3,
        3,
        0,
    )
    assert (body["periodStart"], body["periodEnd"]) == ("2026-11-05", "2026-11-09")
    assert (body["income"], body["expense"]) == ("1500.50", "218.90")
    assert body["warnings"] == [] and body["alreadyImportedAt"] is None
    assert body["sample"][0] == {
        "postedOn": "2026-11-05",
        "description": f"PIX ENVIADO {NAME}",
        "amount": "-200.00",
    }
    assert rows(db_session) == [] and db_session.query(BankStatement).count() == 0


def test_importing_the_same_statement_twice_does_not_duplicate(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account_id = world["account"].id
    first = send(client, auth, account_id, STATEMENT)
    assert first.status_code == 201, first.text
    assert (first.json()["newLines"], first.json()["duplicateLines"]) == (3, 0)

    second = send(client, auth, account_id, STATEMENT)
    assert second.status_code == 201
    assert (second.json()["newLines"], second.json()["duplicateLines"]) == (0, 3)
    assert second.json()["statementId"] is None
    assert len(rows(db_session)) == 3 and db_session.query(BankStatement).count() == 1

    again = send(client, auth, account_id, STATEMENT, path="/preview").json()
    assert (again["newLines"], again["duplicateLines"]) == (0, 3)
    assert again["alreadyImportedAt"] is not None


def test_an_overlapping_statement_only_adds_the_new_lines(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account_id = world["account"].id
    send(client, auth, account_id, STATEMENT)
    later = ofx(
        ("20261109", "-18.90", "A3", "TARIFA DO MÊS"),  # já estava
        ("20261110", "300.00", "A4", "PIX RECEBIDO Outro cliente"),
    )
    result = send(client, auth, account_id, later).json()
    assert (result["newLines"], result["duplicateLines"]) == (1, 1)
    assert [row.externalId for row in rows(db_session)] == ["A1", "A2", "A3", "A4"]
    assert db_session.query(BankStatement).count() == 2


def test_two_equal_lines_without_a_bank_id_are_two_lines_and_still_do_not_duplicate(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    content = (
        "data;lançamento;valor\n"
        "10/11/2026;PIX ENVIADO Fulano;-200,00\n"
        "10/11/2026;PIX ENVIADO Fulano;-200,00\n"
    ).encode("cp1252")
    account_id = world["account"].id
    assert send(client, auth, account_id, content).json()["newLines"] == 2
    assert send(client, auth, account_id, content).json()["newLines"] == 0
    assert len(rows(db_session)) == 2


def test_the_same_statement_can_enter_two_different_accounts(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    send(client, auth, world["account"].id, STATEMENT)
    other = send(client, auth, world["other_account"].id, STATEMENT).json()
    assert other["newLines"] == 3
    assert len(rows(db_session)) == 6


def test_a_statement_that_looks_like_another_account_gets_a_warning(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    account = db_session.get(BankAccount, world["account"].id)
    account.accountNumber = "99999-9"
    db_session.commit()
    warnings = send(client, auth, account.id, STATEMENT, path="/preview").json()["warnings"]
    assert warnings == [bank_statement.OTHER_ACCOUNT]
    account.accountNumber = "0012345-6"  # zeros à esquerda não contam
    db_session.commit()
    assert send(client, auth, account.id, STATEMENT, path="/preview").json()["warnings"] == []


def test_a_file_that_is_not_a_statement_answers_422_and_writes_nothing(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    for path in ("", "/preview"):
        response = send(client, auth, world["account"].id, b"nao e um extrato", path=path)
        assert (response.status_code, response.json()["detail"]) == (422, UNREADABLE)
    empty = send(client, auth, world["account"].id, b"")
    assert (empty.status_code, empty.json()["detail"]) == (422, UNREADABLE)
    assert rows(db_session) == []


def test_a_statement_over_the_size_limit_is_refused(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from api import bank_statements

    monkeypatch.setattr(bank_statements, "MAX_BYTES", 100)
    response = send(client, auth, world["account"].id, STATEMENT)
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "O extrato passa de 5 MB — importe por períodos menores",
    )


def test_an_inactive_account_does_not_receive_statements(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    db_session.get(BankAccount, world["account"].id).active = False
    db_session.commit()
    response = send(client, auth, world["account"].id, STATEMENT)
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "Essa conta bancária está inativa",
    )
    assert rows(db_session) == []


def test_a_missing_account_is_404_on_every_route(client: TestClient, auth: dict[str, str]) -> None:
    for call in (
        lambda: send(client, auth, 9999, STATEMENT),
        lambda: send(client, auth, 9999, STATEMENT, path="/preview"),
        lambda: client.get("/bank-accounts/9999/statements", headers=auth),
        lambda: client.get("/bank-accounts/9999/transactions", headers=auth),
    ):
        response = call()
        assert (response.status_code, response.json()["detail"]) == (
            404,
            "Conta bancária não encontrada",
        )


def test_the_statement_routes_need_a_finance_login(
    client: TestClient, world: dict[str, Any], make_user: Callable[..., User]
) -> None:
    account_id = world["account"].id
    reader = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(reader.id)}"}
    for header in ({}, headers):
        expected = 403 if header else 401
        assert send(client, header, account_id, STATEMENT).status_code == expected
        assert send(client, header, account_id, STATEMENT, path="/preview").status_code == expected
        assert (
            client.get(f"/bank-accounts/{account_id}/statements", headers=header).status_code
            == expected
        )
        assert (
            client.get(f"/bank-accounts/{account_id}/transactions", headers=header).status_code
            == expected
        )


# ----------------------------------------------------------------------------- dados pessoais


def test_the_description_is_stored_encrypted_and_never_reaches_the_history_or_the_log(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    db_session: Session,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    account_id = world["account"].id
    assert send(client, auth, account_id, STATEMENT).status_code == 201
    first = rows(db_session)[0]
    assert NAME not in first.description_enc and "PIX" not in first.description_enc
    # o histórico da conta diz o que entrou, não o que está escrito nas linhas
    texts = [e.text for e in db_session.query(RecordEvent).filter_by(kind="bankAccounts")]
    assert texts == ["Importou extrato: 3 linhas novas e 0 repetidas (05/11/2026 a 09/11/2026)"]
    assert NAME not in caplog.text
    # cifra amarrada à linha: copiada para outra, não abre
    from core.crypto import decrypt_payload

    with pytest.raises(Exception):  # noqa: B017 (a cifra recusa o dado associado de outra linha)
        decrypt_payload(first.description_enc, "bank_transactions:description:1:outra")
    # e a tela lê de volta o que foi escrito
    listed = client.get(f"/bank-accounts/{account_id}/transactions", headers=auth).json()
    assert f"PIX ENVIADO {NAME}" in [item["description"] for item in listed["items"]]


def test_the_stored_file_is_only_its_name_and_hash(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    send(client, auth, world["account"].id, STATEMENT)
    saved = db_session.query(BankStatement).one()
    assert saved.fileHash == hashlib.sha256(STATEMENT).hexdigest()
    assert saved.filename == "extrato.ofx" and saved.fileFormat == "ofx"
    assert all(not hasattr(saved, name) for name in ("content", "file", "data"))


# ----------------------------------------------------------------------------- consultar


def test_the_transactions_come_newest_first_with_the_totals_of_the_period(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    account_id = world["account"].id
    send(client, auth, account_id, STATEMENT)
    listed = client.get(f"/bank-accounts/{account_id}/transactions", headers=auth).json()
    assert [item["postedOn"] for item in listed["items"]] == [
        "2026-11-09",
        "2026-11-06",
        "2026-11-05",
    ]
    assert (listed["total"], listed["income"], listed["expense"]) == (3, "1500.50", "218.90")

    cut = client.get(
        f"/bank-accounts/{account_id}/transactions?from=2026-11-06&to=2026-11-06", headers=auth
    ).json()
    assert [item["amount"] for item in cut["items"]] == ["1500.50"]
    assert (cut["total"], cut["income"], cut["expense"]) == (1, "1500.50", "0.00")

    monkeypatch.setattr(bank_statement, "PAGE_SIZE", 2)
    second = client.get(f"/bank-accounts/{account_id}/transactions?page=2", headers=auth).json()
    assert (len(second["items"]), second["page"], second["pageSize"], second["total"]) == (
        1,
        2,
        2,
        3,
    )


def test_the_import_history_says_who_imported_what(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    account_id = world["account"].id
    send(client, auth, account_id, STATEMENT)
    send(client, auth, account_id, ofx(("20261110", "10.00", "B1", "x")))
    history = client.get(f"/bank-accounts/{account_id}/statements", headers=auth).json()
    assert [(row["newLines"], row["duplicateLines"]) for row in history] == [(1, 0), (3, 0)]
    assert history[0]["filename"] == "extrato.ofx" and history[0]["importedBy"]


def test_an_imported_line_has_no_route_to_be_changed_or_deleted() -> None:
    paths = {
        path: set(methods)
        for path, methods in app.openapi()["paths"].items()
        if path.startswith("/bank-accounts/")
    }
    assert paths  # as rotas do extrato existem
    # só leitura e envio: nenhum PUT, PATCH ou DELETE, então a linha importada é imutável
    assert all(methods <= {"get", "post"} for methods in paths.values()), paths


def test_amount_precision_is_kept_to_the_cent(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    send(
        client,
        auth,
        world["account"].id,
        ofx(("20261110", "0.10", "C1", "a"), ("20261110", "0.20", "C2", "b")),
    )
    assert sum(row.amount for row in rows(db_session)) == Decimal("0.30")
