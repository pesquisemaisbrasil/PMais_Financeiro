# Banco de dados

Como montar e evoluir o Postgres do Financeiro: database e roles separados, convenções, tipos, migrations, dado pessoal, auditoria e o **modelo de dados proposto**, derivado das tabelas financeiras que hoje vivem no P+ Connect (`backend/models/payment_receipt.py`, `interview.py`, `export_log.py`, `pii_access_log.py`, `budget_change_log.py`).

## Postgres separado

Decisão do PO: outro **database** com **usuário próprio**. Mesmo servidor é aceito (dev, homologação); em produção, de preferência servidor separado. O Financeiro **nunca** recebe usuário, senha ou rota de rede para o database do Connect.

Duas roles:

| Role | Para quê | Privilégios |
|---|---|---|
| `financeiro_migrator` | dona das tabelas; só o `alembic upgrade` usa | dona do database e do schema |
| `financeiro_app` | a API e os scripts | `SELECT, INSERT, UPDATE, DELETE` nas tabelas; `USAGE` nas sequências; **sem** `UPDATE/DELETE` nas tabelas de auditoria |

Nenhuma das duas é superuser. O Connect hoje usa uma role só (`postgres` no compose) e não tem role de migração: isto é **novo** no Financeiro. Se for usar só uma role no começo, que seja uma role dedicada, não `postgres`.

```sql
-- como superuser, uma vez por ambiente (senhas vêm do cofre, nunca do repo)
CREATE ROLE financeiro_migrator LOGIN PASSWORD '<do-cofre>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE financeiro_app LOGIN PASSWORD '<do-cofre>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

CREATE DATABASE financeiro OWNER financeiro_migrator;
REVOKE ALL ON DATABASE financeiro FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE financeiro TO financeiro_app;

\c financeiro
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO financeiro_migrator;
GRANT USAGE ON SCHEMA public TO financeiro_app;

-- tudo que o migrator criar daqui pra frente já nasce liberado para a app
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO financeiro_app;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO financeiro_app;

-- no MESMO servidor do Connect: garanta que ninguém do Financeiro entra lá
REVOKE CONNECT ON DATABASE entrevistadores_connect FROM PUBLIC;
```

Auditoria append-only, numa migration logo depois de criar a tabela (role da app vem de variável, não fixa no código):

```sql
REVOKE UPDATE, DELETE ON pii_access_logs, export_logs, integration_call_logs FROM financeiro_app;
```

No `alembic/env.py`, leia `MIGRATION_DATABASE_URL` (se existir) em vez de `DATABASE_URL`. No Connect o `env.py` usa só `DATABASE_URL`:

```python
from core.config import DATABASE_URL
config.set_main_option("sqlalchemy.url", DATABASE_URL)
```

Complete no `pg_hba.conf`: `financeiro_*` só entra no database `financeiro`, só pela rede da API, com `scram-sha-256`.

## Convenções de tabela, coluna, índice e FK

| Item | Regra | Exemplo real do Connect |
|---|---|---|
| Tabela | snake_case, plural | `receipt_batches` |
| PK | `id = Column(Integer, primary_key=True, index=True)` | todas |
| Coluna de dado | camelCase | `partsExpected`, `payeeKeyMasked`, `confirmedAt` |
| FK | snake_case `*_id`, `index=True`, **`ondelete` sempre explícito** | `batch_id = Column(Integer, ForeignKey("receipt_batches.id", ondelete="CASCADE"), nullable=False, index=True)` |
| Índice | `op.f('ix_<tabela>_<coluna>')` nas migrations | `ix_payment_receipts_e2eId` |
| Único composto | `UniqueConstraint` em `__table_args__` | `UniqueConstraint("batch_id", "partIndex")` |
| Único por estado | índice parcial com nome `uq_<tabela>_<o_que>` | `uq_payment_receipts_e2e_paid` |
| Status | `String(20)` com valores pt-BR e comentário listando a máquina de estados | `# enviando → pronto (todas as partes lidas) → confirmado` |
| Docstring do model | explica **por quê** (minimização, idempotência, retenção) | `PaymentReceipt`, `ExportLog` |

`ondelete` por tipo de relação:

| Relação | `ondelete` | Exemplo real |
|---|---|---|
| Filho que não existe sem o pai | `CASCADE` | `receipt_batch_parts.batch_id` |
| Quem fez algo, registro deve sobreviver | `SET NULL` (coluna `nullable=True`) | `receipt_batches.uploaded_by_user_id`, `budget_change_logs.changed_by_user_id` |
| Auditoria ou prova de pagamento | **`RESTRICT`** | `export_logs.user_id`, `pii_access_logs.accessed_by_user_id`, `interviews.interviewer_id` |

Nunca apague em cascata o que prova pagamento. No Connect, `tests/test_fk_ondelete.py` testa o comportamento de FKs importantes (cascata, `SET NULL`, `RESTRICT`); **não existe** um teste que percorre todas as FKs. No Financeiro, crie esse teste genérico:

```python
def test_every_fk_declares_ondelete() -> None:
    for table in Base.metadata.sorted_tables:
        for fk in table.foreign_keys:
            assert fk.ondelete, f"{table.name}.{fk.parent.name} sem ondelete"
```

ID do Connect guardado no Financeiro é **coluna inteira sem FK** (`connect_interview_id`), porque a tabela está em outro banco. Nome sempre com prefixo `connect_`.

## Tipos

| Dado | Tipo | Observação |
|---|---|---|
| Dinheiro por item | `Numeric(10, 2)` | `payment_receipts.amount`, `interviews.earnedValue` |
| Totais/orçamento | `Numeric(12, 2)` | `projects.budget`, `budget_change_logs.oldBudget` |
| Instante | `DateTime(timezone=True)`, `server_default=func.now()` | `createdAt`; `updatedAt` com `onupdate=func.now()` |
| Data de calendário | `Date` | `paidOn`, `paidAt` |
| Lista/estrutura pequena | `JSON` (`sqlalchemy.types.JSON`) | `export_logs.filters`, `pii_access_logs.fields` |
| Texto com teto | `String(n)` | `status String(20)`, `error String(255)`, `e2eId String(64)` |
| Hash HMAC-SHA256 | `String(64)` | `payeeKeyHash` |
| Cifrado (AES-GCM base64) | `String` sem limite | `payeeNameEncrypted`, `pixKeyEncrypted` |
| Booleano | `Boolean, nullable=False, default=False, server_default="false"` | `users.canEditBudget` |

Enum: o Connect usa `Enum(..., name="role_enum")` em colunas antigas (`users.role`, `interviews.status`) e `String(20)` nas novas. Para o Financeiro, prefira `String` + comentário: alterar enum do Postgres em migration é trabalhoso.

## Migrations (Alembic)

- Um arquivo por mudança em `alembic/versions/`, docstring em pt-BR, `upgrade()` e **`downgrade()` funcional**.
- **Uma head só.** Duas branches criaram migration ao mesmo tempo: faça `alembic merge` ou rebase do `down_revision` antes do PR.
- Toda tabela nova: import do model em `alembic/env.py` (senão o autogenerate e o `alembic check` não a veem):

```python
from models.payment_receipt import (  # noqa: F401 (registers model on Base.metadata)
    PaymentReceipt,
    ReceiptBatch,
    ReceiptBatchPart,
)
```

- O container roda `alembic upgrade head` ao subir: migration quebrada = API fora. Backup antes de subir versão com migration.
- Índice parcial real (`e5f6a7b8c9d0_receipt_e2e_unique_only_when_paid.py`):

```python
def upgrade() -> None:
    """Upgrade schema."""
    # Envio só conferido (sem baixa) não pode travar o mesmo PDF em outro envio.
    op.drop_constraint('payment_receipts_e2eId_key', 'payment_receipts', type_='unique')
    op.create_index(op.f('ix_payment_receipts_e2eId'), 'payment_receipts', ['e2eId'], unique=False)
    op.create_index(
        'uq_payment_receipts_e2e_paid', 'payment_receipts', ['e2eId'],
        unique=True, postgresql_where=sa.text("status = 'pago'"),
    )

def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_payment_receipts_e2e_paid', table_name='payment_receipts')
    op.drop_index(op.f('ix_payment_receipts_e2eId'), table_name='payment_receipts')
    op.create_unique_constraint('payment_receipts_e2eId_key', 'payment_receipts', ['e2eId'])
```

No model, o mesmo índice declara `postgresql_where` **e** `sqlite_where` (os testes rodam em SQLite):

```python
__table_args__ = (
    Index("uq_payment_receipts_e2e_paid", "e2eId", unique=True,
          postgresql_where=text("status = 'pago'"), sqlite_where=text("status = 'pago'")),
)
```

### Migration no CI

Os testes rodam em SQLite em memória com o schema criado pelos models; por isso existe um job separado com **Postgres 16 real** (`.github/workflows/tests.yml`, job `migrations`):

```yaml
services:
  postgres:
    image: postgres:16
    env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: financeiro }
    ports: ["5432:5432"]
    options: --health-cmd "pg_isready -U postgres" --health-interval 5s --health-retries 10
steps:
  - run: alembic upgrade head          # aplica tudo
  - run: alembic check                 # drift entre models e migrations
  - run: alembic downgrade -1          # downgrade da última funciona
  - run: alembic upgrade head          # e volta
```

Acrescente no Financeiro (não existe no Connect): `test "$(alembic heads | wc -l)" -eq 1` e, se usar as duas roles, rodar o `upgrade` com a role de migração e um teste rápido de `INSERT/SELECT` com a role da app.

## Dado pessoal no banco

Copie `backend/core/security.py` e `backend/core/crypto.py` do Connect. Três técnicas, cada uma com uso certo:

| Técnica | Função | Quando | Exemplo |
|---|---|---|---|
| HMAC-SHA256 com chave secreta (não reversível) | `hash_cpf`, `hash_pix` (`core/security.py`) | só precisa **comparar** | `users.cpfHash`, `payment_receipts.payeeKeyHash` |
| AES-256-GCM, nonce de 12 bytes, `base64(nonce + ciphertext)` | `encrypt_payload` / `decrypt_payload` (`core/crypto.py`) | precisa **ler de volta** | `payment_receipts.payeeNameEncrypted` |
| Máscara | `mask_pix_key` (`services/finance.py`) | precisa **mostrar sem expor** | `payeeKeyMasked`: `ful***@exemplo.com`, `123***09` |

```python
def hash_pix(pix_key: str) -> str:
    normalized = normalize_pix_key(pix_key)   # core/pix.py: e-mail minúsculo, CPF/CNPJ só dígitos, telefone +55…
    return hmac.new(PIX_SECRET_KEY.encode(), normalized.encode(), hashlib.sha256).hexdigest()

def encrypt_payload(plaintext: str) -> str:
    nonce = os.urandom(12)
    return base64.b64encode(nonce + _get_aesgcm().encrypt(nonce, plaintext.encode(), None)).decode()
```

Regras no Financeiro:

- **CPF**: só hash (ADR 0003 do Connect). Nem coluna cifrada.
- **Chave Pix do entrevistador**: **não é guardada**. Vem da rota auditada do Connect, em memória, na hora de montar a planilha.
- **Chave Pix lida do comprovante**: só `payeeKeyHash` + `payeeKeyMasked` (como hoje).
- **Nome do recebedor do comprovante**: cifrado, mostrado só quando a chave não casa com ninguém.
- **Nunca** texto bruto do PDF, CPF do recebedor ou dados da conta pagadora.
- Trocar `CPF_SECRET_KEY`, `PIX_SECRET_KEY` ou `ENCRYPTION_KEY` depois de ter dado quebra hashes e cifras: as chaves são para sempre (ou exigem script de rotação).
- Mudou o que se guarda: atualize o inventário de dados e o ROPA no mesmo PR.

### Arquivos (MinIO, duas camadas)

Hoje o Connect **não** guarda o PDF de comprovante (ADR 0002) e **não** usa SSE nem KES no MinIO: o bucket é privado e a leitura é por URL pré-assinada de 5 minutos (`core/storage.py`). No Financeiro, se um arquivo for guardado (decisão de retenção do DPO pendente):

1. **Envelope no backend**: gera uma chave de dados aleatória de 32 bytes por arquivo, cifra o conteúdo com AES-256-GCM, e guarda essa chave **cifrada** com `encrypt_payload` (chave mestra `ENCRYPTION_KEY`) na tabela `stored_files`.
2. **SSE no MinIO via KES**: `put_object(..., ServerSideEncryption="aws:kms", SSEKMSKeyId=MINIO_SSE_KMS_KEY_ID)`.
3. Download passa pela API (decifra e devolve), nunca URL pré-assinada direta, porque o objeto no bucket está cifrado pelo backend.

## Tabelas de auditoria (append-only)

Padrão do Connect: tabela própria por tipo de evento, só `INSERT`, FK de quem agiu com `RESTRICT`, docstring dizendo o porquê.

```python
class PiiAccessLog(Base):
    """Registro append-only de quando um terceiro (admin) viu dado sensível
    decriptado de outro usuário. Não loga a própria pessoa vendo seus dados."""
    __tablename__ = "pii_access_logs"
    accessed_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    accessed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    fields = Column(JSON, nullable=False)  # ex: ["pixKey", "sensitiveInfo"]
    accessedAt = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

class ExportLog(Base):   # uma linha por exportação, não por pessoa exportada
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    export_type = Column(String, nullable=False, index=True)
    filters = Column(JSON, nullable=False)
    row_count = Column(Integer, nullable=False)

class BudgetChangeLog(Base):   # de/para de valor
    changed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    oldBudget = Column(Numeric(12, 2), nullable=True)
    newBudget = Column(Numeric(12, 2), nullable=True)
```

A planilha de pagamentos do Connect grava **uma linha de `PiiAccessLog` por pessoa** cuja chave Pix completa saiu, mais **um `ExportLog`** da exportação (`services/payment_sheet.py`). No Connect, append-only é só convenção (não há `REVOKE` no banco); no Financeiro, reforce com o `REVOKE UPDATE, DELETE` acima.

## Modelo de dados proposto para o Financeiro

### O que fica onde

| Fica no **Connect** (fonte da verdade) | Vai para o **Financeiro** |
|---|---|
| `users`, `interviewer_profiles`: pessoa, CPF (hash), chave Pix (cifrada), WhatsApp | Usuários **do Financeiro** (equipe de pagamento, admin) |
| `projects`: título, `valuePerInterview`, `paymentTermDays`, `budget` | Espelho mínimo de projeto (id + título + prazo) só para trava e listagem |
| `interviews`: o que é devido (`earnedValue`, `createdAt`) | Espelho mínimo de "itens a pagar" por `connect_interview_id` |
| Status "pago" da entrevista (`paidAt` + referência do pagamento) — gravado quando o Financeiro pede a baixa | `receipt_batches`, `receipt_batch_parts`, `payment_receipts`, alocação comprovante → item (a baixa) |
| `budget_change_logs`, orçamento como teto duro | Planilha de pagamentos, `export_logs` e `pii_access_logs` dela |
| Notificação ao entrevistador ("Pagamento de R$ …") e fila de WhatsApp | Outbox de eventos ao Connect, eventos recebidos, contas de serviço, idempotência |

Mudança necessária **no Connect** na migração: `interviews.payment_receipt_id` (FK para `payment_receipts`, que sai do Connect) vira uma referência externa sem FK (ex.: `financePaymentRef String(64)`), e as tabelas `receipt_*`/`payment_receipts` do Connect deixam de ser escritas. Isso é decisão a registrar nos dois repositórios.

### Tabelas

Convenção: colunas camelCase, FKs locais snake `*_id`, ids do Connect `connect_*_id` sem FK. Toda tabela tem `id` e `createdAt`.

**`users`**, **`refresh_tokens`**, **`password_reset_tokens`**: copie os models do Connect (login por CPF com `cpfHash`, `passwordHash` bcrypt, `role`, `status`). Papéis: `financeiro`, `admin`. Sem chave Pix, sem endereço, sem `encryptedPayload`.

**`project_refs`**: espelho mínimo de projeto.

| Coluna | Tipo | Motivo |
|---|---|---|
| `connect_project_id` | Integer, unique | id no Connect |
| `title` | String(255) | listar sem chamar o Connect a cada tela (não é dado pessoal) |
| `paymentTermDays` | Integer, nullable | prazo vigente (nulo = 30, `effective_payment_term`) |
| `syncedAt` | DateTime(tz) | quando foi atualizado pela última vez |

É a linha travada com `with_for_update()` na confirmação de lote (papel que `projects` tem hoje em `_lock_batch`).

**`payable_items`**: espelho de entrevista a pagar. Sem nome nem chave Pix.

| Coluna | Tipo | Motivo |
|---|---|---|
| `connect_interview_id` | Integer, **unique** | idempotência da sincronização; uma linha por entrevista |
| `project_ref_id` | FK `project_refs.id`, `RESTRICT` | não some com o projeto |
| `connect_interviewer_id` | Integer, index | id da ficha no Connect; casa com o comprovante |
| `amount` | Numeric(10,2) | `earnedValue` congelado no lançamento |
| `launchedAt` | DateTime(tz) | `Interview.createdAt` (base do prazo) |
| `dueOn` | Date | `expected_payment_date` calculado no Connect |
| `status` | String(20) | `a_pagar → pago`; `cancelado` se o Connect apagou o lançamento |
| `paidOn` | Date, nullable | data do Pix que pagou |
| `connectUpdatedAt` | DateTime(tz) | ignorar evento mais velho que o já aplicado |
| `syncedAt` | DateTime(tz) | |

**`receipt_batches`**: igual ao Connect, trocando FKs de projeto e usuário.

| Coluna | Tipo | Motivo |
|---|---|---|
| `project_ref_id` | FK `project_refs.id`, `RESTRICT` | |
| `uploaded_by_user_id` / `confirmed_by_user_id` | FK `users.id`, `SET NULL` | lote sobrevive à conta |
| `status` | String(20) | `enviando → pronto → confirmado` |
| `partsExpected` | Integer | |
| `confirmedAt` | DateTime(tz), nullable | |
| `stored_file_id` | FK `stored_files.id`, `RESTRICT`, nullable | só se o DPO autorizar guardar o PDF |

**`receipt_batch_parts`**: igual ao Connect (`batch_id` CASCADE, `partIndex`, `pageOffset`, `receiptsCount`, `error String(255)`, `UniqueConstraint("batch_id", "partIndex")`).

**`payment_receipts`**: igual ao Connect.

| Coluna | Tipo | Motivo |
|---|---|---|
| `batch_id` | FK `receipt_batches.id`. **`RESTRICT`** (no Connect é CASCADE) | lote confirmado não pode levar a prova junto; cancelar lote não confirmado apaga os comprovantes no serviço, explicitamente |
| `page` | Integer | |
| `payeeNameEncrypted` | String | AES-GCM |
| `payeeKeyHash` | String(64), index | casar |
| `payeeKeyMasked` | String(255) | exibir |
| `amount` | Numeric(10,2) | |
| `paidOn` | Date | |
| `e2eId` | String(64), index + `uq_payment_receipts_e2e_paid` parcial (`status = 'pago'`) | nunca dar baixa duas vezes no mesmo Pix |
| `group` | String(30) | `no_projeto`, `fora_do_projeto`, `chave_nao_cadastrada`, `erro_leitura`, `duplicado` |
| `connect_interviewer_id` | Integer, nullable | quem casou (resposta do Connect) |
| `status` | String(20) | `pendente`, `pago`, `descartado` |
| `error` | String(255) | |

**`receipt_allocations`**: a baixa propriamente dita (no Connect são as colunas `payment_receipt_id`/`paidAt` em `interviews`).

| Coluna | Tipo | Motivo |
|---|---|---|
| `receipt_id` | FK `payment_receipts.id`, `RESTRICT` | prova |
| `payable_item_id` | FK `payable_items.id`, `RESTRICT`, **unique** | um item é pago uma vez só |
| `amount` | Numeric(10,2) | valor do item na hora (soma = valor do Pix, regra do valor exato) |
| `connectAckAt` | DateTime(tz), nullable | quando o Connect confirmou a baixa |

**`outbox_events`**: eventos para o Connect, no padrão de `notification_deliveries`.

| Coluna | Tipo | Motivo |
|---|---|---|
| `eventType` | String(60) | ex.: `finance.batch.confirmed` |
| `aggregateId` | Integer | id do lote |
| `payload` | JSON | só ids e valores, **sem dado pessoal** |
| `idempotencyKey` | String(64), unique | vai no cabeçalho `Idempotency-Key`; repetir não paga de novo |
| `status` | String(20), index | `pendente → enviado | falhou | descartado` |
| `attempts` | Integer | |
| `lastError` | String(255) | só código/tipo |
| `nextAttemptAt` | DateTime(tz), nullable | backoff |
| `sentAt` | DateTime(tz), nullable | |

**`inbound_events`**: eventos recebidos do Connect (webhook).

| Coluna | Tipo | Motivo |
|---|---|---|
| `eventId` | String(64), unique | `X-Event-Id`; deduplica reentrega |
| `eventType` | String(60) | ex.: `interview.launched`, `interview.deleted` |
| `status` | String(20) | `recebido → processado | erro` |
| `processedAt` | DateTime(tz), nullable | |
| `error` | String(255) | |

O corpo não é guardado: é processado e descartado.

**`idempotency_keys`**: só se alguém chamar escrita do Financeiro por API.

| Coluna | Tipo | Motivo |
|---|---|---|
| `service_client_id` | FK `service_clients.id`, `CASCADE` | chave vale por cliente |
| `key` | String(64) | unique com o cliente |
| `requestHash` | String(64) | mesma chave com corpo diferente = 422 |
| `responseStatus` | Integer | |
| `responseBody` | JSON | devolvido na repetição |
| `expiresAt` | DateTime(tz) | 24 h |

**`service_clients`**: contas de serviço que chamam o Financeiro (proposta de `docs/architecture/integracao-entre-sistemas.md`, **não existe hoje** em nenhum dos dois).

| Coluna | Tipo |
|---|---|
| `name` | String(100) |
| `scopes` | JSON (ex.: `["finance:read"]`) |
| `secretHash` | String(64), unique (`hash_token`, mostrado uma vez) |
| `active` | Boolean |
| `lastUsedAt` | DateTime(tz), nullable |

As credenciais do Financeiro **no Connect** ficam no `.env` (`CONNECT_CLIENT_ID`/`SECRET`), não em tabela.

**`stored_files`**: só se algum arquivo for guardado.

| Coluna | Tipo | Motivo |
|---|---|---|
| `bucket` / `objectKey` | String(100) / String(255) | `receipts/{batch_id}/{uuid}.bin` |
| `contentType` | String(100) | |
| `sizeBytes` | Integer | |
| `sha256` | String(64) | integridade (do conteúdo original) |
| `wrappedKey` | String | chave do arquivo cifrada com `encrypt_payload` |
| `uploaded_by_user_id` | FK `users.id`, `SET NULL` | |
| `retainUntil` | Date, nullable | retenção definida pelo DPO |
| `deletedAt` | DateTime(tz), nullable | apagado do bucket, linha fica para auditoria |

**Auditoria** (append-only, `REVOKE UPDATE, DELETE` da role da app):

| Tabela | Colunas | Quando grava |
|---|---|---|
| `pii_access_logs` | `connect_user_id` Integer (pessoa cujo dado saiu), `accessed_by_user_id` FK `RESTRICT`, `fields` JSON (`["pixKey"]`), `purpose` String(60) (`payment_sheet`), `accessedAt` | cada chave Pix buscada no Connect e entregue a alguém |
| `export_logs` | `user_id` FK `RESTRICT`, `exportType` String(60), `filters` JSON, `rowCount` Integer | cada planilha/CSV com dado pessoal |
| `file_access_logs` | `stored_file_id` FK `RESTRICT`, `user_id` FK `RESTRICT`, `action` String(20) (`upload`, `download`, `delete`) | cada acesso a arquivo |
| `integration_call_logs` | `direction` String(10) (`saida`/`entrada`), `route` String(255), `statusCode` Integer, `durationMs` Integer, `service_client_id` nullable | toda chamada de integração (sem corpo) |
| `batch_status_logs` | `batch_id` FK `RESTRICT`, `changed_by_user_id` FK `SET NULL`, `previousStatus`, `newStatus` | confirmar, cancelar, descartar comprovante |

## Checklist

- [ ] Database `financeiro` com roles próprias, nenhuma superuser; a role da app não tem `CONNECT` no database do Connect.
- [ ] Migrations rodam com a role de migração; a app só tem DML.
- [ ] Toda FK tem `ondelete` explícito, verificado por teste que percorre `Base.metadata`; prova de pagamento e auditoria com `RESTRICT`.
- [ ] Ids do Connect em colunas `connect_*_id` sem FK; nenhuma tabela de pessoa ou chave Pix copiada.
- [ ] Dinheiro em `Numeric(10,2)`/`Numeric(12,2)`; instantes em `DateTime(timezone=True)`; datas de pagamento em `Date`.
- [ ] Índice parcial único em `payment_receipts.e2eId` só entre pagos, com `postgresql_where` e `sqlite_where`; `receipt_allocations.payable_item_id` único.
- [ ] Cada migration tem `downgrade` funcional e o model importado em `alembic/env.py`; uma head só.
- [ ] CI com Postgres 16: `upgrade head`, `alembic check`, `downgrade -1`, `upgrade head`, contagem de heads = 1.
- [ ] CPF só como HMAC; nome do recebedor cifrado com AES-GCM; chave Pix do comprovante só hash + máscara.
- [ ] Tabelas de auditoria sem `UPDATE`/`DELETE` para a role da app; planilha grava `pii_access_logs` por pessoa e `export_logs` por exportação.
- [ ] Arquivo guardado só com envelope AES-GCM + SSE-KMS e linha em `stored_files`; download só pela API, com `file_access_logs`.
- [ ] `outbox_events.idempotencyKey` e `inbound_events.eventId` únicos.
