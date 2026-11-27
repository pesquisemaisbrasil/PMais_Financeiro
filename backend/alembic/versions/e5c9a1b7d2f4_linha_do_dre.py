"""linha do DRE no plano de contas

Revision ID: e5c9a1b7d2f4
Revises: d4b8f2c6a9e3
Create Date: 2026-11-27 21:00:00.000000

DRE com subtotais (Bruno, 27/11/2026; ADR 0030): o grupo do plano de contas, e quando preciso a
conta, apontam para uma linha do DRE. O vínculo inicial é o rascunho aprovado, só nos grupos e nas
contas que vieram do sistema antigo (código e começo do nome); a Vivi confere em Cadastros.
Empréstimo e aporte não são receita nem despesa: ficam fora do resultado.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e5c9a1b7d2f4"
down_revision: str | Sequence[str] | None = "d4b8f2c6a9e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (código do grupo, começo do nome em minúsculas, linha)
GROUPS = (
    ("001", "despesas administrativas%", "administrativas"),
    ("002", "despesas com pessoal%", "pessoal"),
    ("003", "ativo%", "fora"),
    ("004", "ativo%", "fora"),
    ("005", "despesas administrativas%", "administrativas"),
    ("006", "custos%", "custos"),
    ("007", "despesas administrativas%", "administrativas"),
    ("008", "despesas administrativas%", "administrativas"),
    ("009", "despesas administrativas%", "administrativas"),
    ("010", "receitas%", "receita"),
    ("011", "despesas administrativas%", "administrativas"),
    ("012", "despesas administrativas%", "bancarias"),
    ("013", "despesas administrativas%", "impostos"),
    ("014", "despesas administrativas%", "administrativas"),
    ("020", "outras receitas%", "outras_receitas"),
    ("9999", "adiantamento%", "fora"),
)
# contas que não entram no resultado, em qualquer grupo
OUTSIDE_ACCOUNTS = ("empr%stimo%", "aporte%")


def upgrade() -> None:
    for table in ("expense_category_groups", "expense_categories"):
        op.add_column(table, sa.Column("dreLine", sa.String(30), nullable=True))
    bind = op.get_bind()
    for code, name, line in GROUPS:
        bind.execute(
            sa.text(
                'UPDATE expense_category_groups SET "dreLine" = :line '
                "WHERE code = :code AND lower(name) LIKE :name"
            ),
            {"line": line, "code": code, "name": name},
        )
    for name in OUTSIDE_ACCOUNTS:
        bind.execute(
            sa.text(
                "UPDATE expense_categories SET \"dreLine\" = 'fora' WHERE lower(name) LIKE :name"
            ),
            {"name": name},
        )


def downgrade() -> None:
    for table in ("expense_categories", "expense_category_groups"):
        op.drop_column(table, "dreLine")
