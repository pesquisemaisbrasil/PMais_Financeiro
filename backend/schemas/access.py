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


class PeopleOut(BaseModel):
    screens: list[ScreenOut]
    people: list[PersonOut]


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
