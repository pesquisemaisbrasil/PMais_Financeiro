"""O script que popula os cadastros com o .csv do sistema antigo (scripts/importar_cadastros.py):
a mesma regra da tela de Cadastros, prévia sem gravar, CPF nunca guardado, nada repetido e o
cadastro igual ao .csv (o código antigo à parte do gerado, 24/11)."""

from collections.abc import Callable
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    ExpenseCategoryGroup,
    Project,
    RecordEvent,
    Supplier,
)
from models.user import User
from scripts.importar_cadastros import importar
from services.payable import PayableInvalid

EMAIL = "ana@pesquisemais.com.br"
# Como o sistema antigo exporta: UTF-16 sem BOM, separado por ponto e vírgula, tudo entre aspas.
COMPANIES = (
    '"Codigo";"Nome";"Apelido";"TipoPessoa";"CNPJ";"IE";"Fax"\r\n'
    '"2";"Beta Ltda";"Beta";"PJ";"00.000.000/0000-00";"";""\r\n'
    '"1";"Alfa Pesquisas";"Alfa+";"PJ";"11.222.333/0001-81";"123456789";""\r\n'
    '"3";"Gama";"";"PF";"529.982.247-25";"";""\r\n'
    '"4";"Delta";"";"PJ";"11.111.111/1111-11";"";""\r\n'
).encode("utf-16-le")
UNITS = (
    '"Empresa";"Codigo";"Nome";"Apelido";"CNPJ";"IE"\r\n'
    '"Alfa+";"001";"Matriz";"001";"0";""\r\n'
    '"Beta";"001";"Matriz";"001";"00.000.000/0000-00";""\r\n'
    '"Alfa+";"UN2";"Curitiba";"UN2";"11.222.333/0001-81";"987654"\r\n'
    '"Alfa+";"UN3";"Recife";"UN3";"11.222.333/0001-81";""\r\n'
    '"Zeta";"001";"Matriz";"001";"";""\r\n'
).encode("utf-16-le")


@pytest.fixture
def user(make_user: Callable[..., User]) -> User:
    return make_user(email=EMAIL)


def test_the_preview_writes_nothing(db_session: Session, user: User) -> None:
    text = importar(db_session, "empresas", EMAIL, COMPANIES, write=False)

    assert "Colunas que o Financeiro não guarda: Fax" in text
    assert "Serão cadastrados: 4" in text
    assert "  0003 Gama · antigo 3 · CPF não guardado" in text
    # o CNPJ inválido fica de fora, com aviso; o cadastro entra
    assert "  0004 Delta · antigo 4 · CNPJ inválido, não guardado" in text
    assert text.endswith("Nada foi gravado. Para gravar, rode de novo com --gravar.")
    assert db_session.query(Company).count() == 0
    assert db_session.query(RecordEvent).count() == 0


def test_gravar_follows_the_old_order_and_never_keeps_a_cpf(
    db_session: Session, user: User
) -> None:
    text = importar(db_session, "empresas", EMAIL, COMPANIES, write=True)
    assert text.endswith("Gravado.")

    companies = {c.code: c for c in db_session.query(Company)}
    assert {code: c.name for code, c in companies.items()} == {
        "0001": "Alfa Pesquisas",
        "0002": "Beta Ltda",
        "0003": "Gama",
        "0004": "Delta",
    }
    alfa = companies["0001"]
    assert (alfa.nickname, alfa.document) == ("Alfa+", "11222333000181")
    # igual ao .csv: o código antigo fica à parte do gerado, e a IE é guardada
    assert (alfa.legacyCode, alfa.stateRegistration) == ("1", "123456789")
    assert companies["0002"].document is None  # o CNPJ zerado do sistema antigo é "sem CNPJ"
    assert (companies["0003"].personType, companies["0003"].document) == ("PF", None)
    assert companies["0004"].document is None  # CNPJ inválido: o cadastro entra sem ele
    events = [event.text for event in db_session.query(RecordEvent)]
    assert events[0] == "Cadastrou Alfa Pesquisas (cadastro do sistema antigo)"
    assert len(events) == 4


def test_running_again_creates_nothing(db_session: Session, user: User) -> None:
    importar(db_session, "empresas", EMAIL, COMPANIES, write=True)
    again = importar(db_session, "empresas", EMAIL, COMPANIES, write=True)

    assert "Cadastrados: 0" in again
    assert "Já existem (ficam como estão): 4" in again
    assert (
        "  linha 3 (Alfa Pesquisas) = 0001 Alfa Pesquisas (Alfa+) · antigo 1 · CNPJ 11222333000181"
        in again
    )
    assert db_session.query(Company).count() == 4


def test_each_unit_goes_to_the_company_of_its_line(db_session: Session, user: User) -> None:
    importar(db_session, "empresas", EMAIL, COMPANIES, write=True)
    text = importar(db_session, "unidades", EMAIL, UNITS, write=True)

    assert "Colunas que o Financeiro não guarda" not in text
    assert "  0001 Matriz (001) · antigo 001 · Alfa+" in text
    assert "  0002 Matriz (001) · antigo 001 · Beta" in text  # o mesmo nome em outra empresa
    assert "linha 6 (Matriz): A empresa Zeta não existe: importe as empresas antes" in text
    companies = {c.name: c.id for c in db_session.query(Company)}
    units = {(u.company_id, u.name): u for u in db_session.query(BusinessUnit)}
    assert set(units) == {
        (companies["Alfa Pesquisas"], "Matriz"),
        (companies["Beta Ltda"], "Matriz"),
        (companies["Alfa Pesquisas"], "Curitiba"),
        # o mesmo CNPJ (o da empresa) em duas unidades: as duas entram
        (companies["Alfa Pesquisas"], "Recife"),
    }
    curitiba = units[(companies["Alfa Pesquisas"], "Curitiba")]
    # a unidade pode repetir o CNPJ da empresa, como no sistema antigo; o "0" entra vazio
    assert (curitiba.legacyCode, curitiba.nickname) == ("UN2", "UN2")
    assert (curitiba.document, curitiba.stateRegistration) == ("11222333000181", "987654")
    assert units[(companies["Alfa Pesquisas"], "Matriz")].document is None

    again = importar(db_session, "unidades", EMAIL, UNITS, write=True)
    assert "Cadastrados: 0" in again
    assert "Já existem (ficam como estão): 4" in again
    assert db_session.query(BusinessUnit).count() == 4


CENTERS = (
    '"Codigo";"Nome";"Inativo";"Nivel";"Grupo";"Ordem"\r\n'
    '"001.001";"Adm_Geral";"";"2";"Administrativo";"001.001.001"\r\n'
    '"001";"Administrativo";"False";"1";"";"001"\r\n'
    '"001.010 ";"Adm_Ihea";"";"2";"Administrativo";"001.001.010 "\r\n'
    '"200";"Unidade Latam";"True";"1";"";"200"\r\n'
    '"200.001";"Latam Geral";"False";"2";"Unidade Latam";"200.200.001"\r\n'
    '"001.011";"Adm_Geral";"";"2";"Administrativo";"001.001.011"\r\n'
    '"777.001";"Sem superior";"";"2";"Fantasma";"777.777.001"\r\n'
).encode("utf-16-le")


def test_centers_come_with_their_principal_and_keep_the_old_code(
    db_session: Session, user: User
) -> None:
    text = importar(db_session, "centros", EMAIL, CENTERS, write=True)

    # os principais antes dos sub-centros: o código gerado segue a ordem do sistema antigo
    centers = {c.path: c for c in db_session.query(CostCenter)}
    assert {path: (c.code, c.legacyCode) for path, c in centers.items()} == {
        "Administrativo": ("001", "001"),
        "Unidade Latam": ("002", "200"),
        "Administrativo › Adm_Geral": ("001.001", "001.001"),
        "Administrativo › Adm_Ihea": ("001.002", "001.010"),
        "Unidade Latam › Latam Geral": ("002.001", "200.001"),
        "Administrativo › Adm_Geral (001.011)": ("001.003", "001.011"),
    }
    # o principal inativo fica inativo, e o sub-centro dele entra (inativa só no fim)
    assert [path for path, c in centers.items() if not c.active] == ["Unidade Latam"]
    assert "  002 Unidade Latam · antigo 200 · inativo" in text
    # outro código com o mesmo nome no mesmo superior entra com o código antigo no nome (o "Health
    # Full Service" 005.012 do sistema antigo); sem o principal, a linha fica de fora
    assert "nome repetido no superior: entrou como Adm_Geral (001.011)" in text
    assert centers["Administrativo › Adm_Geral (001.011)"].legacyCode == "001.011"
    assert (
        "  linha 8 (Sem superior): O centro principal Fantasma não existe no arquivo nem no "
        "cadastro" in text
    )


# Clientes fictícios. O telefone vem em partes, a observação pode trazer um CPF e o documento de
# pessoa física (ou de "PJ" com 11 dígitos) é CPF: nada disso entra.
CUSTOMERS = (
    '"Codigo";"Nome";"Apelido";"TipoPessoa";"Documento1";"Documento2";"Fone1";"Fone2";"Fone3";'
    '"Email1";"Email2";"WebSite";"Endereco";"Numero";"Complemento";"Bairro";"Cep";"Cidade";"UF";'
    '"Pais";"Origem";"Observacoes"\r\n'
    '"ALFA";"Alfa Pesquisas Ltda";"Alfa";"PJ";"11.222.333/0001-81";"ISENTO";"+55|41|3333-4444";'
    '"+55||";"+55||";"contato@alfa.invalid";"";"";"Rua Um";"10";"";"Centro";"80000-000";'
    '"Curitiba";"PR";"BRASIL";"Planilha Comercial";"Pix (CPF - 529.982.247-25) só por e-mail"\r\n'
    '"ALFA2";"Alfa Pesquisas Ltda";"Alfa";"PJ";"0";"";"+55";"";"";"";"";"";"";"";"";"";"";"";"";'
    '"";"";""\r\n'
    '"MEI";"Fulano Teste";"Fulano";"PJ";"529.982.247-25";"";"";"";"";"email-ruim";"";"";"";"";'
    '"";"";"";"";"";"";"";""\r\n'
    '"alfa";"Outra Alfa";"Outra";"PJ";"";"";"";"";"";"";"";"";"";"";"";"";"";"";"";"";"";""\r\n'
).encode("utf-16-le")


def test_customers_keep_the_card_never_a_cpf_and_never_show_a_name(
    db_session: Session, user: User
) -> None:
    text = importar(db_session, "clientes", EMAIL, CUSTOMERS, write=True)

    assert "Colunas que o Financeiro não guarda: WebSite" in text
    assert "Cadastrados: 4" in text
    assert "Alfa Pesquisas" not in text and "Fulano" not in text  # de pessoa: nunca o nome
    customers = {c.legacyCode: c for c in db_session.query(Customer)}
    alfa = customers["ALFA"]
    assert (alfa.code, alfa.nickname, alfa.document) == ("0001", "Alfa", "11222333000181")
    assert (alfa.stateRegistration, alfa.phone, alfa.phone2) == ("ISENTO", "+55 41 3333-4444", None)
    assert (alfa.addressZip, alfa.addressCity, alfa.origin) == (
        "80000000",
        "Curitiba",
        "Planilha Comercial",
    )
    assert alfa.notes == "Pix (CPF - (CPF retirado)) só por e-mail"
    # o mesmo nome com outro código é outro cliente, como no sistema antigo
    assert customers["ALFA2"].name == "Alfa Pesquisas Ltda" and customers["ALFA2"].document is None
    assert customers["alfa"].name == "Outra Alfa"  # o código só muda na maiúscula: outro cliente
    mei = customers["MEI"]
    assert (mei.document, mei.email) == (None, None)
    assert "Avisos:" in text and "CPF não guardado" in text and "E-mail 1 inválido" in text

    again = importar(db_session, "clientes", EMAIL, CUSTOMERS, write=True)
    assert "Já existem (ficam como estão): 4" in again
    assert db_session.query(Customer).count() == 4


SUPPLIERS = (
    '"Codigo";"Nome";"Apelido";"TipoPessoa";"Documento1";"Documento2";"Fone1";"Fone2";"Fone3";'
    '"Email1";"Email2";"WebSite";"Endereco";"Numero";"Complemento";"Bairro";"Cep";"Cidade";"UF";'
    '"Pais";"Origem";"Observacoes"\r\n'
    '"GRAF";"Gráfica Exemplo Ltda";"Gráfica";"PJ";"11.444.777/0001-61";"";"+55|41|3333-4444";"";"";'
    '"";"";"";"";"";"";"";"";"";"";"";"";"Pix: contato@grafica.invalid"\r\n'
    '"DUP";"Fornecedor Um";"Um";"PJ";"0";"";"";"";"";"";"";"";"";"";"";"";"";"";"";"";"";'
    '"Entrega às terças"\r\n'
    '"DUP";"Fornecedor Dois";"Dois";"PJ";"0";"";"";"";"";"";"";"";"";"";"";"";"";"";"";"";"";""\r\n'
    '"OUTRA";"Outra Gráfica";"Outra";"PJ";"11.444.777/0001-61";"";"";"";"";"";"";"";"";"";"";"";'
    '"";"";"";"";"";""\r\n'
    '"PF1";"Pessoa Teste";"Pessoa";"PF";"529.982.247-25";"";"";"";"";"";"";"";"";"";"";"";"";"";'
    '"";"";"";""\r\n'
).encode("utf-16-le")


def test_suppliers_get_the_same_card_without_pix_and_a_repeated_code_is_two_suppliers(
    db_session: Session, user: User
) -> None:
    text = importar(db_session, "fornecedores", EMAIL, SUPPLIERS, write=True)

    assert "Cadastrados: 4" in text
    assert "Pessoa Teste" not in text and "Gráfica" not in text  # de pessoa: nunca o nome
    assert "observação com dados de pagamento não guardada (Q23)" in text
    # o mesmo CNPJ em outro fornecedor fica de fora, como na tela
    assert "  linha 5 (OUTRA): Já existe um fornecedor ativo com esse documento" in text
    suppliers = {s.name: s for s in db_session.query(Supplier)}
    assert set(suppliers) == {
        "Gráfica Exemplo Ltda",
        "Fornecedor Um",
        "Fornecedor Dois",
        "Pessoa Teste",
    }
    grafica = suppliers["Gráfica Exemplo Ltda"]
    assert (grafica.legacyCode, grafica.phone, grafica.notes) == ("GRAF", "+55 41 3333-4444", None)
    assert suppliers["Fornecedor Um"].notes == "Entrega às terças"
    assert suppliers["Pessoa Teste"].document is None  # CPF nunca

    again = importar(db_session, "fornecedores", EMAIL, SUPPLIERS, write=True)
    assert "Já existem (ficam como estão): 4" in again
    assert db_session.query(Supplier).count() == 4


PLAN = (
    '"Codigo";"Nome";"Inativo";"Nivel";"Grupo";"Ordem"\r\n'
    '"001";"Despesas Fixas";"False";"1";"";"001"\r\n'
    '"001.001";"Aluguel";"False";"2";"Despesas Fixas";"001.001.001"\r\n'
    '"010";"Receitas Operacionais";"False";"1";"";"010"\r\n'
    '"010.001";"Venda de Pesquisa";"";"2";"Receitas Operacionais";"010.010.001"\r\n'
    '"010.001";"Conta com o código de outro grupo";"";"2";"Despesas Fixas";"001.010.001"\r\n'
    '"001.001";"Aluguel de novo";"False";"2";"Despesas Fixas";"001.001.002"\r\n'
    '"9999";"Sem grupo";"";"2";"Fantasma";"9999"\r\n'
).encode("utf-16-le")


def test_the_plan_brings_the_groups_and_the_accounts_under_them(
    db_session: Session, user: User
) -> None:
    text = importar(db_session, "plano", EMAIL, PLAN, write=True)

    groups = {g.code: g for g in db_session.query(ExpenseCategoryGroup)}
    assert {code: g.name for code, g in groups.items()} == {
        "001": "Despesas Fixas",
        "010": "Receitas Operacionais",
    }
    accounts = {(a.group_id, a.code): a for a in db_session.query(ExpenseCategory)}
    # o mesmo código em outro grupo é outra conta; o tipo vem do grupo (receita ou despesa)
    assert {key: (a.name, a.kind) for key, a in accounts.items()} == {
        (groups["001"].id, "001.001"): ("Aluguel", "despesa"),
        (groups["010"].id, "010.001"): ("Venda de Pesquisa", "receita"),
        (groups["001"].id, "010.001"): ("Conta com o código de outro grupo", "despesa"),
    }
    # o mesmo código no mesmo grupo é a mesma conta: é isso que deixa rodar de novo sem repetir
    assert "  linha 7 (Aluguel de novo) = 001.001 Aluguel" in text
    assert "  linha 8 (Sem grupo): O grupo Fantasma não existe no arquivo nem no cadastro" in text

    again = importar(db_session, "plano", EMAIL, PLAN, write=True)
    assert again.count("Cadastrados: 0") == 2
    assert db_session.query(ExpenseCategory).count() == 3


PROJECTS = (
    '"Empresa";"Unidade";"CCusto";"Cliente";"Projeto";"Nome";"Observacoes";"Inativo"\r\n'
    # o sistema antigo exporta a quebra de linha da observação como o texto \r\n
    '"1";"001";"001.001";"Outra Alfa";"1417";"Projeto Alfa";'
    '"Metodologia: ON LINE\\r\\nSegmento:HEALTH";"False"\r\n'
    '"2";"001";"001.001";"Outra Alfa";"1417";"Projeto Alfa";"";"False"\r\n'
    '"1";"001";"001.001";"Outra Alfa";"CARPE DIEM";"Carpe";"";"True"\r\n'
    '"1";"999";"001.001";"Outra Alfa";"2000";"Sem unidade";"";"False"\r\n'
    '"1";"001";"999.999";"Outra Alfa";"2001";"Sem centro";"";"False"\r\n'
    '"1";"001";"001.001";"Fantasma Ltda";"2002";"Sem cliente";"";"False"\r\n'
    '"1";"001";"001.001";"Outra Alfa";"1417";"Outro com o mesmo número";"";"False"\r\n'
).encode("utf-16-le")


def test_projects_need_unit_center_and_customer_and_repeat_the_number_only_elsewhere(
    db_session: Session, user: User
) -> None:
    for tipo, content in (
        ("empresas", COMPANIES),
        ("unidades", UNITS),
        ("centros", CENTERS),
        ("clientes", CUSTOMERS),
    ):
        importar(db_session, tipo, EMAIL, content, write=True)
    text = importar(db_session, "projetos", EMAIL, PROJECTS, write=True)

    companies = {c.legacyCode: c.id for c in db_session.query(Company)}
    projects = {(p.code, p.company_id): p for p in db_session.query(Project)}
    # o mesmo número em outra empresa é outro projeto (como no sistema antigo)
    assert set(projects) == {
        ("1417", companies["1"]),
        ("1417", companies["2"]),
        ("CARPE_DIEM", companies["1"]),
    }
    alfa = projects[("1417", companies["1"])]
    assert alfa.notes == "Metodologia: ON LINE\nSegmento:HEALTH"
    assert (alfa.unit_id, alfa.cost_center_id, alfa.customer_id) != (None, None, None)
    carpe = projects[("CARPE_DIEM", companies["1"])]
    assert (carpe.legacyCode, carpe.active) == ("CARPE DIEM", False)
    assert "código com espaço: entrou como CARPE_DIEM" in text
    # sem unidade, centro ou cliente, o projeto fica de fora (pedido do Bruno, 24/11)
    assert "linha 5 (Sem unidade): A unidade 999 não existe nessa empresa" in text
    assert "linha 6 (Sem centro): O centro de custo 999.999 não existe" in text
    assert "linha 7 (Sem cliente): O cliente Fantasma Ltda não existe" in text
    assert "linha 8 (Outro com o mesmo número): Já existe o projeto PRJ-1417 nessa empresa" in text

    again = importar(db_session, "projetos", EMAIL, PROJECTS, write=True)
    assert "Já existem (ficam como estão): 3" in again
    assert db_session.query(Project).count() == 3


ACCOUNTS = (
    '"Codigo";"Nome";"Banco";"Agencia";"Conta";"TipoConta";"Encerrada";"DataSaldoInicial";'
    '"SaldoInicial";"ImpactaFluxoDeCaixa"\r\n'
    '"1";"Banco Teste";"341";"0349";"06302-4";"CC";"False";"01/01/2025";"-29196,99";"True"\r\n'
    '"2";"Caixinha";"";"";"";"Interna";"False";"";"0,00";"False"\r\n'
    '"3";"Cartão";"Itaú";"Master";"";"Crédito";"False";"";"0,00";"False"\r\n'
    '"7";"Banco da Beta";"341";"6754";"99247-4";"CC";"True";"16/06/2026";"4286,91";"True"\r\n'
).encode("utf-16-le")


def test_bank_accounts_get_the_company_from_the_command_line(
    db_session: Session, user: User
) -> None:
    importar(db_session, "empresas", EMAIL, COMPANIES, write=True)
    importar(
        db_session, "contas", EMAIL, ACCOUNTS, write=True, company="Alfa+", companies={"7": "Beta"}
    )

    companies = {c.legacyCode: c.id for c in db_session.query(Company)}
    accounts = {a.legacyCode: a for a in db_session.query(BankAccount)}
    main = accounts["1"]
    assert (main.company_id, main.accountType, main.impactsCashFlow) == (companies["1"], "cc", True)
    assert (main.openingBalance, main.openingDate) == (Decimal("-29196.99"), date(2025, 1, 1))
    # como no sistema antigo: a Caixinha sem banco e fora do fluxo; o cartão com a bandeira
    assert (accounts["2"].accountType, accounts["2"].bankName) == ("interna", None)
    assert accounts["2"].impactsCashFlow is False
    assert (accounts["3"].accountType, accounts["3"].agency) == ("credito", "Master")
    # a da outra empresa pelo código; a encerrada entra inativa
    assert (accounts["7"].company_id, accounts["7"].active) == (companies["2"], False)

    again = importar(
        db_session, "contas", EMAIL, ACCOUNTS, write=True, company="Alfa+", companies={"7": "Beta"}
    )
    assert "Já existem (ficam como estão): 4" in again
    assert db_session.query(BankAccount).count() == 4


def test_a_file_without_the_name_column_is_refused(db_session: Session, user: User) -> None:
    with pytest.raises(PayableInvalid, match="O arquivo não tem a coluna nome"):
        importar(db_session, "empresas", EMAIL, b"Codigo;Apelido\n1;Alfa\n", write=False)
