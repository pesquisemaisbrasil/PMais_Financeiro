from typing import Literal

from pydantic import BaseModel, Field

RecordKind = Literal[
    "suppliers",
    "customers",
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
    # pessoa física (PF) ou jurídica (PJ); PF não tem documento, porque CPF não é guardado
    personType: Literal["PF", "PJ"] | None = None
    contactName: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=200)
    paymentTerms: str | None = Field(default=None, max_length=200)
    # só na conta do plano de contas: despesa (padrão) ou receita
    kind: Literal["despesa", "receita"] | None = None


class CnpjOut(BaseModel):
    """O que a Receita diz do CNPJ, para a tela preencher e a pessoa editar antes de salvar."""

    cnpj: str
    name: str
    nickname: str
    situation: str


class RecordOut(BaseModel):
    id: int
    name: str
    active: bool
    inUse: bool
    nickname: str | None
    code: str | None
    companyId: int | None
    document: str | None
    personType: str | None
    contactName: str | None
    phone: str | None
    email: str | None
    paymentTerms: str | None
    kind: str | None


class ActiveIn(BaseModel):
    active: bool


class ProjectIncentive(BaseModel):
    projectType: Literal["Health", "CATI", "Consumo", "Outro"] | None = None
    hasIncentive: bool
    incentiveDays: int | None = Field(default=None, ge=1, le=30)
