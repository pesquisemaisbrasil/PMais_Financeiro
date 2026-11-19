"""Troca, pelo servidor, o nível de acesso de uma conta que já existe.

Uso:
    python scripts/definir_nivel.py --email ana@pesquisemais.com.br --nivel superadmin

Os níveis são `financeiro` (usuário), `admin` e `superadmin` (core/permissions.py). O super admin é
provisório, até o fim do desenvolvimento (Bruno, 19/11/2026); não há tela para trocar nível. Fica em
login_events como `role_changed_server`.
"""

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from core.permissions import ROLE_LABELS  # noqa: E402
from db.connection import SessionLocal  # noqa: E402
from models.user import User  # noqa: E402
from services.auth import normalize_email  # noqa: E402
from services.login_events import record_login_event  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--nivel", required=True, choices=list(ROLE_LABELS))
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == normalize_email(args.email)).first()
        if user is None:
            sys.exit("Nenhuma conta com esse e-mail")
        if user.role == args.nivel:
            sys.exit(f"Essa conta já é {ROLE_LABELS[args.nivel]}")
        user.role = args.nivel
        # super admin não tem tela bloqueada
        if args.nivel == "superadmin":
            user.blockedScreensText = ""
        db.commit()
        record_login_event(db, user_id=user.id, success=False, reason="role_changed_server")
        print(f"Nível trocado para {ROLE_LABELS[args.nivel]}. Vale no próximo clique da pessoa.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
