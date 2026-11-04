from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, false

from db.connection import Base


class Company(Base):
    """Empresa do Grupo. Cada lançamento pertence a uma."""

    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class BusinessUnit(Base):
    __tablename__ = "business_units"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name = Column(String(100), nullable=False)
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class CostCenter(Base):
    __tablename__ = "cost_centers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class ExpenseCategory(Base):
    """Conta analítica do plano de contas: só ela recebe lançamento."""

    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), nullable=False, unique=True)
    name = Column(String(100), nullable=False)
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(
        Integer, ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name = Column(String(100), nullable=False)
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    nickname = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class Project(Base):
    """Espelho mínimo do projeto do Connect, que continua sendo o dono do cadastro."""

    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), nullable=False, unique=True)
    title = Column(String(200), nullable=False)
    # em_andamento → encerrado. Encerrado não aceita lançamento nem mudança de valor.
    status = Column(String(20), nullable=False, default="em_andamento")
    # Por enquanto marcados aqui (F23). Sem prazo, incentivo sem data na planilha é recusado.
    projectType = Column(String(40), nullable=True)
    hasIncentive = Column(Boolean, nullable=False, default=False, server_default=false())
    incentiveDays = Column(Integer, nullable=True)
