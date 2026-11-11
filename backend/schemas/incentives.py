from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class IncentiveAgendaRow(BaseModel):
    """Um lançamento de incentivo: uma data de pagamento de um projeto, com as pessoas dela."""

    id: int
    dueDate: date
    description: str
    projectCodes: list[str]
    people: int
    amount: Decimal
    paid: Decimal
    pending: Decimal
    situation: str


class IncentiveBucket(BaseModel):
    # lançamentos, pessoas e o valor: o que falta pagar (ou o total, no que já está pago)
    count: int
    people: int
    total: Decimal


class IncentiveSummary(BaseModel):
    a_vencer: IncentiveBucket
    hoje: IncentiveBucket
    vencido: IncentiveBucket
    pago: IncentiveBucket


class IncentiveAgenda(BaseModel):
    today: date
    # o período que está à vista (vazio em "Tudo")
    rangeStart: date | None
    rangeEnd: date | None
    summary: IncentiveSummary
    # O que está vencido em qualquer data, mesmo fora do período olhado
    overdueAll: IncentiveBucket
    rows: list[IncentiveAgendaRow]
