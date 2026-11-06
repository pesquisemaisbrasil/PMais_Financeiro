# ruff: noqa: F811  (as fixtures importadas de outros testes são reusadas pelo nome)
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core import config, file_vault
from core.file_vault import MemoryFileStore
from models.receivable import ReceivableAttachment
from models.user import User
from services import attachments
from services.auth import create_access_token
from tests.test_payables import PDF, vault  # noqa: F401
from tests.test_receivables import auth, create, world  # noqa: F401


def attach(
    client: TestClient,
    auth: dict[str, str],
    receivable_id: int,
    content: bytes = PDF,
    name: str = "nota.pdf",
    kind: str | None = None,
) -> Any:
    return client.post(
        f"/receivables/{receivable_id}/attachments",
        files={"file": (name, content)},
        data={"kind": kind} if kind else None,
        headers=auth,
    )


def url(receivable_id: int, document: dict[str, Any]) -> str:
    return f"/receivables/{receivable_id}/attachments/{document['id']}"


def test_a_document_is_attached_stored_encrypted_and_listed_with_its_type(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    vault: MemoryFileStore,
    db_session: Session,
) -> None:
    title = create(client, auth, world)
    response = attach(client, auth, title["id"], name="NF emitida 12.pdf", kind="nota")
    assert response.status_code == 201, response.text
    (document,) = response.json()["attachments"]
    assert (document["name"], document["kind"], document["size"]) == (
        "NF emitida 12.pdf",
        "nota",
        len(PDF),
    )
    assert (document["contentType"], document["uploadedBy"]) == ("application/pdf", "Ana")
    assert response.json()["events"][0]["text"] == "Documento incluído: NF emitida 12.pdf (0 KB)"
    # o que vai para o cofre é o arquivo cifrado, e o banco guarda só quem, quando e onde achar
    ((body, metadata),) = vault.objects.values()
    assert body != PDF and PDF not in body
    assert set(metadata) == {"dek", "dek-nonce", "nonce", "key-version", "sha256"}
    row = db_session.query(ReceivableAttachment).one()
    assert row.fileKey.startswith(f"receivable/{title['id']}/") and row.fileKey.endswith(".bin")
    assert (row.uploaded_by_user_id, row.deletedAt, len(row.fileSha256)) == (1, None, 64)
    listed = client.get(f"/receivables/{title['id']}", headers=auth).json()["attachments"]
    assert [a["name"] for a in listed] == ["NF emitida 12.pdf"]
    # sem escolher, o tipo é "outro"
    other = attach(client, auth, title["id"], content=PDF + b"2", name="outro.pdf")
    assert [a["kind"] for a in other.json()["attachments"]] == ["nota", "outro"]


def test_download_returns_the_same_bytes_and_is_audited(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    title = create(client, auth, world)
    document = attach(client, auth, title["id"], name="Nota São João.pdf").json()["attachments"][0]
    response = client.get(f"{url(title['id'], document)}/download", headers=auth)
    assert response.status_code == 200
    assert response.content == PDF
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert (
        "filename*=UTF-8''Nota%20S%C3%A3o%20Jo%C3%A3o.pdf"
        in response.headers["content-disposition"]
    )
    events = client.get(f"/receivables/{title['id']}", headers=auth).json()["events"]
    assert events[0]["text"] == "Documento baixado: Nota São João.pdf"


def test_removing_is_logical_and_needs_a_reason(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    title = create(client, auth, world)
    document = attach(client, auth, title["id"]).json()["attachments"][0]
    link = url(title["id"], document)
    assert client.post(f"{link}/remove", json={"reason": ""}, headers=auth).status_code == 422
    removed = client.post(f"{link}/remove", json={"reason": "Nota errada"}, headers=auth)
    assert removed.status_code == 200
    assert removed.json()["attachments"] == []
    assert removed.json()["events"][0]["text"] == "Documento removido: nota.pdf — Nota errada"
    assert client.get(f"{link}/download", headers=auth).status_code == 404
    assert (
        client.post(f"{link}/remove", json={"reason": "De novo"}, headers=auth).status_code == 404
    )
    assert len(vault.objects) == 1  # sai do título, mas o arquivo continua guardado


def test_renaming_and_changing_the_type_are_audited_and_keep_the_file(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    title = create(client, auth, world)
    document = attach(client, auth, title["id"]).json()["attachments"][0]
    link = url(title["id"], document)

    renamed = client.patch(link, json={"name": "NF 12 março", "kind": "nota"}, headers=auth)
    assert renamed.status_code == 200, renamed.text
    assert [(a["name"], a["kind"]) for a in renamed.json()["attachments"]] == [
        ("NF 12 março.pdf", "nota")
    ]
    assert [e["text"] for e in renamed.json()["events"][:2]] == [
        "Tipo do documento mudou: NF 12 março.pdf (Outro → Nota fiscal)",
        "Documento renomeado: nota.pdf → NF 12 março.pdf",
    ]
    assert client.get(f"{link}/download", headers=auth).content == PDF
    assert len(vault.objects) == 1

    # não muda a extensão, não aceita nome vazio nem tipo inventado, e repetir não registra de novo
    assert (
        client.patch(link, json={"name": "x.exe"}, headers=auth).json()["attachments"][0]["name"]
        == "x.exe.pdf"
    )
    refused = client.patch(link, json={"name": "  "}, headers=auth)
    assert (refused.status_code, refused.json()["detail"]) == (422, "Informe o nome do documento")
    wrong = client.patch(link, json={"kind": "foto"}, headers=auth)
    assert (wrong.status_code, wrong.json()["detail"]) == (422, "Escolha o tipo do documento")
    empty = client.patch(link, json={}, headers=auth)
    assert (empty.status_code, empty.json()["detail"]) == (
        422,
        "Mude o nome ou o tipo do documento",
    )
    events = len(client.get(f"/receivables/{title['id']}", headers=auth).json()["events"])
    client.patch(link, json={"kind": "nota"}, headers=auth)
    assert len(client.get(f"/receivables/{title['id']}", headers=auth).json()["events"]) == events


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("falso.pdf", b"MZ\x90\x00 isto e um executavel"),
        ("programa.exe", b"MZ\x90\x00"),
        ("foto.png", PDF),
        ("vazio.pdf", b""),
        ("sem-extensao", PDF),
    ],
)
def test_files_of_the_wrong_type_or_content_are_refused(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    vault: MemoryFileStore,
    name: str,
    content: bytes,
) -> None:
    title = create(client, auth, world)
    response = attach(client, auth, title["id"], content=content, name=name)
    assert response.status_code == 422
    assert response.json()["detail"] == "Envie PDF, imagem, planilha, documento ou XML de até 20 MB"
    assert vault.objects == {}


def test_the_type_of_a_new_document_must_be_one_of_the_list(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    title = create(client, auth, world)
    wrong = attach(client, auth, title["id"], kind="foto")
    assert (wrong.status_code, wrong.json()["detail"]) == (422, "Escolha o tipo do documento")
    assert vault.objects == {}


def test_the_size_and_count_limits_and_the_same_file_twice_are_refused(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    vault: MemoryFileStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    title = create(client, auth, world)
    monkeypatch.setattr(attachments, "MAX_BYTES", len(PDF) + 5)
    big = attach(client, auth, title["id"], content=PDF + b"x" * 6)
    assert (big.status_code, big.json()["detail"]) == (
        422,
        "Envie PDF, imagem, planilha, documento ou XML de até 20 MB",
    )
    first = attach(client, auth, title["id"], content=PDF + b"1").json()["attachments"][0]
    again = attach(client, auth, title["id"], content=PDF + b"1", name="outro-nome.pdf")
    assert (again.status_code, again.json()["detail"]) == (
        409,
        "Este arquivo já está anexado a este título",
    )
    monkeypatch.setattr(attachments, "MAX_PER_OWNER", 2)
    assert attach(client, auth, title["id"], content=PDF + b"2").status_code == 201
    third = attach(client, auth, title["id"], content=PDF + b"3")
    assert (third.status_code, third.json()["detail"]) == (409, "Este título já tem 2 documentos")
    # tirado o documento, o mesmo arquivo volta a ser aceito
    client.post(f"{url(title['id'], first)}/remove", json={"reason": "Trocar"}, headers=auth)
    assert attach(client, auth, title["id"], content=PDF + b"1").status_code == 201


def test_a_document_of_one_title_cannot_be_read_or_renamed_through_another(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    first = create(client, auth, world)
    second = create(client, auth, world)
    document = attach(client, auth, first["id"]).json()["attachments"][0]
    stolen = client.get(
        f"/receivables/{second['id']}/attachments/{document['id']}/download", headers=auth
    )
    assert (stolen.status_code, stolen.json()["detail"]) == (404, "Documento não encontrado")
    renamed = client.patch(
        f"/receivables/{second['id']}/attachments/{document['id']}",
        json={"name": "x"},
        headers=auth,
    )
    assert renamed.status_code == 404
    missing = attach(client, auth, 99999)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Título não encontrado")


def test_without_the_vault_attaching_says_so_and_the_title_still_opens(
    client: TestClient,
    auth: dict[str, str],
    world: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    title = create(client, auth, world)
    monkeypatch.setattr(config, "FILES_MASTER_KEY", "")
    monkeypatch.setattr(file_vault, "get_store", lambda: MemoryFileStore())
    response = attach(client, auth, title["id"])
    assert (response.status_code, response.json()["detail"]) == (
        503,
        "Os anexos não estão disponíveis agora. Avise quem cuida do sistema.",
    )
    opened = client.get(f"/receivables/{title['id']}", headers=auth)
    assert opened.status_code == 200 and opened.json()["attachments"] == []


def test_a_tampered_file_is_never_delivered(
    client: TestClient, auth: dict[str, str], world: dict[str, Any], vault: MemoryFileStore
) -> None:
    title = create(client, auth, world)
    document = attach(client, auth, title["id"]).json()["attachments"][0]
    (key,) = vault.objects
    body, metadata = vault.objects[key]
    vault.objects[key] = (body[:-1] + bytes([body[-1] ^ 1]), metadata)
    response = client.get(f"{url(title['id'], document)}/download", headers=auth)
    assert response.status_code == 500
    assert "não confere" in response.json()["detail"]
    events = client.get(f"/receivables/{title['id']}", headers=auth).json()["events"]
    assert not any("baixado" in event["text"] for event in events)


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/receivables/1/series"),
        ("post", "/receivables/1/attachments"),
        ("get", "/receivables/1/attachments/1/download"),
        ("patch", "/receivables/1/attachments/1"),
        ("post", "/receivables/1/attachments/1/remove"),
    ],
)
def test_a_role_without_finance_access_cannot_use_the_new_routes(
    client: TestClient, make_user: Callable[..., User], method: str, path: str
) -> None:
    other = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    kwargs: dict[str, Any] = {} if method == "get" else {"json": {}}
    assert getattr(client, method)(path, headers=headers, **kwargs).status_code == 403
