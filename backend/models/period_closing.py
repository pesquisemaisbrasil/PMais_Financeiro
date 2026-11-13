from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func

from db.connection import Base


class PeriodClosing(Base):
    """Mês fechado de uma empresa: o estado de agora. Reabrir apaga a linha daqui, e quem reabriu e
    por quê fica em `period_closing_events`."""

    __tablename__ = "period_closings"
    __table_args__ = (
        UniqueConstraint("company_id", "month", name="uq_period_closings_company_month"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    month = Column(String(7), nullable=False)  # AAAA-MM
    closed_by_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PeriodClosingEvent(Base):
    """Histórico dos fechamentos: quem fechou, quem reabriu (com o motivo) e quem baixou a planilha
    da contabilidade. Só recebe linhas novas."""

    __tablename__ = "period_closing_events"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    month = Column(String(7), nullable=False)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    text = Column(String(500), nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
