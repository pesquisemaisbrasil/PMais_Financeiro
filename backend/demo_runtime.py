"""O backend da versão de demonstração, rodando dentro do navegador (Pyodide).

Não é usado em desenvolvimento nem em produção. O navegador carrega este arquivo junto com o
resto do backend (frontend/scripts/build-demo.mjs) e chama `start()` uma vez e `handle()` a cada
pedido da tela. O banco é um SQLite em memória, alimentado pelo `scripts/seed_demonstracao.py`
(só dados fictícios); as chaves abaixo são de mentira e só existem nesta demonstração.
"""

import base64
import os
import sys
import threading
from typing import Any

SETTINGS = {
    "SECRET_KEY": "demonstracao-sem-valor-chave-ficticia-32-caracteres",  # gitleaks:allow
    "PIX_SECRET_KEY": "demonstracao-sem-valor-chave-pix-ficticia-32-car",  # gitleaks:allow
    "ENCRYPTION_KEY": base64.b64encode(b"d" * 32).decode(),
    "FILES_MASTER_KEY": base64.b64encode(b"f" * 32).decode(),
    "DATABASE_URL": "sqlite:///:memory:",
    "ENVIRONMENT": "development",
    "REFRESH_COOKIE_SECURE": "false",
    # sem limite de requisições (é uma pessoa só, no próprio navegador)
    "RATE_LIMIT_ENABLED": "false",
    "PAYMENT_DISPATCH_SECONDS": "0",
    # tudo de mentira: o Connect, o cofre de arquivos e as consultas externas nunca são chamados
    "CONNECT_MODE": "simulated",
    "CNPJ_LOOKUP_MODE": "simulated",
    "HOLIDAYS_LOOKUP_MODE": "simulated",
    "FILES_MODE": "memory",
    "GOOGLE_CLIENT_ID": "",
    "MICROSOFT_CLIENT_ID": "",
}

_state: dict[str, Any] = {}


def _prepare() -> None:
    os.environ.update(SETTINGS)
    if sys.platform != "emscripten":
        return
    # O navegador não tem thread: as rotas síncronas do FastAPI rodam direto no laço de eventos, e
    # o relógio em thread do limite de requisições (desligado acima) simplesmente não é iniciado.
    import anyio.to_thread

    async def run_sync(func: Any, *args: Any, **_: Any) -> Any:
        return func(*args)

    anyio.to_thread.run_sync = run_sync
    threading.Timer.start = lambda self: None  # type: ignore[method-assign]


def _build_database() -> None:
    import importlib
    import pkgutil

    import models
    from db.connection import Base, SessionLocal, engine
    from scripts.seed_demonstracao import seed_demonstracao

    for module in pkgutil.iter_modules(models.__path__):
        importlib.import_module(f"models.{module.name}")
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_demonstracao(db)
    finally:
        db.close()


def start() -> None:
    """Prepara o ambiente, cria o banco e o preenche. Chamar uma vez, antes de `handle`."""
    import httpx

    _prepare()
    import main

    _build_database()
    _state["client"] = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app), base_url="http://demonstracao"
    )


def reset() -> None:
    """Volta ao ponto de partida: apaga tudo e semeia de novo."""
    from db.connection import Base, engine

    Base.metadata.drop_all(engine)
    _build_database()


def totp_code() -> str:
    """O código do autenticador da demonstração, para a tela de entrada mostrar."""
    import pyotp

    from scripts.seed_demonstracao import DEMO_TOTP_SECRET

    return pyotp.TOTP(DEMO_TOTP_SECRET).now()


def credentials() -> dict[str, str]:
    from scripts.seed_demonstracao import DEMO_EMAIL, DEMO_PASSWORD

    return {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}


async def handle(
    method: str, path: str, headers: list[tuple[str, str]], body: bytes
) -> tuple[int, list[tuple[str, str]], bytes]:
    """Um pedido da tela. Devolve o status, os cabeçalhos (um par por cabeçalho, inclusive
    vários Set-Cookie) e o corpo."""
    response = await _state["client"].request(method, path, headers=headers, content=body)
    return response.status_code, list(response.headers.multi_items()), response.content
