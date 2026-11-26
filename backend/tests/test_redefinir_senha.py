"""Redefinir a senha de quem esqueceu (make redefinir-senha, 26/11/2026; spec acesso-e-auditoria):
uma senha provisória, que a pessoa troca no próximo login pelo mesmo passo da senha inicial,
antes do código do autenticador. O autenticador continua, e as sessões abertas caem."""

import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import verify_password
from models.refresh_token import RefreshToken
from models.user import User
from services.auth import reset_password
from tests.conftest import PASSWORD
from tests.test_auth import bearer, login, sign_in
from tests.test_mfa import current_code
from tests.test_senha_inicial import PENDING, change

TEMPORARY = "Provisoria!7x"
OWN = "Minha!Senha9"


def test_the_temporary_password_asks_for_a_new_one_and_keeps_the_authenticator(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    user = make_user()
    reset_password(db_session, user, TEMPORARY)

    assert login(client).status_code == 401  # a senha esquecida não vale mais
    challenge = login(client, password=TEMPORARY).json()
    assert challenge["password_change_required"] is True
    assert challenge["setup_required"] is False  # o autenticador continua cadastrado

    changed = change(client, challenge["mfa_token"], OWN)
    assert changed.status_code == 200
    # depois da senha nova, o código do app de sempre, sem cadastrar de novo
    assert changed.json()["setup_required"] is False
    token = changed.json()["mfa_token"]
    signed = client.post("/auth/token/mfa", json={"code": current_code()}, headers=bearer(token))
    assert signed.status_code == 200

    db_session.refresh(user)
    assert user.mustChangePassword is False
    assert user.mfaEnabledAt is not None
    assert verify_password(OWN, user.passwordHash)
    assert login(client, password=TEMPORARY).status_code == 401  # a provisória acabou


def test_nothing_opens_with_the_temporary_password(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    user = make_user()
    reset_password(db_session, user, TEMPORARY)
    token = login(client, password=TEMPORARY).json()["mfa_token"]
    code = client.post("/auth/token/mfa", json={"code": current_code()}, headers=bearer(token))
    assert code.status_code == 403
    assert code.json()["detail"] == PENDING


def test_the_new_password_cannot_be_the_temporary_one(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    user = make_user()
    reset_password(db_session, user, TEMPORARY)
    token = login(client, password=TEMPORARY).json()["mfa_token"]
    same = change(client, token, TEMPORARY)
    assert same.status_code == 422
    assert same.json()["detail"] == "A senha nova precisa ser diferente da senha inicial"


def test_open_sessions_are_closed(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    user = make_user()
    assert sign_in(client).status_code == 200
    reset_password(db_session, user, TEMPORARY)

    open_sessions = (
        db_session.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False))
        .count()
    )
    assert open_sessions == 0
    assert client.post("/auth/token/refresh").status_code == 401


def _run(env: dict[str, str], *args: str) -> subprocess.CompletedProcess[str]:
    backend = Path(__file__).resolve().parents[1]
    return subprocess.run(
        [sys.executable, *args], cwd=backend, env=env, capture_output=True, text=True
    )


def test_the_script(tmp_path: Path) -> None:
    """make redefinir-senha roda o scripts/redefinir_senha.py dentro da API."""
    database = tmp_path / "contas.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{database}", "CREATE_USER_PASSWORD": PASSWORD}
    setup = (
        "from db.connection import Base, engine; import models.user, models.refresh_token, "
        "models.login_event, models.mfa_recovery_code; Base.metadata.create_all(engine)"
    )
    assert _run(env, "-c", setup).returncode == 0
    created = _run(
        env, "scripts/create_user.py", "--email", "ana@pesquisemais.invalid", "--name", "Ana"
    )
    assert created.returncode == 0, created.stderr

    unknown = _run(
        {**env, "CREATE_USER_PASSWORD": TEMPORARY},
        "scripts/redefinir_senha.py",
        "--email",
        "ninguem@pesquisemais.invalid",
    )
    assert unknown.returncode != 0
    assert "Nenhuma conta com esse e-mail" in unknown.stderr

    weak = _run(
        {**env, "CREATE_USER_PASSWORD": "fraca"},
        "scripts/redefinir_senha.py",
        "--email",
        "ana@pesquisemais.invalid",
    )
    assert weak.returncode != 0
    assert "Nada mudou" in weak.stderr

    done = _run(
        {**env, "CREATE_USER_PASSWORD": TEMPORARY},
        "scripts/redefinir_senha.py",
        "--email",
        " Ana@PesquiseMais.invalid ",
    )
    assert done.returncode == 0, done.stderr
    assert "Senha provisória salva" in done.stdout

    check = (
        "from db.connection import SessionLocal; from models.user import User; "
        "from models.login_event import LoginEvent; from core.security import verify_password; "
        "db = SessionLocal(); user = db.query(User).one(); "
        f"print(user.mustChangePassword, verify_password({TEMPORARY!r}, user.passwordHash), "
        "[e.reason for e in db.query(LoginEvent).all()])"
    )
    state = _run(env, "-c", check)
    assert state.stdout.strip() == "True True ['password_reset']", state.stderr
