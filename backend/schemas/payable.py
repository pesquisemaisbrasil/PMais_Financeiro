from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
OptionalMoney = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
PeriodMode = Literal["dia", "semana", "mes", "ano", "tudo", "periodo"]
Indicator = Literal[
    "total", "pagos", "pendentes", "vencidos", "hoje", "avencer", "provisoes", "cancelados"
]
Tab = Literal["todas", "agrupados", "provisoes", "connect"]
SortColumn = Literal[
    "vencimento", "fornecedor", "documento", "categoria", "situacao", "valor", "pago", "pendente"
]
DocumentType = Literal["Sem documento", "NF", "Boleto", "Fatura", "Recibo", "Contrato"]


class AllocationIn(BaseModel):
    projectId: int
    amount: Money


class PayableCreate(BaseModel):
    issueDate: date
    dueDate: date
    amount: Money
    supplierId: int
    categoryId: int
    companyId: int
    unitId: int
    costCenterId: int
    paymentMethodId: int
    description: ShortText
    allocations: list[AllocationIn] = Field(default=[], max_length=200)
    documentType: DocumentType = "Sem documento"
    documentNumber: str | None = Field(default=None, max_length=50)
    documentDate: date | None = None
    barcode: str | None = Field(default=None, max_length=60)
    competence: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    docsReceivedOn: date | None = None
    isTransfer: bool = False
    notes: str | None = Field(default=None, max_length=2000)


class PayableUpdate(BaseModel):
    description: ShortText
    amount: Money
    dueDate: date


class PaymentCreate(BaseModel):
    paidOn: date
    amount: Money
    bankAccountId: int
    paymentMethodId: int
    surcharge: OptionalMoney = Decimal("0")
    discount: OptionalMoney = Decimal("0")
    transactionId: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=500)


class BatchPaymentCreate(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    paidOn: date
    bankAccountId: int
    paymentMethodId: int
    note: str | None = Field(default=None, max_length=500)


class BatchIds(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)


class BatchPaymentResult(BaseModel):
    total: Decimal
    count: int


class BatchDeleteResult(BaseModel):
    count: int


class ReasonIn(BaseModel):
    reason: Reason


class PaymentReverse(BaseModel):
    kind: Literal["estorno", "devolucao"]
    reason: Reason
    # Devolução: dia em que o dinheiro voltou. Estorno é sempre hoje.
    on: date | None = None


class AllocationOut(BaseModel):
    projectId: int
    code: str
    amount: Decimal


class PayableRow(BaseModel):
    id: int
    type: str
    origin: str
    situation: str
    dueDate: date
    payee: str
    description: str
    documentType: str
    documentNumber: str | None
    allocations: list[AllocationOut]
    categoryName: str
    costCenterName: str
    paymentMethodName: str
    companyName: str
    amount: Decimal
    paid: Decimal
    pending: Decimal
    docsLate: bool
    barcode: str | None
    itemCount: int
    canPayDirectly: bool


class ValueCount(BaseModel):
    value: Decimal
    count: int


class PayableList(BaseModel):
    today: date
    rangeStart: date | None
    rangeEnd: date | None
    items: list[PayableRow]
    total: int
    page: int
    pageSize: int
    filteredAmount: Decimal
    filteredPaid: Decimal
    filteredPending: Decimal
    indicators: dict[Indicator, ValueCount]
    tabs: dict[Tab, int]


class PayableItemOut(BaseModel):
    id: int
    name: str
    documentType: str
    amount: Decimal
    invoiceNumber: str | None
    invoiceStatus: str | None


class PaymentOut(BaseModel):
    id: int
    kind: str
    reversesId: int | None
    reversed: bool
    paidOn: date
    amount: Decimal
    surcharge: Decimal
    discount: Decimal
    bankAccountName: str
    paymentMethodName: str
    transactionId: str | None
    note: str | None


class EventOut(BaseModel):
    userName: str
    text: str
    createdAt: datetime


class PayableDetail(PayableRow):
    company_id: int
    unitName: str
    issueDate: date
    competence: str | None
    documentDate: date | None
    docsReceivedOn: date | None
    isTransfer: bool
    notes: str | None
    items: list[PayableItemOut]
    payments: list[PaymentOut]
    events: list[EventOut]


class CodeName(BaseModel):
    id: int
    name: str


class CategoryOut(CodeName):
    code: str


class SupplierOut(CodeName):
    nickname: str


class UnitOut(CodeName):
    companyId: int


class BankAccountOut(CodeName):
    companyId: int


class ProjectOut(BaseModel):
    id: int
    code: str
    title: str
    status: str


class Reference(BaseModel):
    companies: list[CodeName]
    units: list[UnitOut]
    costCenters: list[CodeName]
    categories: list[CategoryOut]
    paymentMethods: list[CodeName]
    bankAccounts: list[BankAccountOut]
    suppliers: list[SupplierOut]
    projects: list[ProjectOut]


class AttentionItem(BaseModel):
    kind: Literal["vencidas", "hoje", "devolvida", "connect", "provisoes"]
    title: str
    text: str
    link: str
    action: str


class CashflowWeek(BaseModel):
    label: str
    outflow: Decimal
    provision: Decimal


class UpcomingEntry(BaseModel):
    id: int
    type: str
    payee: str
    description: str
    dueDate: date
    situation: str
    pending: Decimal


class HomeSummary(BaseModel):
    today: date
    overdue: ValueCount
    nextSevenDays: ValueCount
    payablesBadge: int
    attention: list[AttentionItem]
    cashflow: list[CashflowWeek]
    upcoming: list[UpcomingEntry]
