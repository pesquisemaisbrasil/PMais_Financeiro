import pytest
from fastapi import HTTPException

from core.query_lists import MAX_CHOICES, as_list, parse_choices, parse_ids


def test_ids_become_a_list_without_repeats_and_empty_means_no_filter() -> None:
    assert parse_ids("3,5") == [3, 5]
    assert parse_ids(" 3 , 5 ,3") == [3, 5]
    assert parse_ids("7") == [7]
    assert parse_ids(None) is None
    assert parse_ids("") is None
    assert parse_ids(" , ") is None


@pytest.mark.parametrize("raw", ["x", "1,x", "0", "-1", "1.5", "٣", "2147483648"])
def test_ids_refuse_what_is_not_a_database_id(raw: str) -> None:
    with pytest.raises(HTTPException) as refused:
        parse_ids(raw)
    assert refused.value.status_code == 422


def test_the_list_has_a_ceiling() -> None:
    assert parse_ids(",".join(str(n) for n in range(1, MAX_CHOICES + 1))) is not None
    with pytest.raises(HTTPException):
        parse_ids(",".join(str(n) for n in range(1, MAX_CHOICES + 2)))


def test_choices_only_take_the_allowed_options() -> None:
    assert parse_choices("a,b,a", ["a", "b", "c"]) == ["a", "b"]
    assert parse_choices(None, ["a"]) is None
    with pytest.raises(HTTPException):
        parse_choices("a,z", ["a", "b"])


def test_as_list_keeps_old_callers_working() -> None:
    assert as_list(None) == []
    assert as_list("") == []
    assert as_list(4) == [4]
    assert as_list([4, 5]) == [4, 5]
    assert as_list(("a",)) == ["a"]
