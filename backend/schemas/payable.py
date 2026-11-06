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
DateField = Literal["vencimento", "competencia", "baixa"]
SituationFilter = Literal[
    "pago", "parcial", "vencido", "hoje", "a_vencer", "devolvido", "cancelado", "substituido"
]
KindFilter = Literal["real", "provisao"]
RecurrenceKind = Literal["mensal", "semanal", "parcelado"]


class AllocationIn(BaseModel):
    projectId: int
    amount: Money


class PayableCreate(BaseModel):
    type: KindFilter = "real"
    issueDate: date
    dueDate: date
    amount: Money
    # Provisão pode ainda não ter fornecedor; a conta real, sempre tem.
    supplierId: int | None = None
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
    competence: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    docsReceivedOn: date | None = None
    isTransfer: bool = False
    notes: str | None = Field(default=None, max_length=2000)


class ProvisionReplace(BaseModel):
    # Ou liga a uma conta já lançada, ou lança o real agora, com o valor e o fornecedor.
    realId: int | None = None
    supplierId: int | None = None
    amount: Money | None = None


class ReplacementCandidate(BaseModel):
    id: int
    description: str
    payee: str
    amount: Decimal


class BatchReclassify(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    projectId: int | None = None
    categoryId: int | None = None
    costCenterId: int | None = None


class PayableUpdate(BaseModel):
    description: ShortText
    amount: Money
    dueDate: date
    # Os campos abaixo são opcionais: o que não vier não muda. Para limpar um texto ou uma data,
    # mande o campo com null. Empresa, unidade e projeto não mudam aqui (veja Reclassificar).
    supplierId: int | None = None
    categoryId: int | None = None
    costCenterId: int | None = None
    paymentMethodId: int | None = None
    documentType: DocumentType | None = None
    documentNumber: str | None = Field(default=None, max_length=50)
    documentDate: date | None = None
    barcode: str | None = Field(default=None, max_length=60)
    competence: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    docsReceivedOn: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    isTransfer: bool | None = None


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


class BatchCount(BaseModel):
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


class SeriesInfo(BaseModel):
    id: int
    index: int
    count: int
    kind: RecurrenceKind
    estimated: bool


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
    canReplace: bool
    replaces: Decimal | None
    # nulo em conta avulsa
    series: SeriesInfo | None = None


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
    invoiceDate: date | None
    grossAmount: Decimal | None
    surveyDate: date | None
    paidOn: date | None


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
    # os cadastros pelo id, para a tela de edição já abrir preenchida
    supplierId: int | None
    categoryId: int
    costCenterId: int
    paymentMethodId: int
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
    kind: str


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
    projectType: str | None
    hasIncentive: bool
    incentiveDays: int | None


class Reference(BaseModel):
    companies: list[CodeName]
    units: list[UnitOut]
    costCenters: list[CodeName]
    categories: list[CategoryOut]
    paymentMethods: list[CodeName]
    bankAccounts: list[BankAccountOut]
    suppliers: list[SupplierOut]
    customers: list[SupplierOut]
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


ImportKind = Literal["incentivos", "folha"]


class ImportFields(BaseModel):
    kind: ImportKind
    # Cada campo aceita mais de um cadastro. Vazio = todos os que a planilha trouxer, na coluna
    # de mesmo nome; sem a coluna, é preciso marcar exatamente um.
    projectIds: list[int] = Field(default_factory=list, max_length=50)
    companyIds: list[int] = Field(default_factory=list, max_length=50)
    unitIds: list[int] = Field(default_factory=list, max_length=50)
    costCenterIds: list[int] = Field(default_factory=list, max_length=50)
    categoryIds: list[int] = Field(default_factory=list, max_length=50)
    paymentMethodIds: list[int] = Field(default_factory=list, max_length=50)
    # Só a folha pede: no incentivo, a descrição e o vencimento saem do cronograma.
    description: str | None = Field(default=None, max_length=200)
    dueDate: date | None = None


class ImportLine(BaseModel):
    line: int
    name: str
    documentType: str
    invoiceNumber: str | None
    gross: Decimal | None
    amount: Decimal | None
    surveyDate: date | None
    payDate: date | None
    payDateGiven: bool
    projectCode: str | None
    # Empresa, unidade, centro de custo, categoria e forma que a planilha disse, só dos campos
    # que vieram em coluna.
    classification: str | None
    skipped: bool
    errors: list[str]


class ImportGroup(BaseModel):
    projectId: int
    projectCode: str
    projectTitle: str
    classification: str
    payDate: date
    surveyDates: list[date]
    count: int
    total: Decimal
    source: str


class ImportProject(BaseModel):
    id: int
    code: str
    title: str
    projectType: str | None
    deadlineDays: int | None
    missingDeadline: bool
    count: int
    total: Decimal


class ImportPreview(BaseModel):
    kind: ImportKind
    columns: list[str]
    hasProjectColumn: bool
    hasClassificationColumns: bool
    projects: list[ImportProject]
    missingDeadline: bool
    alreadyImported: bool
    total: Decimal
    goodCount: int
    errorCount: int
    skippedCount: int
    # Quantos lançamentos vão ser criados: um por classificação e data (incentivo) ou um por
    # classificação (folha).
    payableCount: int
    groups: list[ImportGroup]
    lines: list[ImportLine]


class ImportResult(BaseModel):
    count: int
    items: int
    total: Decimal


# ---- Recorrência ----

SeriesScope = Literal["only", "following", "open"]


class OccurrenceEdit(BaseModel):
    """Ajuste de uma linha da tabela simulada, antes de salvar."""

    index: int = Field(ge=1)
    dueDate: date | None = None
    amount: Money | None = None


class RecurrenceIn(BaseModel):
    kind: RecurrenceKind
    # total de ocorrências, a primeira incluída
    count: int = Field(ge=2, le=60)
    estimated: bool = False
    occurrences: list[OccurrenceEdit] | None = None


class RecurringCreate(PayableCreate):
    recurrence: RecurrenceIn


class SimulateIn(BaseModel):
    kind: RecurrenceKind
    startDate: date
    count: int = Field(ge=2, le=60)
    amount: Money


class OccurrenceOut(BaseModel):
    index: int
    dueDate: date
    amount: Decimal


class SeriesEdit(BaseModel):
    scope: SeriesScope
    amount: Money | None = None
    description: ShortText | None = None


class SeriesCancel(BaseModel):
    scope: Literal["following", "open"]
    reason: Reason


class SeriesCreated(BaseModel):
    seriesId: int
    ids: list[int]


class SeriesResult(BaseModel):
    count: int
