# ruff: noqa: F811  (as fixtures importadas de test_receipts são reusadas pelo nome)
from collections.abc import Callable
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from models.connect_payable_item import ConnectPayableItem
from models.notification import Notification
from models.payable import Payable, PayableEvent, PayableItem, PayablePayment
from models.project_ref import ProjectRef
from models.receipt import PaymentReceipt, PaymentRequest, ReceiptAllocation, ReceiptBatch
from models.reference import (
    BankAccount,
    BusinessUnit,
    Company,
    CostCenter,
    ExpenseCategory,
    PaymentMethod,
)
from models.user import User
from services import payments
from services.auth import create_access_token
from services.connect_gateway import ConnectPayable, ConnectProject
from tests.conftest import TOTP_SECRET
from tests.fakes import FakeConnect
from tests.test_receipts import (  # noqa: F401
    IN_PROJECT,
    OUT_OF_PROJECT,
    add_items,
    base,
    connect,
    detail,
    open_batch,
    pdf,
    project,
    send,
    text,
)


@pytest.fixture
def auth(make_user: Callable[..., User]) -> dict[str, str]:
    # sem MFA cadastrado: o código do autenticador tem teste próprio
    return {"Authorization": f"Bearer {create_access_token(make_user(mfa=False).id, via_sso=True)}"}


def confirm(
    client: TestClient, project: ProjectRef, auth: dict[str, str], batch: int, **body: object
) -> Any:
    return client.post(f"{base(project)}/{batch}/confirm", json=body, headers=auth)


def two_items_and_four_pix(
    client: TestClient, db: Session, project: ProjectRef, auth: dict[str, str]
) -> int:
    """Exemplo 1 do handoff/08: Pix de 30, 20, 20 e 20 para duas entrevistas de 20."""
    add_items(db, project, "20.00", "20.00")
    batch = open_batch(client, project, auth)
    send(
        client,
        project,
        auth,
        batch,
        pdf(
            text(IN_PROJECT, "30,00", "E1", day="01/02/2026"),
            text(IN_PROJECT, "20,00", "E2", day="02/02/2026"),
            text(IN_PROJECT, "20,00", "E3", day="03/02/2026"),
            text(IN_PROJECT, "20,00", "E4", day="04/02/2026"),
        ),
    )
    return batch


# ---- Confirmar baixa ----


def test_confirming_pays_only_what_closes_and_asks_the_connect_once_per_pix(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    batch = two_items_and_four_pix(client, db_session, project, auth)

    response = confirm(client, project, auth, batch)

    assert response.status_code == 200, response.text
    assert response.json() == {
        "paidReceipts": 2,
        "paidItems": 2,
        "paidTotal": "40.00",
        "awaitingConnect": 0,
        "refused": 0,
    }
    receipts = db_session.query(PaymentReceipt).order_by(PaymentReceipt.id).all()
    assert [r.status for r in receipts] == ["pendente", "pago", "pago", "pendente"]
    assert db_session.query(ReceiptAllocation).count() == 2
    # um pedido por Pix, com a referência estável como Idempotency-Key
    assert [(o.payment_ref, o.amount, o.paid_on) for o in connect.orders] == [
        (f"fin-pay-{receipts[1].id:06d}", Decimal("20.00"), date(2026, 2, 2)),
        (f"fin-pay-{receipts[2].id:06d}", Decimal("20.00"), date(2026, 2, 3)),
    ]
    assert all(o.interviewer_id == 87 and o.connect_project_id == 12 for o in connect.orders)
    assert {r.status for r in db_session.query(PaymentRequest)} == {"aplicada"}
    # o item só fica pago no espelho depois que o Connect confirmou, com a data do Pix
    items = db_session.query(ConnectPayableItem).order_by(ConnectPayableItem.id).all()
    assert [(i.status, i.paidOn) for i in items] == [
        ("pago", date(2026, 2, 2)),
        ("pago", date(2026, 2, 3)),
    ]
    assert all(a.connectAckAt is not None for a in db_session.query(ReceiptAllocation))
    assert db_session.get(ReceiptBatch, batch).status == "confirmado"  # type: ignore[union-attr]


def test_confirming_twice_is_409_and_pays_nothing_again(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    batch = two_items_and_four_pix(client, db_session, project, auth)
    confirm(client, project, auth, batch)
    again = confirm(client, project, auth, batch)
    assert (again.status_code, again.json()["detail"]) == (
        409,
        "Esse envio já foi confirmado e não pode mais ser alterado",
    )
    assert len(connect.orders) == 2
    assert db_session.query(ReceiptAllocation).count() == 2


def test_confirming_with_missing_parts_is_409(
    client: TestClient, project: ProjectRef, auth: dict[str, str], connect: FakeConnect
) -> None:
    batch = open_batch(client, project, auth, parts=2)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    response = confirm(client, project, auth, batch)
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "Ainda faltam partes do PDF para terminar de enviar",
    )


def test_the_same_pdf_in_a_new_batch_is_a_duplicate_after_the_payment(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00", "20.00")
    first = open_batch(client, project, auth)
    send(client, project, auth, first, pdf(text(IN_PROJECT, "20,00", "E1")))
    confirm(client, project, auth, first)

    second = open_batch(client, project, auth)
    send(client, project, auth, second, pdf(text(IN_PROJECT, "20,00", "E1")))
    assert detail(client, project, auth, second)["receipts"][0]["group"] == "duplicado"
    assert confirm(client, project, auth, second).json()["paidReceipts"] == 0
    assert len(connect.orders) == 1


def test_a_pix_paid_by_another_batch_while_this_one_waited_becomes_a_duplicate(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00", "20.00")
    waiting = open_batch(client, project, auth)
    send(client, project, auth, waiting, pdf(text(IN_PROJECT, "20,00", "E1")))
    other = open_batch(client, project, auth)
    send(client, project, auth, other, pdf(text(IN_PROJECT, "20,00", "E1")))
    confirm(client, project, auth, other)

    result = confirm(client, project, auth, waiting)
    assert result.json()["paidReceipts"] == 0
    receipt = db_session.query(PaymentReceipt).filter_by(batch_id=waiting).one()
    assert (receipt.group, receipt.status) == ("duplicado", "pendente")
    assert len(connect.orders) == 1


def test_someone_outside_the_project_is_never_paid_and_an_empty_confirmation_is_allowed(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00", interviewer=91)
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(OUT_OF_PROJECT, "20,00", "E2")))
    result = confirm(client, project, auth, batch)
    assert result.status_code == 200 and result.json()["paidReceipts"] == 0
    assert connect.orders == []
    assert db_session.get(ReceiptBatch, batch).status == "confirmado"  # type: ignore[union-attr]
    assert {i.status for i in db_session.query(ConnectPayableItem)} == {"a_pagar"}


def test_a_discarded_receipt_is_not_paid(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00")
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    receipt_id = detail(client, project, auth, batch)["receipts"][0]["id"]
    client.patch(
        f"{base(project)}/{batch}/receipts/{receipt_id}", json={"discarded": True}, headers=auth
    )
    assert confirm(client, project, auth, batch).json()["paidReceipts"] == 0
    assert connect.orders == []


def test_the_confirmation_rereads_the_items_in_the_connect(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    # o espelho está vazio: quem sabe o que há a pagar é o Connect, lido na hora de confirmar
    when = datetime(2026, 1, 3, tzinfo=UTC)
    connect.payables = [
        ConnectPayable(
            5531, 87, 12, Decimal("20.00"), when, date(2026, 2, 3), "to_pay", None, when
        ),
        ConnectPayable(
            5532, 87, 12, Decimal("20.00"), when, date(2026, 2, 3), "paid", date(2026, 1, 9), when
        ),
    ]
    batch = open_batch(client, project, auth)
    send(
        client,
        project,
        auth,
        batch,
        pdf(
            text(IN_PROJECT, "20,00", "E1", day="01/02/2026"),
            text(IN_PROJECT, "20,00", "E2", day="02/02/2026"),
        ),
    )
    result = confirm(client, project, auth, batch).json()
    # o segundo item já estava pago no Connect: sobra um Pix sem o que pagar
    assert (result["paidReceipts"], result["paidItems"]) == (1, 1)
    assert connect.orders[0].interview_ids == [5531]


def test_an_older_read_does_not_undo_what_the_mirror_already_knows(
    db_session: Session, project: ProjectRef
) -> None:
    from services.connect_sync import sync_items

    new = datetime(2026, 3, 1, tzinfo=UTC)
    old = datetime(2026, 1, 1, tzinfo=UTC)
    fake = FakeConnect(
        payables=[
            ConnectPayable(
                7, 87, 12, Decimal("20.00"), old, date(2026, 2, 1), "paid", date(2026, 2, 1), new
            )
        ]
    )
    sync_items(db_session, fake, project, {87})
    fake.payables = [
        ConnectPayable(7, 87, 12, Decimal("20.00"), old, date(2026, 2, 1), "to_pay", None, old)
    ]
    sync_items(db_session, fake, project, {87})
    assert db_session.query(ConnectPayableItem).one().status == "pago"


# ---- Connect falha ou recusa ----


def test_connect_down_after_confirming_keeps_the_request_and_never_marks_the_item_paid(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00")
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    connect.payment_down = True

    result = confirm(client, project, auth, batch).json()

    assert (result["paidReceipts"], result["awaitingConnect"]) == (1, 1)
    request = db_session.query(PaymentRequest).one()
    assert request.status == "pendente_envio"
    assert db_session.query(ConnectPayableItem).one().status == "a_pagar"
    assert detail(client, project, auth, batch)["receipts"][0]["payment"] == "aguardando_connect"

    # quando o Connect volta, a rodada seguinte aplica, sem pagar de novo
    connect.payment_down = False
    assert payments.dispatch(db_session, connect) == 1
    assert payments.dispatch(db_session, connect) == 0
    db_session.refresh(request)
    assert request.status == "aplicada"
    assert len(connect.orders) == 1
    assert db_session.query(ConnectPayableItem).one().status == "pago"


def test_a_lost_response_is_checked_and_not_paid_twice(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00")
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    connect.lose_response = True  # o Connect aplicou, mas a resposta não voltou

    assert confirm(client, project, auth, batch).json()["awaitingConnect"] == 0
    assert len(connect.orders) == 1
    assert db_session.query(PaymentRequest).one().status == "aplicada"


def test_a_lost_request_is_sent_again_with_the_same_key(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00")
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    connect.lose_request = True  # o pedido nem chegou ao Connect

    confirm(client, project, auth, batch)

    assert len(connect.orders) == 2
    assert connect.orders[0].payment_ref == connect.orders[1].payment_ref
    assert db_session.query(PaymentRequest).one().status == "aplicada"


@pytest.mark.parametrize(
    ("code", "message"),
    [
        ("already_paid", "O Connect já tinha essas entrevistas como pagas"),
        ("duplicate_e2e", "O Connect já recebeu esse Pix em outra baixa"),
        ("amount_mismatch", "O valor do Pix não bate com a soma das entrevistas no Connect"),
    ],
)
def test_a_refusal_from_the_connect_becomes_a_divergence_and_is_never_fixed_alone(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
    code: str,
    message: str,
) -> None:
    add_items(db_session, project, "20.00")
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    connect.refuse = code

    result = confirm(client, project, auth, batch).json()

    assert (result["paidReceipts"], result["refused"]) == (1, 1)
    request = db_session.query(PaymentRequest).one()
    assert (request.status, request.lastError) == ("recusada", code)
    # o espelho não muda e a rodada seguinte não tenta de novo
    assert db_session.query(ConnectPayableItem).one().status == "a_pagar"
    assert payments.dispatch(db_session, connect) == 0
    assert len(connect.orders) == 1
    row = detail(client, project, auth, batch)["receipts"][0]
    assert (row["payment"], row["paymentMessage"]) == ("recusada", message)
    (divergence,) = client.get(f"/projects/{project.id}/finance/divergences", headers=auth).json()
    assert divergence["code"] == code and divergence["message"] == message
    assert divergence["keyMasked"] == "mar***@exemplo.com"


def test_connect_down_while_rereading_stops_the_confirmation_before_anything_is_saved(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00")
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    connect.down = True

    response = confirm(client, project, auth, batch)

    assert response.status_code == 503
    assert db_session.get(ReceiptBatch, batch).status == "pronto"  # type: ignore[union-attr]
    assert db_session.query(ReceiptAllocation).count() == 0
    assert db_session.query(PaymentRequest).count() == 0


# ---- Quem confirma ----


def test_who_has_mfa_must_type_the_code_to_confirm(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    make_user: Callable[..., User],
    connect: FakeConnect,
) -> None:
    user = make_user()  # com MFA
    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    add_items(db_session, project, "20.00")
    batch = open_batch(client, project, headers)
    send(client, project, headers, batch, pdf(text(IN_PROJECT, "20,00", "E1")))

    missing = confirm(client, project, headers, batch)
    wrong = confirm(client, project, headers, batch, code="000000")
    assert (missing.status_code, missing.json()["detail"]) == (
        401,
        "Código de verificação inválido",
    )
    assert wrong.status_code == 401
    assert connect.orders == []

    ok = confirm(client, project, headers, batch, code=pyotp.TOTP(TOTP_SECRET).now())
    assert ok.status_code == 200 and ok.json()["paidReceipts"] == 1


def test_confirming_needs_a_finance_role(
    client: TestClient,
    project: ProjectRef,
    make_user: Callable[..., User],
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    batch = open_batch(client, project, auth)
    reader = make_user(email="leitor@exemplo.com", role="leitor", mfa=False)
    outsider = {"Authorization": f"Bearer {create_access_token(reader.id, via_sso=True)}"}
    assert confirm(client, project, outsider, batch).status_code == 403
    assert client.post(f"{base(project)}/{batch}/confirm", json={}).status_code == 401


# ---- A baixa aparece no lançamento ----


@pytest.fixture
def payable_world(db_session: Session) -> dict[str, object]:
    company = Company(name="PPlus")
    db_session.add(company)
    db_session.flush()
    unit = BusinessUnit(company_id=company.id, name="Consumo SP")
    center = CostCenter(name="Campo")
    category = ExpenseCategory(code="2.01", name="Pessoal de campo")
    method = PaymentMethod(name="Pix")
    account = BankAccount(company_id=company.id, name="Itaú · PPlus")
    db_session.add_all([unit, center, category, method, account])
    db_session.flush()
    payable = Payable(
        origin="connect",
        company_id=company.id,
        unit_id=unit.id,
        cost_center_id=center.id,
        category_id=category.id,
        payment_method_id=method.id,
        payeeName="Entrevistadores",
        description="Entrevistadores · PRJ-12",
        issueDate=date(2026, 2, 1),
        dueDate=date(2026, 2, 10),
        amount=Decimal("40.00"),
    )
    db_session.add(payable)
    db_session.commit()
    return {"payable": payable, "account": account, "method": method}


def open_linked(
    client: TestClient, project: ProjectRef, auth: dict[str, str], payable: Payable
) -> int:
    response = client.post(base(project), json={"parts": 1, "payableId": payable.id}, headers=auth)
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def test_the_payment_shows_up_in_the_payable_the_pdf_was_sent_from(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
    payable_world: dict[str, object],
) -> None:
    payable: Payable = payable_world["payable"]  # type: ignore[assignment]
    account: BankAccount = payable_world["account"]  # type: ignore[assignment]
    method: PaymentMethod = payable_world["method"]  # type: ignore[assignment]
    add_items(db_session, project, "20.00", "20.00")
    batch = open_linked(client, project, auth, payable)
    send(
        client,
        project,
        auth,
        batch,
        pdf(
            text(IN_PROJECT, "20,00", "E1", day="02/02/2026"),
            text(IN_PROJECT, "20,00", "E2", day="03/02/2026"),
        ),
    )

    no_account = confirm(client, project, auth, batch)
    assert (no_account.status_code, no_account.json()["detail"]) == (
        422,
        "Escolha a conta bancária e a forma de pagamento",
    )
    assert db_session.get(ReceiptBatch, batch).status == "pronto"  # type: ignore[union-attr]

    done = confirm(
        client, project, auth, batch, bankAccountId=account.id, paymentMethodId=method.id
    )

    assert done.status_code == 200, done.text
    payments_made = db_session.query(PayablePayment).order_by(PayablePayment.id).all()
    assert [(p.amount, p.paidOn, p.transactionId) for p in payments_made] == [
        (Decimal("20.00"), date(2026, 2, 2), "E1"),
        (Decimal("20.00"), date(2026, 2, 3), "E2"),
    ]
    assert db_session.query(PayableEvent).filter_by(payable_id=payable.id).count() == 1
    detail_response = client.get(f"/payables/{payable.id}", headers=auth)
    assert detail_response.status_code == 200
    assert Decimal(str(detail_response.json()["paid"])) == Decimal("40.00")


def test_a_payment_above_the_payable_balance_is_refused_and_saves_nothing(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
    payable_world: dict[str, object],
) -> None:
    payable: Payable = payable_world["payable"]  # type: ignore[assignment]
    payable.amount = Decimal("10.00")
    db_session.commit()
    add_items(db_session, project, "20.00")
    batch = open_linked(client, project, auth, payable)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    account: BankAccount = payable_world["account"]  # type: ignore[assignment]
    method: PaymentMethod = payable_world["method"]  # type: ignore[assignment]

    response = confirm(
        client, project, auth, batch, bankAccountId=account.id, paymentMethodId=method.id
    )

    assert response.status_code == 409
    assert response.json()["detail"].startswith("O valor passa do saldo pendente")
    assert db_session.query(PaymentRequest).count() == 0
    assert db_session.query(ReceiptAllocation).count() == 0
    assert connect.orders == []


def test_a_batch_of_an_unknown_payable_is_404(
    client: TestClient, project: ProjectRef, auth: dict[str, str], connect: FakeConnect
) -> None:
    response = client.post(base(project), json={"parts": 1, "payableId": 999}, headers=auth)
    assert (response.status_code, response.json()["detail"]) == (404, "Lançamento não encontrado")


# ---- Nomes, avisos e projetos ----


def test_the_name_of_someone_in_the_project_comes_from_the_connect(
    client: TestClient,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    connect.names = {87: "Maria Exemplo"}
    batch = open_batch(client, project, auth)
    send(
        client,
        project,
        auth,
        batch,
        pdf(
            text(IN_PROJECT, "20,00", "E1", name="NOME DO COMPROVANTE"),
            text(OUT_OF_PROJECT, "20,00", "E2"),
        ),
    )
    rows = detail(client, project, auth, batch)["receipts"]
    assert rows[0]["name"] == "Maria Exemplo"  # nunca o nome lido do comprovante
    assert rows[1]["name"] is None

    connect.down = True  # sem o Connect a tela segue, só sem o nome
    assert detail(client, project, auth, batch)["receipts"][0]["name"] is None


def test_a_ready_batch_with_people_outside_the_project_warns_admins_and_finance(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    make_user: Callable[..., User],
    connect: FakeConnect,
) -> None:
    finance = make_user(email="fin@exemplo.com", mfa=False)
    admin = make_user(email="adm@exemplo.com", role="admin", mfa=False)
    other = make_user(email="leitor@exemplo.com", role="leitor", mfa=False)
    headers = {"Authorization": f"Bearer {create_access_token(finance.id, via_sso=True)}"}
    batch = open_batch(client, project, headers)
    send(client, project, headers, batch, pdf(text(OUT_OF_PROJECT, "20,00", "E2")))

    assert {n.user_id for n in db_session.query(Notification)} == {finance.id, admin.id}
    assert other.id not in {n.user_id for n in db_session.query(Notification)}
    (notice,) = client.get("/notifications", headers=headers).json()
    assert notice["type"] == "receipt_out_of_project"
    assert notice["title"] == "1 comprovante de pessoa fora do projeto Pesquisa de mobilidade"
    assert notice["readAt"] is None

    assert client.post(f"/notifications/{notice['id']}/read", headers=headers).status_code == 204
    assert client.get("/notifications", headers=headers).json()[0]["readAt"] is not None
    # o aviso de outra pessoa não é seu
    admin_headers = {"Authorization": f"Bearer {create_access_token(admin.id, via_sso=True)}"}
    other_notice = client.get("/notifications", headers=admin_headers).json()[0]["id"]
    assert client.post(f"/notifications/{other_notice}/read", headers=headers).status_code == 404


def test_a_ready_batch_with_everyone_in_the_project_warns_nobody(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    assert db_session.query(Notification).count() == 0


def test_projects_come_from_the_connect_and_are_listed_to_pick_one(
    client: TestClient, db_session: Session, auth: dict[str, str], connect: FakeConnect
) -> None:
    connect.projects = [
        ConnectProject(12, "Pesquisa de mobilidade", 30),
        ConnectProject(13, "Outra", None),
    ]
    assert client.get("/finance/projects", headers=auth).json() == []
    synced = client.post("/finance/connect/sync", headers=auth)
    assert synced.status_code == 200
    assert [p["title"] for p in synced.json()] == ["Outra", "Pesquisa de mobilidade"]
    # repetir não duplica e atualiza o título
    connect.projects = [ConnectProject(12, "Mobilidade urbana", 45)]
    again = client.post("/finance/connect/sync", headers=auth).json()
    assert [p["title"] for p in again] == ["Mobilidade urbana", "Outra"]
    assert db_session.query(ProjectRef).count() == 2

    connect.down = True
    assert client.post("/finance/connect/sync", headers=auth).status_code == 503


def test_a_failure_while_warning_never_loses_the_receipts_already_read(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    make_user: Callable[..., User],
    connect: FakeConnect,
) -> None:
    finance = make_user(email="fin@exemplo.com", mfa=False)
    headers = {"Authorization": f"Bearer {create_access_token(finance.id, via_sso=True)}"}
    Notification.__table__.drop(bind=db_session.get_bind())  # type: ignore[attr-defined]
    batch = open_batch(client, project, headers)

    response = send(client, project, headers, batch, pdf(text(OUT_OF_PROJECT, "20,00", "E2")))

    assert response.status_code == 200
    assert db_session.query(PaymentReceipt).count() == 1
    assert db_session.get(ReceiptBatch, batch).status == "pronto"  # type: ignore[union-attr]


def add_people(db: Session, payable: Payable, *people: tuple[int | None, str]) -> list[PayableItem]:
    items = [
        PayableItem(
            payable_id=payable.id,
            name=f"Pessoa {n}",
            documentType="RPA",
            amount=Decimal(amount),
            connect_interviewer_id=person,
        )
        for n, (person, amount) in enumerate(people, start=1)
    ]
    db.add_all(items)
    db.commit()
    return items


def test_the_people_of_the_payable_show_who_was_paid_and_when(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
    payable_world: dict[str, object],
) -> None:
    payable: Payable = payable_world["payable"]  # type: ignore[assignment]
    account: BankAccount = payable_world["account"]  # type: ignore[assignment]
    method: PaymentMethod = payable_world["method"]  # type: ignore[assignment]
    # a pessoa 87 tem duas linhas de 20 e uma de 30; a 91 não recebeu Pix; uma não é do Connect
    paid_two, paid_one_more, partial, other, outsider = add_people(
        db_session,
        payable,
        (87, "20.00"),
        (87, "20.00"),
        (87, "30.00"),
        (91, "20.00"),
        (None, "20.00"),
    )
    add_items(db_session, project, "20.00", "20.00")
    batch = open_linked(client, project, auth, payable)
    send(
        client,
        project,
        auth,
        batch,
        pdf(
            text(IN_PROJECT, "20,00", "E1", day="02/02/2026"),
            text(IN_PROJECT, "20,00", "E2", day="03/02/2026"),
        ),
    )

    confirm(client, project, auth, batch, bankAccountId=account.id, paymentMethodId=method.id)

    for item in (paid_two, paid_one_more, partial, other, outsider):
        db_session.refresh(item)
    # os dois Pix (40) pagam as duas primeiras de 20, com o dia do último Pix; a de 30 fica a pagar
    assert (paid_two.paidOn, paid_one_more.paidOn) == (date(2026, 2, 3), date(2026, 2, 3))
    assert (partial.paidOn, other.paidOn, outsider.paidOn) == (None, None, None)
    shown = client.get(f"/payables/{payable.id}", headers=auth).json()["items"]
    assert [i["paidOn"] for i in shown] == ["2026-02-03", "2026-02-03", None, None, None]


# ---- Despachante em segundo plano ----


def waiting_request(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> PaymentRequest:
    add_items(db_session, project, "20.00")
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    connect.payment_down = True
    confirm(client, project, auth, batch)
    connect.payment_down = False
    request = db_session.query(PaymentRequest).one()
    assert request.status == "pendente_envio"
    return request


def test_the_dispatcher_sends_what_was_waiting_for_the_connect(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    from core.dispatcher import run_once

    request = waiting_request(client, db_session, project, auth, connect)

    own_session = sessionmaker(bind=db_session.get_bind())  # a rodada fecha a sessão que usa
    assert run_once(connect, own_session) == 1
    assert run_once(connect, own_session) == 0  # nada a reenviar, nada duplicado
    db_session.refresh(request)
    assert request.status == "aplicada"
    assert len(connect.orders) == 1


def test_a_failing_round_never_breaks_the_dispatcher(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from core import dispatcher

    waiting_request(client, db_session, project, auth, connect)

    def broken(*args: object, **kwargs: object) -> int:
        raise RuntimeError("falha inesperada")

    monkeypatch.setattr(dispatcher.payments, "dispatch", broken)
    assert dispatcher.run_once(connect, sessionmaker(bind=db_session.get_bind())) == 0


def test_the_loop_runs_every_interval_and_stops_when_cancelled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    from core import dispatcher

    calls: list[int] = []

    def counting() -> int:
        calls.append(1)
        return 0

    monkeypatch.setattr(dispatcher, "run_once", counting)

    async def scenario() -> None:
        task = asyncio.create_task(dispatcher.dispatch_loop(0.01))
        await asyncio.sleep(0.15)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(scenario())
    assert len(calls) >= 2


def test_the_dispatcher_is_off_by_default() -> None:
    from core import config

    assert config.PAYMENT_DISPATCH_SECONDS == 0


def test_a_refusal_warns_the_team_and_shows_in_the_list_of_all_projects(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00")
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    connect.refuse = "already_paid"

    confirm(client, project, auth, batch)

    (notice,) = [n for n in client.get("/notifications", headers=auth).json()]
    assert notice["type"] == "payment_refused"
    assert notice["title"] == "O Connect recusou uma baixa"
    assert notice["body"] == "O Connect já tinha essas entrevistas como pagas"
    assert notice["link"] == "/divergencias"
    (row,) = client.get("/finance/divergences", headers=auth).json()
    assert (row["projectTitle"], row["code"], row["keyMasked"]) == (
        "Pesquisa de mobilidade",
        "already_paid",
        "mar***@exemplo.com",
    )
    # sem login, nada de divergência
    assert (
        client.get("/finance/divergences", headers={"Authorization": "Bearer x"}).status_code == 401
    )
