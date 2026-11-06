"""Acréscimos, descontos e impostos de uma conta, lançados um a um (descrição e valor).

O valor líquido é o valor principal + acréscimos − descontos − impostos.
Vale para Contas a pagar e a receber.
"""

from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

AdjustmentKind = Literal["acrescimo", "desconto", "imposto"]
AdjustmentText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


class AdjustmentIn(BaseModel):
    kind: AdjustmentKind
    description: AdjustmentText
    amount: Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class AdjustmentOut(BaseModel):
    id: int
    kind: AdjustmentKind
    description: str
    amount: Decimal
