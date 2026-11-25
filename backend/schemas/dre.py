from decimal import Decimal

from pydantic import BaseModel


class DreMonth(BaseModel):
    month: str
    label: str


class DreAccount(BaseModel):
    """Uma conta analítica do plano de contas, com o valor de cada mês."""

    label: str
    values: list[Decimal]
    total: Decimal


class DreLine(DreAccount):
    """Uma linha do DRE: um grupo do plano de contas e as contas dele."""

    accounts: list[DreAccount]


class DreBlock(DreAccount):
    kind: str
    lines: list[DreLine]


class DreReport(BaseModel):
    months: list[DreMonth]
    blocks: list[DreBlock]
    result: DreAccount
