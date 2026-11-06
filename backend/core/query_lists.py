"""Filtros com mais de uma opção.

A tela manda os valores de um filtro separados por vírgula (`project=3,5`). Isto lê esse texto,
recusa lixo com 422 e limita o tamanho da lista, para ninguém montar um `IN` gigante.
"""

from collections.abc import Iterable
from typing import Any

from fastapi import HTTPException, status

MAX_CHOICES = 50
# Maior inteiro que a coluna id do Postgres aceita.
MAX_ID = 2_147_483_647


def _invalid() -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Filtro inválido")


def _parts(raw: str | None) -> list[str]:
    parts = [part.strip() for part in (raw or "").split(",") if part.strip()]
    if len(parts) > MAX_CHOICES:
        raise _invalid()
    return parts


def parse_ids(raw: str | None) -> list[int] | None:
    """`"3,5"` vira `[3, 5]`; vazio vira `None` (sem filtro). Repetido entra uma vez só."""
    parts = _parts(raw)
    if not parts:
        return None
    if not all(part.isascii() and part.isdigit() for part in parts):
        raise _invalid()
    ids = [int(part) for part in parts]
    if any(not 1 <= value <= MAX_ID for value in ids):
        raise _invalid()
    return list(dict.fromkeys(ids))


def parse_choices(raw: str | None, allowed: Iterable[str]) -> list[str] | None:
    """Como `parse_ids`, para filtros de opções fixas (situação, tipo)."""
    parts = _parts(raw)
    if not parts:
        return None
    valid = set(allowed)
    if any(part not in valid for part in parts):
        raise _invalid()
    return list(dict.fromkeys(parts))


def as_list(value: Any) -> list[Any]:
    """Aceita o valor antigo (um só) e a lista, para quem chama o serviço direto."""
    if value is None or value == "":
        return []
    return list(value) if isinstance(value, list | tuple | set) else [value]
