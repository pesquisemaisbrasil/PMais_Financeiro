"""Dias úteis: sábado, domingo e feriado não contam.

Os feriados nacionais fixos e a Páscoa vêm daqui (valem mesmo sem nada cadastrado). Os que o
financeiro cadastra, ou que a BrasilAPI trouxe (`services/holidays.py`), entram como `extra`: um
mapa de data para nome, que também serve para dizer o motivo ao avisar.
"""

from collections.abc import Mapping
from datetime import date, timedelta
from functools import lru_cache
from types import MappingProxyType

FIXED_HOLIDAYS = (
    (1, 1),
    (4, 21),
    (5, 1),
    (9, 7),
    (10, 12),
    (11, 2),
    (11, 15),
    (11, 20),
    (12, 25),
)

NO_EXTRA: Mapping[date, str] = MappingProxyType({})


def easter(year: int) -> date:
    """Domingo de Páscoa, pelo algoritmo gregoriano anônimo."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    m = (32 + 2 * e + 2 * i - h - k) % 7
    n = (a + 11 * h + 22 * m) // 451
    month, day = divmod(h + m - 7 * n + 114, 31)
    return date(year, month, day + 1)


@lru_cache(maxsize=32)
def holidays(year: int) -> frozenset[date]:
    # Só os nacionais fixos e a Páscoa. Carnaval, ponto facultativo e feriado estadual ou municipal
    # entram pelo cadastro de feriados (`extra`).
    sunday = easter(year)
    return frozenset(
        {date(year, month, day) for month, day in FIXED_HOLIDAYS}
        | {sunday - timedelta(days=2), sunday + timedelta(days=60)}
    )


def why_not_business(day: date, extra: Mapping[date, str] = NO_EXTRA) -> str | None:
    """O motivo de o dia não ser útil ("sábado", "feriado: Finados"...), ou None se ele é útil."""
    if day.weekday() == 5:
        return "sábado"
    if day.weekday() == 6:
        return "domingo"
    if day in extra:
        return f"feriado: {extra[day]}"
    if day in holidays(day.year):
        return "feriado nacional"
    return None


def is_business_day(day: date, extra: Mapping[date, str] = NO_EXTRA) -> bool:
    return why_not_business(day, extra) is None


def next_business_day(day: date, extra: Mapping[date, str] = NO_EXTRA) -> date:
    """O próprio dia se for útil; senão, o próximo dia útil."""
    while not is_business_day(day, extra):
        day += timedelta(days=1)
    return day


def add_business_days(start: date, days: int, extra: Mapping[date, str] = NO_EXTRA) -> date:
    """O dia `days` úteis depois de `start`, que não conta."""
    day = start
    remaining = days
    while remaining > 0:
        day += timedelta(days=1)
        if is_business_day(day, extra):
            remaining -= 1
    return day
