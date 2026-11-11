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


class HolidaySyncOut(BaseModel):
    year: int
    # quantos nacionais novos entraram, e quantos o ano tem agora
    added: int
    total: int
