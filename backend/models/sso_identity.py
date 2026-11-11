from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func

from db.connection import Base


class SsoIdentity(Base):
    """Identificador fixo da pessoa no provedor, guardado no primeiro login por SSO.
    O e-mail pode mudar ou ser reaproveitado por outra pessoa; este valor não."""

    __tablename__ = "sso_identities"
    __table_args__ = (UniqueConstraint("provider", "subject", name="uq_sso_provider_subject"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # google | microsoft
    provider = Column(String(20), nullable=False)
    # Google: `sub`. Microsoft: `<tid>:<oid>` (o `sub` da Microsoft muda a cada aplicativo)
    subject = Column(String(255), nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
