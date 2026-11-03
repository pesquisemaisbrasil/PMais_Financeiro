"""Cria uma conta do Financeiro. Não existe cadastro público: é assim que nasce o primeiro admin.

Uso:
    python scripts/create_user.py --email ana@pesquisemais.com.br --name "Ana" --role admin

A senha é pedida no terminal, para não ficar no histórico do shell. Sem terminal
(CI, seed), vem da variável CREATE_USER_PASSWORD. Se o e-mail já existe, não muda nada.
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from core.security import hash_password  # noqa: E402
from db.connection import SessionLocal  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402
from schemas.user import validate_password_strength  # noqa: E402
from services.auth import normalize_email  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--role", choices=["financeiro", "admin"], default="financeiro")
    args = parser.parse_args()

    email = normalize_email(args.email)
    if "@" not in email:
        sys.exit("E-mail inválido")

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"Já existe uma conta com esse e-mail (id={existing.id}). Nada mudou.")
            return

        password = os.environ.get("CREATE_USER_PASSWORD") or getpass.getpass("Senha: ")
        try:
            validate_password_strength(password)
        except ValueError as exc:
            sys.exit(str(exc))

        user = User(
            name=args.name, email=email, passwordHash=hash_password(password), role=args.role
        )
        db.add(user)
        db.commit()
        print(f"Conta criada (id={user.id}, papel={user.role}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
