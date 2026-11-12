from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

from schemas.bank_reconciliation import ReconciliationOut


class StatementSample(BaseModel):
    postedOn: date
    description: str
    amount: Decimal


class StatementPreview(BaseModel):
    """O que o arquivo traz e o que entraria, sem gravar nada."""

    fileFormat: str
    lines: int
    newLines: int
    duplicateLines: int
    periodStart: date
    periodEnd: date
    # o que as linhas novas somam: entradas e saídas (as duas em valor positivo)
    income: Decimal
    expense: Decimal
    warnings: list[str]
    sample: list[StatementSample]
    # quando este mesmo arquivo já foi importado nesta conta, se foi
    alreadyImportedAt: datetime | None


class StatementResult(BaseModel):
    # vazio quando nenhuma linha era nova: nada foi gravado
    statementId: int | None
    newLines: int
    duplicateLines: int
    periodStart: date
    periodEnd: date


class StatementOut(BaseModel):
    id: int
    filename: str
    fileFormat: str
    periodStart: date
    periodEnd: date
    newLines: int
    duplicateLines: int
    importedBy: str | None
    createdAt: datetime


class TransactionOut(BaseModel):
    id: int
    postedOn: date
    description: str
    amount: Decimal
    statementId: int
    # o que se fez com a linha; vazio = pendente
    reconciliation: ReconciliationOut | None = None


class TransactionCounts(BaseModel):
    """Quantas linhas do período estão em cada situação (sem olhar o filtro de situação)."""

    pending: int
    reconciled: int
    exceptions: int


class TransactionList(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    pageSize: int
    counts: TransactionCounts
    # o que o período filtrado soma, não só a página
    income: Decimal
    expense: Decimal
