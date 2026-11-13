"""Roda o roteiro de teste da integração com o Connect de DEV (`services/connect_check.py`).

Uso, de dentro de `backend/`:

    python scripts/connect_dev_check.py

Lê `backend/.env.connect` (ignorado pelo git) com `CONNECT_BASE_URL`, `CONNECT_CLIENT_ID` e
`CONNECT_CLIENT_SECRET` da conta de serviço do dev (o segredo vem do João, aparece uma vez e
nunca vai para o chat, o repositório ou o log). Dá baixa e desfaz a baixa de itens fictícios no
Connect, então **recusa qualquer endereço que não seja o do dev**. Não grava nada no Financeiro.
"""

import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import dotenv_values  # noqa: E402

from services.connect_check import DevCheck  # noqa: E402
from services.connect_http import HttpConnect  # noqa: E402

ENV_FILE = BACKEND / ".env.connect"
# Só o Connect de dev (ou um dev na mesma máquina ou na rede interna do dev). Nunca produção.
DEV_HOSTS = {"api.dev.connect.pesquisemais.com.br", "connect-dev-api", "localhost", "127.0.0.1"}
# Só a máquina local e a rede interna do dev podem usar http; o endereço público exige https, senão
# o segredo da conta de serviço iria em claro.
PLAIN_HTTP_HOSTS = {"connect-dev-api", "localhost", "127.0.0.1"}
REQUIRED = ("CONNECT_BASE_URL", "CONNECT_CLIENT_ID", "CONNECT_CLIENT_SECRET")


def main() -> int:
    if not ENV_FILE.exists():
        print(
            f"Falta o arquivo {ENV_FILE.name} em backend/, com {', '.join(REQUIRED)}.\n"
            "O segredo da conta de serviço do dev vem do João e nunca vai para o chat ou o git."
        )
        return 2
    values = dotenv_values(ENV_FILE)
    missing = [name for name in REQUIRED if not values.get(name)]
    if missing:
        print(f"Faltam no {ENV_FILE.name}: {', '.join(missing)}")
        return 2
    base, client_id, secret = (str(values[name]) for name in REQUIRED)
    host = urlparse(base).hostname or ""
    if host not in DEV_HOSTS:
        print(
            f"Recusado: {host or base} não é o Connect de dev. Este teste dá baixa e desfaz a "
            "baixa, e só roda em: " + ", ".join(sorted(DEV_HOSTS))
        )
        return 2

    if urlparse(base).scheme != "https" and host not in PLAIN_HTTP_HOSTS:
        print(f"Recusado: {host} só com https://. Com http o segredo iria em claro.")
        return 2

    connect = HttpConnect(base, client_id, secret)
    # o mesmo cliente com um token de escopo mínimo: o Connect tem de recusar a baixa dele
    restricted = HttpConnect(base, client_id, secret, scope="projects:read")
    check = DevCheck(
        connect, restricted=restricted, today=datetime.now(ZoneInfo("America/Sao_Paulo")).date()
    )
    print(f"Connect de dev: {host}\n")
    labels = {"ok": "OK     ", "falhou": "FALHOU ", "pulado": "PULADO "}
    for step in check.run():
        print(f"{labels[step.status]} {step.name}: {step.detail}")
    failed = sum(1 for step in check.steps if step.status == "falhou")
    skipped = sum(1 for step in check.steps if step.status == "pulado")
    print(
        f"\n{len(check.steps) - failed - skipped} passaram, {failed} falharam, {skipped} pulados."
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
