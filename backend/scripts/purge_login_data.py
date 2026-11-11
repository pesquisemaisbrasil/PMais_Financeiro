"""Apaga tentativas de login e sessões antigas, pelos prazos da pergunta Q26 (DPO).

Uso (só conta, não apaga):
    python scripts/purge_login_data.py --login-events-days 180 --refresh-tokens-days 30

Para apagar de verdade, acrescente --apply. Os prazos também podem vir de
LOGIN_EVENTS_RETENTION_DAYS e REFRESH_TOKENS_RETENTION_DAYS; sem prazo, o tipo é ignorado.
**Não rode com --apply antes de o DPO aprovar os prazos.** A proposta que está com ele: 180 dias
para tentativas de login (Marco Civil, art. 15) e 30 dias depois de expirar para sessões.
"""

import argparse
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from db.connection import SessionLocal  # noqa: E402
from services.retention import purge_login_data  # noqa: E402


def _env_days(name: str) -> int | None:
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else None


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "--login-events-days", type=int, default=_env_days("LOGIN_EVENTS_RETENTION_DAYS")
    )
    parser.add_argument(
        "--refresh-tokens-days", type=int, default=_env_days("REFRESH_TOKENS_RETENTION_DAYS")
    )
    parser.add_argument("--apply", action="store_true", help="apaga de verdade")
    args = parser.parse_args()

    if args.login_events_days is None and args.refresh_tokens_days is None:
        sys.exit("Nenhum prazo informado: nada a fazer (a limpeza está desligada).")

    db = SessionLocal()
    try:
        try:
            found = purge_login_data(
                db,
                now=datetime.now(UTC),
                login_events_days=args.login_events_days,
                refresh_tokens_days=args.refresh_tokens_days,
                dry_run=not args.apply,
            )
        except ValueError as exc:
            sys.exit(str(exc))
        verb = "apagados" if args.apply else "passariam do prazo (simulação, nada foi apagado)"
        print(f"Tentativas de login {verb}: {found['login_events']}")
        print(f"Sessões {verb}: {found['refresh_tokens']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
