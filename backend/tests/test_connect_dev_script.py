"""O comando `scripts/connect_dev_check.py`: sem credencial não faz nada e só roda no dev."""

from pathlib import Path
from typing import Any

import pytest

from scripts import connect_dev_check
from services.connect_check import Step


def write(path: Path, base: str, *, secret: str = "segredo-de-teste") -> Path:  # gitleaks:allow
    path.write_text(
        f"CONNECT_BASE_URL={base}\nCONNECT_CLIENT_ID=financeiro-dev\nCONNECT_CLIENT_SECRET={secret}\n"
    )
    return path


class Nothing:
    """Se o comando chegasse a criar um cliente ou a rodar o roteiro, o teste falharia."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        raise AssertionError("não devia chegar ao Connect")


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(connect_dev_check, "HttpConnect", Nothing)
    monkeypatch.setattr(connect_dev_check, "DevCheck", Nothing)


def test_without_the_credentials_file_it_stops_and_says_what_is_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(connect_dev_check, "ENV_FILE", tmp_path / ".env.connect")
    assert connect_dev_check.main() == 2
    assert "CONNECT_CLIENT_SECRET" in capsys.readouterr().out


def test_with_a_variable_missing_it_stops(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    file = tmp_path / ".env.connect"
    file.write_text("CONNECT_BASE_URL=https://api.dev.connect.pesquisemais.com.br\n")
    monkeypatch.setattr(connect_dev_check, "ENV_FILE", file)
    assert connect_dev_check.main() == 2
    assert "CONNECT_CLIENT_ID, CONNECT_CLIENT_SECRET" in capsys.readouterr().out


@pytest.mark.parametrize(
    "base",
    [
        "https://connect.pesquisemais.com.br",  # produção
        "https://api.connect.pesquisemais.com.br",
        "https://api.dev.connect.pesquisemais.com.br.evil.example",  # parece o dev, mas não é
        "https://api.dev.connect.pesquisemais.com.br@evil.example",  # o endereço é o depois do @
        "https://evil.example/api.dev.connect.pesquisemais.com.br",
        "http://10.0.0.5:8000",
        "http://api.dev.connect.pesquisemais.com.br",  # o dev público só com https
    ],
)
def test_it_never_runs_against_an_address_that_is_not_the_dev(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str], base: str
) -> None:
    monkeypatch.setattr(connect_dev_check, "ENV_FILE", write(tmp_path / ".env.connect", base))
    assert connect_dev_check.main() == 2
    out = capsys.readouterr().out
    assert "Recusado" in out and "segredo-de-teste" not in out


@pytest.mark.parametrize(
    ("steps", "code"),
    [
        ([Step("A", "ok", "x"), Step("B", "pulado", "y")], 0),
        ([Step("A", "ok", "x"), Step("B", "falhou", "z")], 1),
    ],
)
def test_on_the_dev_it_runs_prints_every_step_and_the_exit_code_tells_if_it_failed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    steps: list[Step],
    code: int,
) -> None:
    built: list[Any] = []

    class Client:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            built.append(kwargs.get("scope"))

    class Check:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.steps: list[Step] = []

        def run(self) -> list[Step]:
            self.steps = steps
            return steps

    monkeypatch.setattr(connect_dev_check, "HttpConnect", Client)
    monkeypatch.setattr(connect_dev_check, "DevCheck", Check)
    monkeypatch.setattr(
        connect_dev_check,
        "ENV_FILE",
        write(tmp_path / ".env.connect", "https://api.dev.connect.pesquisemais.com.br"),
    )
    assert connect_dev_check.main() == code
    out = capsys.readouterr().out
    assert "api.dev.connect.pesquisemais.com.br" in out and "segredo-de-teste" not in out
    assert [
        line.split()[0] for line in out.splitlines() if line.startswith(("OK", "FALHOU", "PULADO"))
    ] == [{"ok": "OK", "falhou": "FALHOU", "pulado": "PULADO"}[s.status] for s in steps]
    assert built == [None, "projects:read"]  # o cliente comum e o de escopo mínimo
