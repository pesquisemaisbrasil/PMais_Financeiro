import base64
import os
from typing import Any

import pytest
from botocore.exceptions import BotoCoreError, ClientError

from core import config, file_vault
from core.file_vault import (
    FileCorrupted,
    FilesUnavailable,
    MemoryFileStore,
    S3FileStore,
    read_file,
    store_file,
)


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> MemoryFileStore:
    memory = MemoryFileStore()
    monkeypatch.setattr(config, "FILES_MASTER_KEY", base64.b64encode(os.urandom(32)).decode())
    monkeypatch.setattr(file_vault, "get_store", lambda: memory)
    return memory


def test_a_file_comes_back_exactly_and_is_never_stored_in_the_clear(store: MemoryFileStore) -> None:
    secret = b"nota fiscal com nome de pessoa " * 100
    stored = store_file("payable", 7, secret)
    assert (stored.size, len(stored.sha256)) == (len(secret), 64)
    body, _ = store.objects[stored.key]
    assert secret[:20] not in body
    assert read_file("payable", 7, stored.key, stored.sha256) == secret


def test_each_file_has_its_own_key_and_nonce(store: MemoryFileStore) -> None:
    one, two = store_file("payable", 1, b"igual"), store_file("payable", 1, b"igual")
    assert one.key != two.key
    (body_one, meta_one), (body_two, meta_two) = store.objects[one.key], store.objects[two.key]
    assert body_one != body_two
    assert meta_one["dek"] != meta_two["dek"] and meta_one["nonce"] != meta_two["nonce"]


def test_a_file_does_not_open_for_another_owner(store: MemoryFileStore) -> None:
    stored = store_file("payable", 1, b"conteudo")
    with pytest.raises(FileCorrupted):
        read_file("payable", 2, stored.key, stored.sha256)


def test_a_file_copied_under_another_key_does_not_open(store: MemoryFileStore) -> None:
    stored = store_file("payable", 1, b"conteudo")
    store.objects["payable/1/copia.bin"] = store.objects[stored.key]
    with pytest.raises(FileCorrupted):
        read_file("payable", 1, "payable/1/copia.bin", stored.sha256)


@pytest.mark.parametrize("damage", ["body", "dek", "nonce", "version"])
def test_any_change_to_what_is_stored_fails_closed(store: MemoryFileStore, damage: str) -> None:
    stored = store_file("payable", 1, b"conteudo")
    body, metadata = store.objects[stored.key]
    if damage == "body":
        body = b"\x00" + body[1:]
    elif damage == "version":
        metadata["key-version"] = "2"
    else:
        metadata[damage] = base64.b64encode(
            os.urandom(len(base64.b64decode(metadata[damage])))
        ).decode()
    store.objects[stored.key] = (body, metadata)
    with pytest.raises(FileCorrupted):
        read_file("payable", 1, stored.key, stored.sha256)


def test_the_expected_hash_must_match_and_a_missing_object_fails(store: MemoryFileStore) -> None:
    stored = store_file("payable", 1, b"conteudo")
    with pytest.raises(FileCorrupted):
        read_file("payable", 1, stored.key, "0" * 64)
    with pytest.raises(FileCorrupted):
        read_file("payable", 1, "payable/1/nao-existe.bin", stored.sha256)


def test_without_the_master_key_nothing_is_stored_or_read(
    store: MemoryFileStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    stored = store_file("payable", 1, b"conteudo")
    monkeypatch.setattr(config, "FILES_MASTER_KEY", "")
    with pytest.raises(FilesUnavailable):
        store_file("payable", 1, b"outro")
    with pytest.raises(FilesUnavailable):
        read_file("payable", 1, stored.key, stored.sha256)


def test_the_vault_must_be_configured_and_the_fake_one_never_runs_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(config, "FILES_MODE", "off")
    monkeypatch.setattr(config, "FILES_ENDPOINT_URL", "")
    with pytest.raises(FilesUnavailable):
        file_vault.get_store()
    monkeypatch.setattr(config, "FILES_MODE", "memory")
    assert isinstance(file_vault.get_store(), MemoryFileStore)
    monkeypatch.setattr(config, "ENVIRONMENT", "production")
    with pytest.raises(FilesUnavailable):
        file_vault.get_store()


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.error: Exception | None = None

    def put_object(self, **kwargs: Any) -> None:
        if self.error:
            raise self.error
        self.calls.append(kwargs)

    def get_object(self, **kwargs: Any) -> dict[str, Any]:
        if self.error:
            raise self.error

        class Body:
            def read(self) -> bytes:
                return b"cifrado"

        return {"Body": Body(), "Metadata": {"nonce": "x"}}


def test_the_bucket_receives_only_the_encrypted_body_and_its_metadata() -> None:
    client = FakeClient()
    s3 = S3FileStore(client, "financeiro-arquivos")
    s3.put("payable/1/a.bin", b"cifrado", {"nonce": "x"})
    assert client.calls == [
        {
            "Bucket": "financeiro-arquivos",
            "Key": "payable/1/a.bin",
            "Body": b"cifrado",
            "Metadata": {"nonce": "x"},
        }
    ]
    assert s3.get("payable/1/a.bin") == (b"cifrado", {"nonce": "x"})


def test_a_missing_object_is_corruption_and_any_other_failure_is_unavailability() -> None:
    client = FakeClient()
    s3 = S3FileStore(client, "b")
    client.error = ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
    with pytest.raises(FileCorrupted):
        s3.get("k")
    for error in (
        ClientError({"Error": {"Code": "AccessDenied"}}, "GetObject"),
        BotoCoreError(),
    ):
        client.error = error
        with pytest.raises(FilesUnavailable):
            s3.get("k")
        with pytest.raises(FilesUnavailable):
            s3.put("k", b"x", {})
