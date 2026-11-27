from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

# as linhas do DRE a que um grupo ou uma conta do plano de contas pode ser ligada
DreLineKey = Literal[
    "receita",
    "impostos",
    "custos",
    "pessoal",
    "administrativas",
    "bancarias",
    "outras_receitas",
    "fora",
]


class DreMonth(BaseModel):
    month: str
    label: str


class DreAccount(BaseModel):
    """Uma conta analítica do plano de contas, com o valor de cada mês."""

    label: str
    values: list[Decimal]
    total: Decimal


class DreLine(DreAccount):
    """Um grupo do plano de contas e as contas dele."""

    accounts: list[DreAccount]


class DreBlock(DreAccount):
    kind: str
    lines: list[DreLine]


class DreReport(BaseModel):
    """O fluxo mensal: receitas e despesas por grupo, e o resultado."""

    months: list[DreMonth]
    blocks: list[DreBlock]
    result: DreAccount


class DreRow(DreAccount):
    """Uma linha do DRE (com os grupos que entram nela) ou um subtotal."""

    key: str
    kind: Literal["linha", "subtotal", "resultado"]
    # o sinal com que a linha entra no resultado; "±" é a que soma receita e despesa
    sign: Literal["+", "-", "±", "="]
    groups: list[DreLine]


class DreStatement(BaseModel):
    """O DRE por competência: as linhas na ordem, com os subtotais, e o que fica fora."""

    months: list[DreMonth]
    rows: list[DreRow]
    outside: DreRow | None
    # contas com lançamento no período que ainda não têm linha
    unmapped: int
