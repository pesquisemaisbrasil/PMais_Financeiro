"""O script que popula o banco vazio com o relatório do sistema antigo
(scripts/importar_relatorio_antigo.py): cria os cadastros que faltam e importa como a tela."""

from collections.abc import Callable
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from models.payable import Payable
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Supplier,
)
from models.user import User
from scripts.importar_relatorio_antigo import METHOD, importar
from services.payable import PayableInvalid, today

HEADER = (
    "Programação|Pagamento|Fornecedor|Plano de Contas|R$ Líquido|R$ Pago|R$ Pendente|Projeto|"
    "Unidade|CCusto|Empresa|Conta|Situação|Descrição|Documento"
).split("|")
EMAIL = "ana@pesquisemais.com.br"


def _report(*lines: list[str]) -> bytes:
    """O .xls que o sistema antigo exporta: uma tabela HTML, com o título antes do cabeçalho."""
    rows = "".join(
        "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in (HEADER, *lines)
    )
    title = "<tr><td>Lançamentos a Pagar</td></tr>"
    return f"<html><body><table>{title}{rows}</table></body></html>".encode()


@pytest.fixture
def report() -> bytes:
    day = (today() - timedelta(days=3)).strftime("%d/%m/%Y")
    paid = [day, day, "Gráfica Ponto Certo", "Aluguel", "1.200,00", "1.200,00", "0,00"]
    paid += ["Adm_Geral", "Matriz", "Adm_Geral", "Pesquise+", "Banco Itaú", "PAGO", "Aluguel", ""]
    pending = [day, "", "Copa Ltda", "Copa E Cozinha", "80,50", "", "80,50", "Adm_Centro"]
    pending += ["Curitiba", "Adm Filial Curitiba", "Pesquise+", "", "PENDENTE", "", "NF 9"]
    cancelled = [day, "", "Outro", "Nunca cadastrar", "10,00", "", "10,00", "", "Matriz"]
    cancelled += ["Adm_Geral", "Pesquise+", "", "CANCELADO", "", ""]
    return _report(paid, pending, cancelled)


@pytest.fixture
def user(make_user: Callable[..., User]) -> User:
    return make_user(email=EMAIL)


def _counts(db: Session) -> list[int]:
    models = (Company, BusinessUnit, CostCenter, ExpenseCategory, BankAccount, PaymentMethod)
    return [db.query(model).count() for model in (*models, Payable)]


def test_without_gravar_shows_the_preview_and_writes_nothing(
    db_session: Session, user: User, report: bytes
) -> None:
    text = importar(db_session, EMAIL, "relatorio.xls", report, write=False)

    assert "Serão cadastrados (não existiam):" in text
    assert "Plano de contas: SGE-001 Aluguel, SGE-002 Copa E Cozinha" in text
    assert "Contas: 2 entram (1 pagas, com a baixa; 1 a pagar) · 1 canceladas" in text
    assert "Nada foi gravado" in text
    assert _counts(db_session) == [0, 0, 0, 0, 0, 0, 0]


def test_gravar_creates_what_is_missing_and_imports_like_the_screen(
    db_session: Session, user: User, report: bytes
) -> None:
    text = importar(db_session, EMAIL, "relatorio.xls", report, write=True)
    assert text.endswith("Gravado.")

    company = db_session.query(Company).one()
    assert company.name == "Pesquise+"
    units = {u.name: u for u in db_session.query(BusinessUnit)}
    assert set(units) == {"Matriz", "Curitiba"}
    assert {u.company_id for u in units.values()} == {company.id}
    assert {c.name for c in db_session.query(CostCenter)} == {"Adm_Geral", "Adm Filial Curitiba"}
    # a linha cancelada não entra e não cadastra nada
    categories = {c.name: c for c in db_session.query(ExpenseCategory)}
    assert {name: c.code for name, c in categories.items()} == {
        "Aluguel": "SGE-001",
        "Copa E Cozinha": "SGE-002",
    }
    account = db_session.query(BankAccount).one()
    assert (account.name, account.company_id) == ("Banco Itaú", company.id)
    method = db_session.query(PaymentMethod).one()
    assert method.name == METHOD
    # fornecedor e projeto não são cadastrados: a conta guarda o nome e fica sem projeto
    assert db_session.query(Supplier).count() == 0

    payables = {p.payeeName: p for p in db_session.query(Payable)}
    assert set(payables) == {"Gráfica Ponto Certo", "Copa Ltda"}
    paid = payables["Gráfica Ponto Certo"]
    assert paid.origin == "relatorio"
    assert paid.amount == Decimal("1200.00")
    assert paid.unit_id == units["Matriz"].id
    assert paid.category_id == categories["Aluguel"].id
    assert paid.allocations == []
    [payment] = paid.payments
    assert payment.amount == Decimal("1200.00")
    assert (payment.bank_account_id, payment.payment_method_id) == (account.id, method.id)
    assert payables["Copa Ltda"].payments == []
    assert payables["Copa Ltda"].documentNumber == "NF 9"


def test_running_again_creates_nothing(db_session: Session, user: User, report: bytes) -> None:
    importar(db_session, EMAIL, "relatorio.xls", report, write=True)
    before = _counts(db_session)

    preview = importar(db_session, EMAIL, "relatorio.xls", report, write=False)
    assert "Todos os cadastros que o relatório usa já existem." in preview
    assert "2 já importadas antes" in preview
    with pytest.raises(PayableInvalid, match="já foram importadas antes"):
        importar(db_session, EMAIL, "relatorio.xls", report, write=True)
    assert _counts(db_session) == before


def test_needs_an_active_finance_account(db_session: Session, report: bytes) -> None:
    with pytest.raises(PayableInvalid, match="Não achei uma conta ativa"):
        importar(db_session, "ninguem@pesquisemais.com.br", "relatorio.xls", report, write=False)
