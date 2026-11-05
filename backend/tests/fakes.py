"""O P+ Connect simulado: nos testes do Financeiro ele nunca é o de verdade."""

from datetime import UTC, datetime

from services.connect_gateway import (
    ConnectPayable,
    ConnectProject,
    ConnectRefused,
    ConnectTimeout,
    ConnectUnavailable,
    KeyMatch,
    PaymentApplied,
    PaymentOrder,
)


class FakeConnect:
    """Conhece uma lista de chaves já normalizadas. Guarda o que foi perguntado e pedido.

    - `down`: tudo levanta `ConnectUnavailable`.
    - `refuse`: `create_payment` recusa com esse código (ex.: `already_paid`).
    - `payment_down`: só `create_payment` e `get_payment` ficam fora do ar.
    - `lose_response`: o próximo `create_payment` aplica mas a resposta não volta (timeout).
    - `lose_request`: o próximo `create_payment` nem chega ao Connect (timeout).
    """

    def __init__(
        self,
        known: dict[str, KeyMatch] | None = None,
        down: bool = False,
        projects: list[ConnectProject] | None = None,
        payables: list[ConnectPayable] | None = None,
        names: dict[int, str] | None = None,
    ) -> None:
        self.known = known or {}
        self.down = down
        self.projects = projects or []
        self.payables = payables or []
        self.names = names or {}
        self.refuse: str | None = None
        self.lose_response = False
        self.lose_request = False
        self.payment_down = False
        self.calls: list[tuple[int, dict[str, str]]] = []
        self.orders: list[PaymentOrder] = []
        self.applied: dict[str, PaymentApplied] = {}

    def _check(self) -> None:
        if self.down:
            raise ConnectUnavailable

    def list_projects(self) -> list[ConnectProject]:
        self._check()
        return list(self.projects)

    def list_payables(
        self, connect_project_id: int, interviewer_ids: list[int]
    ) -> list[ConnectPayable]:
        self._check()
        return [
            p
            for p in self.payables
            if p.project_id == connect_project_id and p.interviewer_id in interviewer_ids
        ]

    def interviewer_names(self, interviewer_ids: list[int]) -> dict[int, str]:
        self._check()
        return {i: self.names[i] for i in interviewer_ids if i in self.names}

    def match_pix_keys(self, connect_project_id: int, keys: dict[str, str]) -> dict[str, KeyMatch]:
        self.calls.append((connect_project_id, dict(keys)))
        self._check()
        return {
            ref: self.known.get(key, KeyMatch(interviewer_id=None, in_project=False))
            for ref, key in keys.items()
        }

    def create_payment(self, order: PaymentOrder) -> PaymentApplied:
        self._check()
        if self.payment_down:
            raise ConnectUnavailable
        self.orders.append(order)
        if self.lose_request:
            self.lose_request = False
            raise ConnectTimeout
        if self.refuse:
            raise ConnectRefused(self.refuse)
        # o mesmo Idempotency-Key devolve o que já foi aplicado, sem aplicar de novo
        done = self.applied.setdefault(
            order.payment_ref,
            PaymentApplied(order.payment_ref, order.interview_ids, datetime.now(UTC)),
        )
        if self.lose_response:
            self.lose_response = False
            raise ConnectTimeout
        return done

    def get_payment(self, payment_ref: str) -> PaymentApplied | None:
        self._check()
        if self.payment_down:
            raise ConnectUnavailable
        return self.applied.get(payment_ref)
