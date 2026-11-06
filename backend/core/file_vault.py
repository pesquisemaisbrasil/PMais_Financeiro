"""Cofre de arquivos (handoff/06 §4): os anexos das contas.

Cada arquivo é cifrado **aqui no backend**, com uma chave só dele (AES-256-GCM), antes de ir para
o bucket. Essa chave vai embrulhada pela `FILES_MASTER_KEY`, que o MinIO nunca vê: quem tem acesso
ao bucket ou ao backup dele não lê nada. Na leitura o arquivo é decifrado, conferido pelo SHA-256 e,
se não bater, **a leitura falha** (nunca se entrega arquivo adulterado).

Não há URL pública nem pré-assinada: o arquivo só sai pelo backend. A credencial do bucket só
precisa gravar e ler; nada aqui apaga objeto (remover é lógico, no banco).
"""

import base64
import hashlib
import os
import uuid
from dataclasses import dataclass
from typing import Any, Protocol

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from core import config

KEY_VERSION = 1
_NONCE_SIZE = 12


class FilesUnavailable(Exception):
    """O cofre não está configurado ou o bucket não respondeu."""


class FileCorrupted(Exception):
    """O arquivo guardado não confere (mexeram nele, ou é de outra conta). Nunca é entregue."""


@dataclass(frozen=True)
class StoredFile:
    key: str
    sha256: str
    size: int


class FileStore(Protocol):
    def put(self, key: str, body: bytes, metadata: dict[str, str]) -> None: ...

    def get(self, key: str) -> tuple[bytes, dict[str, str]]: ...


class MemoryFileStore:
    """Cofre de mentira, só nos testes e nos testes de tela: some quando a API reinicia."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, dict[str, str]]] = {}

    def put(self, key: str, body: bytes, metadata: dict[str, str]) -> None:
        self.objects[key] = (body, dict(metadata))

    def get(self, key: str) -> tuple[bytes, dict[str, str]]:
        if key not in self.objects:
            raise FileCorrupted("Arquivo não encontrado no cofre")
        body, metadata = self.objects[key]
        return body, dict(metadata)


class S3FileStore:
    """O bucket S3 (MinIO). Qualquer falha de rede ou de permissão vira `FilesUnavailable`."""

    def __init__(self, client: Any, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    @classmethod
    def connect(cls, endpoint: str, access_key: str, secret_key: str, bucket: str) -> "S3FileStore":
        import boto3
        from botocore.config import Config

        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="us-east-1",
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                retries={"max_attempts": 3},
                connect_timeout=5,
                read_timeout=30,
            ),
        )
        return cls(client, bucket)

    def put(self, key: str, body: bytes, metadata: dict[str, str]) -> None:
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            self._client.put_object(Bucket=self._bucket, Key=key, Body=body, Metadata=metadata)
        except (BotoCoreError, ClientError) as exc:
            raise FilesUnavailable("O cofre de arquivos não respondeu") from exc

    def get(self, key: str) -> tuple[bytes, dict[str, str]]:
        from botocore.exceptions import BotoCoreError, ClientError

        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
            return response["Body"].read(), dict(response.get("Metadata", {}))
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                raise FileCorrupted("Arquivo não encontrado no cofre") from exc
            raise FilesUnavailable("O cofre de arquivos não respondeu") from exc
        except BotoCoreError as exc:
            raise FilesUnavailable("O cofre de arquivos não respondeu") from exc


_memory = MemoryFileStore()
_s3: FileStore | None = None


def get_store() -> FileStore:
    """O cofre em uso. Os testes trocam esta função por um `MemoryFileStore`."""
    global _s3
    if config.FILES_MODE == "memory" and config.ENVIRONMENT != "production":
        return _memory
    if config.FILES_ENDPOINT_URL and config.FILES_ACCESS_KEY and config.FILES_SECRET_KEY:
        if _s3 is None:
            _s3 = S3FileStore.connect(
                config.FILES_ENDPOINT_URL,
                config.FILES_ACCESS_KEY,
                config.FILES_SECRET_KEY,
                config.FILES_BUCKET,
            )
        return _s3
    raise FilesUnavailable("O cofre de arquivos não está configurado neste ambiente")


def _master() -> AESGCM:
    if not config.FILES_MASTER_KEY:
        raise FilesUnavailable("A chave do cofre de arquivos não está configurada")
    return AESGCM(base64.b64decode(config.FILES_MASTER_KEY))


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode()


def store_file(kind: str, owner_id: int, data: bytes) -> StoredFile:
    """Cifra e guarda. `kind` e `owner_id` (ex.: `payable`, 12) amarram o arquivo à conta: copiado
    para outra conta, ele não abre."""
    master = _master()
    store = get_store()
    digest = hashlib.sha256(data).hexdigest()
    key = f"{kind}/{owner_id}/{uuid.uuid4().hex}.bin"
    dek, nonce, dek_nonce = os.urandom(32), os.urandom(_NONCE_SIZE), os.urandom(_NONCE_SIZE)
    ciphertext = AESGCM(dek).encrypt(nonce, data, f"{kind}:{owner_id}".encode())
    wrapped = master.encrypt(dek_nonce, dek, key.encode())
    store.put(
        key,
        ciphertext,
        {
            "dek": _b64(wrapped),
            "dek-nonce": _b64(dek_nonce),
            "nonce": _b64(nonce),
            "key-version": str(KEY_VERSION),
            "sha256": digest,
        },
    )
    return StoredFile(key=key, sha256=digest, size=len(data))


def read_file(kind: str, owner_id: int, key: str, expected_sha256: str) -> bytes:
    """Lê, decifra e confere. Falha fechado: qualquer diferença vira `FileCorrupted`."""
    master = _master()
    body, metadata = get_store().get(key)
    try:
        if metadata.get("key-version") != str(KEY_VERSION):
            raise FileCorrupted("Versão de chave desconhecida")
        dek = master.decrypt(
            base64.b64decode(metadata["dek-nonce"]), base64.b64decode(metadata["dek"]), key.encode()
        )
        data = AESGCM(dek).decrypt(
            base64.b64decode(metadata["nonce"]), body, f"{kind}:{owner_id}".encode()
        )
    except (InvalidTag, KeyError, ValueError) as exc:
        raise FileCorrupted("O arquivo guardado não confere") from exc
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise FileCorrupted("O arquivo guardado não confere")
    return data
