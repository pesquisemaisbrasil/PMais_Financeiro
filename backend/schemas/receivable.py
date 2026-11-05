from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from schemas.payable import (
    EventOut,
    Money,
    OptionalMoney,
    RecurrenceIn,
    SeriesInfo,
    ShortText,
    ValueCount,
)

ReceivableDateField = Literal["vencimento", "competencia", "recebimento"]
ReceivableDocument = Literal["Sem documento", "NF", "Fatura", "Invoice"]
ReceivableIndicator = Literal[
    "total", "recebidos", "pendentes", "vencidos", "hoje", "avencer", "cancelados"
]
ReceivableSituation = Literal["recebido", "parcial", "vencido", "hoje", "a_vencer", "cancelado"]
ReceivableSort = Literal[
    "vencimento", "cliente", "categoria", "situacao", "valor", "recebido", "pendente"
]
Competence = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


class ReceivableCreate(BaseModel):
    customerId: int
    # Obrigatório pela regra 2, mas a mensagem é a da spec ("Informe o projeto da receita")
    projectId: int | None = None
    companyId: int
    unitId: int
    costCenterId: int
    categoryId: int
    description: ShortText
    contract: Text | None = None
    documentType: ReceivableDocument = "Sem documento"
    documentNumber: Text | None = None
    documentDate: date | None = None
    issueDate: date
    dueDate: date
    competence: Competence | None = None
    # Bruto; o que se recebe é o líquido (bruto menos os abatimentos)
    amount: Money
    withheld: OptionalMoney = Decimal("0")
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


class RecurringReceivableCreate(ReceivableCreate):
    recurrence: RecurrenceIn


class ReceivableUpdate(BaseModel):
    description: ShortText
    amount: Money
    withheld: OptionalMoney = Decimal("0")
    dueDate: date


class ReceiptCreate(BaseModel):
    receivedOn: date
    amount: Money
    bankAccountId: int
    paymentMethodId: int
    transactionId: Text | None = None
    note: Note | None = None


class ReceiptReverse(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class ReceivableRow(BaseModel):
    id: int
    situation: ReceivableSituation
    dueDate: date
    customer: str
    projectCode: str
    projectTitle: str
    description: str
    contract: str | None
    documentType: str
    documentNumber: str | None
    categoryName: str
    companyName: str
    amount: Decimal
    withheld: Decimal
    net: Decimal
    received: Decimal
    pending: Decimal
    # Só título vencido: dias corridos desde o dia seguinte ao vencimento
    daysLate: int | None
    canReceive: bool
    # nulo em título avulso
    series: SeriesInfo | None = None


class ReceivableList(BaseModel):
    today: date
    rangeStart: date | None
    rangeEnd: date | None
    items: list[ReceivableRow]
    total: int
    page: int
    pageSize: int
    filteredNet: Decimal
    filteredReceived: Decimal
    filteredPending: Decimal
    indicators: dict[ReceivableIndicator, ValueCount]


class ReceiptOut(BaseModel):
    id: int
    kind: str
    reversesId: int | None
    reversed: bool
    receivedOn: date
    amount: Decimal
    bankAccountName: str
    paymentMethodName: str
    transactionId: str | None
    note: str | None


class ReceivableDetail(ReceivableRow):
    company_id: int
    unitName: str
    costCenterName: str
    issueDate: date
    competence: str
    documentDate: date | None
    notes: str | None
    payments: list[ReceiptOut]
    events: list[EventOut]


class DelinquentTitle(BaseModel):
    id: int
    description: str
    dueDate: date
    daysLate: int
    pending: Decimal


class DelinquentCustomer(BaseModel):
    customerId: int
    customer: str
    count: int
    maxDaysLate: int
    total: Decimal
    titles: list[DelinquentTitle]


class ReceivableCreated(BaseModel):
    id: int
