"""Pedidos simultâneos de login em Postgres de verdade (PF-54).

Os testes comuns rodam em SQLite, que ignora o `FOR UPDATE`: se alguém apagar a trava de
`get_mfa_pending_user` (código do MFA) ou de `_find_refresh_token` (renovação da sessão),
tudo continua verde. Estes testes só rodam com DATABASE_URL de Postgres (job `migrations`
do tests.yml) e falham sem a trava.

Como forçam a disputa: o primeiro pedido trava a linha e dorme antes de gravar; o segundo
chega 0,2 s depois. Com a trava ele espera e é recusado; sem a trava ele lê o estado antigo
e passa junto com o primeiro.

Para rodar na máquina (Postgres do docker compose, com as migrations aplicadas), passe a URL
do banco local em DATABASE_URL, que o conftest deixa como SQLite quando a variável falta:
    DATABASE_URL=<url do Postgres local> pytest tests/test_concurrency_postgres.py --no-cov
"""

import threading
import time
import uuid
from collections.abc import Callable, Generator
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from core.config import DATABASE_URL
from core.crypto import encrypt_payload
from core.limiter import limiter
from core.security import hash_password
from db.connection import engine, get_db
from main import app
from models.payable import Payable, PayableEvent, PayablePayment
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
)
from models.user import User
from schemas.payable import PaymentCreate
from schemas.records import RecordIn
from services import auth as auth_service
from services import mfa as mfa_service
from services import payable as payable_service
from services import receivable as receivable_service
from services import records as records_service
from tests.conftest import PASSWORD, TOTP_SECRET

pytestmark = pytest.mark.skipif(
    not DATABASE_URL.startswith("postgresql"),
    reason="precisa de Postgres: o SQLite ignora FOR UPDATE",
)

RACE_SLEEP = 0.6  # tempo que o primeiro pedido segura a trava antes de gravar
SECOND_DELAY = 0.2  # o segundo chega com o primeiro ainda dormindo


@pytest.fixture
def postgres_users() -> Generator[Callable[[], User], None, None]:
    """Cria contas com e-mail único e tenta apagá-las no fim (sobra só o que a trilha de
    auditoria impedir de apagar: o banco de teste do CI é descartável de qualquer jeito)."""
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    created: list[int] = []

    def make() -> User:
        with session_factory() as db:
            user = User(
                name="Concorrência",
                email=f"concorrencia-{uuid.uuid4().hex[:12]}@teste.invalid",
                passwordHash=hash_password(PASSWORD),
                role="financeiro",
                status="active",
            )
            db.add(user)
            db.commit()
            user.totpSecretEncrypted = encrypt_payload(
                TOTP_SECRET, f"users:totpSecretEncrypted:{user.id}"
            )
            user.mfaEnabledAt = datetime.now(UTC)
            db.commit()
            created.append(user.id)
            db.expunge(user)
            return user

    yield make

    for user_id in created:
        try:
            with session_factory() as db:
                db.execute(text("DELETE FROM refresh_tokens WHERE user_id = :id"), {"id": user_id})
                db.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
                db.commit()
        except Exception:  # noqa: BLE001  shortcut: limpeza é cortesia, não regra do teste
            pass


@pytest.fixture
def per_request_db() -> Generator[None, None, None]:
    """Cada pedido usa a própria sessão do Postgres, como em produção: o `client` comum
    divide uma sessão de SQLite entre todos e não serve para testar trava de linha."""
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    # Conexões já abertas: se o segundo pedido tivesse de abrir a sua, o tempo de conexão
    # (2 s no Windows, que tenta IPv6 antes) comeria a janela da disputa e o teste passaria
    # sem a trava.
    warm = [engine.connect() for _ in range(3)]
    for connection in warm:
        connection.close()

    limiter.reset()
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()


def race(call: Callable[[], Any]) -> list[Any]:
    """Dispara `call` duas vezes, a segunda 0,2 s depois, e devolve as duas respostas."""
    results: list[Any] = [None, None]

    def run(index: int, delay: float) -> None:
        time.sleep(delay)
        results[index] = call()

    threads = [
        threading.Thread(target=run, args=(0, 0.0)),
        threading.Thread(target=run, args=(1, SECOND_DELAY)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    return results


def test_same_mfa_code_sent_twice_at_once_passes_only_once(
    postgres_users: Callable[[], User], per_request_db: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = postgres_users()
    mfa_token = auth_service.create_mfa_token(user.id)
    code = pyotp.TOTP(TOTP_SECRET).now()

    real_accept = mfa_service._accept_totp

    def slow_accept(target: User, value: str) -> bool:
        accepted = real_accept(target, value)
        time.sleep(RACE_SLEEP)  # o código já foi marcado como usado, mas ainda sem commit
        return accepted

    monkeypatch.setattr(mfa_service, "_accept_totp", slow_accept)

    def send() -> int:
        return (
            TestClient(app)
            .post(
                "/auth/token/mfa",
                json={"code": code},
                headers={"Authorization": f"Bearer {mfa_token}"},
            )
            .status_code
        )

    statuses = sorted(race(send))

    assert statuses == [200, 401], "o mesmo código do MFA passou duas vezes"


def test_same_refresh_token_sent_twice_at_once_renews_only_once(
    postgres_users: Callable[[], User], per_request_db: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = postgres_users()
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with session_factory() as db:
        _, refresh_token = auth_service.issue_tokens(db, user.id)

    real_issue = auth_service.issue_tokens

    def slow_issue(*args: Any, **kwargs: Any) -> tuple[str, str]:
        time.sleep(RACE_SLEEP)  # o token antigo já foi marcado como usado, mas ainda sem commit
        return real_issue(*args, **kwargs)

    monkeypatch.setattr(auth_service, "issue_tokens", slow_issue)

    def send() -> int:
        return (
            TestClient(app)
            .post("/auth/token/refresh", cookies={"refresh_token": refresh_token})
            .status_code
        )

    statuses = sorted(race(send))

    assert statuses == [200, 401], "o mesmo refresh token renovou a sessão duas vezes"


def test_registries_created_at_the_same_time_get_different_codes(
    postgres_users: Callable[[], User],
) -> None:
    """O contador do código fica travado até o fim da transação: sem a trava, dois cadastros ao
    mesmo tempo leem o mesmo último número e um deles bate no índice único."""
    user_id = postgres_users().id
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    start = threading.Barrier(8)
    codes: list[str | None] = [None] * 8
    errors: list[BaseException] = []

    def create(index: int) -> None:
        try:
            with session_factory() as db:
                start.wait(timeout=10)
                data = RecordIn(name=f"Simultâneo {uuid.uuid4().hex[:8]}", nickname=f"Sim {index}")
                created = records_service.create(db, "suppliers", data, SimpleNamespace(id=user_id))  # type: ignore[arg-type]
                codes[index] = created["code"]
        except BaseException as exc:  # noqa: BLE001  o teste confere o que deu errado depois
            errors.append(exc)

    threads = [threading.Thread(target=create, args=(index,)) for index in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    try:
        assert errors == []
        assert len(set(codes)) == 8  # nenhum repetido
        numbers = sorted(int(code) for code in codes if code)
        assert numbers == list(range(numbers[0], numbers[0] + 8))  # e sem buraco
    finally:
        with session_factory() as db:
            db.execute(text("DELETE FROM suppliers WHERE name LIKE 'Simultâneo %'"))
            db.commit()
        # O histórico só recebe linhas novas: a role da app não apaga (REVOKE da e63f9c4a2b31).
        # Limpar é cortesia, e fica em transação à parte para não desfazer a limpeza acima.
        try:
            with session_factory() as db:
                db.execute(text("DELETE FROM record_events WHERE user_id = :id"), {"id": user_id})
                db.commit()
        except Exception:  # noqa: BLE001  shortcut: limpeza é cortesia, não regra do teste
            pass


def test_row_locks_are_accepted_by_postgres_on_tables_with_a_left_join() -> None:
    """O Postgres recusa FOR UPDATE no lado opcional de um LEFT JOIN, e a conta, o título e o centro
    de custo carregam a série ou o superior assim: sem `of=`, baixar, receber e editar davam erro.
    O Postgres reclama ao analisar a consulta, então basta pedir uma linha que não existe."""
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with session_factory() as db:
        with pytest.raises(payable_service.PayableNotFound):
            payable_service._get(db, 0, lock=True)
        with pytest.raises(receivable_service.ReceivableNotFound):
            receivable_service._get(db, 0, lock=True)
        with pytest.raises(records_service.RecordNotFound):
            records_service._get(db, "costCenters", 0)


@pytest.mark.usefixtures("per_request_db")  # conexões já abertas: abrir uma leva 2 s no Windows
def test_the_same_pix_in_two_payables_at_once_pays_only_once(
    postgres_users: Callable[[], User], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sem a trava por ID, as duas baixas leem "ainda não usado" e passam juntas: a trava de cada
    conta não ajuda, porque as contas são diferentes. Quem chega primeiro segura a janela depois
    de conferir o ID, e a segunda confere enquanto a primeira ainda não gravou."""
    original = payable_service._transaction_used

    def slow_check(db: Session, transaction_id: str) -> bool:
        used = original(db, transaction_id)
        time.sleep(RACE_SLEEP)
        return used

    monkeypatch.setattr(payable_service, "_transaction_used", slow_check)
    user_id = postgres_users().id
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    suffix = uuid.uuid4().hex[:8]
    transaction_id = f"E2E{suffix}"
    with session_factory() as db:
        company = Company(name=f"Concorrência {suffix}")
        db.add(company)
        db.flush()
        unit = BusinessUnit(company_id=company.id, name=f"Unidade {suffix}")
        center = CostCenter(name=f"Centro {suffix}")
        category = ExpenseCategory(code=f"C{suffix}", name=f"Categoria {suffix}")
        method = PaymentMethod(name=f"Pix {suffix}")
        account = BankAccount(company_id=company.id, name=f"Conta {suffix}")
        db.add_all([unit, center, category, method, account])
        db.flush()
        payable_ids = []
        for number in range(2):
            payable = Payable(
                origin="manual",
                company_id=company.id,
                unit_id=unit.id,
                cost_center_id=center.id,
                category_id=category.id,
                payment_method_id=method.id,
                payeeName="Fornecedor",
                description=f"Conta {number} {suffix}",
                issueDate=date(2026, 2, 1),
                dueDate=date(2026, 2, 10),
                amount=Decimal("100.00"),
            )
            db.add(payable)
            db.flush()
            payable_ids.append(payable.id)
        db.commit()
        account_id, method_id = account.id, method.id

    barrier = threading.Barrier(2)
    outcomes: list[str] = [""] * 2

    def pay(index: int) -> None:
        try:
            with session_factory() as db:
                barrier.wait(timeout=10)
                payable_service.pay(
                    db,
                    payable_ids[index],
                    PaymentCreate(
                        paidOn=payable_service.today(),
                        amount=Decimal("100.00"),
                        bankAccountId=account_id,
                        paymentMethodId=method_id,
                        # um digitado de um jeito, o outro de outro: é o mesmo ID
                        transactionId=transaction_id
                        if index == 0
                        else f" {transaction_id.lower()} ",
                    ),
                    SimpleNamespace(id=user_id),  # type: ignore[arg-type]
                )
                outcomes[index] = "pago"
        except payable_service.PayableConflict:
            outcomes[index] = "recusado"
        except BaseException as exc:  # noqa: BLE001  o teste confere o que deu errado depois
            outcomes[index] = f"erro: {exc!r}"

    threads = [threading.Thread(target=pay, args=(index,)) for index in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    with session_factory() as db:
        paid = (
            db.query(PayablePayment)
            .filter(PayablePayment.payable_id.in_(payable_ids), PayablePayment.kind == "pagamento")
            .count()
        )
    try:
        assert sorted(outcomes) == ["pago", "recusado"]
        assert paid == 1
    finally:
        # Baixa e histórico só recebem linhas novas (REVOKE para a role da app): limpar é cortesia
        # onde a role permite, e o banco de teste do CI é descartável de qualquer jeito.
        try:
            with session_factory() as db:
                for model, column in (
                    (PayablePayment, PayablePayment.payable_id),
                    (PayableEvent, PayableEvent.payable_id),
                    (Payable, Payable.id),
                ):
                    db.query(model).filter(column.in_(payable_ids)).delete(
                        synchronize_session=False
                    )
                db.commit()
        except Exception:  # noqa: BLE001  shortcut: limpeza é cortesia, não regra do teste
            pass
