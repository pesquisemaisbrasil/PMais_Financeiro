# ruff: noqa: F811  (as fixtures importadas são reusadas pelo nome)
"""Ficha completa do cliente: IE, telefones, e-mails, observações, endereço e documentos."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.file_vault import MemoryFileStore
from models.reference import CustomerAttachment, RecordEvent
from models.user import User
from services.auth import create_access_token
from tests.test_payables import PDF, vault  # noqa: F401
from tests.test_records import _post, auth  # noqa: F401

ADDRESS = {
    "addressCountry": "Brasil",
    "addressZip": "80.010-000",
    "addressStreet": "Rua XV de Novembro",
    "addressNumber": "100",
    "addressComplement": "Sala 12",
    "addressDistrict": "Centro",
    "addressCity": "Curitiba",
    "addressState": "pr",
}


def customer(client: TestClient, auth: dict[str, str], **extra: Any) -> dict[str, Any]:
    response = _post(client, auth, "customers", name="Cliente Alfa Ltda", nickname="Alfa", **extra)
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


# ---- A ficha ----


def test_the_whole_card_is_saved_cleaned_and_listed(
    client: TestClient, auth: dict[str, str]
) -> None:
    created = customer(
        client,
        auth,
        stateRegistration=" 123.456.789.110 ",
        phone="+55 41 99999-0000",
        phone2="+55 41 3333-4444",
        phone3="",
        emailAlt="financeiro@alfa.com.br",
        notes="  Paga sempre no dia 10  ",
        **ADDRESS,
    )
    assert created["stateRegistration"] == "123.456.789.110"
    assert (created["phone2"], created["phone3"]) == ("+55 41 3333-4444", None)
    assert (created["emailAlt"], created["notes"]) == (
        "financeiro@alfa.com.br",
        "Paga sempre no dia 10",
    )
    # o CEP guarda só os números e a UF vai em maiúscula; o resto é o que foi digitado
    assert (created["addressZip"], created["addressState"]) == ("80010000", "PR")
    assert (created["addressStreet"], created["addressCity"]) == ("Rua XV de Novembro", "Curitiba")
    listed = client.get("/records/customers", headers=auth).json()
    assert listed[0]["addressComplement"] == "Sala 12" and listed[0]["id"] == created["id"]


def test_editing_keeps_what_was_typed_and_an_empty_field_clears_it(
    client: TestClient, auth: dict[str, str]
) -> None:
    created = customer(client, auth, notes="Uma nota", **ADDRESS)
    body = {"name": "Cliente Alfa Ltda", "nickname": "Alfa", "notes": "", **ADDRESS}
    edited = client.patch(f"/records/customers/{created['id']}", json=body, headers=auth).json()
    assert edited["notes"] is None
    assert edited["addressCity"] == "Curitiba"
    assert edited["code"] == created["code"]  # o código gerado não muda


def test_the_address_is_optional(client: TestClient, auth: dict[str, str]) -> None:
    created = customer(client, auth)
    assert all(created[name] is None for name in ADDRESS)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("phone2", "41 99999", "Telefone 2 no formato +55 41 99999-0000"),
        ("phone3", "abc", "Telefone 3 no formato +55 41 99999-0000"),
        ("emailAlt", "sem-arroba", "E-mail alternativo inválido"),
        ("addressZip", "123", "O CEP tem 8 números"),
        ("addressState", "XX", "UF inválida"),
    ],
)
def test_bad_values_are_refused_with_the_field_in_the_message(
    client: TestClient, auth: dict[str, str], field: str, value: str, message: str
) -> None:
    response = _post(client, auth, "customers", name="X", nickname="X", **{field: value})
    assert (response.status_code, response.json()["detail"]) == (422, message)


@pytest.mark.parametrize("registration", ["529.982.247-25", "52998224725"])
def test_cpf_in_the_state_registration_is_refused(
    client: TestClient, auth: dict[str, str], registration: str
) -> None:
    response = _post(
        client, auth, "customers", name="X", nickname="X", stateRegistration=registration
    )
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Informe só a inscrição estadual (IE): CPF e RG não são guardados",
    )


def test_a_state_registration_with_eleven_digits_that_is_not_a_cpf_is_accepted(
    client: TestClient, auth: dict[str, str]
) -> None:
    # a IE de alguns estados tem 11 números: só se recusa o que é um CPF de verdade
    created = customer(client, auth, stateRegistration="12345678901")
    assert created["stateRegistration"] == "12345678901"


def test_a_cpf_typed_in_the_notes_is_refused_but_other_numbers_are_fine(
    client: TestClient, auth: dict[str, str]
) -> None:
    refused = _post(
        client, auth, "customers", name="X", nickname="X", notes="CPF do sócio 529.982.247-25"
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "Não escreva CPF nas observações: ele não é guardado",
    )
    ok = _post(client, auth, "customers", name="Y", nickname="Y", notes="Contrato 20260001234")
    assert ok.status_code == 201


def test_only_customers_get_the_extra_fields(client: TestClient, auth: dict[str, str]) -> None:
    supplier = _post(
        client, auth, "suppliers", name="Forn", nickname="Forn", notes="x", addressCity="Rio"
    ).json()
    assert supplier["notes"] is None and supplier["addressCity"] is None


# ---- Documentos ----


def attach(
    client: TestClient,
    auth: dict[str, str],
    customer_id: int,
    content: bytes = PDF,
    name: str = "contrato.pdf",
    kind: str | None = None,
) -> Any:
    return client.post(
        f"/records/customers/{customer_id}/attachments",
        files={"file": (name, content)},
        data={"kind": kind} if kind else None,
        headers=auth,
    )


def link(customer_id: int, document: dict[str, Any]) -> str:
    return f"/records/customers/{customer_id}/attachments/{document['id']}"


def test_a_document_is_stored_encrypted_listed_and_audited(
    client: TestClient,
    auth: dict[str, str],
    vault: MemoryFileStore,
    db_session: Session,
) -> None:
    created = customer(client, auth)
    response = attach(client, auth, created["id"], name="Contrato Alfa.pdf", kind="contrato")
    assert response.status_code == 201, response.text
    (document,) = response.json()
    assert (document["name"], document["kind"], document["size"]) == (
        "Contrato Alfa.pdf",
        "contrato",
        len(PDF),
    )
    assert (document["contentType"], document["uploadedBy"]) == ("application/pdf", "Ana")
    ((body, _),) = vault.objects.values()
    assert PDF not in body  # no cofre vai o arquivo cifrado
    row = db_session.query(CustomerAttachment).one()
    assert row.fileKey.startswith(f"customer/{created['id']}/")
    events = db_session.query(RecordEvent).filter_by(kind="customers", record_id=created["id"])
    assert "Documento incluído: Contrato Alfa.pdf (0 KB)" in [e.text for e in events]
    # sem escolher, o tipo é "outro"
    other = attach(client, auth, created["id"], content=PDF + b"2", name="ficha.pdf")
    assert [a["kind"] for a in other.json()] == ["contrato", "outro"]
    listed = client.get(f"/records/customers/{created['id']}/attachments", headers=auth).json()
    assert [a["name"] for a in listed] == ["Contrato Alfa.pdf", "ficha.pdf"]


def test_download_returns_the_same_bytes_and_is_audited(
    client: TestClient, auth: dict[str, str], vault: MemoryFileStore, db_session: Session
) -> None:
    created = customer(client, auth)
    (document,) = attach(client, auth, created["id"]).json()
    response = client.get(f"{link(created['id'], document)}/download", headers=auth)
    assert (response.status_code, response.content) == (200, PDF)
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    texts = [e.text for e in db_session.query(RecordEvent).filter_by(kind="customers")]
    assert "Documento baixado: contrato.pdf" in texts


def test_renaming_and_removing_keep_the_trail_and_the_file(
    client: TestClient, auth: dict[str, str], vault: MemoryFileStore, db_session: Session
) -> None:
    created = customer(client, auth)
    (document,) = attach(client, auth, created["id"]).json()
    path = link(created["id"], document)
    renamed = client.patch(path, json={"name": "Contrato 2026", "kind": "contrato"}, headers=auth)
    assert [(a["name"], a["kind"]) for a in renamed.json()] == [("Contrato 2026.pdf", "contrato")]
    assert client.post(f"{path}/remove", json={"reason": ""}, headers=auth).status_code == 422
    removed = client.post(f"{path}/remove", json={"reason": "Versão antiga"}, headers=auth)
    assert (removed.status_code, removed.json()) == (200, [])
    assert client.get(f"{path}/download", headers=auth).status_code == 404
    assert len(vault.objects) == 1  # sai da lista, mas o arquivo continua guardado
    texts = [e.text for e in db_session.query(RecordEvent).filter_by(kind="customers")]
    assert "Documento removido: Contrato 2026.pdf — Versão antiga" in texts


def test_wrong_files_and_repeated_files_are_refused(
    client: TestClient, auth: dict[str, str], vault: MemoryFileStore
) -> None:
    created = customer(client, auth)
    refused = attach(client, auth, created["id"], content=b"MZ not a pdf", name="falso.pdf")
    assert refused.status_code == 422
    assert attach(client, auth, created["id"]).status_code == 201
    again = attach(client, auth, created["id"], name="copia.pdf")
    assert (again.status_code, again.json()["detail"]) == (
        409,
        "Este arquivo já está anexado a este cliente",
    )
    wrong_kind = attach(client, auth, created["id"], content=PDF + b"9", kind="inventado")
    assert wrong_kind.status_code == 422


def test_a_document_of_one_customer_cannot_be_read_through_another(
    client: TestClient, auth: dict[str, str], vault: MemoryFileStore
) -> None:
    first = customer(client, auth)
    second = _post(client, auth, "customers", name="Outro", nickname="Outro").json()
    (document,) = attach(client, auth, first["id"]).json()
    stolen = client.get(f"{link(second['id'], document)}/download", headers=auth)
    assert (stolen.status_code, stolen.json()["detail"]) == (404, "Documento não encontrado")
    missing = attach(client, auth, 99999)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Cadastro não encontrado")


def test_a_customer_with_documents_is_never_deleted_only_inactivated(
    client: TestClient, auth: dict[str, str], vault: MemoryFileStore
) -> None:
    created = customer(client, auth)
    assert client.get("/records/customers", headers=auth).json()[0]["inUse"] is False
    (document,) = attach(client, auth, created["id"]).json()
    client.post(f"{link(created['id'], document)}/remove", json={"reason": "x"}, headers=auth)
    # tirar o documento da lista não apaga o arquivo: o cliente continua "em uso"
    assert client.get("/records/customers", headers=auth).json()[0]["inUse"] is True
    refused = client.delete(f"/records/customers/{created['id']}", headers=auth)
    assert refused.status_code == 409


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/records/customers/1/attachments"),
        ("post", "/records/customers/1/attachments"),
        ("get", "/records/customers/1/attachments/1/download"),
        ("patch", "/records/customers/1/attachments/1"),
        ("post", "/records/customers/1/attachments/1/remove"),
    ],
)
def test_a_role_without_finance_access_cannot_use_the_document_routes(
    client: TestClient, make_user: Callable[..., User], method: str, path: str
) -> None:
    other = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    kwargs: dict[str, Any] = {} if method == "get" else {"json": {}}
    assert getattr(client, method)(path, headers=headers, **kwargs).status_code == 403
