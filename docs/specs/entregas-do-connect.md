# Spec: Entregas do Connect para o Financeiro (cronograma da API `/integrations/v1`)

O que o Financeiro precisa que o **time do P+ Connect** entregue na API de integração, e em que ordem. É o pedido do **PF-6**, escrito para o João levar ao time do Connect: **pronto quando cada entrega tiver data e responsável no Connect**, compatível com a entrega de pagamento de entrevistadores.

O contrato completo (rotas, payloads, erros, eventos) está em [handoff/07](../handoff/07-integracao-com-o-connect.md); o lado do Financeiro, em [integracao-com-o-connect](integracao-com-o-connect.md). Se este spec e o handoff/07 discordarem sobre o contrato, vale o 07. Este spec lista **só o que falta no Connect e a ordem**; o que a API já entrega (conferido no código do Connect em 05/11/2026) fica de fora.

## Comportamento

### Entregas pedidas ao Connect

A ordem segue o handoff/07 §7, ajustada ao que o Financeiro constrói primeiro. **Data** e **Responsável** são preenchidos pelo time do Connect.

| # | Entrega | Para que o Financeiro precisa | Data | Responsável |
|---|---|---|---|---|
| 1 | `POST /interviewers/payment-data` e `POST /pix-key-matches`, com `pii_access_logs` por conta de serviço e limite diário de chaves completas | Planilha de pagamento ao banco e conciliação do comprovante. A chave completa nunca é gravada no Financeiro | | |
| 2 | Baixa: `POST /payments` e `GET /payments/{ref}`, com `idempotency_keys` de 24 h, tudo ou nada, valor exato, erros `already_paid` e `amount_mismatch` | "Confirmar baixa" sem pagar duas vezes | | |
| 3 | Eventos: `integration_outbox`, destinos de webhook, despachante com retentativa e assinatura `X-Signature` | Saber na hora que uma entrevista foi lançada, mudou ou foi apagada | | |
| 4 | Feed `GET /events?after=` (30 dias de histórico) | Recuperar eventos perdidos e fazer a conferência diária | | |
| 5 | Expor o **modelo fiscal** (`fiscalModel`: `"NF"` ou `"RPA"`) e o **status da NF** (`invoiceStatus`: `"pending"` ou `"received"`) de cada entrevistador, sem o arquivo da NF. Pode ser em `GET /payables` ou numa rota própria, como o Connect preferir | Mostrar "NF recebida/pendente" e calcular o líquido do RPA | | |
| 6 | `FINANCE_EXTERNAL_ENABLED`: com a chave ligada, a baixa por comprovante dentro do Connect vira só leitura | Evitar que o mesmo Pix seja baixado nos dois sistemas | | |
| 7 | Testes de cada rota e exemplos JSON em `contract/v1/` | O Financeiro valida seus testes contra os mesmos exemplos | | |
| 8 | Cancelamento de baixa (`POST /payments/{ref}/reversal`) | **Só depois** da decisão do PO sobre a pergunta Q4 | | |

- As entregas **1 e 2 são o caminho crítico**: sem elas o Financeiro só mostra contas, não paga.
- As entregas **3 e 4** entram juntas: sem feed e eventos a baixa fica sem conferência.
- A entrega **5** pode vir depois do primeiro pagamento, mas trava o "NF recebida/pendente" e o líquido do RPA vindos do Connect.

## Regras

1. Mudança **aditiva** (campo ou evento novo) entra no `v1`; mudança incompatível vira `/integrations/v2`, com o `v1` no ar até o Financeiro migrar.
2. Dinheiro é **string decimal** (`"40.00"`); datas `YYYY-MM-DD` no fuso de São Paulo; nomes em camelCase; paginação por cursor.
3. O **arquivo da NF fica no Connect**; só o modelo fiscal e o status chegam ao Financeiro (D8).
4. Evento é **só um aviso**, sem dado pessoal: o Financeiro relê o recurso na API.
5. Toda escrita leva `Idempotency-Key`. A baixa é **tudo ou nada**, com valor exato: se não fecha, é divergência para revisão humana. Nada é pago sem "Confirmar baixa".
6. **Paga não se apaga**: a regra vale também para a baixa externa.
7. A chave Pix completa só sai pela planilha de pagamento, com cada acesso auditado nos dois sistemas, e **nunca é gravada no Financeiro**.
8. **Cancelamento de baixa não entra** até o PO decidir a Q4.
9. Nos testes do Financeiro, o Connect é sempre simulado, a partir dos exemplos de `contract/v1/`.
10. Em produção, só HTTPS; `/docs` e `/openapi.json` fora do ar nos dois sistemas.

## Casos negados

O que a API do Connect responde nas entregas pedidas (formato `{"detail", "code", "requestId"}`; o `detail` em pt-BR simples pode chegar à tela do Financeiro):

| Situação | HTTP | `code` |
|---|---|---|
| Token ausente, expirado ou de cliente desativado | 401 | `invalid_token` |
| Escopo da conta não cobre a rota | 403 | `insufficient_scope` |
| Baixa de entrevista que já está paga | 409 | `already_paid` (com a lista `interviewIds`) |
| Soma das entrevistas diferente do valor do Pix | 422 | `amount_mismatch` |
| Entrevista de outro entrevistador ou de outro projeto | 422 | `mixed_interviewer` |
| Entrevista sem valor ou não concluída | 422 | `not_payable` |
| Mesmo ID de transação Pix (`e2eId`) em outra baixa | 409 | `duplicate_e2e` |
| Mesmo `Idempotency-Key` com corpo diferente | 409 | `idempotency_conflict` |
| Limite de chaves completas por dia (5.000) ou de pedidos por minuto | 429 | `rate_limited` (com `Retry-After`) |
| Integração desligada no ambiente | 503 | `unavailable` |

## Critérios de aceite

- [ ] Cada uma das entregas 1 a 8 tem **data e responsável** registrados neste spec, ou a decisão de que não entra.
- [ ] `POST /payments` repetido com o mesmo `Idempotency-Key` devolve o mesmo resultado e não paga de novo; duas baixas simultâneas das mesmas entrevistas aplicam só uma.
- [ ] `payment-data` grava o acesso por pessoa no Connect e no Financeiro, e a chave completa não aparece em nenhum banco nem log do Financeiro.
- [ ] Derrubar o webhook e recuperar pelo feed funciona em até 5 minutos.
- [ ] Os exemplos JSON de `contract/v1/` passam nos testes do Connect e do Financeiro.
- [ ] Com `FINANCE_EXTERNAL_ENABLED` ligada, a baixa por comprovante dentro do Connect só lê.
- [ ] Um teste de fumaça com os dois `docker compose` vai do lançamento no Connect ao "Pago em" no Financeiro.

## Onde está no código

- Lado do Connect, a **construir**: lista de tarefas em [handoff/07 §7](../handoff/07-integracao-com-o-connect.md) (itens 6 a 12).
- Lado do Financeiro, a construir quando cada entrega chegar: [integracao-com-o-connect](integracao-com-o-connect.md).
- Origem do requisito: [handoff/07], [Reunião 21/10], decisões de 21/10 e 23/10 ([transcrição](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md)), [Kickoff 03/11]. Tarefa no Jira: PF-6.

## Ajustes

- 2026-11-05: o pedido cobre só o que falta, depois de conferir o código do Connect. O handoff/07 §7 está desatualizado: diz que os itens do orçamento "entram quando existirem", mas a API já os entrega. Precisa ser corrigido.
- 2026-11-05: o limite de 5.000 chaves completas por dia vem do handoff/07 §3; o time do Connect pode propor outro valor, e o Financeiro pede só as chaves das planilhas do dia.
