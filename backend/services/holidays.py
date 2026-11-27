"""Cadastro de feriados: os nacionais vêm da BrasilAPI, os estaduais e municipais das cidades
configuradas do feriados.dev (ADR 0024; desde 27/11/2026, nenhuma por padrão) e o financeiro ainda
pode cadastrar à mão.

Todos contam como dia não útil, além dos nacionais fixos e da Páscoa que já estão em
`core/business_days.py`. Vale para o sistema todo: ainda não há feriado por unidade ou cidade (Q42).
A busca roda sozinha (`sync_years`, de `HOLIDAYS_SYNC_HOURS` em `HOLIDAYS_SYNC_HOURS` horas) e pelo
botão da tela.
"""

import logging
from datetime import date
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from core.business_days import next_business_day, previous_business_day, why_not_business
from core.text import format_date_br
from models.reference import Holiday, RecordEvent
from models.user import User
from schemas.holidays import HolidayIn
from services import holiday_sync
from services.payable import PayableConflict, PayableInvalid, today
from services.records import UFS, RecordNotFound

KIND = "holidays"
logger = logging.getLogger(__name__)


def _row(holiday: Holiday) -> dict[str, Any]:
    return {
        "id": holiday.id,
        "date": holiday.day,
        "name": holiday.name,
        "scope": holiday.scope,
        "uf": holiday.uf,
        "city": holiday.city,
        "source": holiday.source,
    }


def _log(db: Session, record_id: int, user: User, text: str) -> None:
    db.add(RecordEvent(kind=KIND, record_id=record_id, user_id=user.id, text=text[:500]))


def list_all(db: Session) -> list[dict[str, Any]]:
    rows = db.query(Holiday).order_by(Holiday.day, Holiday.name).all()
    return [_row(holiday) for holiday in rows]


def holiday_names(db: Session) -> dict[date, str]:
    """Data e nome de cada feriado cadastrado, para o cálculo de dia útil (`extra`). Dois feriados
    no mesmo dia viram um nome só, separado por barra."""
    names: dict[date, list[str]] = {}
    query = db.query(Holiday.day, Holiday.name).order_by(Holiday.day, Holiday.name)
    for day, name in query:
        names.setdefault(day, []).append(name)
    return {day: " / ".join(found) for day, found in names.items()}


def check_day(db: Session, day: date) -> dict[str, Any]:
    """Para o aviso na hora de lançar: a data é dia útil? Se não, qual o motivo e para onde ir."""
    if not holiday_sync.MIN_YEAR <= day.year <= holiday_sync.MAX_YEAR:
        raise PayableInvalid(
            f"Informe uma data entre {holiday_sync.MIN_YEAR} e {holiday_sync.MAX_YEAR}"
        )
    extra = holiday_names(db)
    reason = why_not_business(day, extra)
    return {
        "date": day,
        "isBusinessDay": reason is None,
        "reason": reason,
        "previous": previous_business_day(day, extra),
        "next": next_business_day(day, extra),
    }


def _exists(db: Session, day: date, name: str) -> bool:
    return (
        db.query(Holiday.id)
        .filter(Holiday.day == day, func.lower(Holiday.name) == name.lower())
        .first()
        is not None
    )


def _place(data: HolidayIn) -> tuple[str | None, str | None]:
    """UF e cidade conforme o âmbito: nacional não tem, estadual tem UF, municipal tem as duas."""
    if data.scope == "nacional":
        return None, None
    uf = (data.uf or "").strip().upper()
    if not uf:
        raise PayableInvalid("Informe a UF do feriado")
    if uf not in UFS:
        raise PayableInvalid("UF inválida")
    if data.scope == "estadual":
        return uf, None
    city = " ".join((data.city or "").split())
    if not city:
        raise PayableInvalid("Informe a cidade do feriado municipal")
    return uf, city


def create(db: Session, data: HolidayIn, user: User) -> dict[str, Any]:
    name = " ".join(data.name.split())
    if not name:
        raise PayableInvalid("Informe o nome do feriado")
    if not holiday_sync.MIN_YEAR <= data.date.year <= holiday_sync.MAX_YEAR:
        raise PayableInvalid(
            f"Informe uma data entre {holiday_sync.MIN_YEAR} e {holiday_sync.MAX_YEAR}"
        )
    uf, city = _place(data)
    if _exists(db, data.date, name):
        raise PayableConflict("Esse feriado já está cadastrado")
    holiday = Holiday(day=data.date, name=name, scope=data.scope, uf=uf, city=city, source="manual")
    db.add(holiday)
    db.flush()
    _log(
        db,
        holiday.id,
        user,
        f"Feriado cadastrado: {name}, {format_date_br(data.date)} ({data.scope})",
    )
    db.commit()
    return _row(holiday)


def delete(db: Session, holiday_id: int, user: User) -> None:
    holiday = db.get(Holiday, holiday_id)
    if holiday is None:
        raise RecordNotFound
    _log(
        db,
        holiday.id,
        user,
        f"Feriado excluído: {holiday.name}, {format_date_br(holiday.day)} ({holiday.scope})",
    )
    db.delete(holiday)
    db.commit()


def _count(db: Session, year: int, nacional: bool) -> int:
    query = db.query(Holiday.id).filter(
        Holiday.day >= date(year, 1, 1), Holiday.day <= date(year, 12, 31)
    )
    scope = Holiday.scope == "nacional"
    return query.filter(scope if nacional else ~scope).count()


def sync(db: Session, year: int, user: User | None = None) -> dict[str, int]:
    """Traz os nacionais (BrasilAPI) e os estaduais e municipais das cidades configuradas
    (feriados.dev) do ano. Busca os dois antes de gravar: se um falha, nada muda. O que já existe
    (mesma data e nome) fica, inclusive o cadastrado à mão; só sai o do feriados.dev de uma cidade
    que deixou a lista (Bruno, 27/11/2026). Sem `user`, é a busca automática."""
    found = holiday_sync.fetch_national(year)
    local = holiday_sync.fetch_local(year)
    added = added_local = 0
    wanted = {(spot.day, spot.name) for spot in local}
    stale = [
        holiday
        for holiday in db.query(Holiday).filter(
            Holiday.source == "feriados.dev",
            Holiday.day >= date(year, 1, 1),
            Holiday.day <= date(year, 12, 31),
        )
        if (holiday.day, holiday.name) not in wanted
    ]
    for holiday in stale:
        db.delete(holiday)
    db.flush()
    for item in found:
        if _exists(db, item.day, item.name):
            continue
        db.add(Holiday(day=item.day, name=item.name, scope="nacional", source="brasilapi"))
        added += 1
    for spot in local:
        if _exists(db, spot.day, spot.name):
            continue
        db.add(
            Holiday(
                day=spot.day,
                name=spot.name,
                scope=spot.scope,
                uf=spot.uf,
                city=spot.city,
                source="feriados.dev",
            )
        )
        db.flush()  # o mesmo feriado em duas cidades (mesma data e nome) entra uma vez só
        added_local += 1
    text = f"Feriados de {year} buscados: {added} nacional(is) e {added_local} local(is) novo(s)"
    if stale:
        text += f"; {len(stale)} de cidades fora da lista removido(s)"
    if user is not None:
        _log(db, year, user, text)
    db.commit()
    return {
        "year": year,
        "added": added,
        "total": _count(db, year, nacional=True),
        "addedLocal": added_local,
        "totalLocal": _count(db, year, nacional=False),
    }


def sync_years(db: Session) -> None:
    """A busca automática: o ano de hoje e o próximo. Nunca levanta: a próxima rodada tenta."""
    year = today().year
    for target in (year, year + 1):
        try:
            result = sync(db, target)
            logger.info("Feriados de %s buscados: %s", target, result)
        except Exception:
            db.rollback()
            logger.warning("Não foi possível buscar os feriados de %s agora", target, exc_info=True)
