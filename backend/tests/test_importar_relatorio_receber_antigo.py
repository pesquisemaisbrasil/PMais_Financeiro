"""O script que popula o Contas a receber com o relatório "Lançamentos a Receber" do sistema antigo
(scripts/importar_relatorio_receber_antigo.py): os cadastros que já existem, a baixa das linhas
recebidas, o documento pelo começo do texto e nada repetido ao rodar de novo."""

from collections.abc import Callable
from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.orm import Session

from models.receivable import Receivable, ReceivablePayment
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    PaymentMethod,
    Project,
)
from models.user import User
from scripts.importar_relatorio_receber_antigo import METHOD, importar
from services.payable import PayableInvalid, today

EMAIL = "ana@pesquisemais.com.br"
HEADER = (
    "Programação|Pagamento|Cliente|Plano de Contas|R$ Líquido|R$ Pago|R$ Pendente|Projeto|"
    "Unidade|CCusto|Empresa|Conta|Situação|Descrição|Documento"
).split("|")


def _report(*lines: list[str]) -> bytes:
    """O sheet001.htm que o Excel grava do relatório a receber, com as linhas TOTAL no fim."""
    rows = "".join(
        "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in (HEADER, *lines)
    )
    return f"<html><body><table>{rows}</table></body></html>".encode()


@pytest.fixture
def user(make_user: Callable[..., User]) -> User:
    return make_user(email=EMAIL)


@pytest.fixture
def registers(db_session: Session) -> dict[str, Any]:
    company = Company(name="Pesquise Mais", nickname="Pesquise+")
    db_session.add(company)
    db_session.flush()
    unit = BusinessUnit(company_id=company.id, name="Consumo")
    center = CostCenter(name="Consumo Clt", code="001")
    income = ExpenseCategory(code="010.001", name="Vendas - Clt", kind="receita")
    customer = Customer(nickname="P&G", name="Procter Teste Ltda")
    db_session.add_all([unit, center, income, customer])
    db_session.flush()
    project = Project(code="1762", title="1762_P&G_Teste", company_id=company.id, unit_id=unit.id)
    db_session.add(project)
    db_session.commit()
    return {"company": company, "unit": unit, "customer": customer, "project": project}


@pytest.fixture
def report() -> bytes:
    day = (today() - timedelta(days=2)).strftime("%d/%m/%Y")
    base = ["Procter Teste Ltda", "Vendas - Clt"]
    place = ["1762_P&G_Teste", "Consumo", "Consumo Clt", "Pesquise+"]
    received = [day, day, *base, "1.000,00", "1.000,00", "0", *place, "Banco Itaú", "PAGO"]
    received += ["PO 123", "NF 1482"]
    pending = [day, "", *base, "500,00", "", "500,00", *place, "", "PENDENTE", "Parcela"]
    pending += ["FATURA 392"]
    unknown = [day, "", "Cliente Fantasma", "Vendas - Clt", "10,00", "", "10,00", "", "Consumo"]
    unknown += ["Consumo Clt", "Pesquise+", "", "PENDENTE", "", ""]
    total = ["TOTAL", "GERAL", "", "", "1.510,00", "1.000,00", "510,00", "", "", "", "", "", ""]
    return _report(received, pending, unknown, total + ["", ""])


def test_without_gravar_nothing_is_written(
    db_session: Session, user: User, registers: dict[str, Any], report: bytes
) -> None:
    text = importar(db_session, EMAIL, "receber.htm", report, write=False)

    assert "Títulos: 2 entram (1 recebidos, com a baixa)" in text
    assert "Total R$ 1.500,00, recebido R$ 1.000,00, a receber R$ 500,00" in text
    assert "linha 4: Cliente Cliente Fantasma não existe: importe os cadastros antes" in text
    assert text.endswith("Nada foi gravado. Para gravar, rode de novo com --gravar.")
    assert db_session.query(Receivable).count() == 0
    assert db_session.query(BankAccount).count() == 0


def test_gravar_creates_the_receivables_with_the_receipt_and_never_repeats(
    db_session: Session, user: User, registers: dict[str, Any], report: bytes
) -> None:
    importar(db_session, EMAIL, "receber.htm", report, write=True)

    titles = {r.documentNumber: r for r in db_session.query(Receivable)}
    assert set(titles) == {"1482", "392"}
    nf, invoice = titles["1482"], titles["392"]
    # o documento pelo começo do texto; a NF fica com a data da programação (o relatório não traz)
    assert (nf.documentType, nf.documentDate) == ("NF", nf.issueDate)
    assert (invoice.documentType, invoice.documentDate) == ("Fatura", None)
    assert (nf.customer_id, nf.project_id) == (registers["customer"].id, registers["project"].id)
    assert (nf.amount, nf.unit_id) == (Decimal("1000.00"), registers["unit"].id)
    [receipt] = db_session.query(ReceivablePayment).all()
    assert (receipt.receivable_id, receipt.amount) == (nf.id, Decimal("1000.00"))
    account = db_session.get(BankAccount, receipt.bank_account_id)
    assert account is not None and account.name == "Banco Itaú"
    method = db_session.get(PaymentMethod, receipt.payment_method_id)
    assert method is not None and method.name == METHOD
    assert invoice.payments == []

    again = importar(db_session, EMAIL, "receber.htm", report, write=True)
    assert "Títulos: 0 entram (0 recebidos, com a baixa) · 0 cancelados · 2 já importados" in again
    assert db_session.query(Receivable).count() == 2
    assert db_session.query(BankAccount).count() == 1


def test_needs_an_active_finance_account(db_session: Session, report: bytes) -> None:
    with pytest.raises(PayableInvalid, match="Não achei uma conta ativa"):
        importar(db_session, "ninguem@pesquisemais.com.br", "receber.htm", report, write=False)
