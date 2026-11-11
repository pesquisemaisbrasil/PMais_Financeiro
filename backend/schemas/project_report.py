from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from schemas.payable import ProjectOut


class ProjectSummary(BaseModel):
    id: int
    code: str
    title: str
    status: str
    launched: Decimal
    paid: Decimal
    pending: Decimal
    payableCount: int


class ReportLine(BaseModel):
    """Uma conta, com só a parte deste projeto nos valores."""

    id: int
    type: str
    situation: str
    dueDate: date
    payee: str
    description: str
    categoryName: str
    amount: Decimal
    paid: Decimal
    pending: Decimal
    documentCount: int


class ReportDocument(BaseModel):
    id: int
    payableId: int
    payableDescription: str
    name: str
    kind: str
    size: int
    uploadedBy: str
    createdAt: datetime


class ProjectReport(BaseModel):
    project: ProjectOut
    # do Connect: ainda não chega, e o saldo também fica vazio
    budget: Decimal | None
    launched: Decimal
    paid: Decimal
    pending: Decimal
    provisioned: Decimal
    totalSpent: Decimal
    balance: Decimal | None
    lines: list[ReportLine]
    provisions: list[ReportLine]
    documents: list[ReportDocument]
