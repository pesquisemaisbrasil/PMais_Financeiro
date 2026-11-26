"""Redefine a senha de quem esqueceu: põe uma senha provisória, que a pessoa troca no próximo login.

Uso (no servidor: make redefinir-senha EMAIL=...):
    python scripts/redefinir_senha.py --email ana@pesquisemais.com.br

A senha provisória é pedida no terminal, para não ficar no histórico do shell. Sem terminal (CI),
vem da variável CREATE_USER_PASSWORD. Ela segue a mesma regra de força das outras senhas e só vale
até a pessoa entrar: o login pede uma senha nova, só dela, antes do código do autenticador (o mesmo
passo da senha inicial de primeiro acesso). O autenticador e os computadores liberados continuam;
as sessões abertas da conta são encerradas. Confirme quem pediu antes de rodar. Fica em
login_events como `password_reset`.
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from db.connection import SessionLocal  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.mfa_recovery_code import MfaRecoveryCode  # noqa: E402,F401
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402
from schemas.user import validate_password_strength  # noqa: E402
from services.auth import normalize_email, reset_password  # noqa: E402
from services.login_events import record_login_event  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == normalize_email(args.email)).first()
        if user is None:
            sys.exit("Nenhuma conta com esse e-mail. Nada mudou.")

        password = os.environ.get("CREATE_USER_PASSWORD") or getpass.getpass("Senha provisória: ")
        try:
            validate_password_strength(password)
        except ValueError as exc:
            sys.exit(f"{exc}. Nada mudou.")

        reset_password(db, user, password)
        record_login_event(db, user_id=user.id, success=False, reason="password_reset")
        aviso = "" if user.status == "active" else " Atenção: a conta está inativa e não entra."
        print(
            f"Senha provisória salva (id={user.id}). No próximo login a pessoa cria uma senha só"
            f" dela; o autenticador continua o mesmo. As sessões abertas foram encerradas.{aviso}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
