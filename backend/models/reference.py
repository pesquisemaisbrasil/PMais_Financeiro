from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    false,
    func,
    text,
)
from sqlalchemy.orm import relationship

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
    """Centro de custo em dois níveis: o principal (sem superior) e o sub-centro, embaixo de
    um principal. O código nasce na criação e nunca muda: principal 001, 002...; sub-centro 001.001,
    001.002... (o do superior, um ponto e a ordem dentro dele)."""

    __tablename__ = "cost_centers"
    __table_args__ = (
        Index("uq_cost_centers_code", "code", unique=True),
        # O nome não repete entre os principais, nem dentro do mesmo superior; sub-centros de
        # superiores diferentes podem ter o mesmo nome (o "Geral" de cada um).
        Index(
            "uq_cost_centers_name_root",
            "name",
            unique=True,
            postgresql_where=text("parent_id IS NULL"),
            sqlite_where=text("parent_id IS NULL"),
        ),
        Index(
            "uq_cost_centers_name_parent",
            "parent_id",
            "name",
            unique=True,
            postgresql_where=text("parent_id IS NOT NULL"),
            sqlite_where=text("parent_id IS NOT NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), nullable=True)
    parent_id = Column(
        Integer, ForeignKey("cost_centers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    name = Column(String(100), nullable=False)
    active = Column(Boolean, nullable=False, default=True, server_default="true")

    parent = relationship("CostCenter", remote_side=[id], lazy="joined")

    @property
    def path(self) -> str:
        """Como aparece nas listas: o principal pelo nome; o sub-centro com o superior na frente."""
        return f"{self.parent.name} › {self.name}" if self.parent is not None else self.name

    @property
    def label(self) -> str:
        """Nas escolhas: com o código e o caminho (001.001 · Administrativo › Adm_Geral)."""
        return f"{self.code} · {self.path}" if self.code else self.path


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
    # Inscrição estadual da empresa. RG e CPF não se guardam (Q23, Q37).
    stateRegistration = Column(String(30), nullable=True)
    phone2 = Column(String(30), nullable=True)
    phone3 = Column(String(30), nullable=True)
    emailAlt = Column(String(200), nullable=True)
    notes = Column(String(1000), nullable=True)
    # Endereço: opcional. Para cliente pessoa física é dado pessoal (ver o inventário de dados).
    addressCountry = Column(String(60), nullable=True)
    addressZip = Column(String(8), nullable=True)
    addressStreet = Column(String(150), nullable=True)
    addressNumber = Column(String(20), nullable=True)
    addressComplement = Column(String(100), nullable=True)
    addressDistrict = Column(String(80), nullable=True)
    addressCity = Column(String(80), nullable=True)
    addressState = Column(String(2), nullable=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")

    attachments = relationship("CustomerAttachment", order_by="CustomerAttachment.id")


class CustomerAttachment(Base):
    """Documento anexado ao cliente (contrato, ficha...). Igual ao das contas: o arquivo mora no
    cofre cifrado (core/file_vault.py), aqui ficam só os dados para achá-lo e conferi-lo, e remover
    é **lógico**."""

    __tablename__ = "customer_attachments"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(
        Integer, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name = Column(String(200), nullable=False)
    kind = Column(String(20), nullable=False, server_default="outro")
    contentType = Column(String(100), nullable=False)
    size = Column(Integer, nullable=False)
    fileKey = Column(String(200), nullable=False, unique=True)
    fileSha256 = Column(String(64), nullable=False)
    uploaded_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    deletedAt = Column(DateTime(timezone=True), nullable=True)
    deleted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    deletedReason = Column(String(500), nullable=True)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])


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


class Holiday(Base):
    """Feriado cadastrado: os nacionais vêm da BrasilAPI e os locais, do financeiro. Todos contam
    como dia não útil (`core/business_days.py`), além dos nacionais fixos que já estão no código."""

    __tablename__ = "holidays"
    __table_args__ = (UniqueConstraint("day", "name", name="uq_holidays_day_name"),)

    id = Column(Integer, primary_key=True, index=True)
    day = Column(Date, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    # nacional | estadual | municipal
    scope = Column(String(12), nullable=False)
    uf = Column(String(2))
    city = Column(String(80))
    # brasilapi | manual
    source = Column(String(12), nullable=False)
    createdAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
