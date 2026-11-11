from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func

from db.connection import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Todos os tokens de uma mesma sessão: revogado que reaparece derruba a família inteira.
    familyId = Column(String(32), nullable=False, index=True)
    tokenHash = Column(String, unique=True, index=True, nullable=False)
    expiresAt = Column(DateTime(timezone=True), nullable=False)
    # Entrou por Google ou Microsoft: o segundo fator foi o do provedor, não o TOTP.
    viaSso = Column(Boolean, nullable=False, default=False, server_default="false")
    revoked = Column(Boolean, nullable=False, default=False, server_default="false")
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
