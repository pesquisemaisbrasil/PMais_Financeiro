from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field

Group = Literal[
    "no_projeto", "fora_do_projeto", "chave_nao_cadastrada", "erro_leitura", "duplicado"
]
ReconcileStatus = Literal["bate", "pago_a_mais", "nao_fecha"]


class BatchCreate(BaseModel):
    parts: Annotated[int, Field(ge=1, le=10000)]


class DiscardIn(BaseModel):
    discarded: bool


class BatchProgress(BaseModel):
    id: int
    status: Literal["enviando", "pronto", "confirmado"]
    partsExpected: int
    partsReceived: int
    receiptsTotal: int
    createdAt: datetime
    confirmedAt: datetime | None


class BatchSummary(BatchProgress):
    outOfProjectCount: int
    paidTotal: Decimal


class PartResult(BaseModel):
    partIndex: int
    pageOffset: int
    receiptsCount: int
    error: str | None


class PartError(BaseModel):
    partIndex: int
    error: str | None


class ReceiptItem(BaseModel):
    id: int
    page: int
    group: Group
    status: Literal["pendente", "pago", "descartado"]
    # só quando a chave não casa com ninguém
    name: str | None
    interviewerId: int | None
    keyMasked: str | None
    amount: Decimal | None
    paidOn: date | None
    error: str | None
    reconcileStatus: ReconcileStatus | None
    itemsToPay: int
    message: str | None


class BatchDetail(BatchProgress):
    receipts: list[ReceiptItem]
    partErrors: list[PartError]
