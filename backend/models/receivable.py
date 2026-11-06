from sqlalchemy import (
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
from models.payable import PayableSeries
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    PaymentMethod,
    Project,
)


class Receivable(Base):
    """Título de Contas a receber, simétrico ao de pagar (spec contas-a-receber).

    A situação e o pendente nunca são gravados: saem dos recebimentos e do vencimento
    (services/receivable.py). Excluir é lógico, porque a auditoria aponta para o título.
    """

    __tablename__ = "receivables"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(
        Integer, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Toda receita pertence a um projeto (regra 2 da spec): um só, sem rateio.
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    unit_id = Column(
        Integer, ForeignKey("business_units.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cost_center_id = Column(
        Integer, ForeignKey("cost_centers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Conta de receita do plano de contas
    category_id = Column(
        Integer,
        ForeignKey("expense_categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Texto livre: não há cadastro de contratos
    contract = Column(String(100), nullable=True)
    description = Column(String(255), nullable=False)
    # Sem documento | NF | Fatura | Invoice
    documentType = Column(String(20), nullable=False, default="Sem documento")
    documentNumber = Column(String(50), nullable=True)
    documentDate = Column(Date, nullable=True)
    issueDate = Column(Date, nullable=False)
    dueDate = Column(Date, nullable=False, index=True)
    competence = Column(String(7), nullable=False)  # AAAA-MM
    # Série de que faz parte (parcelas ou recorrência), nº 1 a `count`. Nulo em título avulso.
    series_id = Column(
        Integer, ForeignKey("payable_series.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    seriesIndex = Column(Integer, nullable=True)
    # Valor principal. O líquido a receber é o principal + acréscimos − descontos − impostos.
    amount = Column(Numeric(12, 2), nullable=False)
    # Legado: os abatimentos viraram impostos em `adjustments` (migração d9e4f0a5b3c2). Já não é
    # lido nem gravado; a coluna sai numa migração futura, depois de um tempo em produção.
    withheld = Column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    notes = Column(String, nullable=True)
    canceledAt = Column(DateTime(timezone=True), nullable=True)
    deletedAt = Column(DateTime(timezone=True), nullable=True, index=True)
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    series = relationship(PayableSeries, lazy="joined")
    customer = relationship(Customer)
    project = relationship(Project)
    company = relationship(Company)
    unit = relationship(BusinessUnit)
    cost_center = relationship(CostCenter)
    category = relationship(ExpenseCategory)
    adjustments = relationship(
        "ReceivableAdjustment", cascade="all, delete-orphan", order_by="ReceivableAdjustment.id"
    )
    payments = relationship("ReceivablePayment", order_by="ReceivablePayment.id")
    events = relationship("ReceivableEvent", order_by="ReceivableEvent.id")


class ReceivableAdjustment(Base):
    """Acréscimo, desconto ou imposto lançado no título (kind: acrescimo | desconto | imposto).
    O líquido é o valor + acréscimos − descontos − impostos; os totais saem desta tabela."""

    __tablename__ = "receivable_adjustments"

    id = Column(Integer, primary_key=True, index=True)
    receivable_id = Column(
        Integer, ForeignKey("receivables.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind = Column(String(10), nullable=False)
    description = Column(String(120), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)


class ReceivablePayment(Base):
    """Recebimento. Prova de que o dinheiro entrou: nunca é editado nem apagado, só anulado
    por outra linha (estorno)."""

    __tablename__ = "receivable_payments"

    id = Column(Integer, primary_key=True, index=True)
    receivable_id = Column(
        Integer, ForeignKey("receivables.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # recebimento | estorno
    kind = Column(String(20), nullable=False, default="recebimento")
    # Único: um recebimento só é anulado uma vez, mesmo com dois pedidos ao mesmo tempo.
    reverses_id = Column(
        Integer,
        ForeignKey("receivable_payments.id", ondelete="RESTRICT"),
        nullable=True,
        unique=True,
    )
    # Dia em que o dinheiro entrou: é o que bate com o extrato.
    receivedOn = Column(Date, nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
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


class ReceivableEvent(Base):
    """Histórico do título: o que mudou, quem mudou e quando. Só recebe linhas novas."""

    __tablename__ = "receivable_events"

    id = Column(Integer, primary_key=True, index=True)
    receivable_id = Column(
        Integer, ForeignKey("receivables.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    text = Column(String(500), nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User")
