# Spec: Comprovantes e baixa

Contrato do envio do PDF de comprovantes Pix, da leitura, da classificação, da conciliação por soma exata e do "Confirmar baixa". É o porte do que roda hoje no Connect ([handoff/08 §3–§6, §10–§11](../handoff/08-dominio-e-codigo-atual.md)), com a diferença de que a baixa vira um pedido ao Connect pela API.

## Comportamento

- **Envio:** o financeiro solta o PDF "Comprovante de Transferência" (Itaú/Sispag) na tela do projeto.
  - O navegador corta o PDF em partes (25 páginas; se passar de 24 MB, divide ao meio de novo) e envia parte por parte com o `pageOffset`.
  - A tela mostra o progresso e reenvia só a parte que falhou.
  - **Arquivo grande nunca é recusado.**
- **Rotas** (prefixo `/projects/{projectId}/finance`, papéis `financeiro` e `admin`):

| Método | Rota | Faz | Rate limit |
|---|---|---|---|
| POST | `/receipt-batches` `{parts}` (1–10000) | abre o lote (`enviando`) | 30/min |
| PUT | `/receipt-batches/{id}/parts/{n}` (`file`, `page_offset` 0–100000) | lê uma parte em memória e descarta; idempotente | 600/min |
| GET | `/receipt-batches` | histórico, com quantos estão fora do projeto e o total pago | 60/min |
| GET | `/receipt-batches/{id}` | comprovantes + conciliação calculada na hora + erros das partes | 120/min |
| PATCH | `/receipt-batches/{id}/receipts/{rid}` `{discarded}` | descarta ou restaura antes de confirmar | 120/min |
| POST | `/receipt-batches/{id}/confirm` | dá baixa (com MFA e `confirm_payment`) | 20/min |
| DELETE | `/receipt-batches/{id}` | cancela lote não confirmado | 20/min |

- **Leitura** (`ReceiptParser`, implementação Itaú/Sispag):
  - corta por título "Comprovante de Transferência", não por página;
  - lê só o bloco "dados do recebedor": nome, chave, valor, data, ID da transação (`e2eId`).
- **Classificação:** o Financeiro envia as chaves lidas ao Connect (`POST /pix-key-matches`) e recebe `interviewerId` + `inProject`. Os grupos são:
  - `no_projeto`: chave de alguém aprovado no projeto;
  - `fora_do_projeto`: pessoa cadastrada, mas não aprovada aqui. Gera alerta, nunca baixa;
  - `chave_nao_cadastrada`: ninguém tem a chave. É o único caso em que o nome lido do comprovante aparece na tela;
  - `erro_leitura`: faltou chave, valor ou ID da transação;
  - `duplicado`: `e2eId` já pago em qualquer lote, ou repetido no próprio lote.
- **Conciliação** (calculada no `GET`, sem gravar), só para `no_projeto` pendente. As regras do algoritmo estão no item 3 de Regras. Os status são:
  - `bate`: o valor é exatamente a soma de N itens;
  - `pago_a_mais`: valor maior que tudo o que está a pagar ("lance a produção antes de dar baixa");
  - `nao_fecha`: nenhuma soma dá o valor.
- **Abas da tela:** Batem, Divergentes, Fora do projeto, Chave não cadastrada, Erros e Descartados.
- **Confirmar baixa** (em `ConfirmModal`):
  - o Financeiro trava o projeto (`project_refs`, `with_for_update`);
  - relê no Connect os itens a pagar das pessoas envolvidas e refaz a conciliação;
  - para cada `bate`, grava a alocação (`receipt_allocations`) e cria o pedido de baixa ao Connect (`POST /payments`, um por Pix, `Idempotency-Key` = `paymentRef`).
- **Estado do pedido de baixa:**
  - `pendente_envio` → `enviada` → `aplicada` (o Connect confirmou; o item fica `pago` no espelho);
  - ou `pendente_envio` → `enviada` → `recusada` (vai para Divergências).
  - Enquanto não aplica, a tela mostra "aguardando o Connect".
- O aviso ao entrevistador ("Pagamento de R$ X em {projeto}") é feito pelo **Connect**, quando aplica a baixa.
- **Aviso `receipt_out_of_project`:** quando o lote fica `pronto` com algum comprovante fora do projeto ou de chave não cadastrada, o Financeiro avisa admin e financeiro: "N comprovantes de pessoas fora do projeto {projeto}".

## Regras

1. **O comprovante dá baixa, não cria entrevista:** só aloca itens que já existem no espelho como `a_pagar`.
2. **Valor exato:** a soma das alocações de um Pix é igual ao valor do Pix. Não existe resto nem pagamento parcial.
3. **Algoritmo de conciliação:**
   - FIFO por pessoa (o item mais antigo primeiro: `launchedAt`, `connect_interview_id`);
   - comprovantes em ordem de data do Pix, depois página, depois id;
   - usa o menor prefixo da fila cuja soma de `amount` é exatamente o valor, nunca "valor ÷ valor por entrevista";
   - comprovante que não fecha não consome a fila.
4. **Nada é gravado no `GET`.** No `confirm`, a conta é refeita com o projeto travado, e só `bate` vira alocação.
5. **Pagamento único por Pix:**
   - índice único parcial em `e2eId` onde `status = 'pago'`;
   - pago em outro lote enquanto este esperava vira `duplicado` na confirmação;
   - um lote só conferido não trava o mesmo PDF em outro lote.
6. **O bloco do pagador nunca vira recebedor** (o CNPJ da Pesquise+ está lá).
7. **O PDF não é guardado:** a parte é lida em memória (`run_in_threadpool`) e descartada. Não existe rota de download de comprovante.
8. Do comprovante ficam só: nome cifrado (AES-GCM), hash e máscara da chave, valor, data, `e2eId`, grupo, `connect_interviewer_id`, status e erro. O código de autenticação é lido, mas não é gravado.
9. Recusa arquivo que não começa com `%PDF` e PDF com senha. Erro numa parte fica registrado na parte, e o lote continua.
10. **Estados do lote:**
    - `enviando` → `pronto` → `confirmado` (final);
    - cancelar apaga um lote não confirmado (explicitamente, no serviço; `payment_receipts.batch_id` é `RESTRICT`);
    - lote confirmado não muda mais.
11. Confirmar um lote sem nenhum `bate` é permitido: ele fica `confirmado` com 0 pagos.
12. A recusa do Connect (`already_paid`, `duplicate_e2e`, `amount_mismatch`) **nunca é corrigida sozinha**: vira linha em Divergências para decisão humana.
13. Timeout no pedido de baixa: consulta `GET /payments/{paymentRef}`; se o Connect não conhece, reenvia com o **mesmo** `Idempotency-Key`.
14. Tela nunca mostra a chave completa nem o nome lido de pessoa conhecida.
15. Normalização da chave idêntica à do Connect (`core/pix.py` copiado sem mudança); máscara `hmo***@gmail.com`.

## Casos negados

Mensagens iguais às do Connect hoje:

| Situação | HTTP | `detail` |
|---|---|---|
| Sem token | 401 | (padrão do login) |
| Papel sem permissão | 403 | Seu perfil não permite essa ação |
| Projeto inexistente | 404 | Projeto não encontrado |
| Lote inexistente ou de outro projeto | 404 | Envio de comprovantes não encontrado |
| Comprovante inexistente | 404 | Comprovante não encontrado |
| Mexer em lote confirmado (parte, descarte, cancelar, confirmar de novo) | 409 | Esse envio já foi confirmado e não pode mais ser alterado |
| Confirmar com partes faltando | 409 | Ainda faltam partes do PDF para terminar de enviar |
| Parte acima de 25 MB | 413 | Parte grande demais — divida o PDF em partes menores |
| Índice da parte fora do lote | 422 | Parte fora do intervalo deste envio |
| `parts` fora de 1–10000, `page_offset` negativo ou > 100000 | 422 | (validação) |
| Connect fora do ar na classificação | 503 | O P+ Connect não respondeu — tente de novo em alguns minutos |

## Critérios de aceite

- [ ] Exemplo 1 de [handoff/08 §4](../handoff/08-dominio-e-codigo-atual.md): Pix de 30, 20, 20 e 20 para duas entrevistas de 20 → `nao_fecha`, `bate`, `bate`, `pago_a_mais`.
- [ ] Exemplo 2: a ordem é por data do Pix, não por página; os dois `bate`.
- [ ] Confirmar: 2 pedidos de baixa vão ao Connect com `Idempotency-Key`; depois do `applied`, os itens ficam `pago` e o Connect mostra "Pago em" com a data do Pix.
- [ ] O mesmo PDF num lote novo dá `duplicado`; confirmar o mesmo lote de novo dá 409.
- [ ] Um comprovante de pessoa fora do projeto nunca é pago e dispara `receipt_out_of_project`.
- [ ] Um PDF de 300 páginas é dividido e enviado em partes; reenviar uma parte não duplica.
- [ ] O Connect recusando com `already_paid` cria uma linha em Divergências e não muda o espelho.
- [ ] Um timeout seguido de reenvio com o mesmo `Idempotency-Key` não paga duas vezes.
- [ ] Cada caso de borda da tabela de [handoff/08 §11](../handoff/08-dominio-e-codigo-atual.md) tem teste equivalente, mais o caso sem teste hoje: comprovante quebrado entre duas partes.
- [ ] Nada do PDF fica em disco, banco ou log (teste).

## Onde está no código

- Destino: `backend/api/batches.py`, `backend/services/batches.py`, `backend/services/reconciliation.py`, `backend/services/receipt_parser.py` (interface `ReceiptParser`), `backend/core/pix.py`, `backend/models/receipt_batch.py`, `backend/models/payment_receipt.py`, `backend/models/receipt_allocation.py`
- Frontend: `frontend/src/app/financeiro/projetos/[id]/comprovantes/page.tsx` (`splitPdf`, abas, `ConfirmModal`)
- Testes: `backend/tests/test_receipts.py`, `test_reconciliation.py`, `test_receipt_parser.py`, `test_pix_normalization.py`; `frontend/e2e/financeiro.spec.ts` com PDF sintético (`e2e/receipts.ts`)
- Referência no Connect: `services/finance.py` (`_classify`, `reconcile`, `confirm_batch`), `services/receipt_parser.py`, `core/pix.py`, `models/payment_receipt.py`, `api/finance.py`, `frontend/src/app/admin/projetos/[id]/financeiro/page.tsx`

## Ajustes

- 2026-10-21: `receipt_out_of_project` hoje avisa admin e supervisores no Connect. Como o supervisor não entra no Financeiro, o aviso vai para admin e financeiro. Se o supervisor também deve ser avisado, isso passa pelo Connect: pergunta aberta Q2.
