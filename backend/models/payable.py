from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import relationship

from db.connection import Base
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Project,
    Supplier,
)


class PayableSeries(Base):
    """Série de ocorrências (conta que se repete todo mês, toda semana ou em parcelas).
    Cada ocorrência é um título normal ligado à série; a série só guarda como ela nasceu."""

    __tablename__ = "payable_series"

    id = Column(Integer, primary_key=True, index=True)
    # mensal | semanal | parcelado
    kind = Column(String(20), nullable=False)
    # total de ocorrências, a primeira incluída
    count = Column(Integer, nullable=False)
    startDate = Column(Date, nullable=False)
    # Valor estimado (luz, por exemplo): cada ocorrência é trocada pelo real, uma de cada vez.
    estimated = Column(Boolean, nullable=False, default=False, server_default="false")
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Payable(Base):
    """Título de Contas a pagar, o único lugar onde se paga (kickoff de 03/11, K10).

    A situação nunca é gravada: sai das baixas e do vencimento (services/payable.py).
    Excluir é lógico, porque a auditoria aponta para o título.
    """

    __tablename__ = "payables"

    id = Column(Integer, primary_key=True, index=True)
    # real | provisao. Provisão nunca é paga.
    type = Column(String(20), nullable=False, default="real", index=True)
    # manual | connect | incentivo | folha. O do Connect se paga pelo PDF de comprovantes.
    origin = Column(String(20), nullable=False, default="manual", index=True)
    company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    unit_id = Column(
        Integer, ForeignKey("business_units.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cost_center_id = Column(
        Integer, ForeignKey("cost_centers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    category_id = Column(
        Integer,
        ForeignKey("expense_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    payment_method_id = Column(
        Integer, ForeignKey("payment_methods.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Lançamento agrupado não tem fornecedor: payeeName diz quem recebe ("14 entrevistados").
    supplier_id = Column(
        Integer, ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    payeeName = Column(String(200), nullable=True)
    description = Column(String(255), nullable=False)
    issueDate = Column(Date, nullable=False)
    dueDate = Column(Date, nullable=False, index=True)
    competence = Column(String(7), nullable=True)  # AAAA-MM
    amount = Column(Numeric(12, 2), nullable=False)
    barcode = Column(String(60), nullable=True)
    # Sem documento | NF | Boleto | Fatura | Recibo | Contrato
    documentType = Column(String(20), nullable=False, default="Sem documento")
    documentNumber = Column(String(50), nullable=True)
    documentDate = Column(Date, nullable=True)
    docsReceivedOn = Column(Date, nullable=True)
    # "Pagar em": o dia em que o financeiro pretende pagar. Só informa: não muda lista nem baixa.
    payOn = Column(Date, nullable=True)
    isTransfer = Column(Boolean, nullable=False, default=False, server_default="false")
    notes = Column(String, nullable=True)
    # Provisão trocada pelo lançamento real: sai das contas, e o real entra no lugar.
    # Resumo do arquivo importado, para avisar quando a mesma planilha vier de novo.
    importHash = Column(String(64), nullable=True, index=True)
    replaced_by_id = Column(
        Integer, ForeignKey("payables.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Série de que faz parte (nº 1 a `count`). Nulo em conta avulsa.
    series_id = Column(
        Integer, ForeignKey("payable_series.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    seriesIndex = Column(Integer, nullable=True)
    canceledAt = Column(DateTime(timezone=True), nullable=True)
    deletedAt = Column(DateTime(timezone=True), nullable=True, index=True)
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    company = relationship(Company)
    unit = relationship(BusinessUnit)
    cost_center = relationship(CostCenter)
    category = relationship(ExpenseCategory)
    payment_method = relationship(PaymentMethod)
    supplier = relationship(Supplier)
    series = relationship(PayableSeries, lazy="joined")
    replaced_provisions = relationship("Payable", foreign_keys=[replaced_by_id])
    allocations = relationship(
        "PayableAllocation", cascade="all, delete-orphan", order_by="PayableAllocation.id"
    )
    items = relationship("PayableItem", cascade="all, delete-orphan", order_by="PayableItem.id")
    adjustments = relationship(
        "PayableAdjustment", cascade="all, delete-orphan", order_by="PayableAdjustment.id"
    )
    payments = relationship("PayablePayment", order_by="PayablePayment.id")
    events = relationship("PayableEvent", order_by="PayableEvent.id")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    attachments = relationship("PayableAttachment", order_by="PayableAttachment.id")


class PayableAdjustment(Base):
    """Acréscimo, desconto ou imposto lançado na conta (kind: acrescimo | desconto | imposto).
    O líquido é o valor + acréscimos − descontos − impostos; os totais saem desta tabela."""

    __tablename__ = "payable_adjustments"

    id = Column(Integer, primary_key=True, index=True)
    payable_id = Column(
        Integer, ForeignKey("payables.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind = Column(String(10), nullable=False)
    description = Column(String(120), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)


class PayableAllocation(Base):
    """Rateio: quanto do título cabe a cada projeto. A soma é igual ao valor do título."""

    __tablename__ = "payable_allocations"

    id = Column(Integer, primary_key=True, index=True)
    payable_id = Column(
        Integer, ForeignKey("payables.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    amount = Column(Numeric(12, 2), nullable=False)

    project = relationship(Project)


class PayableItem(Base):
    """Uma pessoa do lançamento agrupado (folha, incentivo, entrevistadores do Connect)."""

    __tablename__ = "payable_items"

    id = Column(Integer, primary_key=True, index=True)
    payable_id = Column(
        Integer, ForeignKey("payables.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String(200), nullable=False)
    # NF | RPA | Incentivo | Sem NF
    documentType = Column(String(20), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    # RPA: `amount` é o líquido a pagar, e aqui fica o bruto.
    grossAmount = Column(Numeric(10, 2), nullable=True)
    invoiceNumber = Column(String(50), nullable=True)
    invoiceDate = Column(Date, nullable=True)
    # Incentivo: o dia em que a pessoa respondeu, que decide a data de pagamento.
    surveyDate = Column(Date, nullable=True)
    # Recebida | Pendente. NF pendente é só aviso e não bloqueia o pagamento (decisão de 28/10).
    invoiceStatus = Column(String(20), nullable=True)
    # Entrevistador do Connect (sem FK: a tabela está em outro banco). Liga a pessoa ao Pix do
    # comprovante, para a baixa dizer quem já foi paga.
    connect_interviewer_id = Column(Integer, nullable=True, index=True)
    # Dia do Pix que pagou esta pessoa.
    paidOn = Column(Date, nullable=True)
    # Incentivo: a chave Pix do respondente já mascarada (3 primeiros e 2 últimos caracteres, como o
    # Connect mostra). A chave completa nunca é guardada nem volta para a tela (Q22).
    pix_masked = Column(String(255), nullable=True)


class PayablePayment(Base):
    """Baixa. Prova de pagamento: nunca é editada nem apagada, só anulada por outra linha."""

    __tablename__ = "payable_payments"

    id = Column(Integer, primary_key=True, index=True)
    payable_id = Column(
        Integer, ForeignKey("payables.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # pagamento | estorno | devolucao (Pix que voltou). Os dois últimos anulam uma baixa.
    kind = Column(String(20), nullable=False, default="pagamento")
    # Único: uma baixa só é anulada uma vez, mesmo com dois pedidos ao mesmo tempo.
    reverses_id = Column(
        Integer, ForeignKey("payable_payments.id", ondelete="RESTRICT"), nullable=True, unique=True
    )
    # Data em que o dinheiro saiu: é a que bate com o extrato.
    paidOn = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    surcharge = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    discount = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    bank_account_id = Column(
        Integer, ForeignKey("bank_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    payment_method_id = Column(
        Integer, ForeignKey("payment_methods.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    transactionId = Column(String(100), nullable=True)
    note = Column(String(500), nullable=True)
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    bank_account = relationship(BankAccount)
    payment_method = relationship(PaymentMethod)


class PayableEvent(Base):
    """Histórico do título: o que mudou, quem mudou e quando. Só recebe linhas novas."""

    __tablename__ = "payable_events"

    id = Column(Integer, primary_key=True, index=True)
    payable_id = Column(
        Integer, ForeignKey("payables.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    text = Column(String(500), nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User")


class PayableAttachment(Base):
    """Documento anexado à conta (nota, boleto, comprovante de incentivo...). O arquivo mora no
    cofre cifrado (core/file_vault.py); aqui ficam só os dados para achá-lo e conferi-lo.
    Remover é **lógico**: a linha fica, com quem tirou e por quê, e o arquivo não é apagado."""

    __tablename__ = "payable_attachments"

    id = Column(Integer, primary_key=True, index=True)
    payable_id = Column(
        Integer, ForeignKey("payables.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name = Column(String(200), nullable=False)
    # um dos KINDS (services/attachments.KINDS)
    kind = Column(String(20), nullable=False, server_default="outro")
    contentType = Column(String(100), nullable=False)
    size = Column(Integer, nullable=False)
    fileKey = Column(String(200), nullable=False, unique=True)
    fileSha256 = Column(String(64), nullable=False)
    uploaded_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    deletedAt = Column(DateTime(timezone=True), nullable=True)
    deleted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    deletedReason = Column(String(500), nullable=True)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])
