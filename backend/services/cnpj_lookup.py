"""Consulta de CNPJ para preencher o cadastro (BrasilAPI, dados públicos da Receita).

Só o CNPJ sai daqui, e só quando a pessoa pede. A consulta nunca grava nada: o cadastro só existe
depois que a pessoa confere os campos, edita o que quiser e salva. O endereço da API é fixo e o
CNPJ é conferido (14 caracteres e dígitos) antes de entrar na URL, então nada que a pessoa digita
escolhe o destino. Nos testes e nas telas de teste a consulta é sempre simulada.

CPF nunca é guardado: a razão social de MEI costuma vir como "NOME 12345678909", e o número é tirado
do nome antes de voltar para a tela.
"""

import re
import string
from dataclasses import dataclass

import requests

from core import config
from core.document import clean_cnpj, is_cpf_shaped, valid_cnpj
from services.payable import PayableInvalid

BASE_URL = "https://brasilapi.com.br/api/cnpj/v1/"
TIMEOUT = (3, 6)  # conectar, ler
MAX_BYTES = 200_000
NAME_LIMIT = 200
NICKNAME_LIMIT = 100
CPF_IN_TEXT = re.compile(r"(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)")


class CnpjNotFound(Exception):
    pass


class CnpjUnavailable(Exception):
    pass


@dataclass(frozen=True)
class CnpjInfo:
    cnpj: str
    name: str
    nickname: str
    # "ATIVA", "BAIXADA", "INAPTA"...: a tela avisa quando não é ATIVA
    situation: str


def _text(value: object, limit: int) -> str:
    """Texto da Receita sem CPF, sem espaço sobrando e no tamanho do campo."""
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", CPF_IN_TEXT.sub("", value)).strip()[:limit]


def _info(cnpj: str, data: dict[str, object]) -> CnpjInfo:
    name = _text(data.get("razao_social"), NAME_LIMIT)
    if not name:
        raise CnpjUnavailable
    fantasy = _text(data.get("nome_fantasia"), NICKNAME_LIMIT)
    return CnpjInfo(
        cnpj=cnpj,
        name=name,
        nickname=string.capwords(fantasy or name)[:NICKNAME_LIMIT],
        situation=_text(data.get("descricao_situacao_cadastral"), 40).upper(),
    )


def _from_brasilapi(cnpj: str) -> CnpjInfo:
    try:
        response = requests.get(
            BASE_URL + cnpj,
            timeout=TIMEOUT,
            allow_redirects=False,
            headers={"Accept": "application/json", "User-Agent": "pmais-financeiro"},
        )
    except requests.RequestException as exc:
        raise CnpjUnavailable from exc
    if response.status_code in (400, 404):
        raise CnpjNotFound
    if response.status_code != 200 or len(response.content) > MAX_BYTES:
        raise CnpjUnavailable
    try:
        data = response.json()
    except ValueError as exc:
        raise CnpjUnavailable from exc
    if not isinstance(data, dict):
        raise CnpjUnavailable
    return _info(cnpj, data)


# CNPJs inventados (dígitos válidos), para a tela e os testes sem internet.
_SIMULATED: dict[str, dict[str, str]] = {
    "11222333000181": {
        "razao_social": "ALFA PESQUISAS LTDA",
        "nome_fantasia": "ALFA PESQUISAS",
        "descricao_situacao_cadastral": "ATIVA",
    },
    "11444777000161": {
        "razao_social": "GRAFICA EXEMPLO LTDA",
        "nome_fantasia": "",
        "descricao_situacao_cadastral": "BAIXADA",
    },
    "12345678000195": {
        "razao_social": "MARIA EXEMPLO DA SILVA 12345678909",
        "nome_fantasia": "",
        "descricao_situacao_cadastral": "ATIVA",
    },
}


def _simulated(cnpj: str) -> CnpjInfo:
    data = _SIMULATED.get(cnpj)
    if data is None:
        raise CnpjNotFound
    return _info(cnpj, dict(data))


def lookup(value: str) -> CnpjInfo:
    """Os dados públicos do CNPJ. Recusa o que não é CNPJ válido antes de sair do sistema."""
    cnpj = clean_cnpj(value)
    if is_cpf_shaped(cnpj):
        raise PayableInvalid("Por enquanto, só CNPJ: CPF não é guardado aqui")
    if not valid_cnpj(cnpj):
        raise PayableInvalid("CNPJ inválido. Confira os dígitos")
    if config.CNPJ_LOOKUP_MODE == "brasilapi":
        return _from_brasilapi(cnpj)
    if config.CNPJ_LOOKUP_MODE == "simulated" and config.ENVIRONMENT != "production":
        return _simulated(cnpj)
    raise CnpjUnavailable
