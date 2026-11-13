from datetime import datetime

from pydantic import BaseModel, Field


class ClosingCompany(BaseModel):
    """Uma empresa no mês: fechada ou não, e o que falta para fechar."""

    id: int
    name: str
    closed: bool
    closedAt: datetime | None
    closedBy: str | None
    lines: int
    # contas ativas da empresa sem nenhuma linha de extrato no mês
    notImported: list[str]
    withoutPair: int
    withoutClassification: int
    ready: bool


class ClosingRow(BaseModel):
    companyId: int
    company: str
    month: str
    closedAt: datetime
    closedBy: str | None


class ClosingStatus(BaseModel):
    month: str
    companies: list[ClosingCompany]
    # todos os meses fechados até hoje, do mais novo para o mais antigo
    closings: list[ClosingRow]


class ReopenIn(BaseModel):
    reason: str = Field(default="", max_length=300)
