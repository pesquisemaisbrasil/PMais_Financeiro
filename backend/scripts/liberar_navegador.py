"""Libera, pelo servidor, o pedido de navegador mais recente de uma conta.

Uso:
    python scripts/liberar_navegador.py --email ana@pesquisemais.com.br

Saída de emergência para quando não há outro administrador para liberar na tela Acessos (o admin
não libera o próprio computador). Confirme quem pediu antes de rodar. Fica em login_events como
`browser_server_approved`.
"""

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from db.connection import SessionLocal  # noqa: E402
from models.user import User  # noqa: E402
from services.auth import normalize_email  # noqa: E402
from services.browsers import approve_latest_request  # noqa: E402
from services.login_events import record_login_event  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == normalize_email(args.email)).first()
        if user is None:
            sys.exit("Nenhuma conta com esse e-mail")
        browser = approve_latest_request(db, user)
        if browser is None:
            sys.exit("Essa conta não tem pedido de navegador esperando")
        record_login_event(db, user_id=user.id, success=False, reason="browser_server_approved")
        print(f"Navegador liberado ({browser.label}). A pessoa já pode entrar de novo.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
