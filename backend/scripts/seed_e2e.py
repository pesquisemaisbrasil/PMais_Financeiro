"""Seed dos testes de tela (e2e, Playwright): banco SQLite descartável.

Apaga e recria `backend/e2e.db` com contas FICTÍCIAS. Quem roda é o
`frontend/playwright.config.ts`, antes de subir o uvicorn; os mesmos valores estão em
`frontend/e2e/fixtures.ts`. Cada teste usa a própria conta, porque um código aceito não vale
de novo e o estado de uma conta não pode vazar para outro teste.

Por segurança só aceita DATABASE_URL de SQLite em arquivo chamado e2e.db: nunca apaga um banco
de verdade.
"""

import os
import sys
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'e2e.db').as_posix()}")

_url = os.environ["DATABASE_URL"]
if not (_url.startswith("sqlite:///") and _url.endswith("e2e.db")):
    raise SystemExit("seed_e2e só roda com DATABASE_URL=sqlite:///.../e2e.db")
_target = Path(_url.removeprefix("sqlite:///"))
if not _target.is_absolute():
    _target = Path.cwd() / _target
if _target.exists():
    _target.unlink()

sys.path.append(str(BACKEND_DIR))

from core.crypto import encrypt_payload  # noqa: E402
from core.security import hash_password, hash_token  # noqa: E402
from db.connection import Base, SessionLocal, engine  # noqa: E402
from models.bank_reconciliation import (  # noqa: E402,F401
    BankReconciliation,
    BankReconciliationEvent,
)
from models.bank_statement import BankStatement, BankTransaction  # noqa: E402,F401
from models.connect_payable_item import ConnectPayableItem  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.mfa_recovery_code import MfaRecoveryCode  # noqa: E402
from models.notification import Notification  # noqa: E402,F401
from models.payable import Payable, PayableItem, PayablePayment  # noqa: E402
from models.period_closing import PeriodClosing, PeriodClosingEvent  # noqa: E402,F401
from models.project_ref import ProjectRef  # noqa: E402
from models.receipt import PaymentRequest, ReceiptBatch  # noqa: E402,F401
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
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402
from scripts.seed_demo import seed as seed_payables  # noqa: E402
from services.payable import today  # noqa: E402

PASSWORD = "E2e!Fictic1a"
TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # gitleaks:allow
RECOVERY_CODE = "E2E2RECUPERACAO2"

WITHOUT_MFA = ["novo@e2e.invalid"]
WITH_MFA = [
    "ana@e2e.invalid",
    "repete@e2e.invalid",
    "recupera@e2e.invalid",
    "roubo@e2e.invalid",
    "contas@e2e.invalid",
    "comprovantes@e2e.invalid",
    "recorrencia@e2e.invalid",
    "receber@e2e.invalid",
    "receber2@e2e.invalid",
    "receber3@e2e.invalid",
    "importacao@e2e.invalid",
    "ajustes@e2e.invalid",
    "ajustes-receber@e2e.invalid",
    "cadastros@e2e.invalid",
    "repetir-detalhe@e2e.invalid",
    "cnpj@e2e.invalid",
    "relatorio@e2e.invalid",
    "passeio@e2e.invalid",
    "faixa@e2e.invalid",
    "agenda@e2e.invalid",
    "diautil@e2e.invalid",
    "extrato@e2e.invalid",
    "conciliacao@e2e.invalid",
    "fechamento@e2e.invalid",
]
# Só quem é administrador reabre um mês fechado.
ADMINS = ["fechamento@e2e.invalid"]


def seed_receipts(db) -> None:  # type: ignore[no-untyped-def]
    """Projeto do Connect e duas entrevistas de R$ 20 da pessoa 87, que o Connect simulado
    (services/connect_gateway.py: SimulatedConnect) conhece pela chave do PDF do teste."""
    project = ProjectRef(connect_project_id=12, title="Pesquisa de mobilidade urbana")
    db.add(project)
    db.flush()
    for number in (1, 2):
        launched = datetime(2026, 1, number, tzinfo=UTC)
        db.add(
            ConnectPayableItem(
                connect_interview_id=5500 + number,
                project_ref_id=project.id,
                connect_interviewer_id=87,
                amount=Decimal("20.00"),
                launchedAt=launched,
                dueOn=date(2026, 2, number),
                connectUpdatedAt=launched,
            )
        )


def link_connect_people(db) -> None:  # type: ignore[no-untyped-def]
    """No lançamento do Connect, a Sandra é a pessoa 87 do Connect e fica com R$ 40, o valor dos
    dois Pix do PDF do teste; o Marcos passa para R$ 280, e o total do lançamento não muda."""
    sandra = db.query(PayableItem).filter(PayableItem.name.like("Sandra%")).one()
    marcos = db.query(PayableItem).filter(PayableItem.name.like("Marcos%")).one()
    sandra.amount, marcos.amount = Decimal("40.00"), Decimal("280.00")
    sandra.connect_interviewer_id = 87


def seed_reconciliation(db) -> None:  # type: ignore[no-untyped-def]
    """Uma conta já paga (R$ 450,00, em 02/04/2030) no Itaú · PPlus, para o teste de conciliação do
    extrato achar a sugestão. Em 2030, para não mexer nos totais dos outros testes."""
    user = db.query(User).filter(User.email == "conciliacao@e2e.invalid").one()
    company = db.query(Company).filter_by(name="PPlus").one()
    pix = db.query(PaymentMethod).filter_by(name="Pix").one()
    payable = Payable(
        company_id=company.id,
        unit_id=db.query(BusinessUnit).filter_by(company_id=company.id, name="Consumo SP").one().id,
        cost_center_id=db.query(CostCenter).filter_by(name="Administrativo").one().id,
        category_id=db.query(ExpenseCategory).filter_by(code="2.04").one().id,
        payment_method_id=pix.id,
        supplier_id=db.query(Supplier).filter_by(nickname="Ponto Certo").one().id,
        description="Conciliação E2E · material gráfico",
        issueDate=date(2030, 4, 1),
        dueDate=date(2030, 4, 2),
        competence="2030-04",
        amount=Decimal("450.00"),
        created_by_user_id=user.id,
    )
    db.add(payable)
    db.flush()
    db.add(
        PayablePayment(
            payable_id=payable.id,
            paidOn=date(2030, 4, 2),
            amount=Decimal("450.00"),
            bank_account_id=db.query(BankAccount).filter_by(name="Itaú · PPlus").one().id,
            payment_method_id=pix.id,
            note="Baixa do teste de conciliação",
            created_by_user_id=user.id,
        )
    )


def seed_receivables(db) -> None:  # type: ignore[no-untyped-def]
    """Dois clientes e três títulos fictícios: dois da Alfa vencidos (um com abatimento) e um da
    Beta a vencer. O plano de contas ganha a conta de receita que o Contas a receber usa."""
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


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        password_hash = hash_password(PASSWORD)
        for email in WITHOUT_MFA + WITH_MFA:
            db.add(User(name=email.split("@")[0], email=email, passwordHash=password_hash))
        db.commit()
        for email in WITH_MFA:
            user = db.query(User).filter(User.email == email).one()
            user.totpSecretEncrypted = encrypt_payload(
                TOTP_SECRET, f"users:totpSecretEncrypted:{user.id}"
            )
            user.mfaEnabledAt = datetime.now(UTC)
            if email in ADMINS:
                user.role = "admin"
            db.add(MfaRecoveryCode(user_id=user.id, codeHash=hash_token(RECOVERY_CODE)))
        seed_payables(db)
        seed_receipts(db)
        link_connect_people(db)
        seed_receivables(db)
        seed_reconciliation(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
