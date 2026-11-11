import json
from collections.abc import Callable, Iterator
from typing import Any

import pytest
import requests
from fastapi.testclient import TestClient

from core import config
from models.user import User
from services import cnpj_lookup
from services.auth import create_access_token

ALFA = "11222333000181"  # no modo simulado: ativa
GRAFICA = "11444777000161"  # no modo simulado: baixada
MEI = "12345678000195"  # no modo simulado: razão social com CPF no fim


@pytest.fixture
def auth(make_user: Callable[..., User]) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(make_user().id)}"}


@pytest.fixture
def simulated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "CNPJ_LOOKUP_MODE", "simulated")


@pytest.fixture
def brasilapi(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "CNPJ_LOOKUP_MODE", "brasilapi")


class FakeResponse:
    """A resposta da BrasilAPI, lida aos pedaços como a de verdade (`stream=True`)."""

    def __init__(self, status: int = 200, body: Any = None, size: int | None = None) -> None:
        self.status_code = status
        raw = b"isto nao e JSON" if isinstance(body, Exception) else json.dumps(body).encode()
        # `size`: enche com espaços (JSON continua válido) para passar do limite de bytes
        self.content = raw.ljust(size, b" ") if size else raw

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def iter_content(self, chunk_size: int = 1) -> Iterator[bytes]:
        for start in range(0, len(self.content), chunk_size):
            yield self.content[start : start + chunk_size]


def fake_get(monkeypatch: pytest.MonkeyPatch, response: FakeResponse | Exception) -> list[Any]:
    calls: list[Any] = []

    def get(url: str, **kwargs: Any) -> FakeResponse:
        calls.append((url, kwargs))
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(cnpj_lookup.requests, "get", get)
    return calls


def lookup(client: TestClient, auth: dict[str, str], cnpj: str) -> Any:
    return client.get(f"/lookups/cnpj/{cnpj}", headers=auth)


# ---- A rota (modo simulado) ----


def test_a_known_cnpj_fills_name_nickname_and_situation(
    client: TestClient, auth: dict[str, str], simulated: None
) -> None:
    response = lookup(client, auth, ALFA)
    assert response.status_code == 200
    assert response.json() == {
        "cnpj": ALFA,
        "name": "ALFA PESQUISAS LTDA",
        "nickname": "Alfa Pesquisas",
        "situation": "ATIVA",
    }


def test_the_nickname_comes_from_the_name_when_there_is_no_trade_name_and_a_closed_company_says_so(
    client: TestClient, auth: dict[str, str], simulated: None
) -> None:
    body = lookup(client, auth, GRAFICA).json()
    assert (body["nickname"], body["situation"]) == ("Grafica Exemplo Ltda", "BAIXADA")


def test_a_cpf_in_the_company_name_never_comes_back(
    client: TestClient, auth: dict[str, str], simulated: None
) -> None:
    response = lookup(client, auth, MEI)
    assert response.status_code == 200
    assert response.json()["name"] == "MARIA EXEMPLO DA SILVA"
    assert "12345678909" not in response.text


def test_the_lookup_refuses_cpf_bad_digits_and_unknown_cnpj(
    client: TestClient, auth: dict[str, str], simulated: None
) -> None:
    cpf = lookup(client, auth, "12345678909")
    assert (cpf.status_code, cpf.json()["detail"]) == (
        422,
        "Por enquanto, só CNPJ: CPF não é guardado aqui",
    )
    bad = lookup(client, auth, "11222333000182")
    assert (bad.status_code, bad.json()["detail"]) == (422, "CNPJ inválido. Confira os dígitos")
    unknown = lookup(client, auth, "99887766000105")
    assert (unknown.status_code, unknown.json()["detail"]) == (
        404,
        "CNPJ não encontrado na Receita. Confira ou preencha à mão.",
    )


def test_the_lookup_is_off_by_default_in_tests_and_the_simulation_never_runs_in_production(
    client: TestClient, auth: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    unavailable = "A consulta de CNPJ não respondeu agora. Preencha à mão ou tente de novo."
    off = lookup(client, auth, ALFA)
    assert (off.status_code, off.json()["detail"]) == (503, unavailable)
    monkeypatch.setattr(config, "CNPJ_LOOKUP_MODE", "simulated")
    monkeypatch.setattr(config, "ENVIRONMENT", "production")
    assert lookup(client, auth, ALFA).status_code == 503


def test_only_finance_can_look_up_a_cnpj(
    client: TestClient, make_user: Callable[..., User]
) -> None:
    assert client.get(f"/lookups/cnpj/{ALFA}").status_code == 401
    other = make_user(role="supervisor", email="outro@e2e.invalid")
    headers = {"Authorization": f"Bearer {create_access_token(other.id)}"}
    assert client.get(f"/lookups/cnpj/{ALFA}", headers=headers).status_code == 403


# ---- A BrasilAPI (sempre de mentira nos testes) ----


def test_brasilapi_answer_is_mapped_and_only_the_cnpj_leaves(
    client: TestClient, auth: dict[str, str], brasilapi: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = fake_get(
        monkeypatch,
        FakeResponse(
            body={
                "razao_social": "ALFA PESQUISAS LTDA",
                "nome_fantasia": "ALFA",
                "descricao_situacao_cadastral": "Ativa",
                "email": "contato@alfa.example",
                "logradouro": "Rua Qualquer",
            }
        ),
    )
    body = lookup(client, auth, ALFA).json()
    assert body == {
        "cnpj": ALFA,
        "name": "ALFA PESQUISAS LTDA",
        "nickname": "Alfa",
        "situation": "ATIVA",
    }
    ((url, kwargs),) = calls
    assert url == f"https://brasilapi.com.br/api/cnpj/v1/{ALFA}"
    assert kwargs["allow_redirects"] is False
    assert kwargs["timeout"] == cnpj_lookup.TIMEOUT
    assert "contato@alfa.example" not in str(body)  # só o que o cadastro usa volta para a tela


def test_brasilapi_not_found_and_bad_request_say_the_cnpj_was_not_found(
    client: TestClient, auth: dict[str, str], brasilapi: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    for status in (404, 400):
        fake_get(monkeypatch, FakeResponse(status=status, body={"message": "x"}))
        assert lookup(client, auth, ALFA).status_code == 404


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(status=500, body={}),
        FakeResponse(status=429, body={}),
        FakeResponse(status=302, body={}),
        FakeResponse(body=ValueError("não é JSON")),
        FakeResponse(body=["não", "é", "objeto"]),
        FakeResponse(body={"razao_social": ""}),
        FakeResponse(body={"razao_social": 7}),
        FakeResponse(body={"razao_social": "ALFA"}, size=cnpj_lookup.MAX_BYTES + 1),
        requests.Timeout("lento"),
        requests.ConnectionError("sem rede"),
    ],
)
def test_brasilapi_failures_never_break_the_screen_and_never_invent_data(
    client: TestClient,
    auth: dict[str, str],
    brasilapi: None,
    monkeypatch: pytest.MonkeyPatch,
    response: FakeResponse | Exception,
) -> None:
    fake_get(monkeypatch, response)
    refused = lookup(client, auth, ALFA)
    assert refused.status_code == 503
    assert "Preencha à mão" in refused.json()["detail"]


def test_long_names_are_cut_to_the_size_of_the_fields(
    client: TestClient, auth: dict[str, str], brasilapi: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_get(
        monkeypatch, FakeResponse(body={"razao_social": "A" * 300, "nome_fantasia": "B" * 300})
    )
    body = lookup(client, auth, ALFA).json()
    assert (len(body["name"]), len(body["nickname"])) == (200, 100)


def test_bad_digits_never_reach_the_internet(
    client: TestClient, auth: dict[str, str], brasilapi: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = fake_get(monkeypatch, FakeResponse(body={"razao_social": "X"}))
    assert lookup(client, auth, "11222333000182").status_code == 422
    assert lookup(client, auth, "12345678909").status_code == 422
    assert calls == []
