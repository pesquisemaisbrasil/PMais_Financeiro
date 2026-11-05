"""Despachante em segundo plano das baixas que esperam o Connect.

Liga com `PAYMENT_DISPATCH_SECONDS` maior que zero (padrão: desligado). A cada intervalo, envia
os pedidos de baixa que ficaram em `pendente_envio` ou `enviada`. É seguro com mais de uma
instância no ar: cada pedido leva o mesmo Idempotency-Key, então o Connect nunca paga duas vezes.
shortcut: um laço dentro da API, sem fila; vira processo próprio se o volume crescer.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from core.config import PAYMENT_DISPATCH_SECONDS
from db.connection import SessionLocal
from services import payments
from services.connect_gateway import ConnectGateway, get_connect

logger = logging.getLogger(__name__)


def run_once(
    connect: ConnectGateway | None = None,
    session_factory: Callable[[], Session] = SessionLocal,
) -> int:
    """Uma rodada. Devolve quantas baixas o Connect aplicou. Nunca levanta: um erro aqui não
    pode derrubar o laço."""
    db = session_factory()
    try:
        return payments.dispatch(db, connect or get_connect())
    except Exception:
        logger.exception("Falha na rodada de envio das baixas ao Connect")
        db.rollback()
        return 0
    finally:
        db.close()


async def dispatch_loop(interval: float) -> None:
    while True:
        await asyncio.sleep(interval)
        await run_in_threadpool(run_once)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    task = (
        asyncio.create_task(dispatch_loop(PAYMENT_DISPATCH_SECONDS))
        if PAYMENT_DISPATCH_SECONDS > 0
        else None
    )
    try:
        yield
    finally:
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
