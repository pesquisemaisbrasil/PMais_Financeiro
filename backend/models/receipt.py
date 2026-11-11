from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)

from db.connection import Base


class ReceiptBatch(Base):
    """Um PDF de comprovantes enviado em partes."""

    __tablename__ = "receipt_batches"

    id = Column(Integer, primary_key=True, index=True)
    project_ref_id = Column(
        Integer, ForeignKey("project_refs.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Lançamento de Contas a pagar de onde o PDF foi enviado: é nele que a baixa aparece.
    payable_id = Column(
        Integer, ForeignKey("payables.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # o lote sobrevive à conta de quem enviou ou confirmou
    uploaded_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    confirmed_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # enviando → pronto (todas as partes lidas) → confirmado (final)
    status = Column(String(20), nullable=False, default="enviando", index=True)
    partsExpected = Column(Integer, nullable=False)
    confirmedAt = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReceiptBatchPart(Base):
    """Uma parte do PDF. O PDF não é guardado: só o resultado da leitura."""

    __tablename__ = "receipt_batch_parts"
    __table_args__ = (UniqueConstraint("batch_id", "partIndex"),)

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(
        Integer, ForeignKey("receipt_batches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    partIndex = Column(Integer, nullable=False)
    pageOffset = Column(Integer, nullable=False, default=0)
    receiptsCount = Column(Integer, nullable=False, default=0)
    error = Column(String(255), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PaymentReceipt(Base):
    """Um comprovante Pix lido. Guarda só o que casa e concilia: nome cifrado, hash e máscara
    da chave, valor, data e ID da transação. CPF, agência, código de autenticação e o texto
    do PDF nunca são gravados."""

    __tablename__ = "payment_receipts"
    __table_args__ = (
        # um Pix só paga uma vez, em qualquer lote
        Index(
            "uq_payment_receipts_e2e_paid",
            "e2eId",
            unique=True,
            postgresql_where=text("status = 'pago'"),
            sqlite_where=text("status = 'pago'"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    # RESTRICT: lote confirmado não leva a prova junto. Cancelar lote não confirmado apaga os
    # comprovantes no serviço, de forma explícita.
    batch_id = Column(
        Integer, ForeignKey("receipt_batches.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    page = Column(Integer, nullable=False)
    # AES-GCM. Só aparece na tela quando a chave não casa com ninguém.
    payeeNameEncrypted = Column(String, nullable=True)
    payeeKeyHash = Column(String(64), nullable=True, index=True)
    payeeKeyMasked = Column(String(255), nullable=True)
    amount = Column(Numeric(10, 2), nullable=True)
    paidOn = Column(Date, nullable=True)
    e2eId = Column(String(64), nullable=True, index=True)
    # no_projeto | fora_do_projeto | chave_nao_cadastrada | erro_leitura | duplicado
    group = Column(String(30), nullable=False)
    # quem casou (resposta do Connect), sem FK
    connect_interviewer_id = Column(Integer, nullable=True)
    # pendente → pago | descartado
    status = Column(String(20), nullable=False, default="pendente", index=True)
    error = Column(String(255), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReceiptAllocation(Base):
    """A baixa: qual comprovante pagou qual item. Prova de pagamento, nunca apagada."""

    __tablename__ = "receipt_allocations"

    id = Column(Integer, primary_key=True, index=True)
    receipt_id = Column(
        Integer, ForeignKey("payment_receipts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # único: um item é pago uma vez só
    payable_item_id = Column(
        Integer,
        ForeignKey("connect_payable_items.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    # valor do item na hora; a soma por comprovante é igual ao valor do Pix
    amount = Column(Numeric(10, 2), nullable=False)
    # quando o Connect confirmou a baixa
    connectAckAt = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PaymentRequest(Base):
    """Pedido de baixa ao Connect, um por Pix. O Financeiro grava o pedido na confirmação e
    só depois fala com o Connect, fora da transação, com `paymentRef` como Idempotency-Key.

    pendente_envio → enviada → aplicada (o Connect confirmou)
                            → recusada (vai para Divergências, nunca é corrigida sozinha)
    """

    __tablename__ = "payment_requests"

    id = Column(Integer, primary_key=True, index=True)
    receipt_id = Column(
        Integer,
        ForeignKey("payment_receipts.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    paymentRef = Column(String(64), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="pendente_envio", index=True)
    attempts = Column(Integer, nullable=False, default=0)
    # só o código do erro (already_paid, duplicate_e2e, amount_mismatch...), nunca dado pessoal
    lastError = Column(String(255), nullable=True)
    sentAt = Column(DateTime(timezone=True), nullable=True)
    appliedAt = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
