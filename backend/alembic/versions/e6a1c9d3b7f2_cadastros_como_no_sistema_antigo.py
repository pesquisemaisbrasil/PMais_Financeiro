"""cadastros como no sistema antigo: código antigo à parte, IE da empresa e ficha da unidade

O centro de custo também ganha o código no sistema antigo (200, 999, IHEA, 002.0001_24...), que nem
sempre segue a numeração gerada (001, 001.001). O cliente ganha o código antigo e a origem, e o
fornecedor, a mesma ficha do cliente. O plano de contas ganha os grupos (tabela à parte, que nunca
recebe lançamento), e o código da conta passa a ser único dentro do grupo.

Revision ID: e6a1c9d3b7f2
Revises: d5f9b3a7c1e4
Create Date: 2026-11-24 16:00:00.000000

Pedido do Bruno em 24/11/2026 (spec cadastros-e-dimensoes): o cadastro igual ao .csv do sistema
antigo. O código gerado (0001...) continua (decisão do PO em 09/11), e o código do sistema antigo
fica em `legacyCode`. A empresa ganha a IE; a unidade ganha apelido, CNPJ (só CNPJ, e pode repetir o
da empresa) e IE.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e6a1c9d3b7f2"
down_revision: str | Sequence[str] | None = "d5f9b3a7c1e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# O fornecedor ganha a mesma ficha do cliente (o .csv do sistema antigo é igual): sem CPF nem Pix.
SUPPLIER_CARD = [
    sa.Column("stateRegistration", sa.String(30), nullable=True),
    sa.Column("phone2", sa.String(30), nullable=True),
    sa.Column("phone3", sa.String(30), nullable=True),
    sa.Column("emailAlt", sa.String(200), nullable=True),
    sa.Column("notes", sa.String(1000), nullable=True),
    sa.Column("addressCountry", sa.String(60), nullable=True),
    sa.Column("addressZip", sa.String(8), nullable=True),
    sa.Column("addressStreet", sa.String(150), nullable=True),
    sa.Column("addressNumber", sa.String(20), nullable=True),
    sa.Column("addressComplement", sa.String(100), nullable=True),
    sa.Column("addressDistrict", sa.String(80), nullable=True),
    sa.Column("addressCity", sa.String(80), nullable=True),
    sa.Column("addressState", sa.String(2), nullable=True),
    sa.Column("origin", sa.String(100), nullable=True),
    sa.Column("legacyCode", sa.String(20), nullable=True),
]


def upgrade() -> None:
    with op.batch_alter_table("companies") as batch:
        batch.add_column(sa.Column("legacyCode", sa.String(20), nullable=True))
        batch.add_column(sa.Column("stateRegistration", sa.String(30), nullable=True))
    with op.batch_alter_table("business_units") as batch:
        batch.add_column(sa.Column("legacyCode", sa.String(20), nullable=True))
        batch.add_column(sa.Column("nickname", sa.String(100), nullable=True))
        batch.add_column(sa.Column("document", sa.String(14), nullable=True))
        batch.add_column(sa.Column("stateRegistration", sa.String(30), nullable=True))
    with op.batch_alter_table("cost_centers") as batch:
        batch.add_column(sa.Column("legacyCode", sa.String(20), nullable=True))
    with op.batch_alter_table("customers") as batch:
        batch.add_column(sa.Column("legacyCode", sa.String(20), nullable=True))
        batch.add_column(sa.Column("origin", sa.String(100), nullable=True))
    with op.batch_alter_table("suppliers") as batch:
        for column in SUPPLIER_CARD:
            batch.add_column(column)
    # Os grupos do plano de contas, e o código da conta único dentro do grupo
    op.create_table(
        "expense_category_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(20), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_expense_category_groups_id", "expense_category_groups", ["id"])
    op.add_column("expense_categories", sa.Column("group_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_expense_categories_group_id",
        "expense_categories",
        "expense_category_groups",
        ["group_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_expense_categories_group_id", "expense_categories", ["group_id"])
    op.drop_constraint("expense_categories_code_key", "expense_categories", type_="unique")
    op.create_index(
        "uq_expense_categories_code_root",
        "expense_categories",
        ["code"],
        unique=True,
        postgresql_where=sa.text("group_id IS NULL"),
    )
    op.create_index(
        "uq_expense_categories_code_group",
        "expense_categories",
        ["group_id", "code"],
        unique=True,
        postgresql_where=sa.text("group_id IS NOT NULL"),
    )
    # O projeto: a empresa (da unidade), as observações e o código antigo; o número único dentro
    # da empresa (o 1417 está na Pesquise+ e na IHEA)
    op.add_column("projects", sa.Column("company_id", sa.Integer(), nullable=True))
    op.add_column("projects", sa.Column("notes", sa.String(1000), nullable=True))
    op.add_column("projects", sa.Column("legacyCode", sa.String(20), nullable=True))
    op.create_foreign_key(
        "fk_projects_company_id", "projects", "companies", ["company_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index("ix_projects_company_id", "projects", ["company_id"])
    op.execute(
        "UPDATE projects SET company_id = "
        "(SELECT company_id FROM business_units WHERE business_units.id = projects.unit_id) "
        "WHERE unit_id IS NOT NULL"
    )
    op.drop_constraint("projects_code_key", "projects", type_="unique")
    op.create_index(
        "uq_projects_code_company",
        "projects",
        ["company_id", "code"],
        unique=True,
        postgresql_where=sa.text("company_id IS NOT NULL"),
    )
    op.create_index(
        "uq_projects_code_root",
        "projects",
        ["code"],
        unique=True,
        postgresql_where=sa.text("company_id IS NULL"),
    )
    # A conta bancária como no sistema antigo: o código de lá, "entra no fluxo de caixa" e os tipos
    # CC, CI, Interna e Crédito (os de antes viram: corrente = CC, aplicação = CI, caixa = Interna)
    op.add_column("bank_accounts", sa.Column("legacyCode", sa.String(20), nullable=True))
    op.add_column(
        "bank_accounts",
        sa.Column("impactsCashFlow", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute(
        'UPDATE bank_accounts SET "accountType" = CASE "accountType" '
        "WHEN 'corrente' THEN 'cc' WHEN 'aplicacao' THEN 'ci' WHEN 'caixa' THEN 'interna' "
        'ELSE "accountType" END'
    )


def downgrade() -> None:
    op.execute(
        'UPDATE bank_accounts SET "accountType" = CASE "accountType" '
        "WHEN 'cc' THEN 'corrente' WHEN 'ci' THEN 'aplicacao' WHEN 'interna' THEN 'caixa' "
        "WHEN 'credito' THEN 'corrente' ELSE \"accountType\" END"
    )
    op.drop_column("bank_accounts", "impactsCashFlow")
    op.drop_column("bank_accounts", "legacyCode")
    # Volta a unicidade na tabela toda: com o mesmo número em duas empresas, a volta falha (como a
    # do código da conta do plano repetido em dois grupos)
    op.drop_index("uq_projects_code_root", "projects")
    op.drop_index("uq_projects_code_company", "projects")
    op.create_unique_constraint("projects_code_key", "projects", ["code"])
    op.drop_index("ix_projects_company_id", "projects")
    op.drop_constraint("fk_projects_company_id", "projects", type_="foreignkey")
    op.drop_column("projects", "legacyCode")
    op.drop_column("projects", "notes")
    op.drop_column("projects", "company_id")
    op.drop_index("uq_expense_categories_code_group", "expense_categories")
    op.drop_index("uq_expense_categories_code_root", "expense_categories")
    op.create_unique_constraint("expense_categories_code_key", "expense_categories", ["code"])
    op.drop_index("ix_expense_categories_group_id", "expense_categories")
    op.drop_constraint("fk_expense_categories_group_id", "expense_categories", type_="foreignkey")
    op.drop_column("expense_categories", "group_id")
    op.drop_index("ix_expense_category_groups_id", "expense_category_groups")
    op.drop_table("expense_category_groups")
    with op.batch_alter_table("suppliers") as batch:
        for column in reversed(SUPPLIER_CARD):
            batch.drop_column(column.name)
    with op.batch_alter_table("customers") as batch:
        batch.drop_column("origin")
        batch.drop_column("legacyCode")
    with op.batch_alter_table("cost_centers") as batch:
        batch.drop_column("legacyCode")
    with op.batch_alter_table("business_units") as batch:
        batch.drop_column("stateRegistration")
        batch.drop_column("document")
        batch.drop_column("nickname")
        batch.drop_column("legacyCode")
    with op.batch_alter_table("companies") as batch:
        batch.drop_column("stateRegistration")
        batch.drop_column("legacyCode")
