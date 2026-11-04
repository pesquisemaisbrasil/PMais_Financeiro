from typing import Literal

from pydantic import BaseModel, Field

RecordKind = Literal[
    "suppliers",
    "categories",
    "companies",
    "units",
    "costCenters",
    "bankAccounts",
    "paymentMethods",
]


class RecordIn(BaseModel):
    name: str = Field(max_length=200)
    nickname: str | None = Field(default=None, max_length=100)
    code: str | None = Field(default=None, max_length=20)
    companyId: int | None = None
    document: str | None = Field(default=None, max_length=30)
    contactName: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=200)
    paymentTerms: str | None = Field(default=None, max_length=200)


class RecordOut(BaseModel):
    id: int
    name: str
    active: bool
    inUse: bool
    nickname: str | None
    code: str | None
    companyId: int | None
    document: str | None
    contactName: str | None
    phone: str | None
    email: str | None
    paymentTerms: str | None


class ActiveIn(BaseModel):
    active: bool


class ProjectIncentive(BaseModel):
    projectType: Literal["Health", "CATI", "Consumo", "Outro"] | None = None
    hasIncentive: bool
    incentiveDays: int | None = Field(default=None, ge=1, le=30)
