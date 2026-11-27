"""A migration da linha do DRE (27/11/2026) liga só os grupos e as contas que vieram do sistema
antigo; o resto fica sem linha para a pessoa escolher em Cadastros."""

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

VERSION = Path(__file__).parents[1] / "alembic" / "versions" / "e5c9a1b7d2f4_linha_do_dre.py"


def test_the_initial_lines_follow_the_old_system_and_leave_the_rest_alone() -> None:
    spec = importlib.util.spec_from_file_location("linha_do_dre", VERSION)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        for statement in (
            "CREATE TABLE expense_category_groups (code TEXT, name TEXT)",
            "CREATE TABLE expense_categories (name TEXT)",
            "INSERT INTO expense_category_groups (code, name) VALUES "
            "('010', 'Receitas Líquida Operacional'), ('003', 'Ativo - Variável'), "
            "('012', 'Despesas Administrativas - Bancárias'), "
            "('013', 'Despesas Administrativas - Impostos'), "
            "('001', 'Despesas Administrativas - Fixas'), ('006', 'Outro nome')",
            "INSERT INTO expense_categories (name) VALUES ('Empréstimo Bancário'), "
            "('Empréstimos de Sócios'), ('Aporte Sócia Fictícia'), ('Seguro_Empréstimo'), "
            "('Vendas - Online')",
        ):
            conn.execute(sa.text(statement))
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        groups = conn.execute(sa.text('SELECT code, "dreLine" FROM expense_category_groups'))
        accounts = conn.execute(sa.text('SELECT name, "dreLine" FROM expense_categories'))
        assert dict(groups.all()) == {
            "010": "receita",
            "003": "fora",
            "012": "bancarias",
            "013": "impostos",
            "001": "administrativas",
            "006": None,
        }
        assert dict(accounts.all()) == {
            "Empréstimo Bancário": "fora",
            "Empréstimos de Sócios": "fora",
            "Aporte Sócia Fictícia": "fora",
            "Seguro_Empréstimo": None,
            "Vendas - Online": None,
        }
