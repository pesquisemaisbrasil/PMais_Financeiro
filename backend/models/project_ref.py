from sqlalchemy import Column, DateTime, Integer, String, func

from db.connection import Base


class ProjectRef(Base):
    """Espelho mínimo do projeto do Connect (handoff/04). É a linha travada com
    `with_for_update()` quando se altera ou confirma um lote de comprovantes do projeto."""

    __tablename__ = "project_refs"

    id = Column(Integer, primary_key=True, index=True)
    # id no Connect, sem FK: a tabela está em outro banco
    connect_project_id = Column(Integer, nullable=False, unique=True)
    # só para listar sem chamar o Connect a cada tela; não é dado pessoal
    title = Column(String(255), nullable=False)
    # nulo = 30 dias
    paymentTermDays = Column(Integer, nullable=True)
    syncedAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
