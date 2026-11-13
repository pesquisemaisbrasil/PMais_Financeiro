from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, Field

HolidayScope = Literal["nacional", "estadual", "municipal"]


class HolidayIn(BaseModel):
    date: Date
    name: str = Field(max_length=120)
    scope: HolidayScope
    # estadual e municipal pedem a UF; municipal pede também a cidade
    uf: str | None = Field(default=None, max_length=2)
    city: str | None = Field(default=None, max_length=80)


class HolidayOut(BaseModel):
    id: int
    date: Date
    name: str
    scope: HolidayScope
    uf: str | None
    city: str | None
    source: Literal["brasilapi", "manual"]


class BusinessDayOut(BaseModel):
    """Se a data é dia útil e, quando não é, por quê e para que dia dá para antecipar ou adiar."""

    date: Date
    isBusinessDay: bool
    # "sábado", "domingo", "feriado nacional" ou "feriado: Nome" (vazio quando é dia útil)
    reason: str | None
    # o dia útil anterior e o próximo: a própria data quando ela é útil
    previous: Date
    next: Date


class HolidaySyncOut(BaseModel):
    year: int
    # quantos nacionais novos entraram, e quantos o ano tem agora
    added: int
    total: int
