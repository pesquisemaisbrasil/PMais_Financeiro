from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)

from db.connection import Base


class BankStatement(Base):
    """Uma importação de extrato: de qual conta, qual arquivo (só o nome e o hash, o arquivo não
    fica guardado) e quantas linhas entraram. Só recebe linhas novas."""

    __tablename__ = "bank_statements"

    id = Column(Integer, primary_key=True, index=True)
    bank_account_id = Column(
        Integer, ForeignKey("bank_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    filename = Column(String(255), nullable=False)
    fileHash = Column(String(64), nullable=False, index=True)
    fileFormat = Column(String(10), nullable=False)  # ofx ou csv
    periodStart = Column(Date, nullable=False)
    periodEnd = Column(Date, nullable=False)
    newLines = Column(Integer, nullable=False)
    duplicateLines = Column(Integer, nullable=False)
    imported_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BankTransaction(Base):
    """Uma linha do extrato. Imutável: nunca é editada nem apagada, e reimportar não duplica."""

    __tablename__ = "bank_transactions"
    __table_args__ = (
        UniqueConstraint("bank_account_id", "dedupeKey", name="uq_bank_transactions_account_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    bank_account_id = Column(
        Integer, ForeignKey("bank_accounts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    statement_id = Column(
        Integer, ForeignKey("bank_statements.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    postedOn = Column(Date, nullable=False, index=True)
    # entrada positiva, saída negativa
    amount = Column(Numeric(14, 2), nullable=False)
    # Cifrada: a descrição do Pix traz o nome de quem pagou ou recebeu.
    description_enc = Column(Text, nullable=False)
    # O ID da transação no banco (FITID do OFX), quando o arquivo traz.
    externalId = Column(String(100), nullable=True)
    # sha256 de "id:<ID do banco>" ou de "data|valor|descrição"; a repetição no arquivo entra no fim
    dedupeKey = Column(String(64), nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
