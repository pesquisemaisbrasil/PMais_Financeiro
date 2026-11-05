from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from db.connection import Base


class Notification(Base):
    """Aviso dentro do sistema para uma pessoa da equipe. Só texto de tela e link: nada de
    dado pessoal de entrevistador."""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # receipt_out_of_project
    type = Column(String(40), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(String(500), nullable=True)
    link = Column(String(255), nullable=True)
    readAt = Column(DateTime(timezone=True), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
