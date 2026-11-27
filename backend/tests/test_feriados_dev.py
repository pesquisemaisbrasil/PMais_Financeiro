# ruff: noqa: F811
"""Feriados estaduais e municipais das capitais no feriados.dev (ADR 0024, Bruno 19/11/2026)."""

from collections.abc import Callable
from datetime import date
from typing import Any

import pytest
import requests
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core import config, dispatcher
from core.business_days import is_business_day
from models.reference import Holiday
from services import holiday_sync, holidays
from services.holidays import holiday_names
from tests.test_cnpj_lookup import FakeResponse
from tests.test_holidays import auth  # noqa: F401

FERIADOS = "http://feriados:3000"
# as respostas de mentira por endereço; um teste troca uma delas para simular a falha
online_answers: dict[str, Callable[[dict[str, Any]], Any]] = {}
NATIONAL = [{"date": "2026-01-01", "name": "Confraternização mundial", "type": "national"}]


def sp_page(page: int = 1, pages: int = 1) -> dict[str, Any]:
    """Uma página como o feriados.dev devolve para SP-sao-paulo: nacional, estado e cidade."""
    state = {"type": "state", "code": "SP", "name": "São Paulo", "stateCode": None}
    city = {"type": "municipality", "code": "SP-sao-paulo", "name": "São Paulo", "stateCode": "SP"}
    data = [
        {
            "date": "2026-01-25T00:00:00.000Z",
            "name": "Aniversário de São Paulo",
            "type": "municipal",
            "locations": [city],
        },
        {
            "date": "2026-07-09T00:00:00.000Z",
            "name": "Revolução Constitucionalista",
            "type": "state",
            "locations": [state],
        },
        {
            "date": "2026-02-16T00:00:00.000Z",
            "name": "Carnaval",
            "type": "optional",
            "locations": [],
        },
        {
            "date": "2026-04-21T00:00:00.000Z",
            "name": "Tiradentes",
            "type": "national",
            "locations": [],
        },
        {
            "date": "2027-01-25T00:00:00.000Z",
            "name": "De outro ano",
            "type": "municipal",
            "locations": [city],
        },
        {"date": "quebrado", "name": "Sem data", "type": "state", "locations": [state]},
        {
            "date": "2026-03-01T00:00:00.000Z",
            "name": "  ",
            "type": "municipal",
            "locations": [city],
        },
        "lixo",
    ]
    return {
        "status": "success",
        "data": data if page == 1 else [],
        "pagination": {"page": page, "totalPages": pages},
    }


@pytest.fixture
def online(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    """BrasilAPI e feriados.dev de mentira, respondendo por endereço; guarda as chamadas."""
    monkeypatch.setattr(config, "HOLIDAYS_LOOKUP_MODE", "brasilapi")
    monkeypatch.setattr(config, "FERIADOS_DEV_URL", FERIADOS)
    monkeypatch.setattr(config, "HOLIDAYS_LOCATIONS", ["SP-sao-paulo"])
    calls: list[Any] = []
    online_answers.clear()
    online_answers.update(
        {
            "https://brasilapi.com.br/api/feriados/v1/2026": lambda _: FakeResponse(200, NATIONAL),
            f"{FERIADOS}/v1/holidays": lambda params: FakeResponse(200, sp_page(params["page"], 2)),
        }
    )

    def get(url: str, **kwargs: Any) -> Any:
        calls.append((url, kwargs))
        if url not in online_answers:
            raise requests.ConnectionError("sem resposta de mentira para este endereço")
        answer = online_answers[url](kwargs.get("params") or {})
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(requests, "get", get)
    return calls


def test_the_search_brings_state_and_city_holidays_of_the_capitals(
    client: TestClient, auth: dict[str, str], online: list[Any], db_session: Session
) -> None:
    response = client.post("/holidays/sync?year=2026", headers=auth)
    assert (response.status_code, response.json()) == (
        200,
        {"year": 2026, "added": 1, "total": 1, "addedLocal": 2, "totalLocal": 2},
    )
    rows = {(h.day, h.name, h.scope, h.uf, h.city, h.source) for h in db_session.query(Holiday)}
    assert rows == {
        (date(2026, 1, 1), "Confraternização mundial", "nacional", None, None, "brasilapi"),
        (
            date(2026, 1, 25),
            "Aniversário de São Paulo",
            "municipal",
            "SP",
            "São Paulo",
            "feriados.dev",
        ),
        (date(2026, 7, 9), "Revolução Constitucionalista", "estadual", "SP", None, "feriados.dev"),
    }
    # ponto facultativo e nacional do feriados.dev ficam de fora; o dia vem antes do T, sem fuso
    assert not is_business_day(date(2026, 1, 25), holiday_names(db_session))
    # endereço fixo, código da configuração, sem seguir redirecionamento, páginas até o fim
    local_calls = [kwargs for url, kwargs in online if url == f"{FERIADOS}/v1/holidays"]
    assert [call["params"] for call in local_calls] == [
        {"year": 2026, "location": "SP-sao-paulo", "limit": 100, "page": 1},
        {"year": 2026, "location": "SP-sao-paulo", "limit": 100, "page": 2},
    ]
    assert all(call["allow_redirects"] is False for call in local_calls)

    again = client.post("/holidays/sync?year=2026", headers=auth).json()
    assert (again["addedLocal"], again["totalLocal"]) == (0, 2)


def test_the_same_holiday_in_two_capitals_enters_once(
    online: list[Any], monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    monkeypatch.setattr(config, "HOLIDAYS_LOCATIONS", ["SP-sao-paulo", "SP-sao-paulo"])
    result = holidays.sync(db_session, 2026)
    assert result["addedLocal"] == 2


def test_without_cities_only_the_national_ones_count_and_the_old_capitals_leave(
    online: list[Any], monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    """Bruno, 27/11/2026: com as 27 capitais, o sábado 28/11 ia para 01/12 por um feriado de
    Alagoas em 30/11. Sem cidade na lista, saem os das capitais e fica o cadastrado à mão."""
    db_session.add_all(
        [
            Holiday(
                day=date(2026, 11, 30),
                name="Dia do Evangélico",
                scope="estadual",
                uf="AL",
                source="feriados.dev",
            ),
            Holiday(day=date(2026, 12, 8), name="Da cidade", scope="municipal", source="manual"),
        ]
    )
    db_session.commit()
    monkeypatch.setattr(config, "HOLIDAYS_LOCATIONS", [])
    result = holidays.sync(db_session, 2026)
    assert result["addedLocal"] == 0
    assert {h.name for h in db_session.query(Holiday)} == {"Confraternização mundial", "Da cidade"}
    assert is_business_day(date(2026, 11, 30), holiday_names(db_session))
    assert not any(url.startswith(FERIADOS) for url, _ in online)


@pytest.mark.parametrize(
    "answer",
    [
        FakeResponse(404, {"status": "error"}),
        FakeResponse(200, {"data": "não é lista"}),
        FakeResponse(200, ValueError("não é JSON")),
        FakeResponse(200, sp_page(), size=500_000),
        requests.ConnectionError("feriados.dev fora do ar"),
    ],
)
def test_when_the_feriados_dev_fails_nothing_is_saved(
    client: TestClient,
    auth: dict[str, str],
    online: list[Any],
    db_session: Session,
    answer: Any,
) -> None:
    online_answers[f"{FERIADOS}/v1/holidays"] = lambda _: answer
    response = client.post("/holidays/sync?year=2026", headers=auth)
    assert response.status_code == 503
    # nem os nacionais entram: a busca é tudo ou nada
    assert db_session.query(Holiday).count() == 0


def test_a_bad_city_code_never_leaves_the_system(
    online: list[Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "HOLIDAYS_LOCATIONS", ["SP-sao-paulo&admin=1"])
    with pytest.raises(holiday_sync.HolidaysUnavailable):
        holiday_sync.fetch_local(2026)
    assert not any(url.startswith(FERIADOS) for url, _ in online)


def test_without_the_address_the_feriados_dev_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "FERIADOS_DEV_URL", "")
    assert holiday_sync.fetch_local(2026) == []
    with pytest.raises(Exception, match="Informe um ano entre 2000 e 2100"):
        holiday_sync.fetch_local(1999)


def test_the_automatic_search_runs_this_year_and_the_next_and_never_raises(
    online: list[Any], db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(holidays, "today", lambda: date(2026, 11, 19))
    # 2027 não tem resposta na BrasilAPI de mentira: falha, fica no log, e 2026 entra mesmo assim
    holidays.sync_years(db_session)
    assert db_session.query(Holiday).filter(Holiday.source == "feriados.dev").count() == 2
    years = [url.rsplit("/", 1)[-1] for url, _ in online if "brasilapi" in url]
    assert years == ["2026", "2027"]


def test_the_background_round_closes_its_session_even_when_it_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    closed: list[bool] = []

    class Session:
        def rollback(self) -> None: ...

        def close(self) -> None:
            closed.append(True)

    def boom(db: Any) -> None:
        raise RuntimeError("falhou")

    monkeypatch.setattr(holidays, "sync_years", boom)
    dispatcher.sync_holidays_once(lambda: Session())  # type: ignore[arg-type,return-value]
    assert closed == [True]
