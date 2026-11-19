"""Tarefas em segundo plano da API: o envio das baixas ao Connect e a busca dos feriados.

Liga com `PAYMENT_DISPATCH_SECONDS` maior que zero (padrão: desligado). A cada intervalo, envia
os pedidos de baixa que ficaram em `pendente_envio` ou `enviada`. É seguro com mais de uma
instância no ar: cada pedido leva o mesmo Idempotency-Key, então o Connect nunca paga duas vezes.
shortcut: um laço dentro da API, sem fila; vira processo próprio se o volume crescer.

A busca dos feriados (ADR 0024) liga com `HOLIDAYS_SYNC_HOURS` maior que zero: espera o feriados.dev
subir e carregar os dados, e depois busca o ano de hoje e o próximo a cada intervalo.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from core.config import HOLIDAYS_SYNC_HOURS, PAYMENT_DISPATCH_SECONDS
from db.connection import SessionLocal
from services import holidays, payments
from services.connect_gateway import ConnectGateway, get_connect

logger = logging.getLogger(__name__)
# o feriados.dev sobe junto com a API e leva um tempo para carregar os dados das cidades
HOLIDAYS_FIRST_DELAY = 90


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


def sync_holidays_once(session_factory: Callable[[], Session] = SessionLocal) -> None:
    """Uma rodada da busca dos feriados. Nunca levanta."""
    db = session_factory()
    try:
        holidays.sync_years(db)
    except Exception:
        logger.exception("Falha na rodada da busca dos feriados")
        db.rollback()
    finally:
        db.close()


async def holidays_loop(hours: float, first_delay: float = HOLIDAYS_FIRST_DELAY) -> None:
    await asyncio.sleep(first_delay)
    while True:
        await run_in_threadpool(sync_holidays_once)
        await asyncio.sleep(hours * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    tasks = []
    if PAYMENT_DISPATCH_SECONDS > 0:
        tasks.append(asyncio.create_task(dispatch_loop(PAYMENT_DISPATCH_SECONDS)))
    if HOLIDAYS_SYNC_HOURS > 0:
        tasks.append(asyncio.create_task(holidays_loop(HOLIDAYS_SYNC_HOURS)))
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
