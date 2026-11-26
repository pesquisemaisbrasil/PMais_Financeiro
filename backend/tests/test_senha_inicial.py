"""Senha inicial de primeiro acesso (pedido do Bruno, 25/11/2026; spec acesso-e-auditoria): a conta
nasce com uma senha inicial, o primeiro login pede uma senha nova da pessoa, e só depois vêm o
cadastro do autenticador e o computador liberado."""

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
from tests.conftest import PASSWORD
from tests.test_auth import bearer, login
from tests.test_mfa import current_code

NEW_PASSWORD = "Minha!Senha9"
PENDING = "Troque a senha inicial antes de continuar"


def first_access_user(make_user: Callable[..., User], db_session: Session) -> User:
    """Conta nova da equipe: senha inicial (PASSWORD), sem autenticador."""
    user = make_user(mfa=False)
    user.mustChangePassword = True
    db_session.commit()
    return user


def change(client: TestClient, token: str, password: str = NEW_PASSWORD):  # type: ignore[no-untyped-def]
    return client.post("/auth/password/initial", json={"password": password}, headers=bearer(token))


def test_first_login_asks_for_a_new_password_before_the_authenticator(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    first_access_user(make_user, db_session)
    challenge = login(client).json()
    assert challenge["password_change_required"] is True
    assert challenge["setup_required"] is True

    changed = change(client, challenge["mfa_token"])
    assert changed.status_code == 200
    # um token parcial novo, e o próximo passo é o cadastro do autenticador
    assert changed.json()["password_change_required"] is False
    assert changed.json()["setup_required"] is True
    token = changed.json()["mfa_token"]
    secret = client.post("/auth/mfa/setup", headers=bearer(token)).json()["secret"]
    confirmed = client.post(
        "/auth/mfa/setup/confirm", json={"code": current_code(secret)}, headers=bearer(token)
    )
    assert confirmed.status_code == 200
    assert len(confirmed.json()["recovery_codes"]) == 10


def test_the_initial_password_stops_working_after_the_change(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    user = first_access_user(make_user, db_session)
    assert change(client, login(client).json()["mfa_token"]).status_code == 200

    db_session.refresh(user)
    assert user.mustChangePassword is False
    assert verify_password(NEW_PASSWORD, user.passwordHash)
    assert login(client).status_code == 401  # a inicial
    again = login(client, password=NEW_PASSWORD)
    assert again.status_code == 200
    assert again.json()["password_change_required"] is False


def test_nothing_opens_before_the_change(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    """Quem pular a tela continua barrado no servidor: nem autenticador, nem código, nem sessão."""
    first_access_user(make_user, db_session)
    token = login(client).json()["mfa_token"]
    for path, body in (
        ("/auth/mfa/setup", None),
        ("/auth/mfa/setup/confirm", {"code": "123456"}),
        ("/auth/token/mfa", {"code": "123456"}),
    ):
        response = client.post(path, json=body, headers=bearer(token))
        assert (response.status_code, response.json()["detail"]) == (403, PENDING), path
    assert db_session.query(RefreshToken).count() == 0


def test_the_new_password_follows_the_password_rule(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    user = first_access_user(make_user, db_session)
    token = login(client).json()["mfa_token"]

    weak = change(client, token, "fraca")
    assert weak.status_code == 422
    assert weak.json()["detail"].startswith("Senha precisa ter de 8 a 72 caracteres")
    same = change(client, token, PASSWORD)
    assert (same.status_code, same.json()["detail"]) == (
        422,
        "A senha nova precisa ser diferente da senha inicial",
    )
    db_session.refresh(user)
    assert user.mustChangePassword is True  # nada mudou


def test_the_change_happens_once(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    first_access_user(make_user, db_session)
    token = login(client).json()["mfa_token"]
    assert change(client, token).status_code == 200
    # o token parcial de antes da troca leva a marca da senha inicial: não vale mais para nada
    assert change(client, token, "Outra!Senha7").status_code == 401
    # com um login novo, a troca da senha inicial já feita é recusada com o aviso
    fresh = login(client, password=NEW_PASSWORD).json()["mfa_token"]
    repeated = change(client, fresh, "Outra!Senha7")
    assert (repeated.status_code, repeated.json()["detail"]) == (
        409,
        "A senha inicial já foi trocada. Entre de novo.",
    )


def test_an_account_without_initial_password_cannot_use_the_route(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    make_user()  # conta normal, com autenticador
    token = login(client).json()["mfa_token"]
    assert login(client).json()["password_change_required"] is False
    assert change(client, token).status_code == 409


def test_the_route_needs_the_partial_login_token(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    first_access_user(make_user, db_session)
    assert client.post("/auth/password/initial", json={"password": NEW_PASSWORD}).status_code == 401
    assert change(client, "nao-e-um-token").status_code == 401


def test_create_user_with_first_access(tmp_path: Path) -> None:
    """O script que cria as contas da equipe marca a senha inicial com --primeiro-acesso."""
    database = tmp_path / "contas.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{database}", "CREATE_USER_PASSWORD": PASSWORD}
    backend = Path(__file__).resolve().parents[1]
    setup = (
        "from db.connection import Base, engine; import models.user, models.refresh_token, "
        "models.login_event, models.mfa_recovery_code; Base.metadata.create_all(engine)"
    )
    subprocess.run([sys.executable, "-c", setup], cwd=backend, env=env, check=True)
    created = subprocess.run(
        [
            sys.executable,
            "scripts/create_user.py",
            "--email",
            "nova@pesquisemais.invalid",
            "--name",
            "Nova",
            "--primeiro-acesso",
        ],
        cwd=backend,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    assert "troca a senha no primeiro acesso" in created.stdout
    check = (
        "from db.connection import SessionLocal; from models.user import User; "
        "print(SessionLocal().query(User).one().mustChangePassword)"
    )
    flag = subprocess.run(
        [sys.executable, "-c", check], cwd=backend, env=env, capture_output=True, text=True
    )
    assert flag.stdout.strip() == "True"
