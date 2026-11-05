"""Reenvia ao Connect as baixas que ficaram esperando (Connect fora do ar na hora de confirmar).

Uso: python scripts/dispatch_payments.py

Seguro de repetir: cada pedido leva o mesmo Idempotency-Key, então o Connect nunca paga duas
vezes. Pedido recusado não é reenviado: espera decisão humana em Divergências. Agende de
poucos em poucos minutos (cron) enquanto não houver um despachante próprio.
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from db.connection import SessionLocal  # noqa: E402
from models.login_event import LoginEvent  # noqa: E402,F401
from models.mfa_recovery_code import MfaRecoveryCode  # noqa: E402,F401
from models.refresh_token import RefreshToken  # noqa: E402,F401
from models.user import User  # noqa: E402,F401
from services import payments  # noqa: E402
from services.connect_gateway import get_connect  # noqa: E402


def main() -> None:
    db = SessionLocal()
    try:
        applied = payments.dispatch(db, get_connect())
        print(f"{applied} baixa(s) aplicada(s) pelo Connect.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
