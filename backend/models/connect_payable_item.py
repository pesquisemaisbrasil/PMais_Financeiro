from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String, func

from db.connection import Base


class ConnectPayableItem(Base):
    """Entrevista a pagar, espelhada do Connect. Sem nome nem chave Pix.

    No handoff/04 esta tabela se chama `payable_items`, nome que já é de outra coisa em
    Contas a pagar (as pessoas de um lançamento): ver "Ajustes" da spec comprovantes-e-baixa.
    """

    __tablename__ = "connect_payable_items"

    id = Column(Integer, primary_key=True, index=True)
    # uma linha por entrevista: a sincronização repetida não duplica
    connect_interview_id = Column(Integer, nullable=False, unique=True)
    project_ref_id = Column(
        Integer, ForeignKey("project_refs.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    connect_interviewer_id = Column(Integer, nullable=False, index=True)
    # earnedValue congelado no lançamento
    amount = Column(Numeric(10, 2), nullable=False)
    launchedAt = Column(DateTime(timezone=True), nullable=False)
    dueOn = Column(Date, nullable=False)
    # a_pagar → pago; cancelado se o Connect apagou o lançamento
    status = Column(String(20), nullable=False, default="a_pagar", index=True)
    paidOn = Column(Date, nullable=True)
    # evento mais velho que o já aplicado é ignorado
    connectUpdatedAt = Column(DateTime(timezone=True), nullable=False)
    syncedAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
