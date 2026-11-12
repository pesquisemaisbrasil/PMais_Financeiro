"""Seed da versão de demonstração (o backend rodando dentro do navegador): só dados FICTÍCIOS.

Parte do `seed_demo` (cadastros e 12 contas a pagar com datas em volta de hoje) e acrescenta o que
faz as outras telas terem o que mostrar: um usuário administrador, baixas (paga, parcial e
cancelada), contas a receber com recebimento, extratos do Itaú com linhas conciliadas, pendentes
e uma exceção, um mês fechado, um feriado local e uma segunda agenda de incentivos.

Tudo passa pelos serviços do sistema (baixa, recebimento, conciliação, fechamento), então o
histórico e as regras são os de verdade. Nenhum nome, CNPJ, chave Pix ou valor é real.
"""

import sys
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.crypto import encrypt_payload  # noqa: E402
from core.security import hash_password  # noqa: E402
from models.payable import Payable, PayableAllocation, PayableItem  # noqa: E402
from models.receivable import Receivable, ReceivableAdjustment  # noqa: E402
from models.reference import (  # noqa: E402
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    Customer,
    ExpenseCategory,
    PaymentMethod,
    Project,
    Supplier,
)
from models.user import User  # noqa: E402
from schemas.bank_reconciliation import ExceptionIn, ReconcileIn  # noqa: E402
from schemas.holidays import HolidayIn  # noqa: E402
from schemas.payable import PaymentCreate  # noqa: E402
from schemas.receivable import ReceiptCreate  # noqa: E402
from scripts.seed_demo import seed as seed_payables  # noqa: E402
from services import bank_reconciliation, bank_statement, holidays, period_closing  # noqa: E402
from services import payable as payables  # noqa: E402
from services import receivable as receivables  # noqa: E402
from services.payable import today  # noqa: E402

DEMO_NAME = "Bruna Demonstração"
DEMO_EMAIL = "demo@pesquisemais.invalid"
DEMO_PASSWORD = "Demo!Financeiro1"
# Segredo do autenticador da demonstração (fictício): a tela de entrada mostra o código do momento.
DEMO_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"  # gitleaks:allow


def ofx(*lines: tuple[date, str, str, str], account: str = "98765-4") -> bytes:
    """Um OFX no estilo SGML dos bancos: (dia, valor, ID do banco, descrição)."""
    body = "".join(
        f"<STMTTRN>\n<TRNTYPE>OTHER\n<DTPOSTED>{day:%Y%m%d}120000[-3:BRT]\n<TRNAMT>{amount}\n"
        f"<FITID>{fitid}\n<MEMO>{memo}\n</STMTTRN>\n"
        for day, amount, fitid, memo in lines
    )
    return (
        "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n"
        "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>341\n<ACCTID>98765-4\n"
        f"</BANKACCTFROM><BANKTRANLIST>\n{body}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>"
        "</OFX>\n"
    ).encode("latin1")


def _user(db) -> User:  # type: ignore[no-untyped-def]
    user = User(
        name=DEMO_NAME,
        email=DEMO_EMAIL,
        passwordHash=hash_password(DEMO_PASSWORD),
        role="admin",
        status="active",
    )
    db.add(user)
    db.commit()
    user.totpSecretEncrypted = encrypt_payload(
        DEMO_TOTP_SECRET, f"users:totpSecretEncrypted:{user.id}"
    )
    user.mfaEnabledAt = datetime.now(UTC)
    db.commit()
    return user


def _accounts(db) -> tuple[BankAccount, BankAccount]:  # type: ignore[no-untyped-def]
    """Os dados bancários das duas contas e um saldo de abertura no mês passado."""
    month_before = (today().replace(day=1) - timedelta(days=1)).replace(day=1)
    itau = db.query(BankAccount).filter_by(name="Itaú · PPlus").one()
    bradesco = db.query(BankAccount).filter_by(name="Bradesco · MC").one()
    for account, bank, agency, number, opening in (
        (itau, "Itaú", "0001", "98765-4", "50000.00"),
        (bradesco, "Bradesco", "0002", "12345-6", "20000.00"),
    ):
        account.bankName, account.agency, account.accountNumber = bank, agency, number
        account.accountType = "corrente"
        account.openingBalance, account.openingDate = Decimal(opening), month_before
    db.commit()
    return itau, bradesco


def _incentive_agenda(db) -> None:  # type: ignore[no-untyped-def]
    """Um segundo lançamento de incentivos, em outra data, para a agenda ter mais de um dia."""
    pplus = db.query(Company).filter_by(name="PPlus").one()
    project = db.query(Project).filter_by(code="1790").one()
    due = today() + timedelta(days=3)
    db.add(
        Payable(
            company_id=pplus.id,
            unit_id=db.query(BusinessUnit).filter_by(name="CATI Curitiba").one().id,
            cost_center_id=db.query(CostCenter).filter_by(name="Campo").one().id,
            category_id=db.query(ExpenseCategory).filter_by(code="2.02").one().id,
            payment_method_id=db.query(PaymentMethod).filter_by(name="Pix").one().id,
            payeeName="8 entrevistados",
            description="Incentivos · pesquisa de satisfação",
            origin="incentivo",
            issueDate=today() - timedelta(days=5),
            dueDate=due,
            competence=due.strftime("%Y-%m"),
            amount=Decimal("1200.00"),
            allocations=[PayableAllocation(project_id=project.id, amount=Decimal("1200.00"))],
            items=[
                PayableItem(
                    name=f"Entrevistado {n:02d}",
                    documentType="Incentivo",
                    amount=Decimal("150.00"),
                    pix_masked=f"512***{(n * 23) % 100:02d}",
                )
                for n in range(1, 9)
            ],
        )
    )
    db.commit()


def _receivables(db) -> None:  # type: ignore[no-untyped-def]
    """Dois clientes e três títulos: dois da Alfa vencidos e um da Beta a vencer."""
    revenue = ExpenseCategory(code="1.01", name="Receita de pesquisa", kind="receita")
    alfa = Customer(nickname="Alfa", name="Alfa Pesquisas Ltda", document="11222333000181")
    beta = Customer(nickname="Beta", name="Beta Consultoria")
    db.add_all([revenue, alfa, beta])
    db.flush()
    company = db.query(Company).filter_by(name="PPlus").one()
    unit = db.query(BusinessUnit).filter_by(name="Consumo SP").one()
    center = db.query(CostCenter).filter_by(name="Administrativo").one()
    project = db.query(Project).filter_by(code="1804").one()
    on = today()

    def title(customer, description, days, amount, withheld="0.00"):  # type: ignore[no-untyped-def]
        due = on + timedelta(days=days)
        adjustments = (
            [
                ReceivableAdjustment(
                    kind="imposto", description="Retenção na nota", amount=Decimal(withheld)
                )
            ]
            if Decimal(withheld) > 0
            else []
        )
        db.add(
            Receivable(
                customer_id=customer.id,
                project_id=project.id,
                company_id=company.id,
                unit_id=unit.id,
                cost_center_id=center.id,
                category_id=revenue.id,
                description=description,
                issueDate=on - timedelta(days=40),
                dueDate=due,
                competence=due.strftime("%Y-%m"),
                amount=Decimal(amount),
                adjustments=adjustments,
            )
        )

    title(alfa, "Satisfação · 1ª parcela", -10, "1000.00", "100.00")
    title(alfa, "Satisfação · 2ª parcela", -3, "500.00")
    title(beta, "Tracking mensal", 10, "700.00")
    db.commit()


def _transaction_id(db, external_id: str) -> int:  # type: ignore[no-untyped-def]
    from models.bank_statement import BankTransaction

    return db.query(BankTransaction).filter_by(externalId=external_id).one().id


def _pay(db, user, description: str, amount: str, on: date, account, method) -> Payable:  # type: ignore[no-untyped-def]
    payable = db.query(Payable).filter_by(description=description).one()
    payables.pay(
        db,
        payable.id,
        PaymentCreate(
            paidOn=on,
            amount=Decimal(amount),
            bankAccountId=account.id,
            paymentMethodId=method.id,
            note="Baixa conferida com o extrato",
        ),
        user,
    )
    return payable


def _previous_month(db, user, itau, pix) -> str:  # type: ignore[no-untyped-def]
    """Duas contas pagas no mês passado, o extrato do mês e o mês fechado para a PPlus."""
    first = (today().replace(day=1) - timedelta(days=1)).replace(day=1)
    month = first.strftime("%Y-%m")
    pplus = db.query(Company).filter_by(name="PPlus").one()
    unit = db.query(BusinessUnit).filter_by(name="Consumo SP").one()
    admin_center = db.query(CostCenter).filter_by(name="Administrativo").one()
    boleto = db.query(PaymentMethod).filter_by(name="Boleto").one()
    for description, value, supplier, category, day in (
        ("Aluguel do mês passado", "2100.00", "Batel", "3.01", 4),
        ("Telefonia e internet · mês passado", "389.90", "Conecta", "3.02", 9),
    ):
        due = first + timedelta(days=day)
        db.add(
            Payable(
                company_id=pplus.id,
                unit_id=unit.id,
                cost_center_id=admin_center.id,
                category_id=db.query(ExpenseCategory).filter_by(code=category).one().id,
                payment_method_id=boleto.id,
                supplier_id=db.query(Supplier).filter_by(nickname=supplier).one().id,
                description=description,
                issueDate=first,
                dueDate=due,
                competence=month,
                amount=Decimal(value),
                created_by_user_id=user.id,
            )
        )
    db.commit()
    lines = []
    for description, value, day, fitid, memo in (
        ("Aluguel do mês passado", "2100.00", 4, "DEMO-0101", "PAGTO BOLETO ALUGUEL EXEMPLO"),
        ("Telefonia e internet · mês passado", "389.90", 9, "DEMO-0102", "PAGTO FATURA TELEFONIA"),
    ):
        _pay(db, user, description, value, first + timedelta(days=day), itau, boleto)
        lines.append((first + timedelta(days=day), f"-{value}", fitid, memo))
    bank_statement.confirm(db, itau.id, "extrato-mes-passado.ofx", ofx(*lines), user)
    for description, fitid in (
        ("Aluguel do mês passado", "DEMO-0101"),
        ("Telefonia e internet · mês passado", "DEMO-0102"),
    ):
        payable = db.query(Payable).filter_by(description=description).one()
        bank_reconciliation.reconcile(
            db,
            _transaction_id(db, fitid),
            ReconcileIn(targetKind="payable", targetId=payable.id, classification="sem_nf"),
            user,
        )
    period_closing.close(db, pplus.id, month, user)
    return month


def _current_month(db, user, itau, bradesco, pix) -> None:  # type: ignore[no-untyped-def]
    """Baixas e extrato do mês: linhas conciliadas, uma com sugestão, uma exceção e uma solta."""
    on = today()
    first = on.replace(day=1)

    def day(back: int) -> date:
        return max(on - timedelta(days=back), first)  # nunca cai no mês passado, já fechado

    boleto = db.query(PaymentMethod).filter_by(name="Boleto").one()
    _pay(db, user, "Impressão de questionários", "1250.00", day(0), itau, boleto)
    _pay(db, user, "Passagens de ônibus · campo", "320.00", day(1), itau, pix)
    _pay(db, user, "Honorários contábeis", "1000.00", day(0), itau, pix)  # parcial: faltam 1.800
    bank_statement.confirm(
        db,
        itau.id,
        "extrato-do-mes.ofx",
        ofx(
            (day(0), "-1250.00", "DEMO-0001", "PAGTO BOLETO GRAFICA EXEMPLO"),
            (day(1), "-320.00", "DEMO-0002", "PIX ENVIADO VIACAO EXEMPLO"),
            (day(0), "-1000.00", "DEMO-0003", "PIX ENVIADO EXATA CONTABIL"),
            (day(2), "-89.90", "DEMO-0004", "TARIFA MANUTENCAO CONTA"),
            (day(2), "500.00", "DEMO-0005", "TED RECEBIDA ALFA PESQUISAS"),
            (day(0), "700.00", "DEMO-0006", "PIX RECEBIDO CLIENTE BETA"),
        ),
        user,
    )
    for description, fitid in (
        ("Impressão de questionários", "DEMO-0001"),
        ("Passagens de ônibus · campo", "DEMO-0002"),
    ):
        payable = db.query(Payable).filter_by(description=description).one()
        bank_reconciliation.reconcile(
            db,
            _transaction_id(db, fitid),
            ReconcileIn(targetKind="payable", targetId=payable.id, classification="sem_nf"),
            user,
        )
    bank_reconciliation.mark_exception(
        db,
        _transaction_id(db, "DEMO-0004"),
        ExceptionIn(reason="Tarifa do banco, sem lançamento", classification="tarifa"),
        user,
    )
    # A MC (Bradesco): o aluguel pago e conciliado, e um recebimento ainda solto
    _pay(db, user, "Aluguel da sala de grupo", "2100.00", day(0), bradesco, boleto)
    bank_statement.confirm(
        db,
        bradesco.id,
        "extrato-bradesco.ofx",
        ofx(
            (day(0), "-2100.00", "DEMO-0201", "PAGTO BOLETO ALUGUEL SALA EXEMPLO"),
            (day(1), "3500.00", "DEMO-0202", "TED RECEBIDA CLIENTE EXEMPLO"),
            account="12345-6",
        ),
        user,
    )
    rent = db.query(Payable).filter_by(description="Aluguel da sala de grupo").one()
    bank_reconciliation.reconcile(
        db,
        _transaction_id(db, "DEMO-0201"),
        ReconcileIn(targetKind="payable", targetId=rent.id, classification="sem_nf"),
        user,
    )
    title = db.query(Receivable).filter_by(description="Satisfação · 2ª parcela").one()
    receivables.receive(
        db,
        title.id,
        ReceiptCreate(
            receivedOn=day(2),
            amount=Decimal("500.00"),
            bankAccountId=itau.id,
            paymentMethodId=pix.id,
            note="Recebimento conferido com o extrato",
        ),
        user,
    )
    bank_reconciliation.reconcile(
        db,
        _transaction_id(db, "DEMO-0005"),
        ReconcileIn(targetKind="receivable", targetId=title.id, classification="sem_nf"),
        user,
    )


def seed_demonstracao(db) -> User:  # type: ignore[no-untyped-def]
    """Popula um banco novo. Devolve o usuário de demonstração."""
    seed_payables(db)
    db.commit()
    user = _user(db)
    itau, bradesco = _accounts(db)
    pix = db.query(PaymentMethod).filter_by(name="Pix").one()
    _receivables(db)
    _incentive_agenda(db)
    _previous_month(db, user, itau, pix)
    _current_month(db, user, itau, bradesco, pix)
    cancelled = db.query(Payable).filter_by(description="Licenças de software").one()
    payables.cancel(db, cancelled.id, "Contrato encerrado", user)
    holidays.create(
        db,
        HolidayIn(
            date=today() + timedelta(days=6),
            name="Aniversário da cidade (exemplo)",
            scope="municipal",
            uf="SP",
            city="São Paulo",
        ),
        user,
    )
    return user
