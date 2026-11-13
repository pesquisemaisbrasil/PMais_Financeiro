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


def _import_models() -> None:
    import importlib
    import pkgutil

    import models

    for module in pkgutil.iter_modules(models.__path__):
        importlib.import_module(f"models.{module.name}")


def _build_database() -> None:
    from db.connection import Base, SessionLocal, engine
    from scripts.seed_demonstracao import seed_demonstracao

    _import_models()
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_demonstracao(db)
    finally:
        db.close()


def start(saved: Any = None) -> None:
    """Prepara o ambiente e o banco. Chamar uma vez, antes de `handle`. Com `saved` (o que
    `snapshot()` devolveu numa visita anterior) o banco volta como estava; sem ele, ou se a cópia
    não abrir, nasce do zero com os dados de exemplo."""
    import httpx

    _prepare()
    import main

    data = _as_bytes(saved)
    if data is not None:
        _import_models()
        try:
            _restore(data)
        except Exception:  # cópia corrompida ou de outra versão: recomeça do zero
            from db.connection import Base, engine

            Base.metadata.drop_all(engine)
            _build_database()
    else:
        _build_database()
    _state["client"] = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main.app), base_url="http://demonstracao"
    )


def _as_bytes(saved: Any) -> bytes | None:
    """O que o navegador mandou: bytes (ou um Uint8Array), ou nada. O `null` do JavaScript chega
    como `JsNull`, não como `None`: qualquer coisa que não vire bytes é "sem cópia"."""
    if saved is None:
        return None
    try:
        data = bytes(saved.to_py() if hasattr(saved, "to_py") else saved)
    except TypeError:
        return None
    return data or None


def _live_connection() -> tuple[Any, Any]:
    """A conexão única do banco em memória (o par: a do pool, para devolver, e a do SQLite)."""
    from db.connection import engine

    pooled = engine.raw_connection()
    return pooled, getattr(pooled, "driver_connection", None) or pooled.connection


def snapshot() -> bytes:
    """O banco inteiro como bytes (um arquivo SQLite), para o navegador guardar entre as visitas."""
    import pathlib
    import sqlite3
    import tempfile

    pooled, live = _live_connection()
    try:
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / "demonstracao.db"
            copy = sqlite3.connect(path)
            try:
                live.backup(copy)
            finally:
                copy.close()
            return path.read_bytes()
    finally:
        pooled.close()


def _restore(data: bytes) -> None:
    import pathlib
    import sqlite3
    import tempfile

    pooled, live = _live_connection()
    try:
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / "demonstracao.db"
            path.write_bytes(data)
            saved = sqlite3.connect(path)
            try:
                saved.backup(live)
            finally:
                saved.close()
    finally:
        pooled.close()


def reset() -> None:
    """Volta ao ponto de partida: apaga tudo e semeia de novo."""
    from db.connection import Base, engine

    Base.metadata.drop_all(engine)
    _build_database()


def totp_code() -> str:
    """O código do autenticador da demonstração, para o "Entrar" usar. O backend recusa uma janela
    de 30 segundos já usada (quem vê um código passar não o repete); aqui o código é do próprio
    navegador, então liberar a janela deixa entrar, sair e entrar de novo logo em seguida."""
    import pyotp

    from db.connection import SessionLocal
    from models.user import User
    from scripts.seed_demonstracao import DEMO_EMAIL, DEMO_TOTP_SECRET

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=DEMO_EMAIL).one()
        user.totpLastUsedStep = None
        db.commit()
    finally:
        db.close()
    return pyotp.TOTP(DEMO_TOTP_SECRET).now()


def credentials() -> dict[str, str]:
    from scripts.seed_demonstracao import DEMO_EMAIL, DEMO_PASSWORD

    return {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}


async def handle(
    method: str, path: str, headers: list[tuple[str, str]], body: bytes
) -> tuple[int, list[tuple[str, str]], bytes]:
    """Um pedido da tela. Devolve o status, os cabeçalhos (um par por cabeçalho, inclusive
    vários Set-Cookie) e o corpo."""
    # Do navegador chegam listas e um Uint8Array (JsProxy): vira pares e bytes.
    if hasattr(body, "to_py"):
        body = body.to_py()
    pairs = [(str(name), str(value)) for name, value in headers]
    response = await _state["client"].request(method, path, headers=pairs, content=bytes(body))
    return response.status_code, list(response.headers.multi_items()), response.content
