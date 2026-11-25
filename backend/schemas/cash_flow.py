from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class CashFlowPeriod(BaseModel):
    start: date
    end: date
    label: str
    forecastIn: Decimal
    forecastOut: Decimal
    actualIn: Decimal
    actualOut: Decimal
    balance: Decimal


class CashFlowAccount(BaseModel):
    """O realizado da conta no período. O previsto não tem conta: ela é escolhida na baixa."""

    id: int
    name: str
    opening: Decimal
    inflow: Decimal
    outflow: Decimal
    closing: Decimal


class CashFlowReport(BaseModel):
    start: date
    end: date
    group: str
    opening: Decimal
    lateIn: Decimal
    lateOut: Decimal
    closing: Decimal
    periods: list[CashFlowPeriod]
    accounts: list[CashFlowAccount]


class CashFlowForecastLine(BaseModel):
    kind: str
    titleId: int
    date: date
    name: str
    description: str
    amount: Decimal
    provision: bool


class CashFlowActualLine(BaseModel):
    kind: str
    titleId: int
    date: date
    name: str
    description: str
    amount: Decimal
    account: str


class CashFlowDetail(BaseModel):
    forecast: list[CashFlowForecastLine]
    actual: list[CashFlowActualLine]
