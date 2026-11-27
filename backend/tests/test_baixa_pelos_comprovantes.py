# ruff: noqa: F811  (as fixtures importadas de outros testes são reusadas pelo nome)
"""Baixa do lançamento de incentivos pelos comprovantes Pix, casados pela chave (Bruno, 27/11/2026).

Os PDFs são gerados no teste (páginas em branco) e o texto de cada página é o comprovante fictício
no layout do Itaú (`receipt_text`): nunca um comprovante real.
"""

import io
from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from pypdf import PdfReader, PdfWriter
from sqlalchemy.orm import Session

from core.file_vault import MemoryFileStore
from models.payable import Payable, PayableAttachment, PayablePayment
from models.user import User
from services import incentive_receipts
from tests.test_carregar_incentivos import _key, _line, _send, _simple, registered  # noqa: F401
from tests.test_payables import auth, vault, world  # noqa: F401
from tests.test_receipt_parser import receipt_text

PREVIEW_URL = "/payables/import/preview"
IMPORT_URL = "/payables/import"
PEOPLE = [("Ana Teste", "100.00"), ("Bia Teste", "50.50"), ("Caio Teste", "25.00")]
PAY_DAY = "24/11/2026"


def _pdf(pages: int) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def _brl(value: str) -> str:
    whole, cents = value.split(".")
    return f"R$ {whole},{cents}"


@pytest.fixture
def launch(
    client: TestClient, auth: dict[str, str], registered: dict[str, Any], db_session: Session
) -> Payable:
    """Um lançamento de incentivos da planilha nova, com três pessoas e as chaves delas."""
    lines = [_line(name, value=Decimal(value), pay=PAY_DAY) for name, value in PEOPLE]
    content = _simple(*lines)
    assert _send(client, auth, IMPORT_URL, content).status_code == 201
    payable = db_session.query(Payable).one()
    assert payable.paidByReceipts is True
    return payable


@pytest.fixture
def pdfs(monkeypatch: pytest.MonkeyPatch) -> Callable[..., list[tuple[str, tuple[str, bytes]]]]:
    """Monta os arquivos de comprovantes: cada arquivo é uma lista de comprovantes (um por
    página). O leitor de PDF de verdade é trocado pelo texto fictício de cada página."""
    texts: dict[bytes, list[str]] = {}

    def build(*files: list[dict[str, str]]) -> list[tuple[str, tuple[str, bytes]]]:
        sent = []
        for index, receipts in enumerate(files):
            content = _pdf(len(receipts)) + f"%arquivo {index} {len(texts)}".encode()
            texts[content] = [receipt_text(**receipt) for receipt in receipts]
            sent.append(("files", (f"comprovantes-{index + 1}.pdf", content)))
        return sent

    real = incentive_receipts.extract_pdf_pages
    monkeypatch.setattr(
        incentive_receipts,
        "extract_pdf_pages",
        lambda content: texts[content] if content in texts else real(content),
    )
    return build


def _receipt(name: str, value: str, e2e: str, day: str = PAY_DAY, **over: str) -> dict[str, str]:
    return {
        "name": name.upper(),
        "key": over.get("key", _key(name)),
        "amount": _brl(over.get("amount", value)),
        "day": day,
        "e2e": e2e,
    }


def _all() -> list[dict[str, str]]:
    return [
        _receipt(name, value, f"E0000000020261124TESTE{index:06}")
        for index, (name, value) in enumerate(PEOPLE, start=1)
    ]


def _preview(client: TestClient, auth: dict[str, str], payable: Payable, files: Any) -> Any:
    response = client.post(f"/payables/{payable.id}/receipts/preview", files=files, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def _confirm(
    client: TestClient, auth: dict[str, str], payable: Payable, files: Any, account: int
) -> Any:
    return client.post(
        f"/payables/{payable.id}/receipts/confirm",
        files=files,
        data={"bankAccountId": str(account)},
        headers=auth,
    )


def test_every_receipt_matches_its_person_by_key_and_the_payment_goes_out(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    launch: Payable,
    pdfs: Callable[..., Any],
    vault: MemoryFileStore,
    db_session: Session,
) -> None:
    # dois arquivos, fora de ordem: a chave diz quem é quem
    first, second, third = _all()
    files = pdfs([third, first], [second])
    result = _preview(client, auth, launch, files)
    assert (result["ready"], result["matched"], result["count"]) == (True, 3, 3)
    assert result["blockers"] == [] and result["extras"] == []
    assert (result["pending"], result["receiptsTotal"]) == ("175.50", "175.50")
    assert [(row["name"], row["status"], row["file"], row["page"]) for row in result["items"]] == [
        ("Ana Teste", "bate", "comprovantes-1.pdf", 2),
        ("Bia Teste", "bate", "comprovantes-2.pdf", 1),
        ("Caio Teste", "bate", "comprovantes-1.pdf", 1),
    ]
    # conferir não grava nada, e a chave inteira nunca sai
    assert db_session.query(PayablePayment).count() == 0
    assert "ana.teste@exemplo.invalid" not in str(result)

    done = _confirm(client, auth, launch, files, world["account"].id)
    assert done.status_code == 201, done.text
    assert done.json() == {"count": 3, "total": "175.50"}
    db_session.expire_all()
    payable = db_session.get(Payable, launch.id)
    assert payable is not None
    # um Pix por pessoa, com o ID da transação e a pessoa
    payments = {p.item_id: p for p in payable.payments}
    by_name = {item.name: item for item in payable.items}
    assert payments[by_name["Ana Teste"].id].transactionId == "E0000000020261124TESTE000001"
    assert payments[by_name["Bia Teste"].id].amount == Decimal("50.50")
    assert all(p.paidOn == date(2026, 11, 24) for p in payments.values())
    # o comprovante de cada pessoa vai para os documentos da conta, ligado a ela, só a página dela
    receipts = {a.item_id: a for a in db_session.query(PayableAttachment).all()}
    assert set(receipts) == set(payments)
    ana = receipts[by_name["Ana Teste"].id]
    assert (ana.name, ana.kind) == ("Comprovante Pix - Ana Teste.pdf", "comprovante")
    detail = client.get(f"/payables/{payable.id}", headers=auth).json()
    assert detail["situation"] == "pago"
    assert {i["name"]: i["paidOn"] for i in detail["items"]}["Caio Teste"] == "2026-11-24"
    assert {a["itemId"] for a in detail["attachments"]} == set(payments)
    stored = client.get(
        f"/payables/{payable.id}/attachments/{ana.id}/download", headers=auth
    ).content
    assert len(PdfReader(io.BytesIO(stored)).pages) == 1
    history = [e["text"] for e in detail["events"]]
    assert any("Baixa pelos comprovantes Pix: 3 pessoas, R$ 175,50" in text for text in history)


def test_without_every_receipt_the_payment_does_not_go_out(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    launch: Payable,
    pdfs: Callable[..., Any],
    vault: MemoryFileStore,
    db_session: Session,
) -> None:
    first, second, _ = _all()
    files = pdfs([first, second])
    result = _preview(client, auth, launch, files)
    assert result["ready"] is False
    assert result["blockers"] == [
        "1 pessoa sem comprovante",
        "A soma dos comprovantes (R$ 150,50) não bate com o valor da conta (R$ 175,50)",
    ]
    assert {row["name"]: row["status"] for row in result["items"]}["Caio Teste"] == (
        "sem_comprovante"
    )
    refused = _confirm(client, auth, launch, files, world["account"].id)
    assert refused.status_code == 409
    assert refused.json()["detail"] == "A baixa ainda não pode sair: 1 pessoa sem comprovante"
    assert db_session.query(PayablePayment).count() == 0
    assert db_session.query(PayableAttachment).count() == 0


def test_a_receipt_with_another_value_or_another_key_is_a_divergence(
    client: TestClient, auth: dict[str, str], launch: Payable, pdfs: Callable[..., Any]
) -> None:
    first, second, third = _all()
    third = _receipt("Caio Teste", "25.00", third["e2e"], amount="26.00")
    stranger = _receipt("Dani Fora", "10.00", "E0000000020261124TESTE000099")
    result = _preview(client, auth, launch, pdfs([first, second, third, stranger]))
    assert result["ready"] is False
    caio = {row["name"]: row for row in result["items"]}["Caio Teste"]
    assert (caio["status"], caio["receiptAmount"]) == ("valor_diferente", "26.00")
    (extra,) = result["extras"]
    # a chave de ninguém do lançamento: o nome lido aparece, para achar o papel; a chave, mascarada
    assert (extra["status"], extra["payeeName"], extra["pixMasked"]) == (
        "outra_chave",
        "DANI FORA",
        "dan***@exemplo.invalid",
    )
    assert result["blockers"][:2] == [
        "1 comprovante com valor diferente do da pessoa",
        "1 comprovante que não entra na baixa (veja abaixo)",
    ]


def test_a_pix_repeated_or_already_used_never_pays_twice(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    launch: Payable,
    pdfs: Callable[..., Any],
    db_session: Session,
) -> None:
    first, second, third = _all()
    # o mesmo comprovante duas vezes no envio
    repeated = _preview(client, auth, launch, pdfs([first, second, third, first]))
    assert [extra["status"] for extra in repeated["extras"]] == ["repetido"]
    # o Pix de Ana já deu baixa em outra conta
    other = Payable(
        **{
            column: getattr(launch, column)
            for column in ("category_id", "company_id", "unit_id", "cost_center_id")
        },
        payment_method_id=launch.payment_method_id,
        issueDate=launch.issueDate,
        dueDate=launch.dueDate,
        amount=Decimal("100.00"),
        description="Outra conta",
    )
    db_session.add(other)
    db_session.flush()
    db_session.add(
        PayablePayment(
            payable_id=other.id,
            paidOn=date(2026, 11, 24),
            amount=Decimal("100.00"),
            bank_account_id=world["account"].id,
            payment_method_id=launch.payment_method_id,
            transactionId=first["e2e"].lower(),
            created_by_user_id=db_session.query(User).first().id,  # type: ignore[union-attr]
        )
    )
    db_session.commit()
    used = _preview(client, auth, launch, pdfs([first, second, third]))
    assert [(e["status"], e["message"]) for e in used["extras"]] == [
        ("ja_usado", "Esse Pix já deu baixa em outra conta")
    ]
    assert used["ready"] is False


def test_after_reversing_some_people_only_they_are_paid_again(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    launch: Payable,
    pdfs: Callable[..., Any],
    vault: MemoryFileStore,
    db_session: Session,
) -> None:
    """Bruno, 27/11/2026: estornar algumas ou todas. Quem foi estornado volta a ficar a pagar e é
    pago de novo pelo comprovante; quem continua pago não entra nem trava."""
    receipts = _all()
    files = pdfs(receipts)
    assert _confirm(client, auth, launch, files, world["account"].id).status_code == 201
    url = f"/payables/{launch.id}"
    detail = client.get(url, headers=auth).json()
    assert {p["itemName"] for p in detail["payments"]} == {name for name, _ in PEOPLE}

    chosen = [p["id"] for p in detail["payments"] if p["itemName"] != "Bia Teste"]
    reversed_ = client.post(
        f"{url}/payments/reverse", json={"paymentIds": chosen, "reason": "Era teste"}, headers=auth
    ).json()
    assert (reversed_["paid"], reversed_["pending"]) == ("50.50", "125.00")
    assert {p["itemName"] for p in reversed_["payments"] if p["kind"] == "estorno"} == {
        "Ana Teste",
        "Caio Teste",
    }
    assert {i["name"]: bool(i["paidOn"]) for i in reversed_["items"]} == {
        "Ana Teste": False,
        "Bia Teste": True,
        "Caio Teste": False,
    }
    sheet = load_workbook(
        io.BytesIO(client.get(f"{url}/items/export", headers=auth).content), read_only=True
    ).active
    status = {row[0]: row[-1] for row in sheet.iter_rows(values_only=True) if row and row[0]}
    assert status["Ana Teste"] == "A pagar" and status["Bia Teste"].startswith("Paga em ")

    # o mesmo PDF completo: o de Bia é ignorado, e os dois estornados voltam a valer
    again = _preview(client, auth, launch, files)
    assert (again["ready"], again["count"], again["matched"], again["ignored"]) == (True, 2, 2, 1)
    assert again["receiptsTotal"] == "125.00"
    assert [row["name"] for row in again["items"]] == ["Ana Teste", "Caio Teste"]
    # outro Pix para quem já foi pago aparece como divergência
    extra = _receipt("Bia Teste", "50.50", "E0000000020261124TESTE000050")
    other = _preview(client, auth, launch, pdfs(receipts + [extra]))
    assert [(e["status"], e["message"]) for e in other["extras"]] == [
        ("ja_paga", "Essa pessoa já foi paga neste lançamento, com outro Pix")
    ]
    assert other["ready"] is False

    done = _confirm(client, auth, launch, files, world["account"].id)
    assert done.status_code == 201, done.text
    assert done.json() == {"count": 2, "total": "125.00"}
    final = client.get(url, headers=auth).json()
    assert (final["situation"], final["pending"]) == ("pago", "0.00")
    db_session.expire_all()
    assert db_session.query(PayablePayment).filter_by(kind="pagamento").count() == 5


def test_the_incentive_paid_by_receipts_has_no_direct_payment(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], launch: Payable
) -> None:
    (row,) = client.get("/payables?mode=tudo", headers=auth).json()["items"]
    assert (row["paidByReceipts"], row["canPayDirectly"]) == (True, False)
    payment = {
        "paidOn": date.today().isoformat(),
        "amount": "175.50",
        "bankAccountId": world["account"].id,
        "paymentMethodId": world["method"].id,
    }
    refused = client.post(f"/payables/{launch.id}/payments", json=payment, headers=auth)
    assert refused.status_code == 409
    assert "baixado pelos comprovantes Pix" in refused.json()["detail"]
    batch = {**payment, "ids": [launch.id]}
    batch.pop("amount")
    assert client.post("/payables/batch/payments", json=batch, headers=auth).status_code == 409


def test_only_the_new_incentive_launch_takes_receipts_and_bad_files_are_refused(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    launch: Payable,
    db_session: Session,
    pdfs: Callable[..., Any],
) -> None:
    created = client.post(
        "/payables",
        json={
            "issueDate": date.today().isoformat(),
            "dueDate": date.today().isoformat(),
            "amount": "10.00",
            "supplierId": world["supplier"].id,
            "categoryId": world["category"].id,
            "companyId": world["company"].id,
            "unitId": world["unit"].id,
            "costCenterId": world["cost_center"].id,
            "paymentMethodId": world["method"].id,
            "description": "Conta comum",
            "allocations": [{"projectId": world["project"].id, "amount": "10.00"}],
        },
        headers=auth,
    ).json()
    common = client.post(
        f"/payables/{created['id']}/receipts/preview", files=pdfs(_all()), headers=auth
    )
    assert common.status_code == 409
    assert "Só o lançamento de incentivos da planilha nova" in common.json()["detail"]

    url = f"/payables/{launch.id}/receipts/preview"
    not_pdf = client.post(url, files=[("files", ("nota.pdf", b"isto nao e pdf"))], headers=auth)
    assert not_pdf.status_code == 422
    assert not_pdf.json()["detail"] == "nota.pdf: não dá para ler este PDF"
    empty = client.post(url, files=[("files", ("vazio.pdf", b""))], headers=auth)
    assert (empty.status_code, empty.json()["detail"]) == (422, "vazio.pdf: o arquivo está vazio")
    assert client.post(url, files=pdfs(_all()), headers={}).status_code == 401
