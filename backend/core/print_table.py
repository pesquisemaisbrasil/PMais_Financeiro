"""A tabela da impressão: as colunas que cabem numa folha, já formatadas, e o total do dinheiro."""

from datetime import date
from decimal import Decimal
from typing import Any

from core.text import format_brl_plain, format_date_br


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, date):
        return format_date_br(value)
    if isinstance(value, Decimal):
        return format_brl_plain(value)
    return str(value)


def build_print(
    title: str,
    headers: list[str],
    rows: list[list[Any]],
    columns: tuple[int, ...],
    money: tuple[int, ...],
) -> dict[str, Any]:
    """`columns` e `money` são posições na tabela inteira da exportação."""
    return {
        "title": title,
        "headers": [headers[i] for i in columns],
        "rows": [[_cell(row[i]) for i in columns] for row in rows],
        "totals": [
            format_brl_plain(sum((row[i] for row in rows), Decimal(0))) if i in money else ""
            for i in columns
        ],
    }
