"""Seed dos testes de tela (e2e, Playwright): banco SQLite descartável.

Apaga e recria `backend/e2e.db` com contas FICTÍCIAS. Quem roda é o
`frontend/playwright.config.ts`, antes de subir o uvicorn; os mesmos valores estão em
`frontend/e2e/fixtures.ts`. Cada teste usa a própria conta, porque um código aceito não vale
de novo e o estado de uma conta não pode vazar para outro teste.

Por segurança só aceita DATABASE_URL de SQLite em arquivo chamado e2e.db: nunca apaga um banco
de verdade.
"""

import os
import sys
from datetime import UTC, datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'e2e.db').as_posix()}")

_url = os.environ["DATABASE_URL"]
if not (_url.startswith("sqlite:///") and _url.endswith("e2e.db")):
    raise SystemExit("seed_e2e só roda com DATABASE_URL=sqlite:///.../e2e.db")
_target = Path(_url.removeprefix("sqlite:///"))
if not _target.is_absolute():
    _target = Path.cwd() / _target
if _target.exists():
    _target.unlink()

sys.path.append(str(BACKEND_DIR))

from core.crypto import encrypt_payload  # noqa: E402
from core.security import hash_password, hash_token  # noqa: E402
from db.connection import Base, SessionLocal, engine  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.mfa_recovery_code import MfaRecoveryCode  # noqa: E402
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402
from scripts.seed_demo import seed as seed_payables  # noqa: E402

PASSWORD = "E2e!Fictic1a"
TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # gitleaks:allow
RECOVERY_CODE = "E2E2RECUPERACAO2"

WITHOUT_MFA = ["novo@e2e.invalid"]
WITH_MFA = [
    "ana@e2e.invalid",
    "repete@e2e.invalid",
    "recupera@e2e.invalid",
    "roubo@e2e.invalid",
    "contas@e2e.invalid",
]


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        password_hash = hash_password(PASSWORD)
        for email in WITHOUT_MFA + WITH_MFA:
            db.add(User(name=email.split("@")[0], email=email, passwordHash=password_hash))
        db.commit()
        for email in WITH_MFA:
            user = db.query(User).filter(User.email == email).one()
            user.totpSecretEncrypted = encrypt_payload(
                TOTP_SECRET, f"users:totpSecretEncrypted:{user.id}"
            )
            user.mfaEnabledAt = datetime.now(UTC)
            db.add(MfaRecoveryCode(user_id=user.id, codeHash=hash_token(RECOVERY_CODE)))
        seed_payables(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
