"""Cliente HTTP do P+ Connect (API `/integrations/v1`), como no guia do dev
(`docs/connect-dev-integracao-financeiro.md`).

Leitura: o token de serviço (`POST /oauth/token`, client_credentials), `GET /projects`,
`GET /payables`, `GET /interviewers` e o feed `GET /events`. Consulta por POST sem efeito:
`pix-key-matches` (de quem é a chave) e `interviewers/payment-data` (chave completa, só em memória).
Escrita: `POST /payments` com `Idempotency-Key`, a consulta `GET /payments/{ref}` e, só para o teste
do dev, o cancelamento (`reversal`, Q4 ainda aberta).

Regras: HTTPS em produção, timeout em toda chamada, segredo, token, corpo e chave Pix nunca em log.
Só leitura (e a consulta por POST) repete sozinha, e só em 429, 5xx e falha de rede (respeitando
`Retry-After`). **Escrita nunca repete sozinha**: se a resposta não voltou (`ConnectTimeout`), o
pedido pode ter sido aplicado, e quem chama confere em `GET /payments/{ref}`.
"""

import logging
import time
from datetime import UTC, date, datetime
from datetime import time as day_start
from decimal import Decimal
from typing import Any
from urllib.parse import quote

import requests

from services.connect_gateway import (
    ConnectPayable,
    ConnectProject,
    ConnectRefused,
    ConnectTimeout,
    ConnectUnavailable,
    KeyMatch,
    PaymentApplied,
    PaymentData,
    PaymentOrder,
    PaymentReversed,
)

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10
ATTEMPTS = 3
MAX_RETRY_WAIT = 5.0
PAGE_SIZE = 500
MATCH_BATCH = 500  # chaves por chamada em `pix-key-matches`
PAYMENT_DATA_BATCH = 200  # pessoas por chamada em `payment-data`
# Renova o token um pouco antes de vencer, para a chamada não sair com ele no limite.
TOKEN_MARGIN_SECONDS = 30


def _to_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _midnight(day: date) -> datetime:
    return datetime.combine(day, day_start.min, tzinfo=UTC)


def _refusal_code(response: Any) -> str:
    """O `code` da recusa do Connect (`already_paid`...); sem ele, o número do HTTP."""
    try:
        code = response.json().get("code")
    except (ValueError, AttributeError):
        code = None
    return str(code) if code else f"http_{response.status_code}"


def _payables(items: list[dict[str, Any]]) -> list[ConnectPayable]:
    payables = []
    for p in items:
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


class HttpConnect:
    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        *,
        production: bool = False,
        session: Any = None,
        scope: str | None = None,
    ) -> None:
        if production and not base_url.lower().startswith("https://"):
            raise ValueError("Em produção a URL do Connect precisa ser HTTPS")
        self.base_url = base_url.rstrip("/")
        self._credentials = (client_id, client_secret)
        # um token só com estes escopos (o teste do dev prova que o Connect recusa o que falta)
        self._scope = scope
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
                data={
                    "grant_type": "client_credentials",
                    **({"scope": self._scope} if self._scope else {}),
                },
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

    def _get(self, path: str, params: dict[str, Any], *, not_found: bool = False) -> dict[str, Any]:
        """`not_found=True`: 404 levanta `ConnectRefused("not_found")` em vez de "fora do ar"."""
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
            if response.status_code == 404 and not_found:
                raise ConnectRefused("not_found")
            logger.error("O Connect respondeu HTTP %s em GET %s", response.status_code, path)
            raise ConnectUnavailable
        raise ConnectUnavailable

    def _post(
        self,
        path: str,
        body: dict[str, Any],
        *,
        idempotency_key: str | None = None,
        replayable: bool = False,
    ) -> dict[str, Any]:
        """POST com corpo JSON. `replayable=True` (consulta sem efeito) repete como a leitura;
        escrita nunca repete sozinha, porque o pedido pode já ter sido aplicado. Recusa do Connect
        (400, 403, 404, 409, 422) vira `ConnectRefused` com o `code` dele; nunca se loga o corpo."""
        extra = {"Idempotency-Key": idempotency_key} if idempotency_key else {}
        attempts = ATTEMPTS if replayable else 1
        refreshed = False
        attempt = 0
        while attempt < attempts:
            attempt += 1
            headers = {"Authorization": self._bearer(), **extra}
            try:
                response = self._session.request(
                    "POST",
                    f"{self.base_url}/integrations/v1{path}",
                    headers=headers,
                    json=body,
                    timeout=TIMEOUT_SECONDS,
                )
            except requests.ConnectTimeout as exc:
                raise ConnectUnavailable from exc  # nem chegou a conectar: nada foi aplicado
            except requests.RequestException as exc:
                if replayable:
                    if attempt >= attempts:
                        raise ConnectUnavailable from exc
                    time.sleep(min(2.0**attempt * 0.25, MAX_RETRY_WAIT))
                    continue
                raise ConnectTimeout from exc  # o pedido pode ter saído
            status = response.status_code
            if status in (200, 201):
                return dict(response.json())
            if status == 401 and not refreshed:
                # token vencido ou revogado: o pedido não foi processado, então vale repetir uma vez
                refreshed = True
                self._token = None
                attempt -= 1
                continue
            if status in (400, 403, 404, 409, 422):
                raise ConnectRefused(_refusal_code(response))
            logger.error("O Connect respondeu HTTP %s em POST %s", status, path)
            if replayable and status in (429, 500, 502, 503, 504) and attempt < attempts:
                wait = float(response.headers.get("Retry-After", 2.0**attempt * 0.25))
                time.sleep(min(wait, MAX_RETRY_WAIT))
                continue
            if not replayable and status in (500, 502, 504):
                raise ConnectTimeout  # pode ter aplicado: confira em GET /payments/{ref}
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
            payables.extend(_payables(self._pages("/payables", params)))
        return payables

    def list_project_payables(
        self, connect_project_id: int, status: str = "to_pay"
    ) -> list[ConnectPayable]:
        """`GET /payables` do projeto inteiro, de todas as pessoas, num só filtro de situação."""
        params = {"projectId": connect_project_id, "status": status}
        return _payables(self._pages("/payables", params))

    def interviewer_names(self, interviewer_ids: list[int]) -> dict[int, str]:
        if not interviewer_ids:
            return {}
        body = self._get("/interviewers", {"ids": ",".join(str(i) for i in interviewer_ids)})
        return {int(i["interviewerId"]): str(i["displayName"]) for i in body["items"]}

    def events(self, after: int = 0, limit: int = 500) -> tuple[list[dict[str, Any]], str | None]:
        """`GET /events`: o feed dos eventos do webhook, em ordem, e o cursor da próxima página.
        Só traz eventos com 5 s ou mais. O evento é só um aviso, sem dado pessoal."""
        body = self._get("/events", {"after": after, "limit": limit})
        return list(body["items"]), body.get("nextCursor")

    # ---- Consulta por POST, sem efeito ----

    def match_pix_keys(self, connect_project_id: int, keys: dict[str, str]) -> dict[str, KeyMatch]:
        """`POST /pix-key-matches`: de quem é cada chave (já normalizada) e se a pessoa está no
        projeto. Se o Connect deixar uma chave sem resposta, nada é classificado: fora do ar."""
        refs = list(keys)
        found: dict[str, KeyMatch] = {}
        for start in range(0, len(refs), MATCH_BATCH):
            chunk = refs[start : start + MATCH_BATCH]
            answer = self._post(
                "/pix-key-matches",
                {
                    "projectId": connect_project_id,
                    "keys": [{"ref": ref, "pixKey": keys[ref]} for ref in chunk],
                },
                replayable=True,
            )
            matches = {
                str(m["ref"]): KeyMatch(
                    int(m["interviewerId"]) if m["interviewerId"] is not None else None,
                    bool(m["inProject"]),
                )
                for m in answer["matches"]
            }
            if set(matches) != set(chunk):
                raise ConnectUnavailable
            found.update(matches)
        return found

    def payment_data(
        self,
        interviewer_ids: list[int],
        connect_project_id: int,
        purpose: str,
        finance_user_id: int,
        finance_user_name: str,
    ) -> list[PaymentData]:
        """`POST /interviewers/payment-data`: a chave Pix completa de quem tem item a pagar no
        projeto. Cada acesso fica na trilha do titular no Connect. Só em memória: nunca gravar."""
        people: list[PaymentData] = []
        for start in range(0, len(interviewer_ids), PAYMENT_DATA_BATCH):
            answer = self._post(
                "/interviewers/payment-data",
                {
                    "interviewerIds": interviewer_ids[start : start + PAYMENT_DATA_BATCH],
                    "purpose": purpose,
                    "projectId": connect_project_id,
                    "onBehalfOf": {
                        "financeUserId": finance_user_id,
                        "financeUserName": finance_user_name,
                    },
                },
                replayable=True,
            )
            for item in answer["items"]:
                updated = item.get("pixKeyUpdatedAt")
                people.append(
                    PaymentData(
                        interviewer_id=int(item["interviewerId"]),
                        name=str(item["name"]),
                        pix_type=item.get("pixType"),
                        pix_key=item.get("pixKey"),
                        pix_key_updated_at=_to_datetime(updated) if updated else None,
                    )
                )
        return people

    # ---- Escrita: nunca repete sozinha ----

    def create_payment(self, order: PaymentOrder) -> PaymentApplied:
        """`POST /payments`, com `Idempotency-Key` = `payment_ref`: repetir o mesmo pedido devolve a
        mesma resposta por 24 h. Tudo ou nada. `ConnectRefused` se o Connect recusou
        (`already_paid`, `duplicate_e2e`, `amount_mismatch`...), `ConnectTimeout` se a resposta não
        voltou (o pedido pode ter sido aplicado: confira com `get_payment`)."""
        answer = self._post(
            "/payments",
            {
                "paymentRef": order.payment_ref,
                "e2eId": order.e2e_id,
                "interviewerId": order.interviewer_id,
                "projectId": order.connect_project_id,
                "amount": f"{order.amount:.2f}",
                "paidOn": order.paid_on.isoformat(),
                "interviewIds": order.interview_ids,
                "confirmedBy": {"financeUserId": order.confirmed_by_user_id},
            },
            idempotency_key=order.payment_ref,
        )
        return PaymentApplied(
            str(answer["paymentRef"]),
            [int(i) for i in answer["interviewIds"]],
            _to_datetime(answer["appliedAt"]),
        )

    def get_payment(self, payment_ref: str) -> PaymentApplied | None:
        """`GET /payments/{ref}`: None se o Connect não conhece a baixa."""
        try:
            answer = self._get(f"/payments/{quote(payment_ref, safe='')}", {}, not_found=True)
        except ConnectRefused as exc:
            if exc.code == "not_found":
                return None
            raise
        return PaymentApplied(
            str(answer["paymentRef"]),
            [int(i) for i in answer["interviewIds"]],
            _to_datetime(answer["appliedAt"]),
        )

    def reverse_payment(
        self,
        payment_ref: str,
        *,
        idempotency_key: str,
        reason: str,
        reversed_on: date,
        note: str,
        confirmed_by_user_id: int,
        approved_by_user_id: int | None = None,
    ) -> PaymentReversed:
        """`POST /payments/{ref}/reversal`: os itens voltam a "a pagar". Fora do fluxo da tela até
        a Q4 (cancelar baixa); usado só no teste do dev."""
        confirmed: dict[str, Any] = {"financeUserId": confirmed_by_user_id}
        if approved_by_user_id is not None:
            confirmed["approvedByFinanceUserId"] = approved_by_user_id
        answer = self._post(
            f"/payments/{quote(payment_ref, safe='')}/reversal",
            {
                "reason": reason,
                "reversedOn": reversed_on.isoformat(),
                "note": note,
                "confirmedBy": confirmed,
            },
            idempotency_key=idempotency_key,
        )
        return PaymentReversed(
            str(answer["paymentRef"]),
            [int(i) for i in answer["interviewIds"]],
            _to_datetime(answer["reversedAt"]),
        )
