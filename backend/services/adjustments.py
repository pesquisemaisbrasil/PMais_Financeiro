"""Contas de acréscimos, descontos e impostos, iguais em Contas a pagar e a receber."""

from collections.abc import Iterable
from decimal import Decimal
from typing import Any

from core.text import format_brl

ZERO = Decimal("0")
KINDS = ("acrescimo", "desconto", "imposto")
LABELS = {"acrescimo": "acréscimos", "desconto": "descontos", "imposto": "impostos"}
NET_ZERO = "O valor líquido precisa ser maior que zero: os descontos e impostos passam do valor"


def total(rows: Iterable[Any], kind: str) -> Decimal:
    return sum((row.amount for row in rows if row.kind == kind), ZERO)


def net(amount: Decimal, rows: Iterable[Any]) -> Decimal:
    """O valor líquido: o valor principal mais os acréscimos, menos descontos e impostos."""
    rows = list(rows)
    return amount + total(rows, "acrescimo") - total(rows, "desconto") - total(rows, "imposto")


def lines(rows: Iterable[Any]) -> list[tuple[str, str, Decimal]]:
    """As linhas na ordem dos tipos (a ordem dentro de cada tipo é mantida)."""
    ordered = sorted(rows, key=lambda row: KINDS.index(row.kind))
    return [(row.kind, row.description, row.amount) for row in ordered]


def describe_changes(before: Iterable[Any], after: Iterable[Any]) -> list[str]:
    """O que mudou, por tipo, para o histórico da conta."""
    before, after = list(before), list(after)
    changes = []
    for kind in KINDS:
        if [x for x in lines(before) if x[0] == kind] == [x for x in lines(after) if x[0] == kind]:
            continue
        old, new = total(before, kind), total(after, kind)
        label = LABELS[kind]
        changes.append(
            f"{label} {format_brl(old)} → {format_brl(new)}"
            if old != new
            else f"{label} reescritos"
        )
    return changes
