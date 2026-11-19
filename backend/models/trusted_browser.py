from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from db.connection import Base


class TrustedBrowser(Base):
    """Navegador de uma conta: a conta só entra pelos navegadores liberados (spec
    acesso-e-auditoria, ADR 0022). O navegador guarda um cookie aleatório; aqui fica só o hash
    dele, nunca o valor. O IP fica mascarado, como em `login_events`: nunca o completo."""

    __tablename__ = "trusted_browsers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # SHA-256 do cookie (core/security.hash_token), como o refresh token
    tokenHash = Column(String(64), nullable=False, unique=True)
    # "Chrome no Windows": o que o admin vê para reconhecer o computador
    label = Column(String(80), nullable=False)
    ipMasked = Column(String(45), nullable=True)
    # pendente | liberado | recusado | revogado
    status = Column(String(12), nullable=False, index=True)
    requestedAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # quem decidiu (liberou, recusou ou revogou) e quando; nulo no primeiro navegador da conta,
    # que é liberado sozinho, e enquanto o pedido espera
    decidedAt = Column(DateTime(timezone=True), nullable=True)
    decided_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    lastSeenAt = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    decided_by = relationship("User", foreign_keys=[decided_by_user_id])
