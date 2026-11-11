from sqlalchemy import Column, DateTime, Integer, String, func

from db.connection import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    # sempre em minúsculas (services/auth.py: normalize_email)
    email = Column(String, unique=True, index=True, nullable=False)
    passwordHash = Column(String, nullable=False)
    # financeiro | admin
    role = Column(String(20), nullable=False, default="financeiro")
    # active | inactive
    status = Column(String(20), nullable=False, default="active", index=True)
    # AES-256-GCM (core/crypto.py), nunca em claro. Já existe durante o cadastro, mas o
    # MFA só vale depois de mfaEnabledAt.
    totpSecretEncrypted = Column(String, nullable=True)
    mfaEnabledAt = Column(DateTime(timezone=True), nullable=True)
    # janela de 30 s do último código aceito: o mesmo código não vale duas vezes
    totpLastUsedStep = Column(Integer, nullable=True)
    mfaFailedAttempts = Column(Integer, nullable=False, default=0, server_default="0")
    mfaLockedUntil = Column(DateTime(timezone=True), nullable=True)
    lastSignedInAt = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updatedAt = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    @property
    def mfaEnabled(self) -> bool:
        return self.mfaEnabledAt is not None
