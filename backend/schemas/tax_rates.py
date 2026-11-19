from decimal import Decimal

from pydantic import BaseModel, Field


class TaxRateOut(BaseModel):
    code: str
    name: str
    # percentual: "0.65" = 0,65%
    rate: Decimal


class TaxRateIn(BaseModel):
    code: str = Field(max_length=20)
    rate: Decimal


class TaxRatesIn(BaseModel):
    rates: list[TaxRateIn] = Field(min_length=1, max_length=10)
