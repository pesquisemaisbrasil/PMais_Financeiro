# Spec: Integração com o Connect (lado do Financeiro)

Contrato do que o **Financeiro** implementa para conversar com o P+ Connect. O contrato completo dos dois lados — rotas, payloads, escopos, erros, eventos e idempotência — está em [handoff/07](../handoff/07-integracao-com-o-connect.md). Se este spec e o 07 discordarem, vale o 07, e este spec é corrigido.

## Comportamento

- **`ConnectClient`** (httpx):
  - token de serviço (`client_credentials`) em cache na memória, renovado 60 s antes de expirar;
  - `X-Request-Id` em toda chamada;
  - timeout;
  - nova tentativa com backoff só em 429, 5xx e timeout, respeitando `Retry-After`.
- **O que o Financeiro chama:**

| Para quê | Rota no Connect | Escopo |
|---|---|---|
| Projetos, prazo, valor por entrevista | `GET /integrations/v1/projects` | `projects:read` |
| Orçamento, lançado, pago, disponível | `GET /integrations/v1/projects/{id}/budget` | `projects:read` |
| Itens a pagar | `GET /integrations/v1/payables` | `payables:read` |
| Nome e chave mascarada | `GET /integrations/v1/interviewers?ids=` | `interviewers:read` |
| Chave completa (só para a planilha) | `POST /integrations/v1/interviewers/payment-data` | `interviewers:pix:read` |
| De quem é a chave do comprovante | `POST /integrations/v1/pix-key-matches` | `pix:match` |
| Pedir a baixa / consultar | `POST /integrations/v1/payments`, `GET /payments/{ref}` | `payments:write` |
| Recuperar eventos perdidos | `GET /integrations/v1/events?after=` | `events:read` |

- **Recebimento de eventos:** `POST /integrations/v1/connect-events`.
  - Confere a assinatura `X-Signature` (HMAC de `timestamp.corpo`) e a janela de 5 min.
  - Deduplica por `X-Event-Id` em `inbound_events`.
  - Responde 204 rápido e processa numa fila própria.
  - **O evento é só um aviso:** o Financeiro relê o recurso na API.
- **Efeito de cada evento:**

| Evento | Efeito no Financeiro |
|---|---|
| `interviews.launched` | relê os itens, cria no espelho e dispara `payment_pending` |
| `interviews.changed` (`removed`, `amount_changed`, `status_changed`) | relê; item removido vira `cancelado`; se estava numa planilha gerada, avisa |
| `project.changed` | relê o projeto (prazo muda a previsão) |
| `project.budget.changed` | relê o orçamento para o resumo |
| `interviewer.pix_changed` | marca as planilhas geradas antes da troca ("chave alterada") |
| `payment.applied` / `payment.reversed` | confirma a baixa local (`aplicada`) ou registra a reversão |

- **O que a reunião de 21/10 acrescenta (a entrar no contrato, N4):**
  - itens do orçamento com data (leitura);
  - modelo fiscal (NF ou RPA) e status da NF do entrevistador (leitura). **O arquivo da NF não passa por aqui**: fica no Connect (D8);
  - **consumo do orçamento por categoria**, que o **Financeiro fornece** e o Connect lê para mostrar ao supervisor (D5): só valores, sem dado pessoal;
  - prazo de pagamento do projeto, definido pelo supervisor (D9).
- **Sincronização de segurança:**
  - feed `GET /events?after=<maior seq>` a cada 5 min e no início do dia;
  - **conferência diária** por projeto com item a pagar ou baixa nos últimos 30 dias: o espelho é comparado com `GET /payables` (contagem e soma por status).
- **Tela "Divergências da integração":**
  - eventos com falha;
  - baixas recusadas;
  - baixas aplicadas aqui e não pagas no Connect;
  - diferenças da conferência diária;
  - itens removidos que estavam numa planilha.

## Regras

1. O Financeiro nunca recebe `DATABASE_URL`, credencial de MinIO nem segredo de hash do Connect.
2. O espelho guarda só ids, valores, datas e status. Nome e chave nunca vão para o banco do Financeiro.
3. Cada chamada vira `integration_call_logs` (direção, rota, status, duração), **sem corpo**. O corpo de `payment-data` e de `pix-key-matches` nunca é logado.
4. Evento mais velho que o estado já aplicado (`connectUpdatedAt`) é ignorado.
5. Diferença encontrada na conferência **nunca corrige pagamento sozinha**: vira linha em Divergências.
6. Toda escrita leva `Idempotency-Key`, gerada **antes** da primeira tentativa e guardada junto do pedido.
7. Dinheiro como string decimal (`"40.00"`), convertido para `Decimal`. Campo desconhecido no JSON é ignorado (contrato aditivo no `v1`).
8. Os exemplos JSON do contrato ficam em `contract/v1/` e são validados nos testes contra os schemas Pydantic do Financeiro.
9. Em produção, só HTTPS.

## Casos negados

Quando o Financeiro recebe eventos:

| Situação | HTTP | `detail` |
|---|---|---|
| Assinatura ausente ou errada | 401 | Assinatura inválida |
| Timestamp fora da janela de 5 min | 401 | Evento fora da janela de tempo |
| Evento já recebido (mesmo `X-Event-Id`) | 204 | (nada é processado de novo) |
| Corpo fora do contrato | 422 | (validação) |

## Critérios de aceite

- [ ] Um lançamento no Connect chega ao espelho pelo webhook; com o webhook derrubado, chega pelo feed em até 5 min.
- [ ] Repetir o mesmo evento assinado devolve 204 e não processa de novo.
- [ ] Um evento com assinatura errada, ou de 10 min atrás, devolve 401.
- [ ] Um pedido de baixa com timeout é conferido em `GET /payments/{ref}` e, se preciso, reenviado com o mesmo `Idempotency-Key`, sem pagar duas vezes.
- [ ] Uma diferença forjada entre o espelho e `GET /payables` aparece em Divergências no dia seguinte.
- [ ] Os testes usam o Connect simulado (`httpx.MockTransport`/`respx`); um teste de fumaça com os dois `docker compose` vai do lançamento ao "Pago em".

## Onde está no código

- Destino: `backend/services/connect_client.py`, `backend/api/connect_events.py`, `backend/services/connect_sync.py`, `backend/services/outbox.py`, `backend/models/inbound_event.py`, `backend/models/outbox_event.py`, `backend/api/divergences.py`
- Contrato: `contract/v1/*.json`
- Testes: `backend/tests/test_connect_client.py`, `test_connect_events.py`, `test_connect_sync.py`, `test_contract_v1.py`
- Lado do Connect: lista de tarefas em [handoff/07 §7](../handoff/07-integracao-com-o-connect.md)

## Ajustes

- 2026-10-21: NF fica no Connect e só o status chega aqui; o Financeiro passa a fornecer o consumo do orçamento ao Connect ([decisões do PO após a reunião de 21/10](../transcricoes/2026-10-21-decisoes-pos-reuniao.md)).

- 2026-10-21: o cancelamento de baixa (`POST /payments/{ref}/reversal`) não entra até o PO decidir (pergunta aberta Q4).
- 2026-10-23: o Connect passa a expor, em `GET /integrations/v1/projects/{id}/budget`, os campos `budgetTotal` e `items[]` (`itemId`, `name`, `kind`, `amount`, `expectedPaymentDate`, `spent`). O **gasto dos itens que não são entrevista é lançado no Connect** pelo coordenador; o Financeiro só lê o total gasto por item, sem descrição nem autor. Isso **inverte** a D5 de 21/10 (antes o Financeiro fornecia o consumo). Mudança aditiva no `v1`. O `updatedAt` do projeto avança a cada gasto, estorno ou troca de itens ([decisões do PO](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), E3).
