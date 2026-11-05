import logging
import unicodedata
from collections.abc import Callable
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.crypto import decrypt_payload
from db.connection import Base
from main import app
from models.connect_payable_item import ConnectPayableItem
from models.project_ref import ProjectRef
from models.receipt import PaymentReceipt, ReceiptBatch, ReceiptBatchPart
from models.user import User
from services import batches
from services.auth import create_access_token
from services.connect_gateway import KeyMatch, get_connect
from tests.fakes import FakeConnect
from tests.test_receipt_parser import minimal_pdf, receipt_text

IN_PROJECT = "maria@exemplo.com"
OUT_OF_PROJECT = "joao@exemplo.com"
UNKNOWN = "ninguem@exemplo.com"


def pdf(*texts: str) -> bytes:
    """PDF fictício montado no teste, sem acento (a fonte do PDF mínimo não tem)."""
    plain = unicodedata.normalize("NFKD", "\n".join(texts)).encode("ascii", "ignore").decode()
    return minimal_pdf([line for line in plain.splitlines() if line])


def text(key: str, amount: str, e2e: str, day: str = "18/02/2026", name: str = "FULANA") -> str:
    return receipt_text(key=key, amount=f"R$ {amount}", e2e=e2e, day=day, name=name)


@pytest.fixture
def connect() -> FakeConnect:
    fake = FakeConnect(
        {
            IN_PROJECT: KeyMatch(87, True),
            OUT_OF_PROJECT: KeyMatch(91, False),
        }
    )
    app.dependency_overrides[get_connect] = lambda: fake
    return fake


@pytest.fixture
def project(db_session: Session) -> ProjectRef:
    ref = ProjectRef(connect_project_id=12, title="Pesquisa de mobilidade")
    db_session.add(ref)
    db_session.commit()
    return ref


@pytest.fixture
def auth(make_user: Callable[..., User]) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(make_user().id)}"}


def add_items(db: Session, project: ProjectRef, *amounts: str, interviewer: int = 87) -> None:
    first = db.query(ConnectPayableItem).count()
    for number, amount in enumerate(amounts, start=first + 1):
        db.add(
            ConnectPayableItem(
                connect_interview_id=5000 + number,
                project_ref_id=project.id,
                connect_interviewer_id=interviewer,
                amount=Decimal(amount),
                launchedAt=datetime(2026, 1, number, tzinfo=UTC),
                dueOn=date(2026, 2, number),
                connectUpdatedAt=datetime(2026, 1, number, tzinfo=UTC),
            )
        )
    db.commit()


def base(project: ProjectRef) -> str:
    return f"/projects/{project.id}/finance/receipt-batches"


def open_batch(
    client: TestClient, project: ProjectRef, auth: dict[str, str], parts: int = 1
) -> int:
    response = client.post(base(project), json={"parts": parts}, headers=auth)
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


def send(
    client: TestClient,
    project: ProjectRef,
    auth: dict[str, str],
    batch: int,
    content: bytes,
    part: int = 0,
    offset: int = 0,
) -> Any:
    return client.put(
        f"{base(project)}/{batch}/parts/{part}",
        files={"file": ("parte.pdf", content, "application/pdf")},
        data={"page_offset": str(offset)},
        headers=auth,
    )


def detail(client: TestClient, project: ProjectRef, auth: dict[str, str], batch: int) -> Any:
    response = client.get(f"{base(project)}/{batch}", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


# ---- Envio e classificação ----


def test_every_group_is_classified_and_the_batch_becomes_ready(
    client: TestClient, project: ProjectRef, auth: dict[str, str], connect: FakeConnect
) -> None:
    batch = open_batch(client, project, auth)
    content = pdf(
        text(IN_PROJECT, "20,00", "E1"),
        text(OUT_OF_PROJECT, "20,00", "E2"),
        text(UNKNOWN, "20,00", "E3", name="PESSOA DESCONHECIDA"),
        text("", "20,00", "E4"),
        text(IN_PROJECT, "20,00", "E1"),  # o mesmo Pix de novo, no mesmo envio
    )
    response = send(client, project, auth, batch, content)
    assert response.status_code == 200, response.text
    assert response.json()["receiptsCount"] == 5

    body = detail(client, project, auth, batch)
    assert body["status"] == "pronto"
    groups = [r["group"] for r in body["receipts"]]
    assert groups == [
        "no_projeto",
        "fora_do_projeto",
        "chave_nao_cadastrada",
        "erro_leitura",
        "duplicado",
    ]
    by_group = {r["group"]: r for r in body["receipts"]}
    # o nome lido só aparece para chave que ninguém tem
    assert by_group["chave_nao_cadastrada"]["name"] == "PESSOA DESCONHECIDA"
    assert by_group["no_projeto"]["name"] is None
    assert by_group["fora_do_projeto"]["name"] is None
    assert by_group["erro_leitura"]["error"] == "Não foi possível ler: chave"
    assert by_group["no_projeto"]["keyMasked"] == "mar***@exemplo.com"
    # o Connect foi perguntado com o ID do projeto dele, e só pelas chaves lidas
    assert connect.calls[0][0] == 12
    assert set(connect.calls[0][1].values()) == {IN_PROJECT, OUT_OF_PROJECT, UNKNOWN}


def test_the_full_key_and_the_receiver_name_are_never_stored_in_clear(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    batch = open_batch(client, project, auth)
    send(
        client, project, auth, batch, pdf(text(UNKNOWN, "20,00", "E3", name="PESSOA DESCONHECIDA"))
    )
    row = db_session.query(PaymentReceipt).one()
    stored = " ".join(
        str(v) for v in (row.payeeKeyHash, row.payeeKeyMasked, row.payeeNameEncrypted, row.error)
    )
    assert UNKNOWN not in stored and "PESSOA" not in stored
    assert len(row.payeeKeyHash or "") == 64
    assert decrypt_payload(row.payeeNameEncrypted or "", batches.ENCRYPTION_CONTEXT) == (
        "PESSOA DESCONHECIDA"
    )
    assert UNKNOWN not in caplog.text and "PESSOA DESCONHECIDA" not in caplog.text


def test_sending_the_same_part_twice_does_not_duplicate(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    batch = open_batch(client, project, auth, parts=2)
    content = pdf(text(IN_PROJECT, "20,00", "E1"))
    send(client, project, auth, batch, content)
    send(client, project, auth, batch, content)
    assert db_session.query(PaymentReceipt).count() == 1
    assert db_session.query(ReceiptBatchPart).count() == 1
    assert detail(client, project, auth, batch)["status"] == "enviando"


def test_page_offset_shows_the_page_of_the_original_pdf(
    client: TestClient, project: ProjectRef, auth: dict[str, str], connect: FakeConnect
) -> None:
    batch = open_batch(client, project, auth, parts=2)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")), part=1, offset=25)
    assert detail(client, project, auth, batch)["receipts"][0]["page"] == 26


def test_an_unreadable_part_is_registered_and_the_batch_goes_on(
    client: TestClient, project: ProjectRef, auth: dict[str, str], connect: FakeConnect
) -> None:
    batch = open_batch(client, project, auth)
    assert send(client, project, auth, batch, b"isto nao e um pdf").status_code == 200
    body = detail(client, project, auth, batch)
    assert body["status"] == "pronto"
    assert body["partErrors"] == [{"partIndex": 0, "error": "O arquivo não é um PDF"}]


def test_a_paid_pix_in_another_batch_shows_as_duplicate(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    old = open_batch(client, project, auth)
    send(client, project, auth, old, pdf(text(IN_PROJECT, "20,00", "E1")))
    db_session.query(PaymentReceipt).update({"status": "pago"})
    db_session.commit()

    new = open_batch(client, project, auth)
    send(client, project, auth, new, pdf(text(IN_PROJECT, "20,00", "E1")))
    assert detail(client, project, auth, new)["receipts"][0]["group"] == "duplicado"


def test_a_batch_that_was_only_checked_does_not_lock_the_same_pdf(
    client: TestClient, project: ProjectRef, auth: dict[str, str], connect: FakeConnect
) -> None:
    first, second = (open_batch(client, project, auth) for _ in range(2))
    for batch in (first, second):
        send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    assert detail(client, project, auth, second)["receipts"][0]["group"] == "no_projeto"


# ---- Conferência ----


def test_reconciliation_by_exact_sum_is_computed_on_the_fly(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00", "20.00")
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
    receipts = detail(client, project, auth, batch)["receipts"]
    assert [r["reconcileStatus"] for r in receipts] == [
        "nao_fecha",
        "bate",
        "bate",
        "pago_a_mais",
    ]
    assert (
        receipts[3]["message"] == "Valor maior que o a pagar. Lance a produção antes de dar baixa"
    )
    # nada foi gravado pela conferência: os itens continuam a pagar
    assert {i.status for i in db_session.query(ConnectPayableItem)} == {"a_pagar"}
    assert {r.status for r in db_session.query(PaymentReceipt)} == {"pendente"}


def test_only_receipts_in_the_project_are_reconciled(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    add_items(db_session, project, "20.00", interviewer=91)
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(OUT_OF_PROJECT, "20,00", "E2")))
    assert detail(client, project, auth, batch)["receipts"][0]["reconcileStatus"] is None


def test_a_discarded_receipt_leaves_the_reconciliation_and_can_come_back(
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
    url = f"{base(project)}/{batch}/receipts/{receipt_id}"

    gone = client.patch(url, json={"discarded": True}, headers=auth)
    assert gone.status_code == 200
    assert gone.json()["status"] == "descartado" and gone.json()["reconcileStatus"] is None
    back = client.patch(url, json={"discarded": False}, headers=auth)
    assert back.json()["status"] == "pendente" and back.json()["reconcileStatus"] == "bate"


# ---- Casos negados ----


def test_requests_without_login_or_without_the_role_are_refused(
    client: TestClient,
    project: ProjectRef,
    make_user: Callable[..., User],
    connect: FakeConnect,
) -> None:
    assert client.post(base(project), json={"parts": 1}).status_code == 401
    outsider = {"Authorization": f"Bearer {create_access_token(make_user(role='leitor').id)}"}
    refused = client.post(base(project), json={"parts": 1}, headers=outsider)
    assert refused.status_code == 403


@pytest.mark.parametrize("parts", [0, 10001])
def test_parts_out_of_range_are_refused(
    client: TestClient, project: ProjectRef, auth: dict[str, str], parts: int
) -> None:
    assert client.post(base(project), json={"parts": parts}, headers=auth).status_code == 422


def test_unknown_project_batch_and_receipt_are_404_with_their_own_message(
    client: TestClient, project: ProjectRef, auth: dict[str, str], connect: FakeConnect
) -> None:
    ghost = client.post("/projects/999/finance/receipt-batches", json={"parts": 1}, headers=auth)
    assert (ghost.status_code, ghost.json()["detail"]) == (404, "Projeto não encontrado")
    missing = client.get(f"{base(project)}/999", headers=auth)
    assert (missing.status_code, missing.json()["detail"]) == (
        404,
        "Envio de comprovantes não encontrado",
    )
    batch = open_batch(client, project, auth)
    no_receipt = client.patch(
        f"{base(project)}/{batch}/receipts/999", json={"discarded": True}, headers=auth
    )
    assert (no_receipt.status_code, no_receipt.json()["detail"]) == (
        404,
        "Comprovante não encontrado",
    )


def test_a_batch_of_another_project_is_not_found(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    other = ProjectRef(connect_project_id=13, title="Outro")
    db_session.add(other)
    db_session.commit()
    batch = open_batch(client, project, auth)
    assert client.get(f"{base(other)}/{batch}", headers=auth).status_code == 404


def test_part_index_outside_the_batch_is_422(
    client: TestClient, project: ProjectRef, auth: dict[str, str], connect: FakeConnect
) -> None:
    batch = open_batch(client, project, auth, parts=2)
    response = send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")), part=2)
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Parte fora do intervalo deste envio",
    )


def test_a_part_above_the_limit_is_413(
    client: TestClient,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("api.batches.MAX_PART_BYTES", 100)
    batch = open_batch(client, project, auth)
    response = send(client, project, auth, batch, b"%PDF" + b"x" * 200)
    assert response.status_code == 413
    assert response.json()["detail"] == "Parte grande demais — divida o PDF em partes menores"


def test_a_confirmed_batch_does_not_change_anymore(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    receipt_id = detail(client, project, auth, batch)["receipts"][0]["id"]
    db_session.query(ReceiptBatch).update({"status": "confirmado"})
    db_session.commit()

    message = "Esse envio já foi confirmado e não pode mais ser alterado"
    answers = [
        send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E9"))),
        client.patch(
            f"{base(project)}/{batch}/receipts/{receipt_id}", json={"discarded": True}, headers=auth
        ),
        client.delete(f"{base(project)}/{batch}", headers=auth),
    ]
    assert [(a.status_code, a.json()["detail"]) for a in answers] == [(409, message)] * 3
    assert db_session.query(PaymentReceipt).count() == 1


def test_connect_down_saves_nothing_and_answers_503(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    connect.down = True
    batch = open_batch(client, project, auth)
    response = send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    assert response.status_code == 503
    assert (
        response.json()["detail"] == "O P+ Connect não respondeu — tente de novo em alguns minutos"
    )
    assert db_session.query(PaymentReceipt).count() == 0
    assert db_session.query(ReceiptBatchPart).count() == 0
    # e depois que o Connect volta, a mesma parte entra
    connect.down = False
    assert (
        send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1"))).status_code == 200
    )


def test_canceling_removes_the_batch_with_its_receipts(
    client: TestClient,
    db_session: Session,
    project: ProjectRef,
    auth: dict[str, str],
    connect: FakeConnect,
) -> None:
    batch = open_batch(client, project, auth)
    send(client, project, auth, batch, pdf(text(IN_PROJECT, "20,00", "E1")))
    assert client.delete(f"{base(project)}/{batch}", headers=auth).status_code == 204
    assert db_session.query(ReceiptBatch).count() == 0
    assert db_session.query(PaymentReceipt).count() == 0
    assert db_session.query(ReceiptBatchPart).count() == 0
    assert client.delete(f"{base(project)}/{batch}", headers=auth).status_code == 404


def test_history_counts_the_ones_outside_the_project(
    client: TestClient, project: ProjectRef, auth: dict[str, str], connect: FakeConnect
) -> None:
    batch = open_batch(client, project, auth)
    send(
        client,
        project,
        auth,
        batch,
        pdf(text(OUT_OF_PROJECT, "20,00", "E2"), text(UNKNOWN, "20,00", "E3")),
    )
    (row,) = client.get(base(project), headers=auth).json()
    assert row["id"] == batch and row["outOfProjectCount"] == 2
    assert Decimal(str(row["paidTotal"])) == 0


# ---- Banco ----


def test_a_pix_can_only_be_paid_once_in_the_database(
    db_session: Session, project: ProjectRef, make_user: Callable[..., User]
) -> None:
    from sqlalchemy.exc import IntegrityError

    batch = ReceiptBatch(project_ref_id=project.id, partsExpected=1)
    db_session.add(batch)
    db_session.flush()

    def receipt(status: str) -> PaymentReceipt:
        return PaymentReceipt(
            batch_id=batch.id, page=1, e2eId="E1", group="no_projeto", status=status
        )

    db_session.add_all([receipt("pendente"), receipt("pendente"), receipt("pago")])
    db_session.commit()  # vários pendentes do mesmo Pix são permitidos
    db_session.add(receipt("pago"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_every_foreign_key_declares_ondelete() -> None:
    for table in Base.metadata.sorted_tables:
        for fk in table.foreign_keys:
            assert fk.ondelete, f"{table.name}.{fk.parent.name} sem ondelete"


def test_me_tells_whether_the_user_has_mfa(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    with_mfa = make_user(email="com@exemplo.com")
    without = make_user(email="sem@exemplo.com", mfa=False)
    for user, expected in ((with_mfa, True), (without, False)):
        headers = {"Authorization": f"Bearer {create_access_token(user.id, via_sso=True)}"}
        assert client.get("/auth/me", headers=headers).json()["mfaEnabled"] is expected
