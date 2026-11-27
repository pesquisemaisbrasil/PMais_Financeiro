from datetime import datetime

from pydantic import BaseModel, Field


class ScreenOut(BaseModel):
    id: str
    label: str


class PersonOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    roleLabel: str
    blockedScreens: list[str]
    # admin só muda as telas de usuário; ninguém muda as próprias nem as do super admin
    canEdit: bool
    # as empresas que a pessoa vê (None é todas) e se quem está olhando pode mudar
    companyIds: list[int] | None
    canEditCompanies: bool


class CompanyChoice(BaseModel):
    id: int
    name: str


class PeopleOut(BaseModel):
    screens: list[ScreenOut]
    companies: list[CompanyChoice]
    people: list[PersonOut]


class CompaniesIn(BaseModel):
    # None é todas as empresas
    companyIds: list[int] | None = Field(max_length=200)


class ScreensIn(BaseModel):
    blocked: list[str] = Field(max_length=20)


class DemandOut(BaseModel):
    id: int
    kind: str
    kindLabel: str
    description: str
    page: str
    sender: str
    createdAt: datetime
    fileName: str
    contentType: str
    size: int
    # concluída pelo super admin (19/11): quando e por quem
    doneAt: datetime | None = None
    doneBy: str | None = None
