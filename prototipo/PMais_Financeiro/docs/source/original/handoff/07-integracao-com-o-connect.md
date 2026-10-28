# Integração com o P+ Connect

Como o Financeiro e o P+ Connect conversam: identidade de serviço, contrato da API nos dois sentidos, eventos, idempotência, testes locais e reconciliação quando algo falha. Este é o contrato que os dois times implementam. Mudou aqui, muda nos dois lados.

**Estado atual:** o Connect **não tem** integração máquina a máquina (`docs/architecture/integracao-entre-sistemas.md`). Não há conta de serviço, escopo, webhook, outbox nem rota `/v1`. **Tudo neste documento é (proposta)**, exceto o que aparece citado como código existente. A base é o padrão já descrito em `integracao-entre-sistemas.md`.

## 1. Arquitetura

```
                    rede interna / HTTPS
  +-------------------------+                     +-------------------------+
  |       P+ CONNECT        |                     |       FINANCEIRO        |
  |  FastAPI + Next.js      |                     |  FastAPI + Next.js      |
  |                         |  (1) POST /oauth/token (client_credentials)   |
  |  /oauth/token  <--------+---------------------+  ConnectClient          |
  |                         |  (2) GET/POST /integrations/v1/...            |
  |  /integrations/v1/* <---+---------------------+  (JWT 15 min, escopos)  |
  |   - projects, budget    |                     |                         |
  |   - payables            |                     |                         |
  |   - interviewers        |                     |                         |
  |   - payment-data (Pix)  |  pii_access_logs    |                         |
  |   - pix-key-matches     |  gravado no Connect |                         |
  |   - payments (baixa)    |                     |                         |
  |   - events (replay)     |                     |                         |
  |                         |  (3) POST evento assinado (X-Signature)       |
  |  integration_outbox ----+-------------------->+  /integrations/v1/      |
  |  + despachante          |   reentrega com     |   connect-events        |
  |   (SKIP LOCKED)         |   backoff           |  inbound_events (dedup) |
  |                         |                     |                         |
  |  Postgres "connect"     |   NUNCA:            |  Postgres "financeiro"  |
  |  usuário connect_app    |   Financeiro -> DB  |  usuário financeiro_app |
  |  MinIO bucket connect   |   do Connect        |  MinIO bucket próprio   |
  +-------------------------+                     +-------------------------+
```

| Sentido | Mecanismo | Para quê |
|---|---|---|
| Financeiro → Connect | API REST com token de serviço | Ler projetos, orçamento, itens a pagar, dados de pagamento; pedir baixa e cancelamento |
| Connect → Financeiro | Webhook assinado (outbox) | Avisar que algo mudou (só ids e valores) |
| Financeiro → Connect | Feed de eventos por cursor | Recuperar eventos perdidos (mesmo conteúdo dos webhooks) |

Princípios:

- **Connect é a fonte da verdade** de pessoas, projetos, entrevistas e do status "pago". O Financeiro **pede** a baixa; quem grava é o Connect.
- **Eventos são avisos finos.** Ao receber, o Financeiro relê o recurso na API. Isso resolve ordem trocada e evento duplicado.
- **Payload de evento sem dado pessoal.** Nome e chave Pix só pela API, com escopo próprio e auditoria.
- O Financeiro **nunca** acessa o banco ou o MinIO do Connect.

## 2. Identidade de serviço

### Tabela `service_clients` (no Connect)

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | int PK | |
| `clientId` | string único | Ex.: `financeiro-prod`. Público |
| `name` | string | "Financeiro (produção)" |
| `secretHash` | string | SHA-256 do segredo (segredo aleatório de 32 bytes, mostrado **uma vez**), mesmo padrão de `refresh_tokens`. Comparar com `hmac.compare_digest` |
| `scopes` | JSON | Lista de escopos |
| `active` | bool | Desativar corta na hora (o token também é checado contra a tabela a cada chamada) |
| `createdAt`, `createdByUserId`, `lastUsedAt`, `rotatedAt` | | Criação e giro só por admin, com `service_client_logs` |

### Destinos de webhook (no Connect)

`webhook_destinations(id, service_client_id, url, secretEncrypted, events JSON, active)`. O segredo do webhook é **cifrado** com AES-GCM (`core/crypto.py`), não hasheado, porque o Connect precisa dele para assinar. É diferente do segredo do `client_credentials`.

### Token

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(financeiro-prod:<segredo>)

grant_type=client_credentials&scope=payables:read payments:write
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsImtpZCI6ImludC0xIn0...",
  "token_type": "bearer",
  "expires_in": 900,
  "scope": "payables:read payments:write"
}
```

Claims do JWT:

```json
{
  "iss": "pconnect",
  "aud": "pconnect-integrations",
  "sub": "service:3",
  "typ": "service",
  "scope": "payables:read payments:write",
  "jti": "5f0c2b6e9a1d4c7f8e3b2a1d0c9f8e7d",
  "iat": 1792502400,
  "exp": 1792503300
}
```

- Assinado com **`INTEGRATION_JWT_SECRET`**, diferente da `SECRET_KEY` dos usuários. Assim um token de serviço falha na assinatura das rotas de tela (401) e um token de usuário falha nas rotas de integração.
- **Atenção no Connect:** hoje `get_current_user` faz `int(user_id)` no `sub`. Um `sub = "service:3"` assinado com a mesma chave daria erro 500. Chave separada evita isso; ainda assim, recusar `typ == "service"` em `get_current_user`.
- Escopo pedido maior que o cadastrado → 400 `invalid_scope`. Sem `scope` → recebe os cadastrados.
- Rate limit de `/oauth/token`: 10/min por `clientId`.
- O Financeiro guarda o token em memória e renova 60 s antes de expirar. Nunca em banco ou log.

### Escopos

| Escopo | Libera | Dado pessoal? |
|---|---|---|
| `projects:read` | Projetos e orçamento | Não |
| `payables:read` | Itens a pagar (entrevistas com valor) | Não (só ids) |
| `interviewers:read` | Nome de exibição, tipo e chave Pix **mascarada** | Sim (nome) |
| `interviewers:pix:read` | Nome + chave Pix **completa**. Escopo especial, auditado por pessoa | **Sim, sensível** |
| `pix:match` | Descobrir de quem é uma chave lida no comprovante | Recebe chave; devolve só id |
| `payments:write` | Baixa e cancelamento de baixa | Não |
| `events:read` | Feed de eventos (replay) | Não |

Helper no Connect, no estilo de `core/permissions.py`:

```python
# core/integration_auth.py (proposta)
def require_scope(scope: str) -> Callable[..., ServiceClient]:
    def dependency(client: ServiceClient = Depends(get_current_service_client)) -> ServiceClient:
        if scope not in client.token_scopes:
            raise HTTPException(status_code=403, detail="Escopo insuficiente", headers=...)
        return client
    return dependency

@router.get("/payables")
def list_payables(client: ServiceClient = Depends(require_scope("payables:read")), ...): ...
```

## 3. Convenções do contrato

| Item | Regra |
|---|---|
| Base | `https://<connect>/integrations/v1/...`. Separado das rotas de tela, com `response_model` próprio |
| Versão | Mudança **aditiva** (campo novo, evento novo) entra no `v1`; o consumidor **ignora campo desconhecido**. Mudança incompatível = `/integrations/v2`, com `v1` no ar até o Financeiro migrar. Eventos têm `version` |
| JSON | camelCase, como o resto da API do Connect |
| Dinheiro | **String decimal** com 2 casas: `"40.00"`. Nunca float. No código, `Decimal` |
| Data | `YYYY-MM-DD` no fuso de São Paulo (mesma regra de `core/text.py: launch_date`) |
| Data e hora | ISO 8601 em UTC com `Z`: `2026-10-15T13:02:11Z` |
| Ids | Inteiros do Connect (`interviewId`, `interviewerId` = id da ficha `interviewer_profiles`, `projectId`). `paymentRef` é do Financeiro |
| Paginação | Por cursor opaco: `?limit=200&cursor=<opaco>` → `{"items": [...], "nextCursor": "..." \| null}`. `limit` máx. 500 |
| Escrita | Toda escrita exige `Idempotency-Key` (seção 6) |
| Rastreio | O Financeiro manda `X-Request-Id` (uuid); o Connect devolve o mesmo e grava no log técnico |
| Cache | Respostas com `Cache-Control: no-store` |
| Transporte | Só HTTPS em produção, rede interna; `http://` só no compose de dev |

### Formato de erro

Mesmo formato da API do Connect (`{"detail": "..."}`), com `code` estável para máquina:

```json
{
  "detail": "A soma das entrevistas (R$ 120,00) é diferente do valor pago (R$ 100,00).",
  "code": "amount_mismatch",
  "requestId": "0b6c7a52-3f7e-4f7b-9d7e-1a2b3c4d5e6f"
}
```

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_request`, `invalid_scope` | Parâmetro inválido |
| 401 | `invalid_client` | Só em `/oauth/token`: identificador ou segredo errados, ou conta desativada (a mesma resposta para os três) |
| 401 | `invalid_token` | Token ausente, expirado, assinatura errada, cliente desativado |
| 403 | `insufficient_scope` | Escopo não cobre a rota |
| 404 | `not_found` | Recurso não existe |
| 409 | `already_paid`, `idempotency_conflict`, `duplicate_e2e`, `not_reversible` | Conflito de estado |
| 422 | `validation_error`, `amount_mismatch`, `mixed_interviewer`, `not_payable` | Regra de negócio. No `/integrations`, o handler converte o 422 padrão do FastAPI (lista) para este formato |
| 429 | `rate_limited` | Com `Retry-After` em segundos |
| 503 | `unavailable` | Manutenção, ou integração desligada no ambiente (sem `INTEGRATION_JWT_SECRET`); o Financeiro tenta de novo |

`detail` em pt-BR simples (pode chegar à tela do Financeiro); `code` é o que o código do Financeiro trata.

### Rate limit por cliente

`key_func` que lê o `sub` do token de serviço (não o IP; o `key_by_user_or_ip` atual decodifica com `SECRET_KEY` e não serve aqui).

| Rota | Limite |
|---|---|
| Leitura em geral | 600/min |
| `POST /interviewers/payment-data` | 30/min e **5.000 chaves/dia** (acima disso, 429 e aviso ao admin) |
| `POST /pix-key-matches` | 60/min |
| `POST /payments`, `/reversal` | 120/min |

## 4. Financeiro → Connect (API)

### 4.1 Projetos e orçamento (`projects:read`)

```http
GET /integrations/v1/projects?status=active&updatedSince=2026-10-01T00:00:00Z&limit=100
```

```json
{
  "items": [
    {
      "projectId": 12,
      "code": "PRJ-12",
      "title": "Pesquisa de mobilidade urbana",
      "status": "active",
      "valuePerInterview": "40.00",
      "paymentTermDays": 30,
      "budget": "12000.00",
      "updatedAt": "2026-10-14T18:20:00Z"
    }
  ],
  "nextCursor": null
}
```

```http
GET /integrations/v1/projects/12/budget
```

```json
{
  "projectId": 12,
  "budget": "12000.00",
  "launched": "8400.00",
  "paid": "6000.00",
  "toPay": "2400.00",
  "available": "3600.00",
  "updatedAt": "2026-10-14T18:20:00Z"
}
```

- `budget: null` = sem limite (ADR 0006). `launched` = soma de `earnedValue` das entrevistas `completed`; `paid` = parte com baixa; `available = budget - launched`.
- O Financeiro **não altera** orçamento. Quem altera é o Connect (`can_edit_budget`), que grava `budget_change_logs`.

### 4.2 Itens a pagar (`payables:read`)

Uma linha por entrevista com valor. Vem de `interviews` (`status = completed`, `earnedValue` não nulo), como `services/payment_sheet.py: build_payment_rows` faz hoje.

```http
GET /integrations/v1/payables?projectId=12&status=to_pay&launchedFrom=2026-10-01&launchedTo=2026-10-31&limit=200
```

```json
{
  "items": [
    {
      "interviewId": 5531,
      "interviewerId": 87,
      "projectId": 12,
      "amount": "40.00",
      "launchedOn": "2026-10-03",
      "dueOn": "2026-11-02",
      "status": "to_pay",
      "paidOn": null,
      "paymentRef": null,
      "updatedAt": "2026-10-03T21:10:44Z"
    },
    {
      "interviewId": 5532,
      "interviewerId": 87,
      "projectId": 12,
      "amount": "40.00",
      "launchedOn": "2026-10-03",
      "dueOn": "2026-11-02",
      "status": "paid",
      "paidOn": "2026-10-15",
      "paymentRef": "fin-pay-000231",
      "updatedAt": "2026-10-15T13:02:11Z"
    }
  ],
  "nextCursor": "eyJ1IjoiMjAyNi0xMC0xNVQxMzowMjoxMVoiLCJpIjo1NTMyfQ"
}
```

| Campo | Origem no Connect |
|---|---|
| `amount` | `Interview.earnedValue` |
| `launchedOn` | `launch_date(Interview.createdAt)` |
| `dueOn` | `expected_payment_date(createdAt, prazo atual do projeto)`. Muda se o prazo do projeto mudar (evento `project.changed`) |
| `status` | `to_pay` (sem baixa), `paid` (com baixa), `removed` (apagada; só aparece com `updatedSince`) |
| `paidOn`, `paymentRef` | Baixa (seção 4.6) |

Filtros: `projectId`, `interviewerId`, `status`, `launchedFrom`/`launchedTo`, `dueTo`, `updatedSince` (sincronização). Cursor ordena por `(updatedAt, interviewId)`.

**Paginação com `dueTo`:** o filtro de vencimento é aplicado no servidor depois de ler as linhas, e cada chamada examina no máximo 2000. No teto a resposta pode vir **curta ou vazia com `nextCursor` preenchido**: siga o cursor até ele vir nulo.

**Entrevista apagada:** o supervisor pode apagar entrevista ainda não paga. Para o Financeiro não ficar com item fantasma, o Connect guarda uma marca (`interview_tombstones(interviewId, projectId, removedAt)`) e devolve `status: "removed"` em `updatedSince`.

### 4.3 Entrevistador, sem chave completa (`interviewers:read`)

```http
GET /integrations/v1/interviewers?ids=87,91
```

```json
{
  "items": [
    {
      "interviewerId": 87,
      "displayName": "Maria Exemplo",
      "pixType": "email",
      "pixKeyMasked": "mar***@exemplo.com",
      "active": true
    }
  ],
  "nextCursor": null
}
```

Máscara com `mask_pix_key` (`services/finance.py`). Sem CPF, e-mail, telefone ou endereço.

### 4.4 Dados de pagamento, com chave completa (`interviewers:pix:read`)

Só para gerar a planilha de pagamento ou conferir antes de pagar. `POST` para os ids não irem para URL nem log de acesso.

```http
POST /integrations/v1/interviewers/payment-data
Authorization: Bearer <token com interviewers:pix:read>
X-Request-Id: 9a0e6f1c-2b3d-4e5f-8a9b-0c1d2e3f4a5b
Content-Type: application/json

{
  "interviewerIds": [87, 91],
  "purpose": "payment_sheet",
  "projectId": 12,
  "onBehalfOf": { "financeUserId": 7, "financeUserName": "Equipe Financeiro 1" }
}
```

```json
{
  "items": [
    {
      "interviewerId": 87,
      "name": "Maria Exemplo",
      "pixType": "email",
      "pixKey": "maria.exemplo@exemplo.com",
      "pixKeyUpdatedAt": "2026-09-02T12:00:00Z"
    },
    {
      "interviewerId": 91,
      "name": "João Exemplo",
      "pixType": null,
      "pixKey": null,
      "pixKeyUpdatedAt": null
    }
  ]
}
```

Regras:

- Máx. 200 ids por chamada. `purpose` obrigatório, de uma lista fechada (`payment_sheet`, `payment_check`).
- Só entrevistadores com item `to_pay` no `projectId` informado. Outro id → fica fora da resposta (não revela existência).
- **Auditoria no Connect:** uma linha em `pii_access_logs` por pessoa, `fields=["pixKey"]`. Hoje `accessed_by_user_id` é FK obrigatória para `users`; precisa de `accessed_by_service_client_id` (nullable) e `onBehalfOf` (texto), com check "um dos dois preenchido". Assim o titular vê esse acesso em `GET /users/{id}/pii-access-log`.
- **Auditoria no Financeiro:** a mesma busca em `pii_access_logs` do Financeiro (quem pediu, para qual planilha).
- O Financeiro usa a chave só em memória, para montar a planilha. Não grava.
- `pixKeyUpdatedAt` permite ao Financeiro saber se a chave mudou depois de uma planilha já gerada.

### 4.5 De quem é esta chave? (`pix:match`)

Na leitura do comprovante, o Financeiro tem a chave do recebedor em memória. Para casar com a pessoa sem copiar a base de chaves:

```http
POST /integrations/v1/pix-key-matches
Content-Type: application/json

{
  "projectId": 12,
  "keys": [
    { "ref": "rcpt-4410", "pixKey": "maria.exemplo@exemplo.com" },
    { "ref": "rcpt-4411", "pixKey": "+5511900000000" }
  ]
}
```

```json
{
  "matches": [
    { "ref": "rcpt-4410", "interviewerId": 87, "inProject": true },
    { "ref": "rcpt-4411", "interviewerId": null, "inProject": false }
  ]
}
```

- O Connect normaliza (`normalize_pix_key`) e compara pelo `hash_pix` com a `PIX_SECRET_KEY` dele (`users.pixKeyLookupHash`). Mesma lógica da conciliação atual.
- `inProject: false` com `interviewerId` preenchido = "recebeu sem estar no projeto" (decisão 11 do `01`): gera alerta, nunca baixa automática.
- Máx. 500 chaves por chamada. Corpo nunca logado.

### 4.6 Marcar entrevistas como pagas (`payments:write`)

Uma chamada por Pix (um comprovante paga uma pessoa). Tudo ou nada.

```http
POST /integrations/v1/payments
Idempotency-Key: fin-pay-000231
Content-Type: application/json

{
  "paymentRef": "fin-pay-000231",
  "e2eId": "E00000000202610151302ABCDEF123456",
  "interviewerId": 87,
  "projectId": 12,
  "amount": "80.00",
  "paidOn": "2026-10-15",
  "interviewIds": [5531, 5533],
  "confirmedBy": { "financeUserId": 7 }
}
```

`201 Created`:

```json
{
  "paymentRef": "fin-pay-000231",
  "status": "applied",
  "interviewIds": [5531, 5533],
  "amount": "80.00",
  "paidOn": "2026-10-15",
  "appliedAt": "2026-10-15T13:02:11Z"
}
```

Regras no Connect (numa transação, projeto travado com `with_for_update()`, como em `confirm_batch`):

| Checagem | Erro |
|---|---|
| Toda entrevista existe, é do `projectId` e do `interviewerId` | 422 `mixed_interviewer` / `not_payable` |
| Entrevista `completed` com `earnedValue` | 422 `not_payable` |
| Nenhuma já paga | 409 `already_paid` com a lista `interviewIds` |
| `sum(earnedValue) == amount` (valor exato, decisão 7) | 422 `amount_mismatch` |
| `e2eId` não usado por outro `paymentRef` | 409 `duplicate_e2e` |
| Mesmo `Idempotency-Key` com corpo diferente | 409 `idempotency_conflict` |

Efeito no Connect:

- nova tabela `external_payments(id, paymentRef único, e2eId único, service_client_id, interviewer_id, project_id, amount, paidOn, status, confirmedByRef, createdAt, reversedAt, reversalReason)`;
- `Interview.external_payment_id` + `Interview.paidAt = paidOn`;
- a regra "entrevista paga não é apagada" passa a olhar também `external_payment_id`;
- notifica o entrevistador (`payment_received`), como `confirm_batch` faz hoje;
- grava evento `payment.applied` no outbox.

Consulta (após timeout, para saber se aplicou):

```http
GET /integrations/v1/payments/fin-pay-000231
```

### 4.7 Cancelar baixa (`payments:write`)

**Decisão de produto pendente:** hoje no Connect "lote confirmado não é cancelado". Cancelar baixa é regra nova (estorno do banco, baixa errada) e precisa de decisão do PO antes de implementar (`docs/planning/perguntas-abertas.md`).

```http
POST /integrations/v1/payments/fin-pay-000231/reversal
Idempotency-Key: fin-rev-000012
Content-Type: application/json

{
  "reason": "bank_reversal",
  "reversedOn": "2026-10-18",
  "note": "Pix devolvido pelo banco",
  "confirmedBy": { "financeUserId": 7, "approvedByFinanceUserId": 2 }
}
```

```json
{
  "paymentRef": "fin-pay-000231",
  "status": "reversed",
  "interviewIds": [5531, 5533],
  "reversedAt": "2026-10-18T10:00:00Z"
}
```

- `reason` de lista fechada: `bank_reversal`, `wrong_match`. `note` sem dado pessoal (até 255 caracteres).
- Efeito: limpa `external_payment_id` e `paidAt` das entrevistas (voltam a `to_pay`), `external_payments.status = reversed`, avisa o entrevistador, evento `payment.reversed`.
- Já revertido → 409 `not_reversible` (ou o mesmo 200, se for o mesmo `Idempotency-Key`).

### 4.8 Feed de eventos (`events:read`)

Mesmos eventos dos webhooks, para recuperar o que se perdeu:

```http
GET /integrations/v1/events?after=10452&limit=500
```

```json
{
  "items": [
    {
      "seq": 10453,
      "eventId": "3d1f0b6a-7c2e-4f5a-9b8c-1d2e3f4a5b6c",
      "type": "interviews.launched",
      "version": 1,
      "occurredAt": "2026-10-16T14:00:00Z",
      "data": { "projectId": 12, "interviewerId": 87, "interviewIds": [5540, 5541] }
    }
  ],
  "nextCursor": "10453"
}
```

Retenção do outbox para replay: 30 dias (proposta; dado sem dado pessoal).

## 5. Connect → Financeiro (eventos)

### Envelope e cabeçalhos

```http
POST https://<financeiro>/integrations/v1/connect-events
Content-Type: application/json
X-Event-Id: 3d1f0b6a-7c2e-4f5a-9b8c-1d2e3f4a5b6c
X-Event-Type: interviews.launched
X-Timestamp: 1792504800
X-Signature: sha256=8f2c...e91a

{
  "eventId": "3d1f0b6a-7c2e-4f5a-9b8c-1d2e3f4a5b6c",
  "seq": 10453,
  "type": "interviews.launched",
  "version": 1,
  "occurredAt": "2026-10-16T14:00:00Z",
  "data": { ... }
}
```

Assinatura: `X-Signature = "sha256=" + hex(HMAC-SHA256(segredo, f"{X-Timestamp}.{corpo_bruto}"))`. O timestamp na assinatura impede reenvio do mesmo corpo dias depois (complemento ao `integracao-entre-sistemas.md`, que assina só o corpo).

### Eventos

| Tipo | Quando (no Connect) | `data` |
|---|---|---|
| `interviews.launched` | `POST /projects/{id}/interviews/log-validated` | `{ "projectId": 12, "interviewerId": 87, "interviewIds": [5540, 5541], "amountTotal": "80.00", "launchedOn": "2026-10-16" }` |
| `interviews.changed` | `set-count`, `DELETE` de entrevista, mudança de valor | `{ "projectId": 12, "interviewIds": [5541], "change": "removed" }` (`change`: `removed`, `amount_changed`, `status_changed`) |
| `project.budget.changed` | Orçamento alterado (junto com `budget_change_logs`) | `{ "projectId": 12, "oldBudget": "10000.00", "newBudget": "12000.00" }` |
| `project.changed` | Prazo de pagamento, valor por entrevista ou status do projeto | `{ "projectId": 12, "fields": ["paymentTermDays"] }` |
| `interviewer.pix_changed` | Chave Pix trocada (`update_user` com `pix_changed`) | `{ "interviewerId": 87, "changedAt": "2026-10-16T15:30:00Z" }` |
| `payment.applied` / `payment.reversed` | Depois da baixa/cancelamento | `{ "paymentRef": "fin-pay-000231", "interviewIds": [5531, 5533] }` |

**Nunca no evento:** nome, chave Pix (nem mascarada), CPF, e-mail, telefone, quem fez a ação no Connect.

`interviewer.pix_changed` é o aviso mais importante: planilha gerada antes da troca está **velha**. O Financeiro marca a planilha como "chave alterada depois de gerada" e pede nova geração antes de pagar essa pessoa.

### Outbox e despacho (no Connect)

```
transação da ação (ex.: lançar entrevistas)
  ├─ INSERT interviews ...
  └─ INSERT integration_outbox (seq, eventId, type, version, data, occurredAt)
COMMIT
        │
despachante (thread ou cron, como services/whatsapp.py)
  ├─ SELECT ... FOR UPDATE SKIP LOCKED  (webhook_deliveries pendentes e vencidas)
  ├─ POST assinado para cada destino
  ├─ 2xx → status "entregue"
  └─ erro/timeout → attempts += 1; nextAttemptAt = agora + 2^attempts min
                    após 10 tentativas (~17 h) → "falhou" + aviso ao admin
```

- Nunca chamar HTTP dentro da transação da ação.
- Mesmo padrão já usado na fila do WhatsApp (`notification_deliveries`: `attempts`, `nextAttemptAt`, `with_for_update(skip_locked=True)`, backoff `2**attempts` minutos).
- Timeout do POST: 5 s. Só `2xx` conta como entregue. `4xx` diferente de 408/429 → "falhou" na hora (erro de contrato; precisa de gente).

### Recebimento (no Financeiro)

```python
# api/connect_events.py (proposta, esboço)
@router.post("/integrations/v1/connect-events", status_code=204)
async def receive(request: Request, db: Session = Depends(get_db)) -> None:
    body = await request.body()
    ts = request.headers.get("X-Timestamp", "")
    expected = "sha256=" + hmac.new(
        CONNECT_WEBHOOK_SECRET.encode(), f"{ts}.".encode() + body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-Signature", "")):
        raise HTTPException(401, detail="Assinatura inválida")
    if abs(time.time() - int(ts or 0)) > 300:
        raise HTTPException(401, detail="Evento fora da janela de tempo")
    event = ConnectEvent.model_validate_json(body)
    if not record_inbound_event(db, event.eventId):   # INSERT ... ON CONFLICT DO NOTHING
        return                                        # duplicado: 204 e nada a fazer
    enqueue_processing(db, event)                     # processa fora do request
```

- Responder rápido (204); processar em fila própria.
- `inbound_events(eventId PK, seq, type, receivedAt, processedAt)` deduplica e guarda o maior `seq` visto (cursor da sincronização).
- Processar = reler na API do Connect os recursos citados (ex.: `GET /payables?...&interviewIds=`). Não confiar só no conteúdo do evento.

## 6. Idempotência

| Item | Regra |
|---|---|
| Onde | Toda escrita (`POST /payments`, `POST /payments/{ref}/reversal`) |
| Chave | `Idempotency-Key`, gerada pelo Financeiro **antes** da primeira tentativa e guardada junto do pagamento. Para baixa, usar o `paymentRef` (o `e2eId` do Pix é a chave natural de negócio e também é único) |
| Armazenamento (Connect) | `idempotency_keys(service_client_id, key, requestHash, status, responseBody, createdAt)`, único por `(client, key)`, guardado por **24 h** |
| Repetição igual | Devolve o **mesmo** status e corpo da primeira vez |
| Mesma chave, corpo diferente | 409 `idempotency_conflict` |
| Primeira ainda em andamento | 409 `idempotency_conflict` com `Retry-After: 2` |
| Após 24 h | A chave expira, mas `paymentRef` e `e2eId` únicos continuam barrando pagamento duplo (409) |

## 7. O que cada lado implementa

### Connect, nesta ordem

> **Feito (fatia 1):** itens 1 a 5 e a leitura de `payables`, `projects` e `interviewers` (chave mascarada). Falta: `payment-data` e `pix-key-matches` com `pii_access_logs` por conta de serviço (6), baixa e `idempotency_keys` (7), outbox e webhooks (8), feed `/events` (9), cancelamento (10), `FINANCE_EXTERNAL_ENABLED` (11).
> `/projects/{id}/budget` devolve hoje o orçamento único; os itens do orçamento entram quando existirem.

1. ADR "Integração máquina a máquina com o Financeiro" + atualizar `integracao-entre-sistemas.md`, ROPA (OP-04: Financeiro como destinatário interno da chave Pix) e inventário de dados.
2. `service_clients`, `service_client_logs`, `POST /oauth/token` (`client_credentials`), `INTEGRATION_JWT_SECRET`, `get_current_service_client`, `require_scope`; `get_current_user` recusando `typ: "service"`. Script `scripts/create_service_client.py` (mostra o segredo uma vez).
3. Rate limit por cliente (`key_func` pelo `sub` do token de serviço).
4. Router `/integrations/v1` com handler de erro próprio (`detail` + `code` + `requestId`), `Cache-Control: no-store`, `X-Request-Id`.
5. Leitura: `projects`, `projects/{id}/budget`, `payables` (com `interview_tombstones`), `interviewers`.
6. `pii_access_logs` aceitando `accessed_by_service_client_id` + `onBehalfOf`; depois `interviewers/payment-data` e `pix-key-matches`.
7. `external_payments`, `idempotency_keys`, `Interview.external_payment_id`; `POST /payments`, `GET /payments/{ref}`; regra "paga não se apaga" cobrindo a baixa externa.
8. `integration_outbox`, `webhook_destinations`, `webhook_deliveries`, despachante com `SKIP LOCKED`; gravar eventos nas ações (lançar, ajustar, apagar entrevista, orçamento, prazo, troca de Pix, baixa).
9. `GET /events` (replay).
10. Cancelamento de baixa, **depois** da decisão do PO.
11. Chave de liga/desliga `FINANCE_EXTERNAL_ENABLED`: com ela ligada, a baixa por comprovante dentro do Connect (`/projects/{id}/finance/receipt-batches/...`) fica só leitura; a baixa passa a vir só pela API.
12. Testes pytest de cada rota: sem token, token de usuário, escopo errado, cliente desativado, idempotência, `amount_mismatch`, `already_paid`, concorrência (duas baixas iguais), auditoria gravada, evento no outbox na mesma transação.

### Financeiro

1. `ConnectClient` (httpx) com cache do token em memória, `X-Request-Id`, timeout, nova tentativa com backoff só em 429/5xx/timeout, respeitando `Retry-After`.
2. Espelho mínimo de itens a pagar (`payables_mirror`) + sincronização por `updatedSince`.
3. `POST /integrations/v1/connect-events` com verificação de assinatura, janela de tempo, `inbound_events` e fila de processamento.
4. Sincronização periódica pelo feed (`GET /events?after=<maior seq>`) e conferência diária por projeto aberto.
5. Planilha com `payment-data` (chave só em memória, auditoria nos dois lados, marca de "chave alterada").
6. Conciliação com `pix-key-matches`.
7. Baixa: estado local `pendente_envio → enviada → aplicada | recusada`, `Idempotency-Key` gerada antes, consulta `GET /payments/{ref}` em timeout.
8. Tela de divergências da integração (eventos com falha, baixas recusadas, diferenças da conferência diária).

## 8. Como testar localmente

### Dois `docker compose`, uma rede

```bash
# uma vez
docker network create pmais-integracao

# Connect (este repo): API em :8000, rede externa pmais-integracao
docker compose -p connect up -d

# Financeiro (outro repo): API em :8100, Postgres e MinIO próprios
docker compose -p financeiro up -d
```

Nos dois `docker-compose.yml`, o serviço da API entra também na rede externa:

```yaml
services:
  api:
    networks: [default, pmais-integracao]
networks:
  pmais-integracao:
    external: true
```

- Bancos, MinIO e usuários **separados** também em dev: o Financeiro nunca recebe `DATABASE_URL` do Connect.
- `.env` do Financeiro: `CONNECT_BASE_URL=http://connect-api-1:8000`, `CONNECT_CLIENT_ID`, `CONNECT_CLIENT_SECRET`, `CONNECT_WEBHOOK_SECRET`. Em produção, só `https://`.

### Clientes de teste

```bash
# no Connect: cria a conta de serviço de dev e o destino do webhook
docker compose -p connect exec api python scripts/create_service_client.py \
  --client-id financeiro-dev \
  --scopes projects:read,payables:read,interviewers:read,interviewers:pix:read,pix:match,payments:write,events:read \
  --webhook-url http://financeiro-api-1:8100/integrations/v1/connect-events
# imprime client_secret e webhook_secret UMA vez -> .env do Financeiro
```

Dados: os seeds do Connect (`scripts/seed_*.py`) com nomes e chaves **fictícios**. Nunca dado real.

### Teste manual de assinatura

```bash
TS=$(date +%s)
BODY='{"eventId":"00000000-0000-0000-0000-000000000001","seq":1,"type":"interviewer.pix_changed","version":1,"occurredAt":"2026-10-16T15:30:00Z","data":{"interviewerId":87,"changedAt":"2026-10-16T15:30:00Z"}}'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$CONNECT_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -i http://localhost:8100/integrations/v1/connect-events \
  -H "Content-Type: application/json" -H "X-Event-Id: 00000000-0000-0000-0000-000000000001" \
  -H "X-Timestamp: $TS" -H "X-Signature: sha256=$SIG" -d "$BODY"
# repetir o mesmo comando: 204 e nenhum processamento novo (dedup)
```

### Testes automatizados

| Onde | Como |
|---|---|
| Connect | pytest com `TestClient`; despachante com `httpx.MockTransport` (sem rede), como os testes do WhatsApp simulam a Zenvia |
| Financeiro | pytest com `ConnectClient` sobre `httpx.MockTransport`/`respx`; webhook com corpo assinado por função de teste |
| Contrato | Pasta `contract/v1/` com os exemplos JSON deste documento. Os dois repositórios validam os mesmos arquivos contra seus schemas Pydantic. Mudou o contrato, muda o arquivo nos dois PRs |
| Ponta a ponta | Script de fumaça com os dois compose no ar: lançar entrevistas no Connect → evento chega → Financeiro lista → baixa → Connect mostra "Pago em" |

## 9. Falhas e reconciliação

| Falha | O que acontece | Como recupera |
|---|---|---|
| Webhook não chega (Financeiro fora, rede) | Connect tenta de novo com backoff; após 10 tentativas, "falhou" + aviso ao admin | Financeiro lê `GET /events?after=<maior seq>` a cada 5 min e no início do dia |
| Evento duplicado | `inbound_events` já tem o `eventId` | 204, nada a fazer |
| Eventos fora de ordem | Evento é só aviso | Financeiro relê o recurso; vale o estado atual do Connect |
| Evento além dos 30 dias do feed | Feed não tem mais | Conferência completa: `GET /payables?projectId=&updatedSince=` desde o último sucesso |
| Baixa com timeout (não se sabe se aplicou) | Financeiro mantém `enviada` | `GET /payments/{ref}`; se 404, reenvia com o **mesmo** `Idempotency-Key` |
| Connect fora na hora da baixa | Baixa fica `pendente_envio` | Fila do Financeiro tenta com backoff; a tela mostra "aguardando o Connect" |
| `already_paid` / `duplicate_e2e` | Outra baixa pegou as entrevistas | Vai para a tela de divergências; decisão humana |
| `amount_mismatch` | Valor do Pix ≠ soma (valor mudou no Connect) | Relê `payables`; divergência para revisão humana. Nada é pago sem confirmação humana |
| Chave Pix trocada depois da planilha | Evento `interviewer.pix_changed` | Planilha marcada; regenerar antes de pagar essa pessoa |
| Entrevista apagada no Connect | `interviews.changed` com `removed` | Financeiro tira do espelho; se já estava numa planilha, avisa |
| Divergência de estado (Financeiro diz pago, Connect não) | Conferência diária compara `paymentRef` local com `GET /payables?status=paid` | Relatório para o Financeiro; reenviar baixa ou abrir revisão |
| Segredo vazado | — | Admin gira o segredo do cliente (`rotatedAt`), desativa o antigo; tokens emitidos expiram em ≤ 15 min (ou na hora, pela checagem de `active`) |

Conferência diária (Financeiro): para cada projeto com item `to_pay` ou baixa nos últimos 30 dias, comparar o espelho com `GET /payables` (contagem e soma por status). Diferença vira linha na tela de divergências, nunca correção automática de pagamento.

## Checklist

- [ ] ADR da integração escrito no Connect e no Financeiro; `integracao-entre-sistemas.md`, inventário e ROPA (OP-04) do Connect atualizados.
- [ ] `service_clients` com segredo só como hash, mostrado uma vez; criação/giro só por admin, com log.
- [ ] `POST /oauth/token` com `client_credentials`; JWT de 15 min com `iss`, `aud`, `sub=service:{id}`, `typ`, `scope`, `jti`, assinado com `INTEGRATION_JWT_SECRET`.
- [ ] Token de usuário recusado nas rotas de integração e token de serviço recusado nas rotas de tela (teste nos dois sentidos).
- [ ] `require_scope` em toda rota `/integrations/v1`; teste de escopo errado e de cliente desativado.
- [ ] Dinheiro como string decimal, datas ISO, camelCase, cursor opaco, erro com `detail` + `code`.
- [ ] `payment-data` grava `pii_access_logs` no Connect (por pessoa) e no Financeiro; chave nunca gravada no Financeiro.
- [ ] `POST /payments` tudo ou nada, projeto travado, valor exato, `already_paid`, `duplicate_e2e`, `Idempotency-Key` de 24 h.
- [ ] Cancelamento de baixa só depois de decisão do PO registrada.
- [ ] Outbox gravado na mesma transação da ação; despachante com `SKIP LOCKED` e backoff; nenhuma chamada HTTP dentro da transação.
- [ ] Eventos assinados com `X-Signature` (timestamp + corpo), `X-Event-Id`, sem dado pessoal; receptor confere assinatura, janela de 5 min e deduplica.
- [ ] Feed `GET /events` e conferência diária funcionando; teste que derruba o webhook e recupera pelo feed.
- [ ] Rate limit por cliente, com limite diário de chaves Pix completas e aviso ao admin.
- [ ] Exemplos JSON em `contract/v1/` validados nos dois repositórios.
- [ ] Dois `docker compose` locais com bancos, MinIO e segredos separados; teste de fumaça ponta a ponta passando.
- [ ] Só HTTPS em produção; `/docs` e `/openapi.json` fora do ar em produção nos dois sistemas.
