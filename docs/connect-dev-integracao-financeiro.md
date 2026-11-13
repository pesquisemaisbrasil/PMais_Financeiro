# P+ Connect (DEV): integração com o Financeiro

Guia para testar a integração no ambiente de **dev**. Contrato completo no repositório: `docs/integracao/contrato-api.md`; exemplos de cada rota, erro e evento em `contract/v1/`.

> Dev tem **só dado fictício**. Nunca use dado real aqui.

## 1. Endereço

| | |
|---|---|
| Base (internet) | `https://api.dev.connect.pesquisemais.com.br` |
| Base (rede Docker interna `pmais-integracao-dev`) | `http://connect-dev-api:8000` |
| Swagger (só no dev) | `https://api.dev.connect.pesquisemais.com.br/docs`, tag **integration** |

No dev a integração fica aberta no endereço público. A API não pede a senha extra do site. Em **prod** é diferente: essas rotas só existem na rede interna, e por fora respondem 404.

## 2. Acesso (conta de serviço)

O João cria a conta no servidor de dev e passa o segredo, que aparece **uma vez só**:

```bash
./scripts/deploy.sh dev run create_service_client.py create \
  --client-id financeiro-dev --name "Financeiro (dev)" \
  --scopes projects:read,payables:read,interviewers:read,interviewers:pix:read,pix:match,payments:write,events:read
```

Webhook (opcional, Connect → Financeiro). O segredo do webhook vai para o `CONNECT_WEBHOOK_SECRET` do Financeiro:

```bash
./scripts/deploy.sh dev run create_service_client.py webhook-set \
  --client-id financeiro-dev --url http://financeiro-dev-api:8000/integrations/v1/connect-events
```

### Escopos

| Escopo | Libera |
|---|---|
| `projects:read` | projetos e orçamento |
| `payables:read` | itens a pagar |
| `interviewers:read` | nome + Pix mascarado, situação fiscal |
| `interviewers:pix:read` | chave Pix completa (teto diário) |
| `pix:match` | de quem é cada chave Pix |
| `payments:write` | baixa, cancelamento de baixa, consulta de baixa |
| `events:read` | feed de eventos |

## 3. Token (15 min)

```bash
curl -s -X POST https://api.dev.connect.pesquisemais.com.br/oauth/token \
  -u "financeiro-dev:<SEGREDO>" \
  -d grant_type=client_credentials
# opcional: -d "scope=projects:read payables:read"
```

Resposta: `{"access_token":"...","token_type":"bearer","expires_in":900,"scope":"..."}`

Em todas as chamadas abaixo:

```
Authorization: Bearer <access_token>
X-Request-Id: <uuid>        (opcional; volta igual na resposta, ajuda a rastrear)
```

Limite do token: 10/min por clientId e 60/min por IP.

## 4. Endpoints

Todos com prefixo `/integrations/v1`.

| Método | Rota | Escopo | Limite | Para quê |
|---|---|---|---|---|
| GET | `/projects` | projects:read | 600/min | Lista projetos. Filtros: `status`, `updatedSince`, `limit` (1–500), `cursor` |
| GET | `/projects/{id}/budget` | projects:read | 600/min | Orçamento: teto, lançado, pago, a pagar, disponível, itens com gasto |
| GET | `/projects/{id}/fiscal-status` | interviewers:read | 600/min | NF ou RPA e situação da nota de quem está aprovado (sem nome nem arquivo) |
| GET | `/payables` | payables:read | 600/min | Lançamentos com valor. Filtros: `projectId`, `interviewerId`, `status` (`to_pay`, `paid`, `removed`), `launchedFrom`, `launchedTo`, `dueTo`, `updatedSince`, `limit`, `cursor` |
| GET | `/interviewers?ids=1,2,3` | interviewers:read | 600/min | Nome de exibição + chave Pix **mascarada** |
| POST | `/interviewers/payment-data` | interviewers:pix:read | 30/min + teto diário | Chave Pix **completa** de quem tem item a pagar no projeto (fica na trilha de acesso do titular) |
| POST | `/pix-key-matches` | pix:match | 60/min | De quem é cada chave e se a pessoa está no projeto (compara por hash, não devolve dado pessoal) |
| POST | `/payments` | payments:write | 120/min | Baixa de um Pix pago. **Exige `Idempotency-Key`**. Tudo ou nada. Resposta 201 |
| GET | `/payments/{paymentRef}` | payments:write | 600/min | Consulta uma baixa feita por você |
| POST | `/payments/{paymentRef}/reversal` | payments:write | 120/min | Desfaz a baixa (itens voltam a "a pagar"). **Exige `Idempotency-Key`** |
| GET | `/events?after=<seq>&limit=` | events:read | 600/min | Feed dos eventos do webhook, em ordem, para recuperar o que se perdeu (só eventos com 5 s ou mais) |

### Corpos dos POST

`POST /interviewers/payment-data`
```json
{
  "interviewerIds": [87, 91],
  "purpose": "payment_sheet",
  "projectId": 12,
  "onBehalfOf": { "financeUserId": 7, "financeUserName": "Equipe Financeiro 1" }
}
```
`purpose`: `payment_sheet` ou `payment_check`.

`POST /pix-key-matches`
```json
{
  "projectId": 12,
  "keys": [
    { "ref": "rcpt-4410", "pixKey": "maria.exemplo@exemplo.com" },
    { "ref": "rcpt-4411", "pixKey": "+5511900000000" }
  ]
}
```

`POST /payments` (cabeçalho `Idempotency-Key: <uuid>`)
```json
{
  "paymentRef": "fin-pay-000231",
  "e2eId": "E00000000202610151302ABCDEF12345",
  "interviewerId": 87,
  "projectId": 12,
  "amount": "80.00",
  "paidOn": "2026-10-15",
  "interviewIds": [5531, 5533],
  "confirmedBy": { "financeUserId": 7 }
}
```
- `amount` tem que bater com a soma dos itens.
- Todos os itens precisam ser da mesma pessoa e estar "a pagar".
- Repetir a mesma chave devolve a mesma resposta por 24 h.

`POST /payments/{paymentRef}/reversal` (cabeçalho `Idempotency-Key: <uuid>`)
```json
{
  "reason": "bank_reversal",
  "reversedOn": "2026-10-18",
  "note": "Pix devolvido pelo banco",
  "confirmedBy": { "financeUserId": 7, "approvedByFinanceUserId": 2 }
}
```
`reason`: `bank_reversal` ou `wrong_match`.

## 5. Erros

Formato: `{"detail": "...", "code": "...", "requestId": "..."}`

| HTTP | code | Quando |
|---|---|---|
| 400 | `invalid_request` / `invalid_scope` | filtro, cursor ou escopo inválido |
| 401 | `invalid_client` / `invalid_token` | segredo errado; token ausente, vencido ou conta desativada |
| 403 | `insufficient_scope` | token sem o escopo da rota |
| 404 | `not_found` | projeto ou pagamento não existe |
| 409 | `already_paid`, `duplicate_e2e`, `idempotency_conflict`, `not_reversible` | item já pago; e2eId repetido; mesma chave com corpo diferente; baixa já desfeita |
| 422 | `not_payable`, `mixed_interviewer`, `amount_mismatch`, `validation_error` | item não pagável; itens de pessoas diferentes; valor não bate; corpo inválido |
| 429 | `rate_limited` | limite por minuto ou teto diário de chaves Pix (ver `Retry-After`) |
| 503 | `unavailable` | integração desligada no ambiente |

## 6. Webhook (Connect → Financeiro)

Eventos:
- `interviews.launched`
- `interviews.changed`
- `payment.applied`
- `payment.reversed`
- `project.changed`
- `project.budget.changed`
- `interviewer.pix_changed`
- `interviewer.fiscal_changed`

Conferir a assinatura:

```
X-Timestamp: <unix>
X-Signature: sha256=<hex>
hex = HMAC-SHA256(CONNECT_WEBHOOK_SECRET, "<X-Timestamp>.<corpo bruto>")
```

- Envio a cada 30 s.
- Se a entrega falhar, o Connect tenta de novo com espera crescente. Na 10ª falha, ou numa resposta 4xx, desiste.
- O que se perdeu dá para recuperar em `GET /events`.

## 7. Roteiro rápido de teste

1. Pegue o token (seção 3).
2. `GET /projects`: escolha um projeto com lançamentos (o seed do dev já cria).
3. `GET /payables?projectId=<id>&status=to_pay`: anote `interviewerId`, ids e valores.
4. `POST /interviewers/payment-data` com esses ids: veja a chave completa.
5. `POST /payments` com os ids de **uma** pessoa e a soma certa: espere 201. No Connect, os itens viram "Pago".
6. Repita a mesma chamada com a mesma `Idempotency-Key`: a resposta vem igual. Com a mesma chave e o corpo mudado: 409.
7. `POST /payments/<ref>/reversal`: os itens voltam a "a pagar". Repetir com chave nova: 409 `not_reversible`.
8. `GET /events`: aparecem `payment.applied` e `payment.reversed`.
9. Casos negados: token sem escopo (403), valor errado (422 `amount_mismatch`), item já pago (409 `already_paid`).
