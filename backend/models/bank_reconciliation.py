from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)

from db.connection import Base


class BankReconciliation(Base):
    """O que se fez com uma linha do extrato: ligada a um lançamento (e à pessoa dele, quando tem
    itens) ou marcada como exceção com motivo. É o estado de agora: desfazer apaga a linha daqui, e
    quem desfez e por quê fica em `bank_reconciliation_events`."""

    __tablename__ = "bank_reconciliations"
    __table_args__ = (
        CheckConstraint(
            "(kind = 'excecao' AND payable_id IS NULL AND receivable_id IS NULL)"
            " OR (kind = 'lancamento' AND ((payable_id IS NOT NULL AND receivable_id IS NULL)"
            " OR (payable_id IS NULL AND receivable_id IS NOT NULL)))",
            name="ck_bank_reconciliations_target",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    # Única: uma linha do extrato só tem uma conciliação, mesmo com dois pedidos ao mesmo tempo.
    bank_transaction_id = Column(
        Integer,
        ForeignKey("bank_transactions.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    # lancamento | excecao
    kind = Column(String(12), nullable=False)
    # incentivo, adiantamento, nf, rpa, sem_nf, reembolso, tarifa, transferencia, recebimento, outro
    classification = Column(String(20), nullable=True)
    payable_id = Column(
        Integer, ForeignKey("payables.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Única: uma pessoa do lançamento só casa com uma linha do extrato.
    payable_item_id = Column(
        Integer, ForeignKey("payable_items.id", ondelete="RESTRICT"), nullable=True, unique=True
    )
    receivable_id = Column(
        Integer, ForeignKey("receivables.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Com NF: o número e a data de emissão que a contabilidade precisa.
    nfNumber = Column(String(50), nullable=True)
    nfIssuedOn = Column(Date, nullable=True)
    # O motivo, na exceção.
    note = Column(String(300), nullable=True)
    reconciled_by_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BankReconciliationEvent(Base):
    """Histórico das conciliações: quem conciliou, marcou exceção ou desfez, e quando. Só recebe
    linhas novas."""

    __tablename__ = "bank_reconciliation_events"

    id = Column(Integer, primary_key=True, index=True)
    # Sem apagar a linha do extrato, o histórico fica para sempre.
    bank_transaction_id = Column(
        Integer, ForeignKey("bank_transactions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    text = Column(String(500), nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
