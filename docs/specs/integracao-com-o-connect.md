# Spec: Integração com o Connect (lado do Financeiro)

Contrato do que o **Financeiro** implementa para conversar com o P+ Connect. O contrato completo dos dois lados — rotas, payloads, escopos, erros, eventos e idempotência — está em [handoff/07](../handoff/07-integracao-com-o-connect.md). Se este spec e o 07 discordarem, vale o 07, e este spec é corrigido.

## Comportamento

- **`ConnectClient`** (`requests`, `services/connect_http.py`):
  - token de serviço (`client_credentials`) em cache na memória, renovado 30 s antes de expirar;
  - `X-Request-Id` em toda chamada: **ainda não** (entra com o registro das chamadas);
  - timeout de 10 s em toda chamada;
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
| `interviews.launched` | relê os itens, cria no espelho, cria ou atualiza o **lançamento agrupado** do projeto × data de pagamento em Contas a pagar e dispara `payment_pending` |
| `interviews.changed` (`removed`, `amount_changed`, `status_changed`) | relê; item removido vira `cancelado`; se estava numa planilha gerada, avisa |
| `project.changed` | relê o projeto (prazo muda a previsão) |
| `project.budget.changed` | relê o orçamento para o resumo |
| `interviewer.pix_changed` | marca as planilhas geradas antes da troca ("chave alterada") |
| `payment.applied` / `payment.reversed` | confirma a baixa local (`aplicada`) ou registra a reversão; o Connect avisa o entrevistador ("pagamento realizado") |

- **O que a reunião de 21/10 acrescenta (a entrar no contrato, N4):**
  - itens do orçamento com data (leitura);
  - modelo fiscal (NF ou RPA) e status da NF do entrevistador (leitura). **O arquivo da NF não passa por aqui**: fica no Connect (D8);
  - **consumo do orçamento por item** (`items[].spent`), que o coordenador lança no Connect e o **Financeiro lê** (E3): só valores, sem descrição nem autor;
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
3. Cada chamada vira `integration_call_logs` (direção, rota, status, duração), **sem corpo** (**a tabela ainda não existe**; hoje só o código HTTP de um erro vai para o log). O corpo de `payment-data` e de `pix-key-matches` nunca é logado.
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
- Cliente HTTP real (já com baixa, consulta de baixa, chave completa, casamento de chave, feed e cancelamento): `backend/services/connect_http.py` e `connect_gateway.py`. Conferência contra o dev: `backend/services/connect_check.py` e `backend/scripts/connect_dev_check.py` ([como rodar](../operations/testar-com-o-connect-dev.md)).

## Ajustes

- 2026-11-12: o cliente HTTP passa a cobrir as escritas do contrato. Toda escrita leva `Idempotency-Key` (na baixa, a própria `paymentRef`) e **não tem nova tentativa automática**: se a resposta se perde (tempo esgotado ou 500, 502 ou 504), o resultado é "não sei se aplicou" e o Financeiro consulta `GET /payments/{ref}` antes de repetir. Só leitura (e as consultas por POST, que não gravam) tenta de novo, em 429, 5xx e falha de rede, respeitando o `Retry-After`. Erro 4xx do Connect vira recusa com o `code` do contrato, e nada é marcado como pago no Financeiro.

- 2026-10-21: NF fica no Connect e só o status chega aqui; o Financeiro passa a fornecer o consumo do orçamento ao Connect ([decisões do PO após a reunião de 21/10](../transcricoes/2026-10-21-decisoes-pos-reuniao.md)).

- 2026-10-21: o cancelamento de baixa (`POST /payments/{ref}/reversal`) não entra até o PO decidir (pergunta aberta Q4).
- 2026-10-23: o Connect passa a expor, em `GET /integrations/v1/projects/{id}/budget`, os campos `budgetTotal` e `items[]` (`itemId`, `name`, `kind`, `amount`, `expectedPaymentDate`, `spent`). O **gasto dos itens que não são entrevista é lançado no Connect** pelo coordenador; o Financeiro só lê o total gasto por item, sem descrição nem autor. Isso **inverte** a D5 de 21/10 (antes o Financeiro fornecia o consumo). Mudança aditiva no `v1`. O `updatedAt` do projeto avança a cada gasto, estorno ou troca de itens ([decisões do PO](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), E3).
- 2026-11-03: o evento `interviews.launched` agora também cria ou atualiza o **lançamento agrupado em Contas a pagar** (um por projeto × data de pagamento), que é o ponto de entrada do pagamento; a baixa continua pedida ao Connect, que avisa o entrevistador ([kickoff com o financeiro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), K1, K2). O Connect **não** tem respondentes: o incentivo entra por planilha importada no Financeiro (K5; futuro: respondentes no Connect).
- 2026-11-06: **cliente HTTP do Financeiro** (`backend/services/connect_http.py`) para o que o Connect **já entrega**: token de serviço (`POST /oauth/token`, client_credentials, sem pedir escopo: o Connect dá os da conta), `GET /projects`, `GET /payables` (uma chamada por pessoa, seguindo o cursor até o fim) e `GET /interviewers`. Token guardado até 30 s antes de vencer; um 401 renova o token uma vez; 429, 5xx e falha de rede repetem até 3 vezes, esperando o `Retry-After` (no máximo 5 s) e só em leitura; timeout de 10 s em toda chamada; em produção só HTTPS; segredo e corpo da resposta nunca vão para o log. `pix-key-matches` e `payments` continuam "fora do ar" no cliente até o Connect entregar (entregas 1 e 2): sem elas, enviar um PDF responde 503 e nenhuma baixa é feita no escuro. Liga com `CONNECT_BASE_URL`, `CONNECT_CLIENT_ID` e `CONNECT_CLIENT_SECRET` no `backend/.env`.

- 2026-11-11: `POST /finance/connect/sync` (o botão **Atualizar do Connect** em Cadastros → Projetos) agora também cria ou atualiza o **projeto de Contas a pagar** (`projects`), com código igual ao ID do Connect, além do espelho dos comprovantes (`project_refs`). O Financeiro **ainda não lê** `GET /projects/{id}/budget` nem a situação do projeto: orçamento e saldo do relatório do projeto ficam em branco até lá (Q40). Piloto com um projeto do Connect.
- 2026-11-13 (**correções da revisão do cliente**): (a) uma resposta 200 que **não é JSON ou não tem o campo do contrato** (HTML de um proxy, por exemplo) não escapa mais como erro 500: numa **escrita** vira `ConnectBadAnswer` (um `ConnectTimeout`: a baixa pode ter sido aplicada, confira com `GET /payments/{ref}`) e numa **leitura**, `ConnectUnavailable`; (b) o `Retry-After` em data HTTP vira a espera padrão, e um cursor que nunca acaba para em 1.000 páginas; (c) **`payment-data` nunca repete sozinha**: cada acesso à chave completa entra na trilha da pessoa no Connect e gasta o teto diário, mesmo sem gravar nada (só `pix-key-matches` é consulta que repete como a leitura); (d) `reverse_payment` (cancelar baixa) existe no cliente **só para o roteiro de teste do dev** desfazer a baixa de teste: nenhuma tela o chama, e a regra 8 de entregas-do-connect continua valendo (Q4). **Para o João:** o `handoff/07` §6 fala em 409 com `Retry-After` para "primeira chamada ainda em andamento", e o guia do dev só cita `idempotency_conflict` para corpo diferente; hoje o cliente trata todo 409 como recusa final. Confirmar se o Connect devolve esse 409 de "em andamento" e, se sim, o cliente deve tratá-lo como "não sei".

