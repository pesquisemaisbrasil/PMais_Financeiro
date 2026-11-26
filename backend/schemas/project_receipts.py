from decimal import Decimal

from pydantic import BaseModel

from schemas.dre import DreMonth


class ProjectReceiptsRow(BaseModel):
    """Um projeto (ou "Sem projeto", sem id) e o que entrou dele em cada mês do ano."""

    projectId: int | None
    label: str
    values: list[Decimal]
    total: Decimal


class ProjectReceiptsReport(BaseModel):
    year: int
    months: list[DreMonth]
    rows: list[ProjectReceiptsRow]
    total: ProjectReceiptsRow
