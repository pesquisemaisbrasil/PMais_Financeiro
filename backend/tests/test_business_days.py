from datetime import date

import pytest

from core.business_days import (
    add_business_days,
    holidays,
    is_business_day,
    next_business_day,
    previous_business_day,
    why_not_business,
)


def test_holidays_match_the_validated_prototype() -> None:
    assert holidays(2026) == {
        date.fromisoformat(day)
        for day in (
            "2026-01-01",
            "2026-04-03",
            "2026-04-21",
            "2026-05-01",
            "2026-06-04",
            "2026-09-07",
            "2026-10-12",
            "2026-11-02",
            "2026-11-15",
            "2026-11-20",
            "2026-12-25",
        )
    }
    assert date(2027, 3, 26) in holidays(2027)
    assert date(2027, 5, 27) in holidays(2027)


@pytest.mark.parametrize(
    ("start", "days", "expected"),
    [
        # sexta conta segunda, e o dia de partida não conta
        (date(2026, 10, 23), 1, date(2026, 10, 26)),
        # 10 úteis a partir de 30/10 pulam 02/11 e 20/11 não entra
        (date(2026, 10, 30), 10, date(2026, 11, 16)),
        # partir de um feriado funciona
        (date(2026, 11, 2), 3, date(2026, 11, 5)),
        (date(2026, 10, 26), 0, date(2026, 10, 26)),
    ],
)
def test_add_business_days(start: date, days: int, expected: date) -> None:
    assert add_business_days(start, days) == expected
    assert days == 0 or is_business_day(expected)


# 25/01/2027 é segunda: feriado municipal de São Paulo, que o cadastro de feriados acrescenta
LOCAL = {date(2027, 1, 25): "Aniversário de São Paulo"}


def test_a_registered_holiday_is_not_a_business_day() -> None:
    assert is_business_day(date(2027, 1, 25))
    assert not is_business_day(date(2027, 1, 25), LOCAL)
    # 5 úteis a partir de 22/01 (sexta) seriam 29/01; com o feriado local sobem para 01/02
    assert add_business_days(date(2027, 1, 22), 5) == date(2027, 1, 29)
    assert add_business_days(date(2027, 1, 22), 5, LOCAL) == date(2027, 2, 1)


@pytest.mark.parametrize(
    ("day", "extra", "reason"),
    [
        (date(2026, 11, 7), {}, "sábado"),
        (date(2026, 11, 8), {}, "domingo"),
        (date(2026, 11, 2), {}, "feriado nacional"),
        (date(2027, 1, 25), LOCAL, "feriado: Aniversário de São Paulo"),
        (date(2026, 11, 9), {}, None),
    ],
)
def test_why_not_business_names_the_reason(
    day: date, extra: dict[date, str], reason: str | None
) -> None:
    assert why_not_business(day, extra) == reason


def test_next_business_day_keeps_a_business_day_and_skips_the_rest() -> None:
    assert next_business_day(date(2026, 11, 9)) == date(2026, 11, 9)
    assert next_business_day(date(2026, 11, 7)) == date(2026, 11, 9)  # sábado
    assert next_business_day(date(2026, 11, 15)) == date(2026, 11, 16)  # domingo e feriado
    assert next_business_day(date(2027, 1, 25), LOCAL) == date(2027, 1, 26)


def test_previous_business_day_keeps_a_business_day_and_goes_back_over_the_rest() -> None:
    assert previous_business_day(date(2026, 11, 9)) == date(2026, 11, 9)
    assert previous_business_day(date(2026, 11, 7)) == date(2026, 11, 6)  # sábado → sexta
    assert previous_business_day(date(2026, 11, 8)) == date(2026, 11, 6)  # domingo → sexta
    # 20/11/2026 é feriado nacional (sexta): volta para a quinta
    assert previous_business_day(date(2026, 11, 20)) == date(2026, 11, 19)
    assert previous_business_day(date(2027, 1, 25), LOCAL) == date(
        2027, 1, 22
    )  # segunda local → sexta
