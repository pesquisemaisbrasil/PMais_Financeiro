"""O roteiro de teste da integração com o Connect de DEV, passo a passo.

É a seção 7 do guia `docs/connect-dev-integracao-financeiro.md`, feita com o cliente do
Financeiro (`services/connect_http.py`).

Mexe no Connect: dá baixa e desfaz a baixa de itens fictícios. Por isso só roda no dev (o script
`scripts/connect_dev_check.py` recusa qualquer outro endereço) e **sempre desfaz o que fez**, até
quando um passo falha no meio. Não grava nada no Financeiro. A saída não leva nome, chave Pix nem
segredo: só o que passou, o que falhou e por quê (código da recusa, campo que faltou na resposta).
"""

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from core.pix import normalize_pix_key
from services.connect_gateway import (
    ConnectBadAnswer,
    ConnectPayable,
    ConnectRefused,
    ConnectTimeout,
    ConnectUnavailable,
    KeyMatch,
    PaymentApplied,
    PaymentOrder,
)
from services.connect_http import HttpConnect

EVENT_WAIT_SECONDS = 6.0  # o feed só traz evento com 5 s ou mais
MAX_FEED_PAGES = 200


class Mismatch(Exception):
    """O Connect respondeu, mas não como o contrato diz."""


class Skip(Exception):
    """O passo não tem o que testar (por exemplo, não há item a pagar no dev)."""


@dataclass(frozen=True)
class Step:
    name: str
    status: str  # ok | falhou | pulado
    detail: str


def _expect(condition: bool, message: str) -> None:
    if not condition:
        raise Mismatch(message)


def _describe(exc: Exception) -> str:
    """Por que o passo falhou, sem nunca ecoar corpo, chave ou segredo."""
    if isinstance(exc, ConnectRefused):
        return f"o Connect recusou: {exc.code}"
    if isinstance(exc, ConnectBadAnswer):
        where = f" (campo: {exc.field})" if exc.field else ""
        return f"o Connect respondeu fora do contrato{where}; a baixa pode ter sido aplicada"
    if isinstance(exc, ConnectTimeout):
        return "a resposta não voltou (a baixa pode ter sido aplicada)"
    if isinstance(exc, ConnectUnavailable):
        return (
            "o Connect não respondeu como esperado (fora do ar, sem permissão ou resposta inválida)"
        )
    if isinstance(exc, KeyError):
        return f"campo ausente na resposta: {exc}"
    if isinstance(exc, Mismatch):
        return str(exc)
    return f"erro inesperado ({type(exc).__name__})"


class DevCheck:
    def __init__(
        self,
        connect: HttpConnect,
        *,
        restricted: HttpConnect | None = None,
        today: date,
        finance_user_id: int = 1,
        approver_user_id: int = 2,
        wait: float = EVENT_WAIT_SECONDS,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.connect = connect
        # um cliente da mesma conta com um token de escopo mínimo, para o teste do 403
        self.restricted = restricted
        self.today = today
        self.user = finance_user_id
        self.approver = approver_user_id
        self.wait = wait
        self.sleep = sleep
        self.steps: list[Step] = []
        # o que os passos passam adiante (só em memória)
        self.project_id: int | None = None
        self.interviewer_id: int | None = None
        self.items: list[ConnectPayable] = []
        self.pix_key: str | None = None
        self.order: PaymentOrder | None = None
        self.applied: PaymentApplied | None = None
        # a baixa saiu, mesmo que a resposta não tenha voltado: o Connect pode ter aplicado
        self.attempted = False
        self.reversed = False
        self.last_seq = 0
        # baixas que o Connect aceitou quando devia recusar: o fim do roteiro desfaz
        self.stray: list[str] = []

    # ---- Execução ----

    def _run(self, name: str, action: Callable[[], str]) -> bool:
        try:
            detail = action()
        except Skip as skip:
            self.steps.append(Step(name, "pulado", str(skip)))
            return False
        except Exception as exc:  # noqa: BLE001 (cada passo diz o que deu errado, sem parar o roteiro)
            self.steps.append(Step(name, "falhou", _describe(exc)))
            return False
        self.steps.append(Step(name, "ok", detail))
        return True

    def run(self) -> list[Step]:
        """Faz o roteiro todo. Se der baixa, desfaz no fim, mesmo com passo falhando."""
        try:
            self._run("Token de serviço", self._token)
            self._run("Projetos", self._projects)
            self._run("Itens a pagar do projeto", self._payables)
            self._run("Nome e chave mascarada", self._names)
            self._run("Feed de eventos: ponto de partida", self._feed_start)
            self._run("Chave completa (payment-data)", self._payment_data)
            self._run("De quem é a chave (pix-key-matches)", self._matches)
            self._run("Baixa (POST /payments)", self._pay)
            self._run("Repetir a baixa devolve a mesma resposta", self._replay)
            self._run("Mesma chave com corpo diferente é recusada", self._conflict)
            self._run("Consultar a baixa (GET /payments)", self._get)
            self._run("Item já pago é recusado", self._already_paid)
            self._run("Token sem o escopo é recusado", self._no_scope)
            self._run("Cancelar a baixa (reversal)", self._reverse)
            self._run("Cancelar de novo é recusado", self._reverse_again)
            self._run('Os itens voltam a "a pagar"', self._back_to_pay)
            self._run("Valor que não bate é recusado", self._mismatch)
            self._run("Feed de eventos: baixa e cancelamento", self._feed_end)
        finally:
            self._cleanup()
        return self.steps

    @property
    def failed(self) -> bool:
        return any(step.status == "falhou" for step in self.steps)

    def _need(self) -> tuple[int, int]:
        if self.project_id is None or self.interviewer_id is None or not self.items:
            raise Skip("não há item a pagar no dev: peça ao João para rodar o seed")
        return self.project_id, self.interviewer_id

    def _paid_order(self) -> PaymentOrder:
        """A baixa dos passos anteriores; sem ela (passo pulado ou falho) não há o que testar."""
        if self.order is None or self.applied is None:
            raise Skip("sem baixa nos passos anteriores")
        return self.order

    def _expect_refusal(self, connect: HttpConnect, order: PaymentOrder, code: str) -> None:
        """O Connect tem de recusar este pedido com este código. Se aceitar, a baixa é anotada para
        ser desfeita no fim, e o passo falha."""
        try:
            connect.create_payment(order)
        except ConnectRefused as refused:
            _expect(refused.code == code, f"esperado {code}, veio {refused.code}")
            return
        self.stray.append(order.payment_ref)
        raise Mismatch(
            f"devia ser recusado com {code}, e o Connect aceitou (a baixa será desfeita)"
        )

    def _total(self) -> Decimal:
        return sum((item.amount for item in self.items), Decimal("0"))

    def _new_order(self, **overrides: object) -> PaymentOrder:
        project, interviewer = self._need()
        fields: dict[str, object] = {
            "payment_ref": f"fin-dev-check-{uuid.uuid4().hex[:10]}",
            "e2e_id": "E" + uuid.uuid4().hex.upper()[:31],
            "interviewer_id": interviewer,
            "connect_project_id": project,
            "amount": self._total(),
            "paid_on": self.today,
            "interview_ids": [item.interview_id for item in self.items],
            "confirmed_by_user_id": self.user,
        }
        return PaymentOrder(**{**fields, **overrides})  # type: ignore[arg-type]

    # ---- Passos ----

    def _token(self) -> str:
        self.connect._bearer()
        return "token de 15 minutos obtido"

    def _projects(self) -> str:
        projects = self.connect.list_projects()
        _expect(bool(projects), "nenhum projeto no dev")
        return f"{len(projects)} projetos"

    def _payables(self) -> str:
        for project in self.connect.list_projects():
            pending = self.connect.list_project_payables(project.id, "to_pay")
            if not pending:
                continue
            interviewer = pending[0].interviewer_id
            self.project_id = project.id
            self.interviewer_id = interviewer
            self.items = [p for p in pending if p.interviewer_id == interviewer]
            return (
                f"projeto {project.id}: {len(self.items)} itens de uma pessoa, "
                f"soma R$ {self._total()} ({len(pending)} a pagar no projeto)"
            )
        raise Skip("nenhum projeto do dev tem item a pagar: peça ao João para rodar o seed")

    def _names(self) -> str:
        _, interviewer = self._need()
        names = self.connect.interviewer_names([interviewer])
        _expect(interviewer in names, "o Connect não devolveu a pessoa")
        return "nome de exibição recebido"

    def _feed_start(self) -> str:
        after = 0
        for _ in range(MAX_FEED_PAGES):
            items, cursor = self.connect.events(after, 500)
            self.last_seq = max([self.last_seq, *[int(i["seq"]) for i in items]])
            if not cursor:
                break
            after = int(cursor)
        return f"último evento: {self.last_seq}"

    def _payment_data(self) -> str:
        project, interviewer = self._need()
        people = self.connect.payment_data(
            [interviewer], project, "payment_check", self.user, "Equipe Financeiro (teste do dev)"
        )
        _expect(
            len(people) == 1 and people[0].interviewer_id == interviewer, "pessoa não devolvida"
        )
        self.pix_key = people[0].pix_key
        if not self.pix_key:
            raise Skip("a pessoa do dev não tem chave Pix cadastrada")
        return "chave completa recebida (só em memória)"

    def _matches(self) -> str:
        project, interviewer = self._need()
        if not self.pix_key:
            raise Skip("sem a chave do passo anterior")
        found = self.connect.match_pix_keys(
            project,
            {"conhecida": normalize_pix_key(self.pix_key), "estranha": "ninguem@exemplo.invalid"},
        )
        _expect(
            found["conhecida"] == KeyMatch(interviewer, True),
            "a chave conhecida não casou com a pessoa",
        )
        _expect(
            found["estranha"] == KeyMatch(None, False), "uma chave que ninguém tem não devia casar"
        )
        return "a chave casa com a pessoa do projeto, e uma estranha não casa com ninguém"

    def _pay(self) -> str:
        self._need()
        self.order = self._new_order()
        self.attempted = True
        self.applied = self.connect.create_payment(self.order)
        _expect(
            sorted(self.applied.interview_ids) == sorted(self.order.interview_ids),
            "os itens da resposta não são os da baixa",
        )
        return f"baixa aplicada em {len(self.applied.interview_ids)} itens"

    def _replay(self) -> str:
        order = self._paid_order()
        again = self.connect.create_payment(order)
        _expect(again == self.applied, "repetir a mesma chave devia devolver a mesma resposta")
        return "mesma resposta"

    def _conflict(self) -> str:
        order = self._paid_order()
        changed = PaymentOrder(**{**order.__dict__, "amount": order.amount + Decimal("0.01")})
        self._expect_refusal(self.connect, changed, "idempotency_conflict")
        return "409 idempotency_conflict"

    def _get(self) -> str:
        order = self._paid_order()
        found = self.connect.get_payment(order.payment_ref)
        _expect(found is not None, "o Connect não conhece a baixa que acabou de aplicar")
        _expect(
            self.connect.get_payment("fin-dev-check-inexistente") is None,
            "baixa inexistente devia dar 404",
        )
        return "a baixa existe, e uma inexistente dá 404"

    def _already_paid(self) -> str:
        self._paid_order()
        self._expect_refusal(self.connect, self._new_order(), "already_paid")
        return "409 already_paid"

    def _no_scope(self) -> str:
        if self.restricted is None:
            raise Skip("sem cliente de escopo mínimo")
        self._paid_order()
        self._expect_refusal(self.restricted, self._new_order(), "insufficient_scope")
        return "403 insufficient_scope"

    def _reverse(self) -> str:
        order = self._paid_order()
        result = self.connect.reverse_payment(
            order.payment_ref,
            idempotency_key=f"{order.payment_ref}-rev",
            reason="bank_reversal",
            reversed_on=self.today,
            note="Teste de integração no dev",
            confirmed_by_user_id=self.user,
            approved_by_user_id=self.approver,
        )
        self.reversed = True
        _expect(
            sorted(result.interview_ids) == sorted(order.interview_ids),
            "os itens do cancelamento não são os da baixa",
        )
        return "baixa cancelada"

    def _reverse_again(self) -> str:
        order = self._cancelled_order()
        try:
            self.connect.reverse_payment(
                order.payment_ref,
                idempotency_key=f"{order.payment_ref}-rev-2",
                reason="bank_reversal",
                reversed_on=self.today,
                note="Teste de integração no dev",
                confirmed_by_user_id=self.user,
            )
        except ConnectRefused as refused:
            _expect(
                refused.code == "not_reversible", f"esperado not_reversible, veio {refused.code}"
            )
            return "409 not_reversible"
        raise Mismatch("cancelar de novo, com chave nova, devia ser recusado")

    def _cancelled_order(self) -> PaymentOrder:
        order = self._paid_order()
        if not self.reversed:
            raise Skip("a baixa não foi cancelada nos passos anteriores")
        return order

    def _back_to_pay(self) -> str:
        project, interviewer = self._need()
        self._cancelled_order()
        back = {
            p.interview_id
            for p in self.connect.list_project_payables(project, "to_pay")
            if p.interviewer_id == interviewer
        }
        _expect({i.interview_id for i in self.items} <= back, 'os itens não voltaram a "a pagar"')
        return 'os itens voltaram a "a pagar"'

    def _mismatch(self) -> str:
        self._need()
        wrong = self._new_order(amount=self._total() + Decimal("1.00"))
        self._expect_refusal(self.connect, wrong, "amount_mismatch")
        return "422 amount_mismatch"

    def _feed_end(self) -> str:
        self._cancelled_order()
        self.sleep(self.wait)
        types: set[str] = set()
        after = self.last_seq
        for _ in range(MAX_FEED_PAGES):
            items, cursor = self.connect.events(after, 500)
            types |= {str(i["type"]) for i in items}
            if not cursor:
                break
            after = int(cursor)
        missing = {"payment.applied", "payment.reversed"} - types
        _expect(not missing, f"faltam no feed: {', '.join(sorted(missing))}")
        return "payment.applied e payment.reversed no feed"

    def _cleanup(self) -> None:
        """Desfaz o que ficou aplicado (um passo falhou no meio, ou o Connect aceitou o que devia
        recusar): o dev volta como estava."""
        pending = list(self.stray)
        if self.order is not None and (self.applied or self.attempted) and not self.reversed:
            pending.insert(0, self.order.payment_ref)
        for ref in pending:
            try:
                self.connect.reverse_payment(
                    ref,
                    idempotency_key=f"{ref}-cleanup",
                    reason="wrong_match",
                    reversed_on=self.today,
                    note="Limpeza do teste de integração",
                    confirmed_by_user_id=self.user,
                    approved_by_user_id=self.approver,
                )
                self.steps.append(Step("Limpeza", "ok", f"a baixa {ref} foi desfeita"))
            except ConnectRefused as exc:
                if exc.code not in ("not_found", "not_reversible"):
                    self.steps.append(
                        Step("Limpeza", "falhou", f"o Connect recusou: {exc.code}: desfaça {ref}")
                    )
                else:
                    self.steps.append(
                        Step("Limpeza", "ok", f"a baixa {ref} não existe mais no Connect")
                    )
            except Exception as exc:  # noqa: BLE001
                self.steps.append(
                    Step("Limpeza", "falhou", f"{_describe(exc)}: desfaça a baixa {ref} à mão")
                )
