from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class SuggestionOut(BaseModel):
    """Um lançamento (e a pessoa dele, quando tem itens) que pode ser a origem da linha."""

    targetKind: Literal["payable", "receivable"]
    targetId: int
    itemId: int | None
    description: str
    who: str | None
    projectCodes: list[str]
    amount: Decimal
    # o dia da baixa que bateu com a linha
    paidOn: date
    score: int
    reasons: list[str]
    # o que o lançamento já diz, para a tela preencher (a pessoa confere e muda)
    classification: str | None
    nfNumber: str | None
    nfIssuedOn: date | None


class ReconcileIn(BaseModel):
    targetKind: Literal["payable", "receivable"]
    targetId: int
    itemId: int | None = None
    classification: str = Field(default="", max_length=20)
    nfNumber: str | None = Field(default=None, max_length=50)
    nfIssuedOn: date | None = None


class ExceptionIn(BaseModel):
    reason: str = Field(default="", max_length=300)
    classification: str | None = Field(default=None, max_length=20)


class UndoIn(BaseModel):
    reason: str = Field(default="", max_length=300)


class ReconciliationOut(BaseModel):
    kind: Literal["lancamento", "excecao"]
    classification: str | None
    classificationLabel: str | None
    # o que a linha está ligada a: o lançamento (e a pessoa), ou o motivo da exceção
    label: str
    targetKind: Literal["payable", "receivable"] | None
    targetId: int | None
    nfNumber: str | None
    nfIssuedOn: date | None
    by: str | None
    at: datetime
