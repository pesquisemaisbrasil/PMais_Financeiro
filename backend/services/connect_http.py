"""Cliente HTTP do P+ Connect (API `/integrations/v1`), só com o que o Connect já entrega.

Entregue pelo Connect e usado aqui: o token de serviço (`POST /oauth/token`, client_credentials),
`GET /projects`, `GET /payables` e `GET /interviewers`. Ainda não existem no Connect
(spec entregas-do-connect, entregas 1 e 2): `pix-key-matches` e `payments`. Enquanto isso, essas
chamadas respondem "fora do ar": nada é pago nem classificado no escuro.

Regras: HTTPS em produção, timeout em toda chamada, segredo e token nunca em log, nova tentativa
com espera só para leitura e só em 429, 5xx e falha de rede (respeitando `Retry-After`).
"""

import logging
import time
from datetime import UTC, date, datetime
from datetime import time as day_start
from decimal import Decimal
from typing import Any

import requests

from services.connect_gateway import (
    ConnectPayable,
    ConnectProject,
    ConnectUnavailable,
    KeyMatch,
    PaymentApplied,
    PaymentOrder,
)

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10
ATTEMPTS = 3
MAX_RETRY_WAIT = 5.0
PAGE_SIZE = 500
# Renova o token um pouco antes de vencer, para a chamada não sair com ele no limite.
TOKEN_MARGIN_SECONDS = 30


def _to_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _midnight(day: date) -> datetime:
    return datetime.combine(day, day_start.min, tzinfo=UTC)


class HttpConnect:
    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        *,
        production: bool = False,
        session: Any = None,
    ) -> None:
        if production and not base_url.lower().startswith("https://"):
            raise ValueError("Em produção a URL do Connect precisa ser HTTPS")
        self.base_url = base_url.rstrip("/")
        self._credentials = (client_id, client_secret)
        self._session = session or requests.Session()
        self._token: str | None = None
        self._expires_at = 0.0

    # ---- Token e pedido ----

    def _fetch_token(self) -> None:
        try:
            response = self._session.request(
                "POST",
                f"{self.base_url}/oauth/token",
                auth=self._credentials,
                data={"grant_type": "client_credentials"},
                timeout=TIMEOUT_SECONDS,
            )
        except requests.RequestException as exc:
            raise ConnectUnavailable from exc
        if response.status_code != 200:
            # só o código do erro: nunca o corpo, que pode ecoar o que foi enviado
            logger.error("O Connect recusou o token de serviço (HTTP %s)", response.status_code)
            raise ConnectUnavailable
        body = response.json()
        self._token = str(body["access_token"])
        self._expires_at = time.monotonic() + int(body["expires_in"]) - TOKEN_MARGIN_SECONDS

    def _bearer(self) -> str:
        if self._token is None or time.monotonic() >= self._expires_at:
            self._fetch_token()
        return f"Bearer {self._token}"

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        refreshed = False
        for attempt in range(1, ATTEMPTS + 1):
            try:
                response = self._session.request(
                    "GET",
                    f"{self.base_url}/integrations/v1{path}",
                    headers={"Authorization": self._bearer()},
                    params=params,
                    timeout=TIMEOUT_SECONDS,
                )
            except requests.RequestException as exc:
                if attempt == ATTEMPTS:
                    raise ConnectUnavailable from exc
                time.sleep(min(2.0**attempt * 0.25, MAX_RETRY_WAIT))
                continue
            if response.status_code == 200:
                return dict(response.json())
            if response.status_code == 401 and not refreshed:
                # token vencido ou revogado: pega outro uma vez e repete
                refreshed = True
                self._token = None
                continue
            if response.status_code in (429, 500, 502, 503, 504) and attempt < ATTEMPTS:
                wait = float(response.headers.get("Retry-After", 2.0**attempt * 0.25))
                time.sleep(min(wait, MAX_RETRY_WAIT))
                continue
            logger.error("O Connect respondeu HTTP %s em GET %s", response.status_code, path)
            raise ConnectUnavailable
        raise ConnectUnavailable

    def _pages(self, path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        """Segue o cursor até ele vir nulo (a resposta pode vir curta ou vazia com cursor)."""
        items: list[dict[str, Any]] = []
        cursor: str | None = None
        while True:
            query = {**params, "limit": PAGE_SIZE, **({"cursor": cursor} if cursor else {})}
            body = self._get(path, query)
            items.extend(body["items"])
            cursor = body.get("nextCursor")
            if not cursor:
                return items

    # ---- O que o Connect já entrega ----

    def list_projects(self) -> list[ConnectProject]:
        return [
            ConnectProject(int(p["projectId"]), str(p["title"]), p.get("paymentTermDays"))
            for p in self._pages("/projects", {})
        ]

    def list_payables(
        self, connect_project_id: int, interviewer_ids: list[int]
    ) -> list[ConnectPayable]:
        payables = []
        for interviewer_id in interviewer_ids:
            params = {"projectId": connect_project_id, "interviewerId": interviewer_id}
            for p in self._pages("/payables", params):
                if p["amount"] is None:
                    continue  # sem valor não há o que pagar
                launched = date.fromisoformat(p["launchedOn"])
                payables.append(
                    ConnectPayable(
                        interview_id=int(p["interviewId"]),
                        interviewer_id=int(p["interviewerId"]),
                        project_id=int(p["projectId"]),
                        amount=Decimal(p["amount"]),
                        launched_at=_midnight(launched),
                        due_on=date.fromisoformat(p["dueOn"]) if p["dueOn"] else launched,
                        status=str(p["status"]),
                        paid_on=date.fromisoformat(p["paidOn"]) if p["paidOn"] else None,
                        updated_at=_to_datetime(p["updatedAt"]),
                    )
                )
        return payables

    def interviewer_names(self, interviewer_ids: list[int]) -> dict[int, str]:
        if not interviewer_ids:
            return {}
        body = self._get("/interviewers", {"ids": ",".join(str(i) for i in interviewer_ids)})
        return {int(i["interviewerId"]): str(i["displayName"]) for i in body["items"]}

    # ---- Ainda não existe no Connect ----

    def match_pix_keys(self, connect_project_id: int, keys: dict[str, str]) -> dict[str, KeyMatch]:
        raise ConnectUnavailable

    def create_payment(self, order: PaymentOrder) -> PaymentApplied:
        raise ConnectUnavailable

    def get_payment(self, payment_ref: str) -> PaymentApplied | None:
        raise ConnectUnavailable
