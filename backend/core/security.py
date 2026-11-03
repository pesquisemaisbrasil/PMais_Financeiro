import hashlib
import hmac

from passlib.context import CryptContext

from core.config import SECRET_KEY

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(plain_password, password_hash)
    except ValueError:
        # Senha que o bcrypt recusa (byte nulo, acima de 4096 bytes) é só senha errada, não 500.
        # O dummy mantém o tempo igual ao de uma conta inexistente.
        pwd_context.dummy_verify()
        return False


def dummy_verify_password() -> None:
    """Gasta o tempo de um bcrypt quando a conta não existe: o tempo de resposta
    não pode revelar quais e-mails têm cadastro."""
    pwd_context.dummy_verify()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_email(email: str) -> str:
    """HMAC, não SHA puro: e-mail é fácil de adivinhar e o hash fica em `login_events`."""
    return hmac.new(SECRET_KEY.encode(), email.encode(), hashlib.sha256).hexdigest()
