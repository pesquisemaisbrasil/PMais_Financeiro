"""Redefine o MFA de uma conta que perdeu o celular e os códigos de recuperação.

Uso:
    python scripts/reset_mfa.py --email ana@pesquisemais.com.br

Apaga o segredo e os códigos e derruba as sessões: no próximo login a pessoa cadastra de novo.
Confirme quem pediu antes de rodar. Fica em login_events como `mfa_reset`, e a tela de
administração (com aviso ao dono) vem com a entrega de usuários.
"""

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from db.connection import SessionLocal  # noqa: E402
from models.user import User  # noqa: E402
from services.auth import normalize_email  # noqa: E402
from services.login_events import record_login_event  # noqa: E402
from services.mfa import reset_mfa  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == normalize_email(args.email)).first()
        if user is None:
            sys.exit("Nenhuma conta com esse e-mail")
        reset_mfa(db, user)
        record_login_event(db, user_id=user.id, success=False, reason="mfa_reset")
        print(f"MFA redefinido (id={user.id}). As sessões da conta foram encerradas.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
