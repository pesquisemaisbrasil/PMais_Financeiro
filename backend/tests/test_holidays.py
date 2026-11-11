from collections.abc import Callable
from datetime import date
from typing import Any

import pytest
import requests
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core import config
from core.business_days import is_business_day
from models.reference import Holiday, RecordEvent
from models.user import User
from services import holiday_sync
from services.auth import create_access_token
from services.holidays import holiday_names
from tests.test_cnpj_lookup import FakeResponse, fake_get


@pytest.fixture
def auth(make_user: Callable[..., User]) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(make_user().id)}"}


@pytest.fixture
def simulated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "HOLIDAYS_LOOKUP_MODE", "simulated")


@pytest.fixture
def brasilapi(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "HOLIDAYS_LOOKUP_MODE", "brasilapi")


def local(**overrides: Any) -> dict[str, Any]:
    return {
        "date": "2027-01-25",
        "name": "Aniversário de São Paulo",
        "scope": "municipal",
        "uf": "SP",
        "city": "São Paulo",
        **overrides,
    }


# ---- Acesso ----


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/holidays"),
        ("post", "/holidays"),
        ("delete", "/holidays/1"),
        ("post", "/holidays/sync?year=2027"),
    ],
)
def test_every_route_needs_a_login(client: TestClient, method: str, path: str) -> None:
    assert getattr(client, method)(path).status_code == 401


def test_a_user_without_the_finance_role_is_refused(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    other = make_user(email="leitor@exemplo.com", role="leitor")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.get("/holidays", headers=headers).status_code == 403
    assert client.post("/holidays", json=local(), headers=headers).status_code == 403


# ---- Cadastrar, listar e excluir ----


def test_a_local_holiday_is_created_listed_by_date_and_logged(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    later = client.post("/holidays", json=local(date="2027-07-09", name="Revolução"), headers=auth)
    assert later.status_code == 201, later.text
    created = client.post("/holidays", json=local(), headers=auth)
    assert created.status_code == 201, created.text
    assert created.json() == {
        "id": created.json()["id"],
        "date": "2027-01-25",
        "name": "Aniversário de São Paulo",
        "scope": "municipal",
        "uf": "SP",
        "city": "São Paulo",
        "source": "manual",
    }

    listed = client.get("/holidays", headers=auth).json()
    assert [h["date"] for h in listed] == ["2027-01-25", "2027-07-09"]
    event = db_session.query(RecordEvent).filter_by(kind="holidays").order_by(RecordEvent.id).all()
    assert [e.text for e in event][-1] == (
        "Feriado cadastrado: Aniversário de São Paulo, 25/01/2027 (municipal)"
    )


def test_a_national_holiday_keeps_no_state_or_city(
    client: TestClient, auth: dict[str, str]
) -> None:
    response = client.post(
        "/holidays",
        json=local(date="2027-02-08", name="Carnaval", scope="nacional", uf="SP", city="Santos"),
        headers=auth,
    )
    assert response.status_code == 201, response.text
    assert (response.json()["uf"], response.json()["city"]) == (None, None)


def test_a_state_holiday_keeps_the_state_and_drops_the_city(
    client: TestClient, auth: dict[str, str]
) -> None:
    response = client.post(
        "/holidays",
        json=local(date="2027-07-09", name="Revolução", scope="estadual", uf="sp", city="Santos"),
        headers=auth,
    )
    assert response.status_code == 201, response.text
    assert (response.json()["uf"], response.json()["city"]) == ("SP", None)


@pytest.mark.parametrize(
    ("overrides", "status", "detail"),
    [
        ({"name": "   "}, 422, "Informe o nome do feriado"),
        ({"date": "1999-12-31"}, 422, "Informe uma data entre 2000 e 2100"),
        ({"date": "2101-01-01"}, 422, "Informe uma data entre 2000 e 2100"),
        ({"uf": None}, 422, "Informe a UF do feriado"),
        ({"uf": "XX"}, 422, "UF inválida"),
        ({"city": " "}, 422, "Informe a cidade do feriado municipal"),
    ],
)
def test_a_holiday_with_missing_or_bad_data_is_refused(
    client: TestClient,
    auth: dict[str, str],
    db_session: Session,
    overrides: dict[str, Any],
    status: int,
    detail: str,
) -> None:
    response = client.post("/holidays", json=local(**overrides), headers=auth)
    assert (response.status_code, response.json()["detail"]) == (status, detail)
    assert db_session.query(Holiday).count() == 0


def test_the_same_date_and_name_cannot_be_registered_twice(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    assert client.post("/holidays", json=local(), headers=auth).status_code == 201
    again = client.post("/holidays", json=local(name="  aniversário DE são paulo "), headers=auth)
    assert (again.status_code, again.json()["detail"]) == (409, "Esse feriado já está cadastrado")
    # outro nome no mesmo dia pode
    other = client.post("/holidays", json=local(name="Ponto facultativo"), headers=auth)
    assert other.status_code == 201
    assert db_session.query(Holiday).count() == 2


def test_deleting_removes_it_logs_it_and_a_missing_one_is_404(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    holiday_id = client.post("/holidays", json=local(), headers=auth).json()["id"]
    assert client.delete(f"/holidays/{holiday_id}", headers=auth).status_code == 204
    assert client.get("/holidays", headers=auth).json() == []
    last = (
        db_session.query(RecordEvent).filter_by(kind="holidays").order_by(RecordEvent.id).all()[-1]
    )
    assert last.text == "Feriado excluído: Aniversário de São Paulo, 25/01/2027 (municipal)"

    missing = client.delete(f"/holidays/{holiday_id}", headers=auth)
    assert (missing.status_code, missing.json()["detail"]) == (404, "Feriado não encontrado")


# ---- O que entra no cálculo de dia útil ----


def test_registered_holidays_become_non_business_days(
    client: TestClient, auth: dict[str, str], db_session: Session
) -> None:
    client.post("/holidays", json=local(), headers=auth)
    client.post("/holidays", json=local(name="Ponto facultativo"), headers=auth)
    names = holiday_names(db_session)
    assert names == {date(2027, 1, 25): "Aniversário de São Paulo / Ponto facultativo"}
    assert is_business_day(date(2027, 1, 25))
    assert not is_business_day(date(2027, 1, 25), names)


# ---- Buscar os nacionais (BrasilAPI) ----


def test_the_simulated_search_adds_the_national_holidays_and_only_once(
    client: TestClient, auth: dict[str, str], simulated: None
) -> None:
    first = client.post("/holidays/sync?year=2027", headers=auth)
    assert (first.status_code, first.json()) == (200, {"year": 2027, "added": 4, "total": 4})
    listed = client.get("/holidays", headers=auth).json()
    assert {(h["date"], h["name"], h["source"]) for h in listed} >= {
        ("2027-02-08", "Carnaval", "brasilapi"),
        ("2027-02-09", "Carnaval", "brasilapi"),
    }

    again = client.post("/holidays/sync?year=2027", headers=auth)
    assert again.json() == {"year": 2027, "added": 0, "total": 4}


def test_a_search_does_not_duplicate_what_was_registered_by_hand(
    client: TestClient, auth: dict[str, str], simulated: None
) -> None:
    client.post(
        "/holidays",
        json=local(date="2027-02-08", name="Carnaval", scope="nacional"),
        headers=auth,
    )
    result = client.post("/holidays/sync?year=2027", headers=auth).json()
    assert (result["added"], result["total"]) == (3, 4)


def test_the_search_asks_the_fixed_address_for_the_year_and_keeps_only_national_ones(
    client: TestClient, auth: dict[str, str], brasilapi: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = fake_get(
        monkeypatch,
        FakeResponse(
            200,
            [
                {"date": "2026-11-20", "name": "Dia da consciência negra", "type": "national"},
                {"date": "2026-02-16", "name": "Carnaval", "type": "national"},
                {"date": "2026-08-15", "name": "Do estado", "type": "state"},
                {"date": "2027-01-01", "name": "De outro ano", "type": "national"},
                {"date": "sem-data", "name": "Quebrado", "type": "national"},
                {"date": "2026-12-25", "name": "  ", "type": "national"},
                "lixo",
            ],
        ),
    )
    response = client.post("/holidays/sync?year=2026", headers=auth)
    assert (response.status_code, response.json()) == (200, {"year": 2026, "added": 2, "total": 2})
    url, kwargs = calls[0]
    assert url == "https://brasilapi.com.br/api/feriados/v1/2026"
    assert kwargs["allow_redirects"] is False and kwargs["timeout"] == holiday_sync.TIMEOUT


@pytest.mark.parametrize(
    "answer",
    [
        FakeResponse(500, {}),
        FakeResponse(200, ValueError("não é JSON")),
        FakeResponse(200, {"não": "é lista"}),
        FakeResponse(200, []),
        FakeResponse(200, [{"date": "2026-01-01", "name": "x", "type": "national"}], size=200_000),
        requests.ConnectionError("sem rede"),
    ],
)
def test_when_the_search_fails_nothing_is_saved_and_the_message_is_simple(
    client: TestClient,
    auth: dict[str, str],
    db_session: Session,
    brasilapi: None,
    monkeypatch: pytest.MonkeyPatch,
    answer: FakeResponse | Exception,
) -> None:
    fake_get(monkeypatch, answer)
    response = client.post("/holidays/sync?year=2026", headers=auth)
    assert response.status_code == 503
    assert response.json()["detail"].startswith("Não foi possível buscar os feriados agora")
    assert db_session.query(Holiday).count() == 0


@pytest.mark.parametrize("year", [1999, 2101])
def test_a_year_out_of_range_never_leaves_the_system(
    client: TestClient,
    auth: dict[str, str],
    brasilapi: None,
    monkeypatch: pytest.MonkeyPatch,
    year: int,
) -> None:
    calls = fake_get(monkeypatch, FakeResponse(200, []))
    response = client.post(f"/holidays/sync?year={year}", headers=auth)
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "Informe um ano entre 2000 e 2100",
    )
    assert calls == []


def test_the_search_is_off_when_the_mode_is_empty_and_simulation_is_refused_in_production(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    # sem modo: desligada
    assert client.post("/holidays/sync?year=2027", headers=auth).status_code == 503
    monkeypatch.setattr(config, "HOLIDAYS_LOOKUP_MODE", "simulated")
    monkeypatch.setattr(config, "ENVIRONMENT", "production")
    assert client.post("/holidays/sync?year=2027", headers=auth).status_code == 503
