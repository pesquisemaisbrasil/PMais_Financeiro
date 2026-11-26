from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class PendingInvoiceRow(BaseModel):
    """Uma pessoa que recebe por NF e ainda não tem a nota."""

    itemId: int
    payableId: int
    name: str
    project: str
    description: str
    dueDate: date
    situation: str
    amount: Decimal


class PendingInvoices(BaseModel):
    rows: list[PendingInvoiceRow]
    total: Decimal


class InvoiceIn(BaseModel):
    number: str = Field(max_length=50)
    issueDate: date | None = None


class InvoiceOut(BaseModel):
    itemId: int
    invoiceNumber: str
    invoiceDate: date


class RpaRow(BaseModel):
    """Uma pessoa paga por RPA no mês."""

    itemId: int
    payableId: int
    name: str
    project: str
    paidOn: date
    gross: Decimal
    inss: Decimal
    net: Decimal


class RpaMonth(BaseModel):
    month: str
    label: str
    rows: list[RpaRow]
    gross: Decimal
    inss: Decimal
    net: Decimal
