"""Busca dos feriados do ano: os nacionais na BrasilAPI (dados públicos, sem chave) e os estaduais e
municipais das cidades configuradas no feriados.dev, que roda no nosso servidor (ADR 0024). Desde
27/11/2026 nenhuma cidade é configurada por padrão: só os nacionais contam.

Só o ano (e o código da cidade, que vem da configuração) sai daqui. Os endereços são fixos e o ano
é conferido (número entre 2000 e 2100) antes de entrar na URL, então nada que a pessoa digita
escolhe o destino. A busca nunca grava: quem grava é `services/holidays.py`. Da BrasilAPI só entram
os de tipo "national" (é ela que traz o Carnaval, Q42); do feriados.dev, só "state" e "municipal"
(ponto facultativo fica de fora). Nos testes e nas telas de teste a busca é sempre simulada, e o
feriados.dev fica desligado (sem `FERIADOS_DEV_URL`).
"""

import json
import re
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
LOCAL_TIMEOUT = (3, 10)
LOCAL_MAX_BYTES = 400_000
PAGE_LIMIT = 100
MAX_PAGES = 5
# do feriados.dev só "state" e "municipal": "national" vem da BrasilAPI; "optional" é ponto
# facultativo
LOCAL_SCOPES = {"state": "estadual", "municipal": "municipal"}
LOCATION_CODE = re.compile(r"^[A-Za-z]{2}(-[a-z0-9-]+)?$")


class HolidaysUnavailable(Exception):
    pass


@dataclass(frozen=True)
class NationalHoliday:
    day: date
    name: str


@dataclass(frozen=True)
class LocalHoliday:
    day: date
    name: str
    # estadual | municipal
    scope: str
    uf: str | None
    city: str | None


def _read_json(url: str, params: dict[str, Any] | None, timeout: Any, max_bytes: int) -> Any:
    """GET de um endereço fixo, lido aos pedaços e cortado no limite. Qualquer falha vira
    `HolidaysUnavailable`."""
    try:
        # stream: a resposta é lida aos pedaços e cortada no limite, em vez de baixada inteira
        with requests.get(
            url,
            params=params,
            timeout=timeout,
            allow_redirects=False,
            stream=True,
            headers={"Accept": "application/json", "User-Agent": "pmais-financeiro"},
        ) as response:
            if response.status_code != 200:
                raise HolidaysUnavailable
            body = b""
            for chunk in response.iter_content(chunk_size=16_384):
                body += chunk
                if len(body) > max_bytes:
                    raise HolidaysUnavailable
    except requests.RequestException as exc:
        raise HolidaysUnavailable from exc
    try:
        return json.loads(body)
    except ValueError as exc:  # inclui texto que não é JSON e bytes que não são UTF-8
        raise HolidaysUnavailable from exc


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
    return _holidays(year, _read_json(BASE_URL + str(year), None, TIMEOUT, MAX_BYTES))


def _clean(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _local(year: int, data: Any) -> tuple[list[LocalHoliday], int]:
    """Os estaduais e municipais de uma página do feriados.dev e o total de páginas, sem confiar no
    formato: o que não confere é descartado."""
    if not isinstance(data, dict) or not isinstance(data.get("data"), list):
        raise HolidaysUnavailable
    found = []
    for item in data["data"]:
        if not isinstance(item, dict) or item.get("type") not in LOCAL_SCOPES:
            continue
        scope = LOCAL_SCOPES[item["type"]]
        name = _clean(item.get("name"), NAME_LIMIT)
        try:
            # vem como "2026-01-25T00:00:00.000Z" (meia-noite em UTC): o dia é o que vem antes do T
            day = date.fromisoformat(str(item.get("date"))[:10])
        except ValueError:
            continue
        if not name or day.year != year:
            continue
        kind = "state" if scope == "estadual" else "municipality"
        places = [p for p in item.get("locations") or [] if isinstance(p, dict)]
        place = next((p for p in places if p.get("type") == kind), {})
        uf = _clean(place.get("stateCode") or place.get("code"), 2).upper() or None
        city = _clean(place.get("name"), 80) or None if scope == "municipal" else None
        found.append(LocalHoliday(day, name, scope, uf, city))
    pagination = data.get("pagination")
    pages = pagination.get("totalPages") if isinstance(pagination, dict) else 1
    return found, pages if isinstance(pages, int) and pages > 0 else 1


def _from_feriados_dev(year: int) -> list[LocalHoliday]:
    """Os estaduais e municipais de cada cidade configurada. Uma cidade que falha derruba a busca
    toda: melhor avisar do que gravar metade."""
    found: dict[LocalHoliday, None] = {}
    for code in config.HOLIDAYS_LOCATIONS:
        if not LOCATION_CODE.match(code):
            raise HolidaysUnavailable
        page = pages = 1
        while page <= min(pages, MAX_PAGES):
            params = {"year": year, "location": code, "limit": PAGE_LIMIT, "page": page}
            data = _read_json(
                f"{config.FERIADOS_DEV_URL}/v1/holidays", params, LOCAL_TIMEOUT, LOCAL_MAX_BYTES
            )
            items, pages = _local(year, data)
            found.update(dict.fromkeys(items))
            page += 1
    return list(found)


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


def fetch_local(year: int) -> list[LocalHoliday]:
    """Os estaduais e municipais das cidades configuradas (`HOLIDAYS_LOCATIONS`), no feriados.dev.
    Sem cidade ou sem `FERIADOS_DEV_URL` (testes, demonstração), não busca nada."""
    if not MIN_YEAR <= year <= MAX_YEAR:
        raise PayableInvalid(f"Informe um ano entre {MIN_YEAR} e {MAX_YEAR}")
    if not config.FERIADOS_DEV_URL:
        return []
    return _from_feriados_dev(year)
