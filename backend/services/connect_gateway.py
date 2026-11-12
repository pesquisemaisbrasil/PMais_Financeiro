"""O que o Financeiro pede ao P+ Connect, pela API de integração (spec integracao-com-o-connect).

A interface do que o Financeiro pede ao Connect. O Connect de **dev** já entrega tudo isto (guia
`docs/connect-dev-integracao-financeiro.md`); em produção essas rotas só existem na rede interna, e
sem conta de serviço configurada a resposta é "fora do ar". Nos testes o Connect é sempre simulado
(`tests/fakes.py`), e para ver a tela funcionando sem o Connect há o `SimulatedConnect`, ligado só
com `CONNECT_MODE=simulated` fora de produção. Nunca acessa o banco do Connect.
"""

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Protocol

from core.config import (
    CONNECT_BASE_URL,
    CONNECT_CLIENT_ID,
    CONNECT_CLIENT_SECRET,
    CONNECT_MODE,
    ENVIRONMENT,
)


class ConnectUnavailable(Exception):
    """O Connect não respondeu. Quem chama não grava nada e devolve 503."""


class ConnectTimeout(ConnectUnavailable):
    """O pedido saiu e a resposta não voltou: o Connect pode ter aplicado ou não."""


class ConnectRefused(Exception):
    """O Connect entendeu e recusou (`already_paid`, `duplicate_e2e`, `amount_mismatch`...).
    Nunca é corrigido sozinho: vira divergência para decisão humana."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class KeyMatch:
    # nulo = ninguém tem essa chave
    interviewer_id: int | None
    in_project: bool


@dataclass(frozen=True)
class ConnectProject:
    id: int
    title: str
    payment_term_days: int | None


@dataclass(frozen=True)
class ConnectPayable:
    interview_id: int
    interviewer_id: int
    project_id: int
    amount: Decimal
    launched_at: datetime
    due_on: date
    # to_pay | paid | removed
    status: str
    paid_on: date | None
    updated_at: datetime


@dataclass(frozen=True)
class PaymentOrder:
    payment_ref: str
    e2e_id: str
    interviewer_id: int
    connect_project_id: int
    amount: Decimal
    paid_on: date
    interview_ids: list[int]
    confirmed_by_user_id: int


@dataclass(frozen=True)
class PaymentApplied:
    payment_ref: str
    interview_ids: list[int]
    applied_at: datetime


@dataclass(frozen=True)
class PaymentReversed:
    """A baixa desfeita no Connect (`POST /payments/{ref}/reversal`). Não entra no fluxo da tela
    até o PO decidir a Q4 (cancelar baixa); existe para o teste do dev."""

    payment_ref: str
    interview_ids: list[int]
    reversed_at: datetime


@dataclass(frozen=True)
class PaymentData:
    """A chave Pix completa de uma pessoa (`POST /interviewers/payment-data`). Só em memória, para
    montar a planilha de pagamento: nunca gravada, e fora do `repr` para não ir parar em log."""

    interviewer_id: int
    name: str
    pix_type: str | None
    pix_key: str | None = field(repr=False)
    pix_key_updated_at: datetime | None


class ConnectGateway(Protocol):
    def list_projects(self) -> list[ConnectProject]:
        """`GET /projects`."""
        ...

    def list_payables(
        self, connect_project_id: int, interviewer_ids: list[int]
    ) -> list[ConnectPayable]:
        """`GET /payables`: itens a pagar (e pagos) das pessoas, seguindo o cursor até o fim."""
        ...

    def interviewer_names(self, interviewer_ids: list[int]) -> dict[int, str]:
        """`GET /interviewers`: nome de exibição, nunca a chave."""
        ...

    def match_pix_keys(self, connect_project_id: int, keys: dict[str, str]) -> dict[str, KeyMatch]:
        """`POST /pix-key-matches`: recebe {ref: chave normalizada} (até 500 por chamada) e
        devolve {ref: quem é}. Só o Connect conhece as chaves."""
        ...

    def create_payment(self, order: PaymentOrder) -> PaymentApplied:
        """`POST /payments`, com `Idempotency-Key` = `payment_ref`. Tudo ou nada. Levanta
        `ConnectRefused` se o Connect recusou e `ConnectTimeout` se a resposta não voltou."""
        ...

    def get_payment(self, payment_ref: str) -> PaymentApplied | None:
        """`GET /payments/{ref}`: None se o Connect não conhece o pedido."""
        ...


class UnavailableConnect:
    """Enquanto a API do Connect não existe no ambiente."""

    def list_projects(self) -> list[ConnectProject]:
        raise ConnectUnavailable

    def list_payables(
        self, connect_project_id: int, interviewer_ids: list[int]
    ) -> list[ConnectPayable]:
        raise ConnectUnavailable

    def interviewer_names(self, interviewer_ids: list[int]) -> dict[int, str]:
        raise ConnectUnavailable

    def match_pix_keys(self, connect_project_id: int, keys: dict[str, str]) -> dict[str, KeyMatch]:
        raise ConnectUnavailable

    def create_payment(self, order: PaymentOrder) -> PaymentApplied:
        raise ConnectUnavailable

    def get_payment(self, payment_ref: str) -> PaymentApplied | None:
        raise ConnectUnavailable


SIMULATED_IN_PROJECT = "maria.exemplo@exemplo.com"
SIMULATED_OUT_OF_PROJECT = "joao.exemplo@exemplo.com"


class SimulatedConnect:
    """Connect de mentira, só para dev e E2E (dados fictícios). Conhece duas chaves: a de uma
    pessoa do projeto (id 87) e a de uma que recebeu sem estar nele (id 91). Aplica toda baixa.
    Não lê projeto nem item: esses vêm do que o seed gravou no espelho."""

    def list_projects(self) -> list[ConnectProject]:
        return []

    def list_payables(
        self, connect_project_id: int, interviewer_ids: list[int]
    ) -> list[ConnectPayable]:
        return []

    def interviewer_names(self, interviewer_ids: list[int]) -> dict[int, str]:
        names = {87: "Maria Exemplo", 91: "João Exemplo"}
        return {i: names[i] for i in interviewer_ids if i in names}

    def match_pix_keys(self, connect_project_id: int, keys: dict[str, str]) -> dict[str, KeyMatch]:
        known = {
            SIMULATED_IN_PROJECT: KeyMatch(87, True),
            SIMULATED_OUT_OF_PROJECT: KeyMatch(91, False),
        }
        return {ref: known.get(key, KeyMatch(None, False)) for ref, key in keys.items()}

    def create_payment(self, order: PaymentOrder) -> PaymentApplied:
        return PaymentApplied(order.payment_ref, order.interview_ids, datetime.now(UTC))

    def get_payment(self, payment_ref: str) -> PaymentApplied | None:
        return None


def get_connect() -> ConnectGateway:
    """Dependência das rotas. Os testes trocam por um Connect simulado."""
    if CONNECT_MODE == "simulated" and ENVIRONMENT != "production":
        return SimulatedConnect()
    if CONNECT_BASE_URL and CONNECT_CLIENT_ID and CONNECT_CLIENT_SECRET:
        return _http_connect()
    return UnavailableConnect()


_http: ConnectGateway | None = None


def _http_connect() -> ConnectGateway:
    """Um cliente só para a API toda: ele guarda o token até perto de vencer."""
    global _http
    if _http is None:
        from services.connect_http import HttpConnect

        _http = HttpConnect(
            CONNECT_BASE_URL,
            CONNECT_CLIENT_ID,
            CONNECT_CLIENT_SECRET,
            production=ENVIRONMENT == "production",
        )
    return _http
