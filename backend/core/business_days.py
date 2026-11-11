"""Dias úteis: sábado, domingo e feriado nacional não contam."""

from datetime import date, timedelta
from functools import lru_cache

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


def _easter(year: int) -> date:
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
    # shortcut: só feriados nacionais, como no protótipo; ter um cadastro quando o financeiro
    # precisar de feriado municipal ou de ponto facultativo.
    easter = _easter(year)
    return frozenset(
        {date(year, month, day) for month, day in FIXED_HOLIDAYS}
        | {easter - timedelta(days=2), easter + timedelta(days=60)}
    )


def is_business_day(day: date) -> bool:
    return day.weekday() < 5 and day not in holidays(day.year)


def add_business_days(start: date, days: int) -> date:
    """O dia `days` úteis depois de `start`, que não conta."""
    day = start
    remaining = days
    while remaining > 0:
        day += timedelta(days=1)
        if is_business_day(day):
            remaining -= 1
    return day
