from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    false,
    func,
    text,
)

from db.connection import Base


class Company(Base):
    """Empresa do Grupo. Cada lançamento pertence a uma."""

    __tablename__ = "companies"
    # O banco segura dois pedidos ao mesmo tempo com o mesmo documento.
    __table_args__ = (
        Index(
            "uq_companies_active_document",
            "document",
            unique=True,
            postgresql_where=text("active AND document IS NOT NULL"),
            sqlite_where=text("active AND document IS NOT NULL"),
        ),
        Index("uq_companies_code", "code", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    # Razão social: até 200 letras, que é o que a Receita devolve na consulta de CNPJ.
    name = Column(String(200), nullable=False, unique=True)
    nickname = Column(String(100), nullable=True)
    # PF (pessoa física) ou PJ (pessoa jurídica). PF fica sem documento: CPF não é guardado (Q23).
    personType = Column(String(2), nullable=True)
    code = Column(String(20), nullable=True)
    # Só CNPJ: CPF não é guardado (pergunta Q23).
    document = Column(String(14), nullable=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class BusinessUnit(Base):
    __tablename__ = "business_units"
    __table_args__ = (Index("uq_business_units_code", "code", unique=True),)

    id = Column(Integer, primary_key=True, index=True)
    # Gerado na criação (0001, 0002...), único e nunca reaproveitado: ver RecordCounter.
    code = Column(String(20), nullable=True)
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
    # despesa (Contas a pagar) | receita (Contas a receber): cada tela só vê a sua
    kind = Column(String(10), nullable=False, default="despesa", server_default="despesa")
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


class Customer(Base):
    """Cliente de Contas a receber. Só CNPJ: CPF não é guardado (pergunta Q23)."""

    __tablename__ = "customers"
    # O banco segura dois pedidos ao mesmo tempo com o mesmo documento.
    __table_args__ = (
        Index(
            "uq_customers_active_document",
            "document",
            unique=True,
            postgresql_where=text("active AND document IS NOT NULL"),
            sqlite_where=text("active AND document IS NOT NULL"),
        ),
        Index("uq_customers_code", "code", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), nullable=True)
    nickname = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    # PF (pessoa física) ou PJ (pessoa jurídica). PF fica sem documento: CPF não é guardado (Q23).
    personType = Column(String(2), nullable=True)
    document = Column(String(14), nullable=True)
    contactName = Column(String(120), nullable=True)
    phone = Column(String(30), nullable=True)
    email = Column(String(200), nullable=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")


class Supplier(Base):
    __tablename__ = "suppliers"
    # O banco segura dois pedidos ao mesmo tempo com o mesmo documento.
    __table_args__ = (
        Index(
            "uq_suppliers_active_document",
            "document",
            unique=True,
            postgresql_where=text("active AND document IS NOT NULL"),
            sqlite_where=text("active AND document IS NOT NULL"),
        ),
        Index("uq_suppliers_code", "code", unique=True),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), nullable=True)
    nickname = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    # PF (pessoa física) ou PJ (pessoa jurídica). PF fica sem documento: CPF não é guardado (Q23).
    personType = Column(String(2), nullable=True)
    # Só CNPJ: CPF não é guardado (pergunta Q23).
    document = Column(String(14), nullable=True)
    contactName = Column(String(120), nullable=True)
    phone = Column(String(30), nullable=True)
    email = Column(String(200), nullable=True)
    paymentTerms = Column(String(200), nullable=True)
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


class RecordCounter(Base):
    """Último código gerado de cada cadastro (fornecedor, cliente, empresa). Fica à parte da tabela
    para o código nunca ser reaproveitado: excluir o último cadastro não devolve o número."""

    __tablename__ = "record_counters"

    kind = Column(String(20), primary_key=True)
    lastValue = Column(Integer, nullable=False, default=0, server_default="0")


class RecordEvent(Base):
    """Histórico dos cadastros: quem mudou o quê e quando. Só recebe linhas novas."""

    __tablename__ = "record_events"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(20), nullable=False, index=True)
    # Sem chave estrangeira: o cadastro pode ser excluído, e o histórico fica.
    record_id = Column(Integer, nullable=False, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    text = Column(String(500), nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
