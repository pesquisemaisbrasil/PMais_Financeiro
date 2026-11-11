"""Busca dos feriados nacionais do ano (BrasilAPI, dados públicos, sem chave).

Só o ano sai daqui, e só quando a pessoa pede (botão do cadastro de feriados). O endereço é fixo e o
ano é conferido (número entre 2000 e 2100) antes de entrar na URL, então nada que a pessoa digita
escolhe o destino. A busca nunca grava: quem grava é `services/holidays.py`. Só entram os de tipo
"national": estadual e municipal a BrasilAPI não traz, e esses o financeiro cadastra à mão. Nos
testes e nas telas de teste a busca é sempre simulada.
"""

import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import requests

from core import config
from core.business_days import easter
from services.payable import PayableInvalid

BASE_URL = "https://brasilapi.com.br/api/feriados/v1/"
TIMEOUT = (3, 6)  # conectar, ler
MAX_BYTES = 100_000
MIN_YEAR = 2000
MAX_YEAR = 2100
NAME_LIMIT = 120


class HolidaysUnavailable(Exception):
    pass


@dataclass(frozen=True)
class NationalHoliday:
    day: date
    name: str


def _holidays(year: int, data: Any) -> list[NationalHoliday]:
    """Os nacionais do ano, sem confiar no formato: o que não confere é descartado."""
    if not isinstance(data, list):
        raise HolidaysUnavailable
    found = []
    for item in data:
        if not isinstance(item, dict) or item.get("type") != "national":
            continue
        name = " ".join(str(item.get("name") or "").split())[:NAME_LIMIT]
        try:
            day = date.fromisoformat(str(item.get("date")))
        except ValueError:
            continue
        if name and day.year == year:
            found.append(NationalHoliday(day, name))
    if not found:
        raise HolidaysUnavailable
    return found


def _from_brasilapi(year: int) -> list[NationalHoliday]:
    try:
        # stream: a resposta é lida aos pedaços e cortada no limite, em vez de baixada inteira
        with requests.get(
            BASE_URL + str(year),
            timeout=TIMEOUT,
            allow_redirects=False,
            stream=True,
            headers={"Accept": "application/json", "User-Agent": "pmais-financeiro"},
        ) as response:
            if response.status_code != 200:
                raise HolidaysUnavailable
            body = b""
            for chunk in response.iter_content(chunk_size=16_384):
                body += chunk
                if len(body) > MAX_BYTES:
                    raise HolidaysUnavailable
    except requests.RequestException as exc:
        raise HolidaysUnavailable from exc
    try:
        data = json.loads(body)
    except ValueError as exc:  # inclui texto que não é JSON e bytes que não são UTF-8
        raise HolidaysUnavailable from exc
    return _holidays(year, data)


def _simulated(year: int) -> list[NationalHoliday]:
    """Alguns feriados inventados para a tela e os testes sem internet. O Carnaval está aqui de
    propósito: é o que a tabela do código não tem."""
    sunday = easter(year)
    return [
        NationalHoliday(date(year, 1, 1), "Confraternização mundial"),
        NationalHoliday(sunday - timedelta(days=48), "Carnaval"),
        NationalHoliday(sunday - timedelta(days=47), "Carnaval"),
        NationalHoliday(sunday - timedelta(days=2), "Sexta-feira Santa"),
    ]


def fetch_national(year: int) -> list[NationalHoliday]:
    """Os feriados nacionais do ano. Recusa ano fora do intervalo antes de sair do sistema."""
    if not MIN_YEAR <= year <= MAX_YEAR:
        raise PayableInvalid(f"Informe um ano entre {MIN_YEAR} e {MAX_YEAR}")
    if config.HOLIDAYS_LOOKUP_MODE == "brasilapi":
        return _from_brasilapi(year)
    if config.HOLIDAYS_LOOKUP_MODE == "simulated" and config.ENVIRONMENT != "production":
        return _simulated(year)
    raise HolidaysUnavailable
