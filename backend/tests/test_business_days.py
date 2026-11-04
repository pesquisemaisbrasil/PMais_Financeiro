from datetime import date

import pytest

from core.business_days import add_business_days, holidays, is_business_day


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
