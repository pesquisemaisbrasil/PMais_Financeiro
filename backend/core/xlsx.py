"""Planilha .xlsx das listas (Contas a pagar e a receber).

Dinheiro e data saem como número e data de verdade, para o Excel somar, ordenar e filtrar. Todo
texto sai como texto: uma descrição que começa com `=` não vira fórmula, mesmo vinda de fora.
"""

import io
from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MONEY_FORMAT = "#,##0.00"
DATE_FORMAT = "DD/MM/YYYY"
_HEADER_FILL = PatternFill("solid", fgColor="E8EDF5")
_MIN_WIDTH, _MAX_WIDTH = 10, 48


def _write(cell: Any, value: Any) -> None:
    if isinstance(value, date):
        cell.value = value
        cell.number_format = DATE_FORMAT
    elif isinstance(value, Decimal):
        cell.value = value
        cell.number_format = MONEY_FORMAT
    elif isinstance(value, bool) or value is None:
        cell.value = None if value is None else str(value)
    elif isinstance(value, int):
        cell.value = value
    else:
        cell.value = str(value)
        # Texto que começa com = + - @ seria lido como fórmula: força o tipo texto.
        cell.data_type = "s"


def build_xlsx(
    *,
    sheet: str,
    title: str,
    headers: Sequence[str],
    rows: Sequence[Sequence[Any]],
    total_columns: Sequence[int] = (),
) -> bytes:
    """Linha 1: o título com os filtros usados. Linha 2: os cabeçalhos. Depois, uma linha por
    item e, se pedido, uma linha de total nas colunas de dinheiro indicadas (a partir do 0)."""
    book = Workbook()
    ws = book.active
    ws.title = sheet[:31]
    ws.append([None])
    _write(ws.cell(row=1, column=1), title)
    ws.cell(row=1, column=1).font = Font(bold=True)
    ws.append(list(headers))
    for column in range(1, len(headers) + 1):
        cell = ws.cell(row=2, column=column)
        cell.font = Font(bold=True)
        cell.fill = _HEADER_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)

    widths = [len(header) for header in headers]
    for row_index, row in enumerate(rows, start=3):
        for column, value in enumerate(row, start=1):
            _write(ws.cell(row=row_index, column=column), value)
            shown = len(f"{value:,.2f}") if isinstance(value, Decimal) else len(str(value or ""))
            widths[column - 1] = max(widths[column - 1], shown)

    last = 2 + len(rows)
    if total_columns and rows:
        total_row = last + 1
        label = ws.cell(row=total_row, column=1)
        label.value = "Total"
        label.font = Font(bold=True)
        for column in total_columns:
            total = sum(
                (row[column] for row in rows if isinstance(row[column], Decimal)), Decimal(0)
            )
            cell = ws.cell(row=total_row, column=column + 1)
            _write(cell, total)
            cell.font = Font(bold=True)
    if rows:
        ws.auto_filter.ref = f"A2:{get_column_letter(len(headers))}{last}"
    ws.freeze_panes = "A3"
    for column, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(column)].width = max(
            _MIN_WIDTH, min(_MAX_WIDTH, width + 2)
        )

    output = io.BytesIO()
    book.save(output)
    return output.getvalue()
