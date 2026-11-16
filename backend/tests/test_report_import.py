"""Importar o relatório "Lançamentos a Pagar" do sistema antigo (SGE4B): uma conta por linha, a
baixa das pagas, nada repetido ao reenviar e o que fazer com o que não existe nos cadastros."""

import io
from collections.abc import Callable
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy.orm import Session

from models.payable import Payable, PayableEvent
from models.period_closing import PeriodClosing
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
    Project,
    Supplier,
)
from models.user import User
from services.auth import create_access_token
from services.payable import pending_amount, today

PREVIEW = "/payables/import-report/preview"
CONFIRM = "/payables/import-report"

# O cabeçalho do relatório, na linha 4: o título e duas linhas em branco vêm antes.
HEADER = [
    "Programação",
    "Pagamento",
    "Fornecedor",
    "Plano de Contas",
    "R$ Líquido",
    "R$ Pago",
    "R$ Pendente",
    "Projeto",
    "Unidade",
    "CCusto",
    "Empresa",
    "Conta",
    "Situação",
    "Descrição",
    "Documento",
]
ORDER = (
    "scheduled",
    "paid_on",
    "supplier",
    "category",
    "net",
    "paid",
    "pending",
    "project",
    "unit",
    "center",
    "company",
    "account",
    "situation",
    "description",
    "document",
)


@pytest.fixture
def user(make_user: Callable[..., User]) -> User:
    return make_user()


@pytest.fixture
def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
def legacy(db_session: Session) -> dict[str, Any]:
    company = Company(name="PPlus Pesquisas Ltda", nickname="Pesquisa+")
    other_company = Company(name="MC")
    db_session.add_all([company, other_company])
    db_session.flush()
    matriz = BusinessUnit(company_id=company.id, name="Matriz")
    other = {
        "unit": BusinessUnit(company_id=other_company.id, name="Filial MC"),
        "account": BankAccount(
            company_id=other_company.id, name="Bradesco · MC", bankName="Bradesco"
        ),
        "category": ExpenseCategory(code="1.01", name="Receita de pesquisa", kind="receita"),
    }
    account = BankAccount(company_id=company.id, name="Itaú · PPlus", bankName="Itaú")
    rent = ExpenseCategory(code="2.01", name="Aluguel")
    material = ExpenseCategory(code="2.10", name="Material de Apoio Projeto")
    center = CostCenter(name="Adm_Geral")
    other_center = CostCenter(name="Adm_Centro")
    method = PaymentMethod(name="Pix")
    supplier = Supplier(nickname="Ponto Certo", name="Gráfica Ponto Certo")
    project = Project(code="1804", title="Pesquisa de satisfação")
    closed = Project(code="1700", title="Projeto antigo", status="encerrado")
    db_session.add_all(
        [matriz, *other.values(), account, rent, material, center, other_center]
        + [method, supplier, project, closed]
    )
    db_session.commit()
    return {
        "company": company,
        "other_company": other_company,
        "unit": matriz,
        "account": account,
        "rent": rent,
        "material": material,
        "center": center,
        "other_center": other_center,
        "method": method,
        "supplier": supplier,
        "project": project,
        "closed_project": closed,
        **{f"other_{key}": value for key, value in other.items()},
    }


def _xlsx(rows: list[list[Any]]) -> bytes:
    book = Workbook()
    for row in rows:
        book.active.append(row)
    output = io.BytesIO()
    book.save(output)
    return output.getvalue()


def entry(**overrides: Any) -> list[Any]:
    """Uma linha a pagar, como o relatório traz (valor como número e data como data da planilha)."""
    base: dict[str, Any] = {
        "scheduled": date(2026, 11, 18),
        "paid_on": None,
        "supplier": "Ponto Certo",
        "category": "Aluguel",
        "net": 657.8,
        "paid": None,
        "pending": 657.8,
        "project": "Adm_Central",
        "unit": "Matriz",
        "center": "Adm_Geral",
        "company": "Pesquisa+",
        "account": None,
        "situation": "PENDENTE",
        "description": "Teste",
        "document": None,
    }
    base.update(overrides)
    return [base[key] for key in ORDER]


def paid(**overrides: Any) -> list[Any]:
    """Uma linha já paga: Pagamento, R$ Pago, Conta e Situação PAGO."""
    values: dict[str, Any] = {
        "scheduled": date(2026, 11, 3),
        "paid_on": date(2026, 11, 3),
        "net": 500,
        "paid": 500,
        "pending": 0,
        "account": "Banco Itaú",
        "situation": "PAGO",
    }
    values.update(overrides)
    return entry(**values)


def report(*lines: list[Any]) -> bytes:
    return _xlsx([["Lançamentos a Pagar"], [], [], HEADER, *lines])


def post(
    client: TestClient,
    auth: dict[str, str],
    path: str,
    content: bytes,
    legacy: dict[str, Any] | None = None,
    name: str = "relatorio.xlsx",
    **fields: Any,
) -> Any:
    data: dict[str, Any] = {}
    if legacy is not None:
        data["paymentMethodId"] = legacy["method"].id
    data.update(
        {
            key: str(value).lower() if isinstance(value, bool) else value
            for key, value in fields.items()
        }
    )
    return client.post(path, data=data, files={"file": (name, content)}, headers=auth)


def read(
    client: TestClient, auth: dict[str, str], content: bytes, legacy: dict[str, Any], **fields: Any
) -> Any:
    response = post(client, auth, PREVIEW, content, legacy, **fields)
    assert response.status_code == 200, response.text
    return response.json()


def enter(
    client: TestClient, auth: dict[str, str], content: bytes, legacy: dict[str, Any], **fields: Any
) -> Any:
    return post(client, auth, CONFIRM, content, legacy, **fields)


# ---- O caminho principal ----


def test_each_line_becomes_one_account_and_the_paid_one_gets_its_payment(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    content = report(entry(), paid())
    preview = read(client, auth, content, legacy)
    assert db_session.query(Payable).count() == 0  # conferir não grava nada
    assert (preview["goodCount"], preview["paidCount"], preview["pendingCount"]) == (2, 1, 1)
    assert (preview["errorCount"], preview["alreadyCount"], preview["cancelledCount"]) == (0, 0, 0)
    assert [Decimal(preview[key]) for key in ("total", "paidTotal", "pendingTotal")] == [
        Decimal("1157.80"),
        Decimal("500.00"),
        Decimal("657.80"),
    ]
    first = preview["lines"][0]
    assert first["line"] == 5  # o cabeçalho está na linha 4
    assert first["classification"] == "PPlus Pesquisas Ltda · Matriz · Adm_Geral · 2.01 Aluguel"
    assert (
        preview["lines"][1]["willPay"] is True and preview["lines"][1]["account"] == "Itaú · PPlus"
    )
    assert "Programação" in preview["columns"] and "Documento" in preview["columns"]

    response = enter(client, auth, content, legacy)
    assert response.status_code == 201, response.text
    assert response.json() == {
        "count": 2,
        "paidCount": 1,
        "total": "1157.80",
        "paidTotal": "500.00",
        "pendingTotal": "657.80",
    }
    pending, settled = db_session.query(Payable).order_by(Payable.id).all()
    assert (pending.origin, pending.type) == ("relatorio", "real")
    assert pending.supplier_id == legacy["supplier"].id and pending.payeeName is None
    assert (pending.company_id, pending.unit_id) == (legacy["company"].id, legacy["unit"].id)
    assert pending.issueDate == pending.dueDate == date(2026, 11, 18)
    assert pending.competence == "2026-11" and pending.amount == Decimal("657.80")
    assert pending.description == "Teste" and not pending.payments and not pending.allocations
    assert pending.docsReceivedOn is None and pending.importKey and pending.importHash

    (payment,) = settled.payments
    assert (payment.paidOn, payment.amount) == (date(2026, 11, 3), Decimal("500.00"))
    assert payment.bank_account_id == legacy["account"].id
    assert payment.payment_method_id == legacy["method"].id
    assert payment.note == "Importada do relatório do sistema antigo"
    assert pending_amount(settled) == 0
    texts = [e.text for e in db_session.query(PayableEvent).filter_by(payable_id=settled.id)]
    assert any("relatorio.xlsx, linha 6" in text and "paga em 03/11/2026" in text for text in texts)

    # Na lista: situação paga, origem do relatório e a aba só delas
    assert client.get(f"/payables/{settled.id}", headers=auth).json()["situation"] == "pago"
    listing = client.get("/payables?mode=tudo&tab=relatorio", headers=auth).json()
    assert listing["total"] == 2 and listing["tabs"]["relatorio"] == 2
    assert {row["origin"] for row in listing["items"]} == {"relatorio"}


def test_the_csv_of_the_report_works_with_semicolons_and_text_values(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    header = ";".join(HEADER)
    text = (
        "Lançamentos a Pagar;;;;\n;;;;\n\n"
        f"{header}\n"
        "18/11/2026;;Ponto Certo;Aluguel;657,8;;657,8;Adm_Central;Matriz;Adm_Geral;"
        "Pesquisa+;;PENDENTE;Teste;\n"
        "03/11/2026;03/11/2026;Ponto Certo;Aluguel;1.234,56;1.234,56;0,00;;Matriz;Adm_Geral;"
        "Pesquisa+;Itaú;PAGO;Pago;\n"
    )
    response = post(client, auth, PREVIEW, text.encode("utf-8"), legacy, name="relatorio.csv")
    assert response.status_code == 200, response.text
    preview = response.json()
    assert (preview["goodCount"], preview["paidCount"], preview["errorCount"]) == (2, 1, 0)
    assert preview["lines"][0]["net"] == "657.80" and preview["lines"][1]["paid"] == "1234.56"


def test_blank_and_total_rows_are_ignored(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    total = [None, None, None, None, 1157.8, 500, 657.8]
    preview = read(client, auth, report(entry(), [], total), legacy)
    assert len(preview["lines"]) == 1 and preview["goodCount"] == 1


# ---- Repetir é seguro ----


def test_sending_the_report_again_creates_nothing_and_equal_lines_are_separate_accounts(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    twin = paid(description="Dois iguais")  # as linhas 6 e 7 do relatório de exemplo se repetem
    content = report(entry(), twin, twin)
    assert enter(client, auth, content, legacy).json()["count"] == 3
    assert db_session.query(Payable).count() == 3

    again = enter(client, auth, content, legacy)
    assert again.status_code == 422
    assert again.json()["detail"] == "Todas as linhas deste relatório já foram importadas antes"
    seen = read(client, auth, content, legacy)
    assert (seen["goodCount"], seen["alreadyCount"]) == (0, 3)
    assert {line["skipped"] for line in seen["lines"]} == {"Já importada antes"}

    # Um relatório mais novo: as mesmas linhas (uma delas agora paga) e uma nova
    now_paid = entry(
        paid_on=date(2026, 11, 10), paid=657.8, pending=0, account="Banco Itaú", situation="PAGO"
    )
    newer = report(now_paid, twin, twin, entry(net=100, pending=100, description="Nova"))
    result = enter(client, auth, newer, legacy)
    assert result.status_code == 201 and result.json()["count"] == 1
    assert db_session.query(Payable).count() == 4
    # a conta já importada não é atualizada: a baixa dela se dá na própria conta
    first = db_session.query(Payable).order_by(Payable.id).first()
    assert first is not None and not first.payments


def test_a_corrected_line_is_not_confused_with_an_old_one(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    enter(client, auth, report(entry(net=100, pending=100)), legacy)
    result = enter(client, auth, report(entry(net=100.5, pending=100.5)), legacy)  # outro valor
    assert result.json()["count"] == 1
    assert db_session.query(Payable).count() == 2


# ---- O que não existe nos cadastros ----


def test_a_supplier_that_is_not_registered_enters_with_the_name_only_and_no_project(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    content = report(entry(supplier="Fornecedor Novo"))
    preview = read(client, auth, content, legacy)
    assert (preview["goodCount"], preview["supplierOnlyNameCount"], preview["noProjectCount"]) == (
        1,
        1,
        1,
    )
    notes = preview["lines"][0]["notes"]
    assert "Fornecedor Fornecedor Novo não está nos cadastros: entra só com o nome" in notes
    assert "Projeto Adm_Central não existe: a conta entra sem projeto" in notes

    assert enter(client, auth, content, legacy).status_code == 201
    payable = db_session.query(Payable).one()
    assert payable.supplier_id is None and payable.payeeName == "Fornecedor Novo"
    assert not payable.allocations
    row = client.get("/payables?mode=tudo", headers=auth).json()["items"][0]
    assert row["payee"] == "Fornecedor Novo"


@pytest.mark.parametrize("typed", ["1804", "PRJ-1804", "Pesquisa de satisfação"])
def test_the_project_is_found_by_code_or_title(
    client: TestClient,
    auth: dict[str, str],
    legacy: dict[str, Any],
    db_session: Session,
    typed: str,
) -> None:
    assert enter(client, auth, report(entry(project=typed)), legacy).status_code == 201
    (allocation,) = db_session.query(Payable).one().allocations
    assert (allocation.project_id, allocation.amount) == (legacy["project"].id, Decimal("657.80"))


def test_a_closed_project_is_left_out_of_the_account_and_the_default_project_fills_the_rest(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    closed = report(entry(project="1700"))
    preview = read(client, auth, closed, legacy)
    assert "Projeto 1700 está fechado: a conta entra sem projeto" in preview["lines"][0]["notes"]
    with_default = read(
        client, auth, report(entry(project="Adm_Central")), legacy, projectId=legacy["project"].id
    )
    assert (
        with_default["lines"][0]["project"] == "PRJ-1804" and with_default["usedDefaultCount"] == 1
    )
    refused = post(client, auth, PREVIEW, closed, legacy, projectId=legacy["closed_project"].id)
    assert refused.status_code == 409


def test_unknown_plan_cost_center_and_unit_use_the_default_marked_on_screen_or_leave_the_line_out(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    content = report(entry(category="Plano que não existe", unit="Unidade X", center="Centro X"))
    bare = read(client, auth, content, legacy)
    assert (bare["goodCount"], bare["errorCount"]) == (0, 1)
    errors = bare["lines"][0]["errors"]
    assert (
        "Plano de contas Plano que não existe não existe. Cadastre ou marque um padrão na tela"
        in errors
    )
    assert "Centro de custo Centro X não existe. Cadastre ou marque um padrão na tela" in errors
    assert "Unidade Unidade X não existe. Cadastre ou marque um padrão na tela" in errors
    refused = enter(client, auth, content, legacy)
    assert refused.status_code == 422
    assert (
        refused.json()["detail"]
        == "Nenhuma linha do relatório pode entrar. Corrija e envie de novo"
    )

    defaults = {
        "categoryId": legacy["material"].id,
        "costCenterId": legacy["other_center"].id,
        "unitId": legacy["unit"].id,
    }
    filled = read(client, auth, content, legacy, **defaults)
    assert (filled["goodCount"], filled["errorCount"], filled["usedDefaultCount"]) == (1, 0, 1)
    assert len(filled["lines"][0]["notes"]) >= 3
    assert enter(client, auth, content, legacy, **defaults).status_code == 201
    payable = db_session.query(Payable).one()
    assert payable.category_id == legacy["material"].id
    assert payable.cost_center_id == legacy["other_center"].id
    # a empresa vem da unidade escolhida
    assert (payable.unit_id, payable.company_id) == (legacy["unit"].id, legacy["company"].id)


def test_a_category_that_is_revenue_is_not_found_for_a_payable(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    preview = read(client, auth, report(entry(category="Receita de pesquisa")), legacy)
    assert preview["goodCount"] == 0
    assert "Plano de contas Receita de pesquisa não existe" in preview["lines"][0]["errors"][0]
    revenue = post(
        client, auth, PREVIEW, report(entry()), legacy, categoryId=legacy["other_category"].id
    )
    assert revenue.status_code == 422
    assert revenue.json()["detail"] == "Contas a pagar usam conta de despesa"


def test_the_category_is_found_by_code_name_or_both(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    lines = [
        entry(category=typed, description=typed) for typed in ("2.01", "aluguel", "2.01 Aluguel")
    ]
    preview = read(client, auth, report(*lines), legacy)
    assert (preview["goodCount"], preview["errorCount"]) == (3, 0)


def test_the_company_comes_from_the_unit_and_the_company_column_only_breaks_a_tie(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    same_name = BusinessUnit(company_id=legacy["other_company"].id, name="Matriz")
    db_session.add(same_name)
    db_session.commit()
    mc = entry(company="MC", description="Da MC", account=None)
    plain = entry(company=None, description="Sem empresa")
    unregistered = entry(company="Empresa que não existe", unit="Filial MC", description="Outra")
    preview = read(client, auth, report(entry(), mc, plain, unregistered), legacy)
    lines = preview["lines"]
    assert lines[0]["classification"].startswith("PPlus Pesquisas Ltda · Matriz")
    assert lines[1]["classification"].startswith("MC · Matriz")
    assert lines[2]["errors"] == [
        "Unidade Matriz existe em mais de uma empresa: o relatório precisa trazer a empresa"
    ]
    # empresa que não existe não atrapalha: a da unidade vale
    assert lines[3]["classification"].startswith("MC · Filial MC")
    wrong_default = read(
        client, auth, report(entry(unit="Unidade X")), legacy, unitId=legacy["other_unit"].id
    )
    assert wrong_default["lines"][0]["errors"] == [
        "A unidade padrão Filial MC não é da empresa PPlus Pesquisas Ltda"
    ]


# ---- A baixa das linhas pagas ----


def test_the_bank_account_is_found_by_the_account_or_the_bank_name(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    lines = [
        paid(account=typed, description=typed) for typed in ("Banco Itaú", "Itaú", "Itaú · PPlus")
    ]
    preview = read(client, auth, report(*lines), legacy)
    assert (preview["goodCount"], preview["errorCount"]) == (3, 0)
    assert {line["account"] for line in preview["lines"]} == {"Itaú · PPlus"}


def test_the_bank_account_is_found_when_the_text_is_inside_the_account_name(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    # conta cadastrada só com o nome (sem o campo banco): "Banco Itaú" acha "Itaú Empresas"
    legacy["account"].bankName = None
    legacy["account"].name = "Itaú Empresas"
    db_session.commit()
    preview = read(client, auth, report(paid(account="Banco Itaú")), legacy)
    assert (preview["goodCount"], preview["errorCount"]) == (1, 0)
    assert preview["lines"][0]["account"] == "Itaú Empresas"


def test_a_paid_line_without_a_known_account_uses_the_default_or_is_left_out(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    unknown = report(paid(account="Banco Inexistente"))
    bare = read(client, auth, unknown, legacy)
    assert bare["lines"][0]["errors"] == [
        "Conta bancária Banco Inexistente não existe na empresa PPlus Pesquisas Ltda"
    ]
    blank = read(client, auth, report(paid(account=None)), legacy)
    assert blank["lines"][0]["errors"] == [
        "Linha paga sem conta bancária e nenhuma conta padrão marcada na tela"
    ]
    other_company = read(client, auth, unknown, legacy, bankAccountId=legacy["other_account"].id)
    assert other_company["lines"][0]["errors"] == [
        "A conta padrão Bradesco · MC não é da empresa PPlus Pesquisas Ltda"
    ]
    fixed = read(client, auth, unknown, legacy, bankAccountId=legacy["account"].id)
    assert fixed["goodCount"] == 1 and fixed["usedDefaultCount"] == 1
    assert "Conta Banco Inexistente não existe: usada Itaú · PPlus" in fixed["lines"][0]["notes"]
    assert (
        enter(client, auth, unknown, legacy, bankAccountId=legacy["account"].id).status_code == 201
    )
    (payment,) = db_session.query(Payable).one().payments
    assert payment.bank_account_id == legacy["account"].id


def test_without_registering_payments_everything_enters_as_pending(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    content = report(paid(account="Banco Inexistente"))  # sem baixa, a conta nem é conferida
    preview = read(client, auth, content, legacy, registerPayments=False)
    assert (preview["goodCount"], preview["paidCount"], preview["pendingCount"]) == (1, 0, 1)
    assert Decimal(preview["paidTotal"]) == 0 and Decimal(preview["pendingTotal"]) == Decimal(
        "500.00"
    )
    assert enter(client, auth, content, legacy, registerPayments=False).status_code == 201
    payable = db_session.query(Payable).one()
    assert not payable.payments and pending_amount(payable) == Decimal("500.00")


def test_a_partial_payment_leaves_the_rest_pending(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    # vence daqui a 30 dias: com 400 pagos de 1.000, a situação é "parcial" (e não "vencida")
    partial = paid(
        scheduled=today() + timedelta(days=30),
        net=1000,
        paid=400,
        pending=600,
        situation="PENDENTE",
    )
    assert enter(client, auth, report(partial), legacy).status_code == 201
    payable = db_session.query(Payable).one()
    assert pending_amount(payable) == Decimal("600.00")
    assert client.get(f"/payables/{payable.id}", headers=auth).json()["situation"] == "parcial"


# ---- O que fica de fora ----


@pytest.mark.parametrize(
    ("line", "message"),
    [
        (paid(net=500, paid=600), "R$ Pago é maior que o R$ Líquido"),
        (entry(situation="PAGO"), "A Situação diz PAGO, mas R$ Pago está vazio"),
        (paid(paid_on=None), "Linha paga sem data de Pagamento"),
        (
            paid(paid_on=today() + timedelta(days=1)),
            "A data de Pagamento não pode ser no futuro",
        ),
        (paid(paid_on="not-a-date"), "Data de Pagamento inválida"),
        (entry(scheduled="abc"), "Programação inválida ou vazia"),
        (entry(scheduled=None), "Programação inválida ou vazia"),
        (entry(net="abc"), "R$ Líquido inválido"),
        (entry(net=0, pending=0), "R$ Líquido inválido"),
        (paid(paid="abc"), "R$ Pago inválido"),
        (entry(supplier=""), "Sem fornecedor"),
    ],
)
def test_a_line_that_does_not_close_is_left_out_with_the_reason(
    client: TestClient,
    auth: dict[str, str],
    legacy: dict[str, Any],
    db_session: Session,
    line: list[Any],
    message: str,
) -> None:
    good = entry(description="Boa")
    preview = read(client, auth, report(good, line), legacy)
    assert (preview["goodCount"], preview["errorCount"]) == (1, 1)
    assert message in preview["lines"][1]["errors"]
    assert enter(client, auth, report(good, line), legacy).json()["count"] == 1
    assert db_session.query(Payable).count() == 1  # a linha com erro nunca entra


CPF = "529.982.247-25"  # CPF de teste, válido pela conta dos dígitos (não é de ninguém)


def test_a_cpf_in_the_text_is_taken_out_and_the_line_still_enters(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    # O sistema antigo põe a chave Pix na descrição ("PIX CPF ..."); o CPF nunca é guardado
    pix = entry(description=f"Aluguel PIX CPF {CPF} ref. novembro", document="52998224725")
    content = report(pix)
    preview = read(client, auth, content, legacy)
    assert (preview["goodCount"], preview["errorCount"]) == (1, 0)
    line = preview["lines"][0]
    assert line["description"] == "Aluguel PIX CPF (CPF retirado) ref. novembro"
    assert line["notes"][:2] == [
        "CPF retirado da coluna Descrição: o sistema não guarda CPF",
        "CPF retirado da coluna Documento: o sistema não guarda CPF",
    ]
    assert CPF not in str(preview) and "52998224725" not in str(preview)

    assert enter(client, auth, content, legacy).status_code == 201
    payable = db_session.query(Payable).one()
    assert payable.description == "Aluguel PIX CPF (CPF retirado) ref. novembro"
    assert payable.documentNumber == "(CPF retirado)"
    stored = " ".join(
        [payable.description, payable.documentNumber or ""]
        + [event.text for event in db_session.query(PayableEvent)]
    )
    assert "52998224725" not in stored and CPF not in stored

    # Reenviar o mesmo arquivo continua sendo seguro: a chave da linha não leva o CPF
    again = read(client, auth, content, legacy)
    assert (again["goodCount"], again["alreadyCount"]) == (0, 1)


def test_a_number_that_only_looks_like_a_cpf_stays_as_it_is(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    # 11 dígitos que não fecham a conta do CPF (telefone, nota, protocolo) não são mexidos
    preview = read(client, auth, report(entry(description="Pedido 12345678900")), legacy)
    assert preview["lines"][0]["description"] == "Pedido 12345678900"
    assert preview["lines"][0]["notes"] == [
        "Projeto Adm_Central não existe: a conta entra sem projeto"
    ]


def test_a_cancelled_line_is_left_out_without_being_an_error(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    preview = read(client, auth, report(entry(), entry(situation="CANCELADO", net="x")), legacy)
    assert (preview["goodCount"], preview["errorCount"], preview["cancelledCount"]) == (1, 0, 1)
    assert preview["lines"][1]["skipped"] == "Cancelada no relatório"


def test_a_closed_month_of_the_company_refuses_the_line(
    client: TestClient,
    auth: dict[str, str],
    legacy: dict[str, Any],
    db_session: Session,
    user: User,
) -> None:
    db_session.add(
        PeriodClosing(company_id=legacy["company"].id, month="2026-11", closed_by_id=user.id)
    )
    db_session.commit()
    october = paid(scheduled=date(2026, 10, 20), paid_on=date(2026, 10, 25))
    preview = read(client, auth, report(entry(), october, paid(paid_on=date(2026, 11, 5))), legacy)
    assert preview["goodCount"] == 1  # só a de outubro, que tem o pagamento de outubro
    assert preview["lines"][0]["errors"] == ["O período de novembro/2026 está fechado"]
    assert preview["lines"][2]["errors"] == ["O período de novembro/2026 está fechado"]
    assert enter(client, auth, report(entry(), october), legacy).json()["count"] == 1


# ---- O arquivo ----


def test_a_file_without_the_header_is_refused(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    response = post(client, auth, PREVIEW, _xlsx([["Nome", "Valor"], ["Ana", 10]]), legacy)
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Não achei o cabeçalho do relatório: ele precisa das colunas "
        "Programação, Fornecedor e R$ Líquido"
    )


def test_the_payment_method_is_needed_when_the_report_has_no_column_for_it(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    response = post(client, auth, PREVIEW, report(entry()))
    assert response.status_code == 422
    assert (
        response.json()["detail"] == "O relatório não traz a forma de pagamento. Marque uma na tela"
    )


def test_the_payment_method_can_come_from_a_column_of_the_report(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    rows = [HEADER + ["Forma Pagto"], [*entry(), "Pix"], [*entry(description="Outra"), "Boleto"]]
    response = post(client, auth, PREVIEW, _xlsx(rows))
    preview = response.json()
    assert response.status_code == 200
    assert (preview["goodCount"], preview["errorCount"]) == (1, 1)
    assert "Forma de pagamento Boleto não existe" in preview["lines"][1]["errors"][0]


def test_a_file_that_is_not_a_spreadsheet_is_refused(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    refused = post(client, auth, PREVIEW, b"%PDF-1.4", legacy, name="relatorio.pdf")
    assert refused.status_code == 422
    assert refused.json()["detail"] == "Envie o relatório em .xls, .xlsx ou .csv"
    broken = post(client, auth, PREVIEW, b"isto nao e um xlsx", legacy)
    assert broken.status_code == 422
    not_html = post(client, auth, PREVIEW, b"isto nao e um xls", legacy, name="relatorio.xls")
    assert not_html.status_code == 422
    assert not_html.json()["detail"] == (
        "Não foi possível ler a planilha. Confira se o arquivo está inteiro"
    )


def pt(value: Any) -> str:
    """A célula como o relatório do sistema antigo a escreve: texto, 1.234,56 e 18/11/2026."""
    if value is None:
        return ""
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, int | float):
        return f"{value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return str(value)


def html_report(*lines: list[Any]) -> bytes:
    """O relatório como o sistema antigo exporta: uma tabela HTML com a extensão .xls (o Excel
    abre), em UTF-8 com BOM e o cabeçalho na primeira linha. As células levam HTML puro."""

    def row(tag: str, values: list[Any]) -> str:
        return "<tr>" + "".join(f"<{tag}>{pt(value)}</{tag}>" for value in values) + "</tr>"

    table = row("th", HEADER) + "".join(row("td", line) for line in lines)
    return f"﻿<html><body><table border=1>{table}</table></body></html>".encode()


def test_the_html_that_the_old_system_saves_as_xls_is_read(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    name = "DADOSAPAGAR_20261116_111257.xls"
    pending = entry(
        supplier="Ponto &amp; Cia",
        net=1234.56,
        pending=1234.56,
        description="Aluguel de<br>novembro<br/>  (sala 2)",
    )
    content = html_report(pending, paid(document="NF 77"))
    preview = read(client, auth, content, legacy, name=name)
    assert (preview["goodCount"], preview["paidCount"], preview["errorCount"]) == (2, 1, 0)
    first, second = preview["lines"]
    assert first["line"] == 2  # o cabeçalho é a primeira linha da tabela
    assert first["supplier"] == "Ponto & Cia" and first["net"] == "1234.56"
    assert first["description"] == "Aluguel de novembro (sala 2)"
    assert second["willPay"] is True and second["account"] == "Itaú · PPlus"

    assert enter(client, auth, content, legacy, name=name).status_code == 201
    assert db_session.query(Payable).count() == 2
    payable = db_session.query(Payable).filter_by(documentNumber="NF 77").one()
    assert payable.supplier_id == legacy["supplier"].id and len(payable.payments) == 1


def test_the_old_binary_xls_is_refused_with_a_clear_message(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    old = bytes.fromhex("d0cf11e0a1b11ae1") + b"\x00" * 64
    response = post(client, auth, PREVIEW, old, legacy, name="relatorio.xls")
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Este .xls é do formato antigo do Excel, que o sistema não lê. "
        "Abra o arquivo no Excel e salve como .xlsx ou .csv"
    )


def test_the_boleto_line_leaves_the_description_and_goes_to_its_own_field(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any], db_session: Session
) -> None:
    bank = "34191.79001 01043.510047 91020.150008 1 98760000012345"
    # a concessionária: o primeiro bloco, sozinho, fecha a conta do CPF, e mesmo assim fica inteiro
    utility = "52998224725-1 11111111111-1 22222222222-2 33333333333-3"
    raw = "848" + "0" * 45  # 48 dígitos seguidos
    lines = [
        entry(description=f"Locação {bank} ref. 11/2026", document="A"),
        entry(description=f"Luz  {utility}", document="B"),
        entry(description=f"Água {raw}", document="C"),
    ]
    content = report(*lines)
    preview = read(client, auth, content, legacy)
    assert (preview["goodCount"], preview["errorCount"]) == (3, 0)
    assert [line["description"] for line in preview["lines"]] == [
        "Locação ref. 11/2026",
        "Luz",
        "Água",
    ]
    assert all("CPF retirado" not in " ".join(line["notes"]) for line in preview["lines"])
    assert enter(client, auth, content, legacy).status_code == 201
    stored = {p.documentNumber: p.barcode for p in db_session.query(Payable)}
    assert stored == {"A": bank, "B": utility, "C": raw}


def test_defaults_that_do_not_exist_are_refused(
    client: TestClient, auth: dict[str, str], legacy: dict[str, Any]
) -> None:
    for field in ("categoryId", "unitId", "costCenterId", "bankAccountId"):
        fields: dict[str, Any] = {field: 999999}
        response = post(client, auth, PREVIEW, report(entry()), legacy, **fields)
        assert response.status_code == 422, field
