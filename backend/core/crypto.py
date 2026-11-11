import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from core.config import ENCRYPTION_KEY

_NONCE_SIZE = 12  # bytes, recomendado pra GCM


def _get_aesgcm() -> AESGCM:
    return AESGCM(base64.b64decode(ENCRYPTION_KEY))


def encrypt_payload(plaintext: str, associated_data: str) -> str:
    """`associated_data` (`tabela:coluna:id`) amarra o valor à linha: copiado para outra
    conta, ele não abre."""
    nonce = os.urandom(_NONCE_SIZE)
    ciphertext = _get_aesgcm().encrypt(nonce, plaintext.encode(), associated_data.encode())
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt_payload(envelope: str, associated_data: str) -> str:
    raw = base64.b64decode(envelope)
    nonce, ciphertext = raw[:_NONCE_SIZE], raw[_NONCE_SIZE:]
    return _get_aesgcm().decrypt(nonce, ciphertext, associated_data.encode()).decode()
