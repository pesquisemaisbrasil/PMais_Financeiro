from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from db.connection import Base


class MfaRecoveryCode(Base):
    """Código de recuperação de uso único. Só o hash fica no banco: o código em claro
    aparece uma vez, no fim do cadastro do MFA."""

    __tablename__ = "mfa_recovery_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    codeHash = Column(String, nullable=False, index=True)
    usedAt = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
