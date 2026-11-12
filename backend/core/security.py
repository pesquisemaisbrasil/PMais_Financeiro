import functools
import hashlib
import hmac

import bcrypt

from core.config import SECRET_KEY

# O bcrypt só olha os 72 primeiros bytes. Cortamos aqui, como o passlib fazia, porque o bcrypt 5
# recusa senha maior em vez de cortar. Acima de 4096 bytes ou com byte nulo é recusa.
_BCRYPT_MAX_BYTES = 72
_MAX_PASSWORD_BYTES = 4096


def _secret(password: str) -> bytes:
    raw = password.encode()
    if len(raw) > _MAX_PASSWORD_BYTES or b"\x00" in raw:
        raise ValueError("senha recusada")
    return raw[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_secret(password), bcrypt.gensalt()).decode()


@functools.cache
def _dummy_hash() -> bytes:
    return bcrypt.hashpw(b"dummy", bcrypt.gensalt())


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_secret(plain_password), password_hash.encode())
    except ValueError:
        # Senha que o bcrypt recusa (byte nulo, acima de 4096 bytes) ou hash malformado é só senha
        # errada, não 500. O dummy mantém o tempo igual ao de uma conta inexistente.
        dummy_verify_password()
        return False


def dummy_verify_password() -> None:
    """Gasta o tempo de um bcrypt quando a conta não existe: o tempo de resposta
    não pode revelar quais e-mails têm cadastro."""
    bcrypt.checkpw(b"dummy", _dummy_hash())


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_email(email: str) -> str:
    """HMAC, não SHA puro: e-mail é fácil de adivinhar e o hash fica em `login_events`."""
    return hmac.new(SECRET_KEY.encode(), email.encode(), hashlib.sha256).hexdigest()
