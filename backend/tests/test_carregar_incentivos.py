# ruff: noqa: F811
"""Carregar incentivos: o modelo, as colunas da planilha e a classificação que vem do projeto."""

import io
from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session

from core.pix import hash_pix
from models.payable import Payable, PayableItem
from models.reference import (
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Project,
)
from models.user import User
from services import incentive_template
from services.auth import create_access_token
from services.payable_import import _date
from tests.test_payables import auth, world  # noqa: F401

TEMPLATE_URL = "/payables/import/incentives-template"
PREVIEW_URL = "/payables/import/preview"
IMPORT_URL = "/payables/import"
FULL_KEY = "pessoa-ficticia@exemplo.invalid"
CATEGORY = "2.04 Material e gráfica"
CURRENT_HEADER = [
    "Nome Completo:",
    "Beneficiário:",
    "Chave Pix:",
    "PIX:",
    "VALOR TOTAL",
    "STATUS",
    "PEDIDO EM",
    "DATA DE REALIZAÇÃO DA PESQUISA",
    "PAGAR (PREENCHIDO PELO FINANCEIRO)",
    "COMPROVANTES SALVOS NA REDE",
    "OBS",
    "Projeto",
    "Plano de contas",
    "Forma de pagamento",
]
SIMPLE_HEADER = [
    "Projeto",
    "Plano de contas",
    "Forma de pagamento",
    "Beneficiário",
    "Chave Pix",
    "Valor",
    "Data de pagamento",
]
FIELDS = {"kind": "incentivos"}  # a janela não marca nada: tudo vem da planilha


def _xlsx(rows: list[list[Any]]) -> bytes:
    book = Workbook()
    for row in rows:
        book.active.append(row)
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


def _simple(*lines: list[Any]) -> bytes:
    return _xlsx([SIMPLE_HEADER, *lines])


def _key(name: str) -> str:
    """Uma chave fictícia por pessoa: a baixa casa o comprovante pela chave (27/11/2026)."""
    return name.lower().replace(" ", ".") + "@exemplo.invalid"


def _line(name: str = "Pessoa Um", project: Any = "1804", **over: Any) -> list[Any]:
    return [
        project,
        over.get("category", CATEGORY),
        over.get("method", "Pix"),
        name,
        over.get("key", _key(name)),
        over.get("value", 100),
        over.get("pay", "24/11/2026"),
    ]


def _current(*lines: dict[str, Any]) -> bytes:
    """A planilha que o financeiro usa hoje, com as três colunas que o sistema exige no fim."""
    rows: list[list[Any]] = [CURRENT_HEADER]
    for line in lines:
        rows.append(
            [
                line.get("full", "Pessoa Um"),
                line.get("beneficiary", "Pessoa Um"),
                line["key"]
                if "key" in line
                else _key(line.get("beneficiary") or line.get("full") or "Pessoa Um"),
                line.get("pix"),
                line.get("value", 100),
                line.get("status"),
                date(2026, 11, 3),
                line.get("survey", date(2026, 11, 10)),
                line.get("pay", date(2026, 11, 24)),
                "Sim",
                "observação que não pode ser lida",
                "1804",
                CATEGORY,
                "Pix",
            ]
        )
    return _xlsx(rows)


def _send(client: TestClient, auth: dict[str, str], url: str, content: bytes, **fields: Any) -> Any:
    files = {"file": ("incentivos.xlsx", content)}
    return client.post(url, data={**FIELDS, **fields}, files=files, headers=auth)


@pytest.fixture
def registered(world: dict[str, Any], db_session: Session) -> dict[str, Any]:
    """Os projetos com unidade e centro de custo, como o cadastro exige desde 18/11."""
    for key in ("project", "other_project"):
        world[key].unit_id = world["unit"].id
        world[key].cost_center_id = world["cost_center"].id
    db_session.commit()
    return world


# ---- A planilha modelo ----


def _template(client: TestClient, auth: dict[str, str]) -> Any:
    response = client.get(TEMPLATE_URL, headers=auth)
    assert response.status_code == 200
    return response


def test_template_has_the_team_columns_and_no_person_to_launch_by_mistake(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    """27/11/2026: as colunas da planilha da equipe, na mesma ordem, sem CPF nem dados de banco, e
    Projeto, Plano de contas e Forma de pagamento no fim."""
    response = _template(client, auth)
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert incentive_template.FILENAME in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "no-store"

    book = load_workbook(io.BytesIO(response.content))
    assert book.sheetnames == [
        "Incentivos",
        "Como preencher",
        "Projetos",
        "Plano de contas",
        "Formas de pagamento",
    ]
    fill = book["Incentivos"]
    titles = [cell.value for cell in fill[1]]
    assert titles == [
        "Equipe",
        "ID LINK",
        "Nome Completo:",
        "Beneficiário:",
        "PAGO A",
        "Chave Pix:",
        "PIX:",
        "VALOR TOTAL",
        "STATUS",
        "PEDIDO EM",
        "DATA DE REALIZAÇÃO DA PESQUISA",
        "PAGAR (PREENCHIDO PELO FINANCEIRO)",
        "COMPROVANTES SALVOS NA REDE",
        "OBS",
        "Projeto",
        "Plano de contas",
        "Forma de pagamento",
    ]
    assert not any(word in str(titles).upper() for word in ("CPF", "BANCO", "AGÊNCIA", "CONTA:"))
    assert fill.max_row == 1  # só o cabeçalho: o exemplo fica na aba Como preencher
    guide = {row[0].value: row[1].value for row in book["Como preencher"].iter_rows(min_row=2)}
    assert guide["Chave Pix: / PIX:"] == "Sim"
    assert (guide["Projeto"], guide["Plano de contas"], guide["Forma de pagamento"]) == (
        "Sim",
        "Sim",
        "Sim",
    )


def test_template_keeps_codes_as_text_and_offers_the_lists(
    client: TestClient, auth: dict[str, str], world: dict[str, Any]
) -> None:
    book = load_workbook(io.BytesIO(_template(client, auth).content))
    fill = book["Incentivos"]
    # a chave Pix (F e G) e os códigos (O, P e Q) como texto; as datas (J, K e L) como data
    for letter in ("F", "G", "O", "P", "Q"):
        assert fill.column_dimensions[letter].number_format == "@"
    assert fill.column_dimensions["L"].number_format == "DD/MM/YYYY"
    rules = {str(rule.sqref): rule for rule in fill.data_validations.dataValidation}
    assert rules["O2:O5001"].formula1 == "'Projetos'!$A$2:$A$3"
    assert rules["P2:P5001"].formula1 == "'Plano de contas'!$A$2:$A$2"
    assert rules["Q2:Q5001"].formula1 == "'Formas de pagamento'!$A$2:$A$2"
    assert {rules[cell].type for cell in ("O2:O5001", "P2:P5001", "Q2:Q5001")} == {"list"}
    assert rules["H2:H5001"].type == "decimal"


def test_template_lists_only_what_can_be_used(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], db_session: Session
) -> None:
    db_session.add_all(
        [
            Project(code="1600", title="Inativo", active=False),
            Project(code="1950", title="=Fórmula de mentira"),
            ExpenseCategory(code="1.01", name="Receita", kind="receita"),
            ExpenseCategory(code="2.09", name="Antiga", active=False),
            PaymentMethod(name="Cheque", active=False),
        ]
    )
    db_session.commit()
    book = load_workbook(io.BytesIO(_template(client, auth).content))
    listed = [(row[0].value, row[1].value) for row in book["Projetos"].iter_rows(min_row=2)]
    # sem o encerrado (1700) e sem o inativo (1600)
    assert listed == [
        ("1790", "Outra"),
        ("1804", "Pesquisa"),
        ("1950", "=Fórmula de mentira"),
    ]
    assert book["Projetos"]["B4"].data_type == "s"  # o nome não vira fórmula no Excel
    assert [row[0].value for row in book["Plano de contas"].iter_rows(min_row=2)] == [CATEGORY]
    assert [row[0].value for row in book["Formas de pagamento"].iter_rows(min_row=2)] == ["Pix"]


def test_template_filled_in_goes_to_each_project_on_the_programmed_date(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], db_session: Session
) -> None:
    """Vários projetos numa planilha: cada pessoa vai para o lançamento do seu projeto e da data
    em PAGAR (PREENCHIDO PELO FINANCEIRO), com a chave Pix para casar o comprovante."""
    book = load_workbook(io.BytesIO(_template(client, auth).content))
    fill = book["Incentivos"]

    def person(name: str, key: str | None, value: Any, pay: date, project: str) -> list[Any]:
        row: list[Any] = [None] * len(incentive_template.COLUMNS)
        for title, cell in (
            ("Beneficiário:", name),
            ("PIX:", key),
            ("VALOR TOTAL", value),
            ("DATA DE REALIZAÇÃO DA PESQUISA", date(2026, 11, 10)),
            ("PAGAR (PREENCHIDO PELO FINANCEIRO)", pay),
            ("Projeto", project),
            ("Plano de contas", CATEGORY),
            ("Forma de pagamento", "Pix"),
        ):
            row[[c[0] for c in incentive_template.COLUMNS].index(title)] = cell
        return row

    fill.append(person("Pessoa Um", FULL_KEY, 100, date(2026, 11, 24), "1804"))
    fill.append(
        person("Pessoa Dois", _key("Pessoa Dois"), Decimal("50.50"), date(2026, 11, 24), "1804")
    )
    fill.append(person("Pessoa Três", _key("Pessoa Três"), 25, date(2026, 11, 25), "1804"))
    fill.append(person("Pessoa Quatro", _key("Pessoa Quatro"), 75, date(2026, 11, 25), "1790"))
    fill.append(person("Sem Chave", None, 10, date(2026, 11, 25), "1790"))
    output = io.BytesIO()
    book.save(output)

    preview = _send(client, auth, PREVIEW_URL, output.getvalue()).json()
    assert (preview["goodCount"], preview["errorCount"], preview["payableCount"]) == (4, 1, 3)
    assert preview["total"] == "250.50"
    assert preview["lines"][-1]["errors"] == [
        "Sem chave Pix: a baixa casa o comprovante com a pessoa pela chave"
    ]

    created = _send(client, auth, IMPORT_URL, output.getvalue())
    assert created.status_code == 201
    assert created.json() == {"count": 3, "items": 4, "total": "250.50"}
    # Um lançamento por projeto e data, e a soma fecha com a planilha
    payables = db_session.query(Payable).order_by(Payable.dueDate, Payable.amount).all()
    assert [(p.dueDate.day, str(p.amount)) for p in payables] == [
        (24, "150.50"),
        (25, "25.00"),
        (25, "75.00"),
    ]
    assert all(p.paidByReceipts for p in payables)
    # cada pessoa guarda a chave mascarada e o HMAC dela, nunca a chave
    first = payables[0].items[0]
    assert first.pix_masked == "pes***@exemplo.invalid"
    assert first.pix_hash == hash_pix(FULL_KEY)


@pytest.mark.parametrize("role", ["sem_acesso", "sem_login"])
def test_template_is_only_for_the_finance_team(
    client: TestClient, make_user: Callable[..., User], role: str
) -> None:
    headers = {}
    if role == "sem_acesso":
        user = make_user(email="outro@pesquisemais.com.br", role="auditor")
        headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    response = client.get(TEMPLATE_URL, headers=headers)
    assert response.status_code == (403 if role == "sem_acesso" else 401)


# ---- Projeto, plano de contas e forma de pagamento têm de vir na planilha ----


@pytest.mark.parametrize(
    ("missing", "message"),
    [
        (["Projeto"], 'A planilha precisa da coluna "projeto"'),
        (["Plano de contas"], 'A planilha precisa da coluna "plano de contas"'),
        (["Forma de pagamento"], 'A planilha precisa da coluna "forma de pagamento"'),
        (
            ["Projeto", "Forma de pagamento"],
            'A planilha precisa das colunas "projeto" e "forma de pagamento"',
        ),
        (
            ["Projeto", "Plano de contas", "Forma de pagamento"],
            'A planilha precisa das colunas "projeto", "plano de contas" e "forma de pagamento"',
        ),
    ],
)
def test_a_sheet_without_the_three_details_is_refused(
    client: TestClient,
    auth: dict[str, str],
    registered: dict[str, Any],
    missing: list[str],
    message: str,
) -> None:
    keep = [index for index, title in enumerate(SIMPLE_HEADER) if title not in missing]
    rows = [SIMPLE_HEADER, _line()]
    content = _xlsx([[row[index] for index in keep] for row in rows])
    # Marcar na tela não substitui a coluna
    marked = {
        "projectIds": str(registered["project"].id),
        "categoryIds": str(registered["category"].id),
        "paymentMethodIds": str(registered["method"].id),
    }
    for fields in ({}, marked):
        response = _send(client, auth, PREVIEW_URL, content, **fields)
        assert response.status_code == 422
        assert response.json()["detail"] == message


@pytest.mark.parametrize(
    ("column", "message"),
    [
        (0, "Sem projeto na linha"),
        (1, "Sem plano de contas na linha"),
        (2, "Sem forma de pagamento na linha"),
    ],
)
def test_a_line_without_one_of_the_details_stays_out_and_says_why(
    client: TestClient,
    auth: dict[str, str],
    registered: dict[str, Any],
    db_session: Session,
    column: int,
    message: str,
) -> None:
    blank = _line("Pessoa Incompleta")
    blank[column] = None
    content = _simple(_line("Pessoa Completa"), blank)
    # Mesmo com o cadastro marcado na tela, a célula vazia é erro
    marked = {
        "projectIds": str(registered["project"].id),
        "categoryIds": str(registered["category"].id),
        "paymentMethodIds": str(registered["method"].id),
    }
    for fields in ({}, marked):
        preview = _send(client, auth, PREVIEW_URL, content, **fields).json()
        assert (preview["goodCount"], preview["errorCount"]) == (1, 1)
        assert preview["lines"][1]["errors"] == [message]
    assert _send(client, auth, IMPORT_URL, content).json()["items"] == 1
    assert [item.name for item in db_session.query(PayableItem).all()] == ["Pessoa Completa"]


def test_unknown_details_are_errors_on_the_line(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any]
) -> None:
    content = _simple(
        _line("Conta errada", category="9.99 Não existe"),
        _line("Forma errada", method="Cheque"),
        _line("Projeto errado", project="9999"),
    )
    preview = _send(client, auth, PREVIEW_URL, content).json()
    assert [line["errors"] for line in preview["lines"]] == [
        ["Plano de contas 9.99 Não existe não existe"],
        ["Forma de pagamento Cheque não existe"],
        ["Projeto 9999 não existe"],
    ]


def test_each_line_says_its_own_category_and_method_and_they_split_the_launches(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], db_session: Session
) -> None:
    other_category = ExpenseCategory(code="2.02", name="Incentivos")
    other_method = PaymentMethod(name="TED")
    db_session.add_all([other_category, other_method])
    db_session.commit()
    content = _simple(
        _line("Pessoa Um"),
        _line("Pessoa Dois"),
        _line("Pessoa Três", category="2.02 Incentivos"),
        _line("Pessoa Quatro", method="TED"),
    )
    created = _send(client, auth, IMPORT_URL, content)
    assert created.status_code == 201
    assert created.json()["count"] == 3
    launches = {
        (p.category.code, p.payment_method.name): len(p.items)
        for p in db_session.query(Payable).all()
    }
    assert launches == {("2.04", "Pix"): 2, ("2.02", "Pix"): 1, ("2.04", "TED"): 1}


def test_the_category_is_found_by_code_by_name_or_by_both(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any]
) -> None:
    content = _simple(
        _line("Pelo código", category="2.04"),
        _line("Pelo nome", category="material e grafica"),
        _line("Pelos dois", category=CATEGORY),
    )
    assert _send(client, auth, PREVIEW_URL, content).json()["goodCount"] == 3


# ---- As colunas da planilha atual ----


def test_current_sheet_is_read_by_its_own_column_titles(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], db_session: Session
) -> None:
    content = _current({"beneficiary": "Maria Ficticia", "pix": FULL_KEY, "value": 150})
    response = _send(client, auth, PREVIEW_URL, content)
    assert response.status_code == 200
    preview = response.json()
    assert preview["errorCount"] == 0
    line = preview["lines"][0]
    assert (line["name"], line["amount"]) == ("Maria Ficticia", "150.00")
    assert (line["surveyDate"], line["payDate"]) == ("2026-11-10", "2026-11-24")
    assert line["payDateGiven"] is True
    # O que a planilha não precisa dizer ao sistema não é lido nem guardado
    assert "observação" not in response.text


def test_current_sheet_without_the_three_new_columns_says_what_is_missing(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any]
) -> None:
    header = CURRENT_HEADER[:-3]
    content = _xlsx([header, ["Pessoa", "Pessoa", None, None, 10, None, None, None, "24/11/2026"]])
    response = _send(client, auth, PREVIEW_URL, content)
    assert response.status_code == 422
    assert response.json()["detail"] == (
        'A planilha precisa das colunas "projeto", "plano de contas" e "forma de pagamento"'
    )


def test_beneficiary_comes_first_and_full_name_is_the_backup(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any]
) -> None:
    content = _current(
        {"full": "Nome Reserva", "beneficiary": "Quem Recebe"},
        {"full": "Nome Reserva", "beneficiary": None},
    )
    preview = _send(client, auth, PREVIEW_URL, content).json()
    assert [line["name"] for line in preview["lines"]] == ["Quem Recebe", "Nome Reserva"]


def test_sheet_with_only_the_full_name_column_is_accepted(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any]
) -> None:
    content = _xlsx(
        [
            ["Nome Completo:", "VALOR TOTAL", "PAGAR", "Projeto", "Plano de contas", "Forma"],
            ["Só Nome", 10, "24/11/2026", "1804", "2.04", "Pix"],
        ]
    )
    preview = _send(client, auth, PREVIEW_URL, content).json()
    assert [line["name"] for line in preview["lines"]] == ["Só Nome"]


@pytest.mark.parametrize(
    ("key", "pix"),
    [
        ("E-mail", FULL_KEY),  # o tipo na primeira coluna e a chave na segunda
        (FULL_KEY, "e-mail"),  # o contrário
        (FULL_KEY, None),
        (None, FULL_KEY),
    ],
)
def test_the_pix_key_is_found_in_either_column_and_stays_masked(
    client: TestClient,
    auth: dict[str, str],
    registered: dict[str, Any],
    db_session: Session,
    key: str | None,
    pix: str | None,
) -> None:
    content = _current({"key": key, "pix": pix})
    preview = _send(client, auth, PREVIEW_URL, content)
    assert FULL_KEY not in preview.text
    assert _send(client, auth, IMPORT_URL, content).status_code == 201
    item = db_session.query(PayableItem).one()
    assert item.pix_masked is not None
    assert item.pix_masked.startswith("pes")
    assert FULL_KEY not in item.pix_masked


def test_a_cell_with_only_the_key_type_is_not_taken_as_a_key(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], db_session: Session
) -> None:
    content = _current({"key": "CPF", "pix": "Celular"})
    preview = _send(client, auth, PREVIEW_URL, content).json()
    # o tipo da chave não é chave: a pessoa fica sem chave, e sem chave a baixa não casa (27/11)
    assert preview["lines"][0]["errors"] == [
        "Sem chave Pix: a baixa casa o comprovante com a pessoa pela chave"
    ]


@pytest.mark.parametrize("status", ["Pago", "PAGO", "pago em 10/11", "Paga"])
def test_a_line_already_paid_stays_out_so_nobody_is_paid_twice(
    client: TestClient,
    auth: dict[str, str],
    registered: dict[str, Any],
    db_session: Session,
    status: str,
) -> None:
    content = _current(
        {"beneficiary": "Pessoa Paga", "status": status, "pay": "data que não é data"},
        {"beneficiary": "Pessoa a Pagar", "status": "Pendente"},
    )
    preview = _send(client, auth, PREVIEW_URL, content).json()
    assert (preview["goodCount"], preview["errorCount"], preview["skippedCount"]) == (1, 0, 0)
    assert preview["alreadyPaidCount"] == 1
    paid, open_line = preview["lines"]
    assert (paid["alreadyPaid"], paid["skipped"], paid["errors"]) == (True, False, [])
    assert open_line["alreadyPaid"] is False

    assert _send(client, auth, IMPORT_URL, content).status_code == 201
    assert [item.name for item in db_session.query(PayableItem).all()] == ["Pessoa a Pagar"]


@pytest.mark.parametrize("status", ["Não pago", "Pendente", "A pagar", None])
def test_other_statuses_do_not_change_anything(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], status: str | None
) -> None:
    preview = _send(client, auth, PREVIEW_URL, _current({"status": status})).json()
    assert (preview["goodCount"], preview["alreadyPaidCount"]) == (1, 0)


def test_a_pay_cell_that_is_not_a_date_is_an_error_on_the_line(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any]
) -> None:
    preview = _send(client, auth, PREVIEW_URL, _current({"pay": "assim que der"})).json()
    assert preview["lines"][0]["errors"] == [
        "Data de pagamento inválida: use dia/mês/ano, como 27/11/2026"
    ]


@pytest.mark.parametrize(
    "text",
    ["27/11/2026", "27/11/26", "27-11-2026", "27.11.2026", "2026-11-27", "27/11/2026 00:00:00"],
)
def test_the_date_written_as_text_is_read_in_the_usual_formats(text: str) -> None:
    """Reunião de 26/11/2026: a planilha da equipe não vinha no formato único."""
    assert _date(text) == (date(2026, 11, 27), True)


@pytest.mark.parametrize("text", ["27/11", "31/02/2026", "27/11/1999", "amanhã"])
def test_a_date_without_year_or_impossible_is_not_read(text: str) -> None:
    assert _date(text) == (None, False)


def test_sheet_without_any_date_column_is_refused(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any]
) -> None:
    content = _xlsx([["Beneficiário:", "VALOR TOTAL"], ["Pessoa", 10]])
    response = _send(client, auth, PREVIEW_URL, content)
    assert response.status_code == 422
    assert response.json()["detail"] == 'A planilha precisa da coluna "data da pesquisa"'


# ---- Empresa, unidade e centro de custo vêm do cadastro do projeto ----


def test_company_unit_and_center_come_from_the_project(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], db_session: Session
) -> None:
    assert _send(client, auth, IMPORT_URL, _simple(_line())).status_code == 201
    payable = db_session.query(Payable).one()
    assert payable.company_id == registered["company"].id
    assert payable.unit_id == registered["unit"].id
    assert payable.cost_center_id == registered["cost_center"].id


def test_each_line_uses_the_registration_of_its_own_project(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], db_session: Session
) -> None:
    other_company = db_session.query(Company).filter_by(name="MC").one()
    unit = BusinessUnit(company_id=other_company.id, name="Matriz")
    center = CostCenter(name="Tecnologia")
    db_session.add_all([unit, center])
    db_session.flush()
    registered["other_project"].unit_id = unit.id
    registered["other_project"].cost_center_id = center.id
    db_session.commit()

    content = _simple(_line("Pessoa Um", "1804"), _line("Pessoa Dois", "PRJ-1790"))
    assert _send(client, auth, IMPORT_URL, content).status_code == 201
    by_unit = {p.unit_id: p for p in db_session.query(Payable).all()}
    assert by_unit[unit.id].company_id == other_company.id
    assert by_unit[unit.id].cost_center_id == center.id
    assert by_unit[registered["unit"].id].company_id == registered["company"].id


def test_a_column_in_the_sheet_wins_over_the_project_registration(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], db_session: Session
) -> None:
    center = CostCenter(name="Tecnologia")
    db_session.add(center)
    db_session.commit()
    content = _xlsx(
        [
            [*SIMPLE_HEADER, "Centro de custo"],
            [*_line("Pela coluna"), "Tecnologia"],
            [*_line("Célula vazia"), None],
        ]
    )
    assert _send(client, auth, IMPORT_URL, content).status_code == 201
    centers = {p.items[0].name: p.cost_center_id for p in db_session.query(Payable).all()}
    assert centers == {
        "Pela coluna": center.id,
        "Célula vazia": registered["cost_center"].id,
    }


@pytest.mark.parametrize(
    ("missing", "message"),
    [
        ("unit_id", "Projeto PRJ-1804 sem unidade no cadastro"),
        ("cost_center_id", "Projeto PRJ-1804 sem centro de custo no cadastro"),
    ],
)
def test_a_project_with_an_incomplete_registration_is_an_error_on_the_line(
    client: TestClient,
    auth: dict[str, str],
    registered: dict[str, Any],
    db_session: Session,
    missing: str,
    message: str,
) -> None:
    setattr(registered["project"], missing, None)
    db_session.commit()
    preview = _send(client, auth, PREVIEW_URL, _simple(_line())).json()
    assert preview["goodCount"] == 0
    assert preview["lines"][0]["errors"] == [message]


def test_an_inactive_unit_of_the_project_is_an_error_on_the_line(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], db_session: Session
) -> None:
    registered["unit"].active = False
    db_session.commit()
    preview = _send(client, auth, PREVIEW_URL, _simple(_line())).json()
    assert preview["lines"][0]["errors"] == ["Unidade Consumo SP: cadastro inativo"]


def test_payroll_still_needs_every_field_marked_on_the_screen(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any]
) -> None:
    content = _xlsx([["Nome", "Documento", "Valor"], ["Pessoa", "Sem NF", 10]])
    response = _send(
        client,
        auth,
        PREVIEW_URL,
        content,
        kind="folha",
        projectIds=str(registered["project"].id),
        categoryIds=str(registered["category"].id),
        paymentMethodIds=str(registered["method"].id),
        description="Campo",
        dueDate="2026-11-24",
    )
    assert response.status_code == 422
    assert response.json()["detail"] == (
        'A planilha não tem a coluna "empresa". '
        "Escolha uma só empresa na tela ou inclua a coluna na planilha"
    )
