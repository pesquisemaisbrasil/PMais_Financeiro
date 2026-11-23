from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from db.connection import Base


class Demand(Base):
    """Pedido de mudança no sistema, aberto por qualquer pessoa e lido só pelo super admin (Bruno,
    19/11/2026). O anexo (print ou PDF) mora no cofre cifrado (core/file_vault.py), como os anexos
    das contas: pode mostrar dado real da tela."""

    __tablename__ = "demands"

    id = Column(Integer, primary_key=True, index=True)
    # nova | bug | regra (services/demands.KINDS)
    kind = Column(String(10), nullable=False)
    description = Column(Text, nullable=False)
    # a tela de onde a pessoa abriu ("/contas-a-pagar", "/cadastros?aba=suppliers")
    page = Column(String(200), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    fileName = Column(String(200), nullable=False)
    contentType = Column(String(100), nullable=False)
    size = Column(Integer, nullable=False)
    fileKey = Column(String(200), nullable=False, unique=True)
    fileSha256 = Column(String(64), nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # Concluída pelo super admin: quem abriu recebe o aviso no sino (Bruno, 19/11/2026)
    doneAt = Column(DateTime(timezone=True), nullable=True)
    done_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
