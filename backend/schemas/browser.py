from datetime import datetime
from typing import Literal

from pydantic import BaseModel

BrowserStatus = Literal["pendente", "liberado", "recusado", "revogado"]


class BrowserOut(BaseModel):
    """Um navegador na tela Acessos. Sem o cookie (só o hash fica no banco) e sem o IP completo."""

    id: int
    userId: int
    userName: str
    userEmail: str
    label: str
    ipMasked: str | None
    status: BrowserStatus
    requestedAt: datetime
    decidedAt: datetime | None
    decidedBy: str | None
    lastSeenAt: datetime | None
