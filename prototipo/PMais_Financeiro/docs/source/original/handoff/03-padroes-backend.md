# Padrões do backend

Como escrever código Python no Financeiro do mesmo jeito que o P+ Connect: camadas, nomes, rotas, exceções, transação, concorrência, dinheiro, datas, paginação, log, rate limit, filas e lint. Os exemplos são trechos reais do Connect, encurtados. O modelo a copiar é o Financeiro que já roda lá: `backend/api/finance.py`, `backend/services/finance.py`, `backend/schemas/finance.py`, `backend/models/payment_receipt.py`.

## Camadas: quem faz o quê

| Camada | Faz | Não faz |
|---|---|---|
| `api/` (rota) | autenticação (`Depends(get_current_active_user)`), permissão (`require_*` **dentro** do handler), rate limit, validação de tamanho de upload, tradução de exceção de domínio em `HTTPException`, cabeçalhos (`X-Total-Count`) | regra de negócio, query complexa, commit |
| `services/` | regra, queries, travas, `commit`; levanta **exceção de domínio** | `HTTPException`, `Request`, nada de HTTP |
| `models/` | tabela SQLAlchemy, docstring explicando o porquê | lógica |
| `schemas/` | Pydantic de entrada e saída (`response_model`) | acesso a banco |
| `core/` | infraestrutura sem regra de produto: config, cripto, hash, storage, permissões, limiter, logging, paginação, formatação | — |

Exceções reais à regra, que o Financeiro pode repetir: `services/auth.py` (dependência `get_current_user`) e `core/permissions.py` levantam `HTTPException` direto, porque são usados como guarda de rota.

## Nomenclatura (convenção real do Connect)

| Item | Convenção | Exemplo real |
|---|---|---|
| Tabela | snake_case, plural | `receipt_batches`, `payment_receipts`, `budget_change_logs` |
| Coluna de dado | **camelCase** | `createdAt`, `partsExpected`, `paidAt`, `payeeKeyHash`, `e2eId` |
| Coluna FK | **snake_case** terminando em `_id` | `project_id`, `batch_id`, `uploaded_by_user_id`, `matched_interviewer_id` |
| Classe model | PascalCase singular | `ReceiptBatch`, `PaymentReceipt` |
| Valor de status | string curta em **pt-BR** | `enviando → pronto → confirmado`; `pendente`, `pago`, `descartado` |
| Campo JSON da API | igual à coluna (camelCase; FKs ficam snake) | `paidReceipts`, `interviewer_id` |
| Exceção de domínio | PascalCase, sem sufixo `Error` | `BatchNotFound`, `BatchAlreadyConfirmed`, `BudgetExceeded` |

Irregularidades que existem e **não** devem ser copiadas: `refresh_tokens` usa `token_hash`, `expires_at`, `created_at`; `export_logs` usa `export_type`, `row_count`; o model `InterviwerProfile` tem erro de digitação. Na dúvida, siga a tabela vizinha mais recente (`payment_receipts`).

## Padrão de rota

```python
router = APIRouter(prefix="/projects/{project_id}/finance", tags=["finance"])

_CONFIRMED_DETAIL = "Esse envio já foi confirmado e não pode mais ser alterado"

@router.post(
    "/receipt-batches/{batch_id}/confirm",
    response_model=ReceiptBatchConfirmResult,
    description="Dá baixa nas entrevistas dos comprovantes que batem (transação única)",
)
@limiter.limit("20/minute")
def confirm_batch_endpoint(
    request: Request,                       # obrigatório para o slowapi
    project_id: int,
    batch_id: int,
    send_whatsapp: bool = Query(default=False, alias="sendWhatsapp"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    require_finance(current_user)
    batch = _batch_or_404(db, project_id, batch_id)
    try:
        return confirm_batch(db, batch, current_user.id, send_whatsapp=send_whatsapp)
    except BatchAlreadyConfirmed as exc:
        raise HTTPException(status_code=409, detail=_CONFIRMED_DETAIL) from exc
```

Regras:

- Ordem dos decorators: `@router.<verbo>(...)` primeiro, `@limiter.limit(...)` embaixo.
- Toda rota declara `response_model` (ou `status_code=204`) e `description` em pt-BR.
- `require_*` é chamado na primeira linha do handler, não como `Depends`.
- Helper `_x_or_404` na própria rota para "buscar ou 404", traduzindo a exceção do serviço.
- Sempre `raise HTTPException(...) from exc`.
- Mensagens repetidas viram constante `_ALGO_DETAIL` no topo do arquivo.
- Trabalho pesado síncrono (ler PDF) dentro de rota `async`: `await run_in_threadpool(process_part, db, ...)`, senão a API inteira para.

### Permissões (`core/permissions.py`)

```python
def require_finance(current_user: User) -> None:
    if current_user.role not in ("admin", "supervisor", "financeiro"):
        raise HTTPException(status_code=403, detail="Acesso ao Financeiro é necessário")
```

Uma função `require_<capacidade>` por capacidade (não por tela). Permissão por usuário vira função booleana (`can_edit_budget`). O papel é lido do banco a cada requisição (`get_current_user` busca o `User`). No Financeiro, some `require_scope("finance:write")` para conta de serviço (proposta em `docs/architecture/integracao-entre-sistemas.md`; **não existe hoje**).

## Exceções de domínio e mapeamento para HTTP

Onde vivem hoje:

- **No próprio serviço**, quando são do domínio dele: `services/finance.py` (`BatchNotFound`, `BatchAlreadyConfirmed`, `PartOutOfRange`), `services/project.py` (`BudgetExceeded`, `BudgetEditForbidden`), `core/storage.py` (`PhotoTooLarge`…).
- **Em `core/exceptions.py`**, quando usadas por mais de um módulo: `InvalidStatusTransition`, `TrainingNotPassed`, `MissingMeiCnpj`.

Exceção pode carregar dado para a mensagem:

```python
class BudgetExceeded(Exception):
    def __init__(self, available: Decimal) -> None:
        self.available = available
        super().__init__(f"Orçamento insuficiente: restam {format_brl(available)}")
```

| Código | Quando |
|---|---|
| 400 | regra de entrada simples ("projeto sem valor por entrevista") |
| 401 | token inválido (`get_current_user`) |
| 403 | sem permissão |
| 404 | não encontrado (inclusive "existe, mas é de outro projeto") |
| 409 | conflito de regra: já confirmado, orçamento, cota, duplicado, ainda enviando |
| 413 | arquivo grande demais |
| 422 | entrada inválida (Pydantic ou parte fora do intervalo) |
| 429 | rate limit (slowapi) |

`detail` é **sempre pt-BR, frase para leigo**, porque o front mostra direto no toast: "Envio de comprovantes não encontrado", "Parte grande demais — divida o PDF em partes menores", "Esse lançamento passa do orçamento do projeto — restam R$ 20,00". Nunca nome de tabela, stack trace ou texto em inglês.

## Transações

- **Quem dá `commit` é o serviço**, no fim da operação (`create_batch`, `confirm_batch`, `delete_batch`). A rota não comita.
- Uma ação de negócio = **uma transação**: em `confirm_batch`, marcar comprovantes, baixar entrevistas, mudar status do lote e criar notificações saem num único `db.commit()`.
- Efeitos colaterais "no mesmo commit" **nunca comitam nem levantam**. Contrato de `services/notification.notify`:

```python
def notify(db, user_ids, *, type, title, body=None, link=None, exclude_user_id=None, whatsapp=None) -> int:
    """Adiciona notificações à sessão (db.add_all) — NUNCA dá commit, quem
    chama é dono da transação do evento principal. Nunca levanta: qualquer
    erro é logado e engolido..."""
```

E quem chama ainda protege:

```python
try:
    whatsapp_queued += notify(db, [recipient], type="payment_received", ...)
except Exception:
    logger.exception("Falha ao notificar pagamento (interviewer_id=%s)", interviewer_id)
```

- Auditoria que faz parte da ação (`_record_budget_change`) só faz `db.add`; quem chama comita.
- Exceção: `services/export_log.record_export` comita sozinho porque é a única escrita de uma rota de leitura.
- Idempotência por constraint: tente inserir, e se der `IntegrityError` faça `rollback` e devolva o que já existe (`process_part`, unique `(batch_id, partIndex)`).

## Concorrência

Toda checagem de teto, saldo ou "já confirmado" trava a linha-pai com `with_for_update()` **e relê o estado depois da trava**:

```python
def _lock_batch(db: Session, batch: ReceiptBatch) -> ReceiptBatch | None:
    db.query(Project).filter(Project.id == batch.project_id).with_for_update().first()
    return db.query(ReceiptBatch).filter(ReceiptBatch.id == batch.id).populate_existing().first()

# confirm_batch
if _lock_batch(db, batch) is None:
    db.rollback(); raise BatchNotFound
if batch.status == "confirmado":       # decide pelo status RELIDO, não pelo do começo
    db.rollback(); raise BatchAlreadyConfirmed
```

- Lançamento contra orçamento: `project = db.query(Project)...with_for_update().first()` antes de `ensure_budget_available`.
- Trabalho lento (ler PDF) fica **fora** da trava; trave só antes de gravar.
- Fila com vários consumidores: `with_for_update(skip_locked=True)` (ver "Filas").
- Backstop no banco além da trava: índice único parcial `uq_payment_receipts_e2e_paid` (ver [04-banco-de-dados.md](04-banco-de-dados.md)).

No Financeiro, a linha-pai a travar é o **lote** (ou uma linha por projeto espelhado), já que o projeto vive no Connect.

## Dinheiro

- Banco: `Numeric(10, 2)` (valor por item/comprovante); `Numeric(12, 2)` para totais grandes (orçamento).
- Python: `Decimal` sempre. Some com `Decimal("0")` como início: `sum((...), Decimal("0"))`. Converta resultado de agregação com `Decimal(str(total))`.
- **Nunca `float`**. Única exceção real: célula numérica do `.xlsx` (`float(row.total)` em `payment_sheet.py`), só na hora de escrever.
- API: campo `Decimal` no schema Pydantic v2 sai como string JSON (`"40.00"`).
- Texto: helpers de `core/text.py`:

```python
format_brl(Decimal("1234.5"))        # 'R$ 1.234,50'
format_brl_plain(Decimal("1234.5"))  # '1.234,50'  (coluna "Valor (R$)" de CSV)
format_reais(Decimal("40"))          # '40,00 reais' (variável de WhatsApp, sem "$")
```

## Datas e fuso

- Banco em **UTC**: `DateTime(timezone=True)`, `server_default=func.now()`; no Python `datetime.now(UTC)`.
- Regra de data (dia de lançamento, prazo, "vence hoje") em **America/Sao_Paulo**: `SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")` (requer `tzdata`).
- `launch_date(dt)`: dia em São Paulo de um instante (naive = UTC). Perto da meia-noite UTC ainda é o dia anterior em São Paulo.
- `expected_payment_date(dt, term_days)` = `launch_date(dt) + term_days`; `effective_payment_term(project.paymentTermDays)` cai para 30 quando nulo.
- Quando o mesmo instante gera texto e coluna, fixe `now = datetime.now(UTC)` uma vez e use nos dois (comentário em `services/interview.py`: "mesmo relógio").
- Exibição: `format_date_br` (`dd/mm/aaaa`), `format_datetime_br` (converte para São Paulo).
- Data só de calendário (`paidOn`, `paidAt`) é `Date`, não `DateTime`.

## Paginação

```python
# core/pagination.py
def pagination_params(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> Pagination: ...

# rota
def list_projects_endpoint(request: Request, response: Response, ...,
                           pagination: Pagination = Depends(pagination_params)):
    projects = get_projects(db, skip=pagination.skip, limit=pagination.limit)
    response.headers["X-Total-Count"] = str(count_projects(db))
```

`X-Total-Count` precisa estar no `expose_headers` do CORS. Para sincronizar ou para timeline longa, cursor: `GET /audit/events?before=<cursor>` devolve `nextCursor` (`services/audit.py: list_audit_events` busca `limit + 1` para saber se há mais).

## Logging

- `core/logging_config.setup_logging()`: JSON no stdout com `level`, `logger`, `message`, `time` e, no log de acesso, `method`, `path`, `status_code`, `duration_ms`, `client_ip`.
- `logger = logging.getLogger(__name__)` em cada módulo.
- **Nunca dado pessoal no log**: nada de nome, e-mail, telefone, CPF, chave Pix, valor de uma pessoa, corpo de requisição. Logue **ids** e tipo do erro:

```python
logger.error("Erro inesperado ao enviar WhatsApp (entrega %s): %s", delivery.id, type(exc).__name__)
```

- Erro guardado em coluna também é só tipo/código: a mensagem é só "respondeu HTTP 503", nunca o corpo da resposta nem o número de telefone.
- Engine com `create_engine(url, hide_parameters=True)`: erro de banco não leva valores para o log.
- Script de manutenção imprime ids, nunca a chave (`rehash_pix_keys.py`).

## Rate limit

```python
# core/limiter.py
limiter = Limiter(key_func=get_remote_address, enabled=RATE_LIMIT_ENABLED)
```

- `@limiter.limit("N/minute")` em **toda** rota; o handler recebe `request: Request`.
- Faixas usadas: leitura 60/min; detalhe muito acessado 120/min; escrita 20–30/min; ação sensível 5–10/min; upload em partes 600/min.
- Polling ou usuários atrás do mesmo IP: `@limiter.limit("120/minute", key_func=key_by_user_or_ip)` (chave `user:{sub}` do JWT, senão IP).
- `RATE_LIMIT_ENABLED=false` só nos testes de tela (e2e). No Financeiro, rotas de integração usam chave por **cliente** (`service:{id}`), não por IP.

## Filas, outbox e despachante

Padrão de `services/whatsapp.py` + `models/notification_delivery.py`. É o que o Financeiro usa para mandar eventos ao Connect (baixa, por exemplo).

1. **Enfileirar na mesma transação** da ação: `db.add(NotificationDelivery(..., status="pendente", attempts=0))`. Sem chamada externa dentro da transação.
2. **Despachar** em função própria, chamada por thread da API e por script de cron:

```python
pending_ids = [...]  # ids pendentes vencidos, order_by(id), limit
for delivery_id in pending_ids:
    delivery = (
        db.query(NotificationDelivery)
        .filter(NotificationDelivery.id == delivery_id, *due)
        .with_for_update(skip_locked=True)
        .populate_existing()
        .first()
    )
    if delivery is None:
        continue                  # outro processo pegou
    delivery.attempts += 1
    try:
        delivery.providerMessageId = send_...(...)   # chamada ao provedor
        delivery.status = "enviado"
    except Exception as exc:
        retryable = ...   # exceção do provedor traz .retryable (5xx/429/rede); erro inesperado = True
        if not retryable or delivery.attempts >= MAX_ATTEMPTS:
            delivery.status = "falhou"
        else:
            delivery.nextAttemptAt = now + timedelta(minutes=2**delivery.attempts)
    db.commit()                   # commit POR item: falha depois não desfaz o que já foi aceito
```

3. **Status**: `pendente → enviado | falhou | descartado`. 5xx, 429 e erro de rede repetem (até 5, espera `2^tentativas` minutos); 4xx falha na hora. `Retry-After` respeitado com teto de 30 s.
4. **Thread**:

```python
def start_dispatcher_thread(interval_seconds: int = 30) -> threading.Thread:
    def loop() -> None:
        while True:
            db = SessionLocal()
            try:
                dispatch_pending(db)
            except Exception:
                logger.exception("Falha no despachante de WhatsApp")
                db.rollback()
            finally:
                db.close()
            time.sleep(interval_seconds)
    thread = threading.Thread(target=loop, name="whatsapp-dispatcher", daemon=True)
    thread.start()
    return thread
```

5. Liga e desliga por variável (`DELIVERY_DISPATCHER_ENABLED`); nos testes, desligado em `tests/conftest.py`.
6. Payload da fila **sem dado pessoal** além do necessário (no Connect: nunca CPF ou chave Pix).

## Scripts

Padrão de `backend/scripts/`:

- Docstring no topo com "Uso:" e o comando.
- `sys.path.append(str(Path(__file__).resolve().parents[1]))` e imports com `# noqa: E402`.
- Abre `SessionLocal()` e fecha no `finally`.
- **Idempotente**: rodar duas vezes dá o mesmo resultado. `seed_admin.py` promove se o CPF já existe, senão cria.
- Mudança em dado real: **simula por padrão** e só grava com `--apply` (`rehash_pix_keys.py`); relatório só com ids.
- Seeds de demo dizem "não rodar em produção" e usam dado fictício.
- Script que precisa de todos os models importa `main` (`import main as _app  # noqa: E402,F401`).
- Ficam fora do mypy (`exclude = ["alembic/versions", "scripts/"]`).

## Ruff e mypy

`backend/pyproject.toml` do Connect, para copiar:

```toml
[tool.ruff]
line-length = 100
target-version = "py311"
extend-exclude = ["alembic/versions"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]
ignore = ["B008"]   # Depends(...) como default é o padrão do FastAPI

[tool.mypy]
python_version = "3.11"
ignore_missing_imports = true
disallow_untyped_defs = true
check_untyped_defs = true
exclude = ["alembic/versions", "scripts/"]
```

Todo `def` com tipos. `# type: ignore[código]` só com comentário do motivo (ex.: handler do slowapi). CI (`.github/workflows/lint.yml`): `ruff check .`, `ruff format --check .`, `mypy .`. Testes (`tests.yml`): `pytest -q --cov=. --cov-fail-under=80`.

## Checklist

- [ ] Nenhum `HTTPException` em `services/` (fora a dependência de auth); nenhuma regra ou commit em `api/`.
- [ ] Toda rota tem `response_model` (ou 204), `description` pt-BR, `@limiter.limit`, `request: Request` e `require_*` na primeira linha.
- [ ] Toda exceção de domínio é traduzida com `raise HTTPException(...) from exc` e `detail` em pt-BR para leigo.
- [ ] Tabelas snake_case plural, colunas camelCase, FKs `*_id` snake.
- [ ] Toda checagem de teto/estado é feita depois de `with_for_update()` e releitura (`populate_existing`).
- [ ] Dinheiro só `Numeric` + `Decimal`; nenhum `float` fora da escrita do `.xlsx`.
- [ ] Instantes em UTC; regra de dia usa `launch_date`/`SAO_PAULO_TZ`.
- [ ] Listas com `pagination_params` e `X-Total-Count`; sincronização por cursor.
- [ ] `grep` por `logger.` não mostra nome, e-mail, CPF, chave Pix nem corpo de requisição; engine com `hide_parameters=True`.
- [ ] Efeitos colaterais (notificação, evento) entram na mesma transação, sem commit próprio e sem levantar.
- [ ] Outbox com `skip_locked`, commit por item, retry com backoff e liga/desliga por variável.
- [ ] Scripts idempotentes, com dry-run por padrão quando mexem em dado real.
- [ ] `ruff check`, `ruff format --check`, `mypy` e `pytest` com cobertura ≥ 80% verdes no CI.
