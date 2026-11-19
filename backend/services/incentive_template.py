"""A planilha modelo do Carregar incentivos (.xlsx), montada na hora do download.

A primeira aba é a que o importador lê: o cabeçalho fica na linha 1 e ela vem sem nenhuma pessoa,
nem de exemplo, para ninguém lançar um nome fictício sem querer. O exemplo fica em "Como preencher".
"""

import io
from collections.abc import Sequence
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter, quote_sheetname
from openpyxl.worksheet.datavalidation import DataValidation
from sqlalchemy.orm import Session

from core.xlsx import DATE_FORMAT, MONEY_FORMAT
from models.reference import ExpenseCategory, PaymentMethod, Project
from services.payable_import import MAX_ROWS

FILENAME = "modelo-carregar-incentivos.xlsx"
FILL_SHEET = "Incentivos"
GUIDE_SHEET = "Como preencher"
PROJECTS_SHEET = "Projetos"
CATEGORIES_SHEET = "Plano de contas"
METHODS_SHEET = "Formas de pagamento"

_TEXT_FORMAT = "@"
_LAST_ROW = MAX_ROWS + 1
_HEADER_FILL = PatternFill("solid", fgColor="E8EDF5")
# 01/01/2000, no número de série que o Excel usa para datas.
_FIRST_DATE = "36526"

# Título, largura e formato de cada coluna. O que é código fica como texto: digitado como número,
# o Excel corta o zero da frente de um celular ou de um CPF, e o "2.10" do plano de contas vira 2,1.
COLUMNS: tuple[tuple[str, int, str | None], ...] = (
    ("Projeto", 14, _TEXT_FORMAT),
    ("Plano de contas", 32, _TEXT_FORMAT),
    ("Forma de pagamento", 22, _TEXT_FORMAT),
    ("Beneficiário", 38, None),
    ("Chave Pix", 34, _TEXT_FORMAT),
    ("Valor", 14, MONEY_FORMAT),
    ("Data da pesquisa", 18, DATE_FORMAT),
    ("Data de pagamento", 18, DATE_FORMAT),
)
_VALUE_COLUMN = 6
_DATE_COLUMNS = (7, 8)
_GUIDE_TITLES = ("Coluna", "É obrigatória?", "Como preencher", "Exemplo")
_GUIDE_WIDTHS = (22, 30, 76, 26)
_GUIDE = (
    (
        "Projeto",
        "Sim",
        "O código do projeto. Escolha na lista da célula; os projetos abertos estão na aba "
        "Projetos.",
        "1790",
    ),
    (
        "Plano de contas",
        "Sim",
        "A conta do plano de contas. Escolha na lista da célula; as contas estão na aba Plano de "
        "contas.",
        "2.02 Incentivos",
    ),
    (
        "Forma de pagamento",
        "Sim",
        "Como o incentivo será pago. Escolha na lista da célula; as formas estão na aba Formas de "
        "pagamento.",
        "Pix",
    ),
    ("Beneficiário", "Sim", "O nome completo de quem vai receber.", "Maria Exemplo"),
    (
        "Chave Pix",
        "Não",
        "A chave Pix de quem vai receber. O sistema guarda só uma parte dela.",
        "maria@exemplo.invalid",
    ),
    (
        "Valor",
        "Sim",
        "O valor a pagar, em reais, com até 2 casas depois da vírgula.",
        "150,00",
    ),
    (
        "Data da pesquisa",
        "Quando não houver data de pagamento",
        "O dia da pesquisa, em dd/mm/aaaa. Com ela, o sistema calcula o pagamento pelo prazo do "
        "projeto.",
        "10/11/2026",
    ),
    (
        "Data de pagamento",
        "Quando o projeto não tiver prazo de incentivo",
        "O dia de pagar, em dd/mm/aaaa. Se cair em fim de semana ou feriado, vai para o próximo "
        "dia útil.",
        "24/11/2026",
    ),
)
_NOTES = (
    "Preencha uma linha por pessoa, na aba Incentivos, e não mude os títulos da primeira linha.",
    "Linha sem projeto, plano de contas ou forma de pagamento fica de fora, com o motivo na "
    "conferência.",
    "Empresa, unidade e centro de custo vêm do cadastro de cada projeto.",
    "Cada combinação de projeto, plano de contas, forma de pagamento e data de pagamento vira um "
    "lançamento no Contas a pagar, com as pessoas dentro.",
    "Antes de criar qualquer lançamento, o sistema mostra a conferência, com os erros de cada "
    "linha.",
    "Não inclua coluna de CPF: o sistema não lê esse dado.",
)


def _put(sheet: Any, row: int, column: int, text: str) -> Any:
    cell = sheet.cell(row=row, column=column)
    cell.value = text
    cell.data_type = "s"  # nome de cadastro que começa com "=" não vira fórmula
    return cell


def _header(sheet: Any, titles: Sequence[str], widths: Sequence[int]) -> None:
    for column, (title, width) in enumerate(zip(titles, widths, strict=True), start=1):
        cell = _put(sheet, 1, column, title)
        cell.font = Font(bold=True)
        cell.fill = _HEADER_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.column_dimensions[get_column_letter(column)].width = width
    sheet.freeze_panes = "A2"


def _rule(sheet: Any, column: int, kind: str, title: str, message: str, **options: Any) -> None:
    rule = DataValidation(
        type=kind,
        allow_blank=True,
        showErrorMessage=True,
        errorTitle=title,
        error=message,
        **options,
    )
    letter = get_column_letter(column)
    rule.add(f"{letter}2:{letter}{_LAST_ROW}")
    sheet.add_data_validation(rule)


def _list_rule(sheet: Any, column: int, source: str, count: int) -> None:
    """A lista de escolha da célula. Só avisa: um cadastro feito depois do download também vale."""
    if not count:
        return
    _rule(
        sheet,
        column,
        "list",
        "Fora da lista",
        f"Esse valor não está na aba {source}. Confira antes de continuar.",
        errorStyle="warning",
        formula1=f"{quote_sheetname(source)}!$A$2:$A${count + 1}",
    )


def _fill_sheet(sheet: Any, projects: int, categories: int, methods: int) -> None:
    sheet.title = FILL_SHEET
    _header(sheet, [column[0] for column in COLUMNS], [column[1] for column in COLUMNS])
    for column, (_, _, number_format) in enumerate(COLUMNS, start=1):
        if number_format:
            sheet.column_dimensions[get_column_letter(column)].number_format = number_format
    _list_rule(sheet, 1, PROJECTS_SHEET, projects)
    _list_rule(sheet, 2, CATEGORIES_SHEET, categories)
    _list_rule(sheet, 3, METHODS_SHEET, methods)
    _rule(
        sheet,
        _VALUE_COLUMN,
        "decimal",
        "Valor inválido",
        "Use só números, com até 2 casas. Exemplo: 150,00",
        operator="greaterThan",
        formula1="0",
    )
    for column in _DATE_COLUMNS:
        _rule(
            sheet,
            column,
            "date",
            "Data inválida",
            "Use o formato dd/mm/aaaa. Exemplo: 24/11/2026",
            operator="greaterThan",
            formula1=_FIRST_DATE,
        )


def _guide_sheet(sheet: Any) -> None:
    _header(sheet, _GUIDE_TITLES, _GUIDE_WIDTHS)
    for row, texts in enumerate(_GUIDE, start=2):
        for column, text in enumerate(texts, start=1):
            cell = _put(sheet, row, column, text)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    first_note = len(_GUIDE) + 3
    _put(sheet, first_note, 1, "Lembretes").font = Font(bold=True)
    for row, note in enumerate(_NOTES, start=first_note + 1):
        _put(sheet, row, 1, note)


def _list_sheet(
    sheet: Any, titles: Sequence[str], widths: Sequence[int], rows: Sequence[Sequence[str]]
) -> None:
    _header(sheet, titles, widths)
    for row, texts in enumerate(rows, start=2):
        for column, text in enumerate(texts, start=1):
            _put(sheet, row, column, text)


def build(db: Session) -> bytes:
    """O modelo, com os projetos abertos e os cadastros ativos na hora do download."""
    projects = (
        db.query(Project)
        .filter(Project.active.is_(True), Project.status != "encerrado")
        .order_by(Project.code)
        .all()
    )
    categories = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.active.is_(True), ExpenseCategory.kind == "despesa")
        .order_by(ExpenseCategory.code)
        .all()
    )
    methods = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.active.is_(True))
        .order_by(PaymentMethod.name)
        .all()
    )
    book = Workbook()
    _fill_sheet(book.active, len(projects), len(categories), len(methods))
    _guide_sheet(book.create_sheet(GUIDE_SHEET))
    _list_sheet(
        book.create_sheet(PROJECTS_SHEET),
        ("Código", "Projeto"),
        (14, 60),
        [(str(project.code), str(project.title)) for project in projects],
    )
    _list_sheet(
        book.create_sheet(CATEGORIES_SHEET),
        ("Conta",),
        (44,),
        [(f"{category.code} {category.name}",) for category in categories],
    )
    _list_sheet(
        book.create_sheet(METHODS_SHEET),
        ("Forma de pagamento",),
        (30,),
        [(str(method.name),) for method in methods],
    )
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()
