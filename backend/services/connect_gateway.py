"""O que o Financeiro pede ao P+ Connect, pela API de integração (spec integracao-com-o-connect).

Só a interface e o que existe hoje: o Connect ainda não entregou `/integrations/v1`
(spec entregas-do-connect, entregas 1 e 2). Até lá, em produção a resposta é "fora do ar",
e nos testes o Connect é sempre simulado (`tests/fakes.py`). Nunca acessa o banco do Connect.
"""

from dataclasses import dataclass
from typing import Protocol


class ConnectUnavailable(Exception):
    """O Connect não respondeu. Quem chama não grava nada e devolve 503."""


@dataclass(frozen=True)
class KeyMatch:
    # nulo = ninguém tem essa chave
    interviewer_id: int | None
    in_project: bool


class ConnectGateway(Protocol):
    def match_pix_keys(self, connect_project_id: int, keys: dict[str, str]) -> dict[str, KeyMatch]:
        """`POST /pix-key-matches`: recebe {ref: chave normalizada} (até 500 por chamada) e
        devolve {ref: quem é}. Só o Connect conhece as chaves."""
        ...


class UnavailableConnect:
    """Enquanto a API do Connect não existe no ambiente."""

    def match_pix_keys(self, connect_project_id: int, keys: dict[str, str]) -> dict[str, KeyMatch]:
        raise ConnectUnavailable


def get_connect() -> ConnectGateway:
    """Dependência das rotas. Os testes trocam por um Connect simulado."""
    return UnavailableConnect()
