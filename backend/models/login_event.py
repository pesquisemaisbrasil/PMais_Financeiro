from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func

from db.connection import Base


class LoginEvent(Base):
    """Tentativa de login, com sucesso ou erro. Nunca guarda o e-mail digitado,
    a senha nem o IP completo. O último sucesso da conta dá o IP e o user-agent
    do último login."""

    __tablename__ = "login_events"

    id = Column(Integer, primary_key=True, index=True)
    # SET NULL: a tentativa continua contando nos totais mesmo sem a conta
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # HMAC do e-mail: conta as falhas por e-mail, exista a conta ou não
    emailHash = Column(String(64), nullable=True, index=True)
    success = Column(Boolean, nullable=False)
    # wrong_password | inactive_account | unknown_account | rate_limited | wrong_mfa_code |
    # mfa_locked | mfa_reset; no sucesso, recovery_code quando entrou por código de recuperação
    reason = Column(String(40), nullable=True)
    ipMasked = Column(String(45), nullable=True)
    userAgent = Column(String(255), nullable=True)
    createdAt = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
