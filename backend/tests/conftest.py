import base64
import os
from collections.abc import Callable, Generator
from datetime import UTC, datetime

os.environ.setdefault("SECRET_KEY", "test-secret-key-com-pelo-menos-32-caracteres")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("ENCRYPTION_KEY", base64.b64encode(b"0" * 32).decode())
# o TestClient fala http: com Secure, o cookie não voltaria (tem teste próprio do atributo)
os.environ.setdefault("REFRESH_COOKIE_SECURE", "false")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from core.crypto import encrypt_payload  # noqa: E402
from core.limiter import limiter  # noqa: E402
from core.security import hash_password  # noqa: E402
from db.connection import Base, get_db  # noqa: E402
from main import app  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.mfa_recovery_code import MfaRecoveryCode  # noqa: E402,F401
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402

PASSWORD = "Str0ng!Pass"
TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    limiter.reset()
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db_session: Session) -> Callable[..., User]:
    def _make_user(
        email: str = "ana@pesquisemais.com.br",
        role: str = "financeiro",
        status: str = "active",
        mfa: bool = True,
    ) -> User:
        user = User(
            name="Ana", email=email, passwordHash=hash_password(PASSWORD), role=role, status=status
        )
        db_session.add(user)
        db_session.commit()
        if mfa:
            user.totpSecretEncrypted = encrypt_payload(
                TOTP_SECRET, f"users:totpSecretEncrypted:{user.id}"
            )
            user.mfaEnabledAt = datetime.now(UTC)
            db_session.commit()
        return user

    return _make_user
