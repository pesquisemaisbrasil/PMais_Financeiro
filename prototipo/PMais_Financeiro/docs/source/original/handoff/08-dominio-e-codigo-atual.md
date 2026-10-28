# Domínio e código atual do Financeiro

O que o Financeiro **já faz dentro do P+ Connect**, explicado a partir do código: vocabulário, regras de produto e de onde cada uma veio, o fluxo ponta a ponta, o algoritmo de conciliação, o leitor de comprovantes, os estados, a planilha, os avisos e o destino de cada arquivo no sistema novo. Leia antes de portar qualquer parte: o código atual é a referência de comportamento, e cada regra aqui tem teste.

Caminhos relativos à raiz do repositório do Connect (`backend/`, `frontend/`). Quando um doc do Connect e o código discordam, vale o código (exemplo: `docs/architecture/seguranca/financeiro.md` ainda cita `require_supervisor`, mas as rotas usam `require_finance`).

## 1. Glossário

| Termo | Significado | Onde está no código |
|---|---|---|
| **Lote** (envio) | Um PDF de comprovantes enviado para o Financeiro de **um projeto**. O PDF chega em partes. | `ReceiptBatch` (`receipt_batches`) |
| **Parte** | Pedaço do PDF cortado no navegador (até 25 páginas, menor que 24 MB). Cada parte é uma requisição. Reenviar a mesma parte não duplica nada. | `ReceiptBatchPart` (`receipt_batch_parts`, `unique(batch_id, partIndex)`) |
| **Comprovante** | Um "Comprovante de Transferência" Pix do Itaú/Sispag lido de uma parte. Guarda só campos mínimos. | `PaymentReceipt` (`payment_receipts`) |
| **e2eId** (ID da transação) | ID fim a fim do Pix (`E0000…`). Chave natural contra pagamento em dobro: só pode existir **um** comprovante `pago` com o mesmo e2eId. | `PaymentReceipt.e2eId` + índice `uq_payment_receipts_e2e_paid` |
| **Baixa** | Marcar entrevistas lançadas como pagas por um comprovante: grava `Interview.payment_receipt_id` e `Interview.paidAt`. Só acontece no "Confirmar baixa". | `confirm_batch` em `services/finance.py` |
| **Bate** | O valor do Pix é exatamente a soma de N entrevistas a pagar da pessoa. Único caso que vira baixa. | `Reconciliation.status = "bate"` |
| **Divergente** | Comprovante do projeto que não bate: `pago_a_mais` (Pix maior que tudo que está a pagar) ou `nao_fecha` (nenhuma soma dá o valor). Vai para revisão humana, nunca é pago sozinho. | aba "Divergentes" (`tabOf` no `page.tsx`) |
| **No projeto** | Chave Pix de alguém com candidatura **aprovada neste projeto**. | `GROUP_IN_PROJECT = "no_projeto"` |
| **Fora do projeto** | Chave de alguém cadastrado, mas sem candidatura aprovada aqui (pendente, rejeitada ou nunca se candidatou). Gera alerta, nunca baixa. | `GROUP_OUT_OF_PROJECT = "fora_do_projeto"` |
| **Chave não cadastrada** | Chave que não casa com ninguém. Único caso em que o nome lido do comprovante aparece na tela. | `GROUP_UNKNOWN_KEY = "chave_nao_cadastrada"` |
| **Erro de leitura** | Faltou chave, valor ou ID da transação no comprovante. | `GROUP_UNREADABLE = "erro_leitura"` |
| **Duplicado** | e2eId já **pago** em qualquer lote, ou repetido no próprio lote. | `GROUP_DUPLICATE = "duplicado"` |
| **A pagar** | Entrevista `completed`, com `earnedValue` e sem baixa (`payment_receipt_id IS NULL`). | filtros em `finance.py`, `payment_sheet.py`, `earnings.py` |
| **Lançado** | Soma do `earnedValue` das entrevistas `completed` do projeto (pagas ou não). É o que consome o orçamento. | `get_budget_used` em `services/project.py` |
| **`earnedValue`** | Valor da entrevista **congelado** no lançamento (`valuePerInterview` do momento). Mudar o valor do projeto depois não muda o que já foi lançado. | `Interview.earnedValue` |
| **Prazo de pagamento** (`paymentTermDays`) | Dias corridos entre o lançamento e a previsão de pagamento. 1 a 365; nulo = padrão `PAYMENT_TERM_DAYS = 30`. | `Project.paymentTermDays`, `effective_payment_term` |
| **Previsão** (`expectedPaymentDate`) | Data do lançamento **no fuso de São Paulo** + prazo **atual** do projeto. Mudar o prazo muda a previsão do que já foi lançado. | `expected_payment_date` em `core/text.py` |
| **Orçamento** (teto) | Limite do que pode ser **lançado** em entrevistas no projeto. Nulo = sem limite; 0 = bloqueia tudo. Teto duro, sem "forçar". | `Project.budget`, `ensure_budget_available` |
| **80% / 100%** | Limiares de aviso de orçamento. Ao cruzar 80% ou chegar a 100% num lançamento, avisa admin, supervisores e financeiro (só o maior limiar cruzado). | `BUDGET_THRESHOLDS` em `finance_notifications.py` |
| **Saldo** | Orçamento − lançado. | `budgetBalance` em `get_finance_summary` |

## 2. Regras de produto e origem

Mudar qualquer uma exige nova decisão do PO, não só código.

| # | Regra | Origem | Garantia no código |
|---|---|---|---|
| 1 | **O comprovante dá baixa, não cria entrevista.** O supervisor lança a produção; o comprovante informa o que já foi pago. | Reunião 09/10/2026 (respostas do PO), ADR 0001 | `confirm_batch` só faz `UPDATE` em entrevistas existentes; a fila só tem `payment_receipt_id IS NULL` |
| 2 | **Valor exato.** Pix = soma das entrevistas pagas. Não existe resto nem pagamento parcial. Não fechou: divergência. | Reunião 09/10/2026 ("valores exatos, entrevistas × valor, sem resto"), plano seção 14 #2 | `reconcile` exige `running == target` |
| 3 | **Orçamento é teto duro**, para todos (inclusive admin), e cobre só entrevistas. | Reunião 09/10/2026 ("ninguém força"), ADR 0006 | `ensure_budget_available` → `BudgetExceeded` → 409, com o projeto travado (`with_for_update`) |
| 4 | **Nada é pago sem confirmação humana.** | Plano seção 6, ADR 0001 | Baixa só em `POST …/confirm`; o `GET` calcula a conciliação sem gravar |
| 5 | **O PDF não é guardado** e não há download de comprovante. | Reunião 09/10/2026 ("não deixar por enquanto baixar o comprovante", "dividir o pdf e deixar anônimo"), ADR 0002 | `process_part` lê em memória e descarta; não existe rota de arquivo |
| 6 | **Quem recebeu sem estar no projeto é avisado**, nunca pago. | Reunião 09/10/2026 ("tem que avisar de alguma forma quem não estava e está com comprovante") | grupos `fora_do_projeto`/`chave_nao_cadastrada` + notificação `receipt_out_of_project` |
| 7 | **Chave Pix sempre mascarada** (`hmo***@gmail.com`) para quem confere. | ROPA ("supervisor vê valores, não PIX"), spec `financeiro.md` regra 7 | `mask_pix_key`; a chave fica só como hash + máscara |
| 8 | **Planilha do Financeiro com Pix completo**, só admin e financeiro, **sem CPF**, cada download auditado. | Reunião 09/10/2026 ("usuário financeiro que baixa planilha do que pagar por projeto"), spec `ganhos-e-pagamentos.md` regras 5–7 | `require_payment_sheet`, `export_logs` + `pii_access_logs` |
| 9 | **Orçamento só muda por quem pode** (admin, financeiro, supervisor com `canEditBudget`), auditado e notificado. | Reunião 09/10/2026 ("supervisor não altera orçamento, só quem for sinalizado"), ADR 0006 | `can_edit_budget`, `BudgetChangeLog`, `budget_changed` |
| 10 | **Arquivo grande nunca é recusado**: parte no meio. | Reunião 09/10/2026 ("se tiver muitos comprovantes não pode recusar, tem que partir no meio") | `splitPdf` no navegador; limite de 25 MB é **por parte** |
| 11 | **Pix em CNPJ é aceito** no cadastro. | Reunião 09/10/2026 ("financeiro já paga em CNPJ via Pix") | `normalize_pix_key` (14 dígitos), `pixType = cnpj` |
| 12 | **Entrevista paga não pode ser apagada**, nem o total ficar abaixo das pagas. | Spec `projetos-cotas-e-orcamento.md` regra 12 | `delete_logged_interview`, `CountBelowPaid` → 409 |
| 13 | **Financeiro não lança nem apaga entrevistas.** | Spec `projetos-cotas-e-orcamento.md` regra 13 | rotas de lançamento exigem supervisor/admin |

## 3. Fluxo ponta a ponta

```
Connect (supervisor)                 Financeiro (papel financeiro/admin)             Banco Itaú
───────────────────                  ────────────────────────────────────            ──────────
1. lança N entrevistas  ──►  a pagar (earnedValue congelado, previsão = lançamento + prazo)
   ├─ 409 se passa do orçamento
   └─ avisos: budget_threshold (80/100%), payment_pending
                                     2. baixa planilha payments.xlsx (Pix completo, auditada)
                                     3. paga no internet banking ─────────────────────►  Pix
                                     4. baixa o PDF "Comprovante de Transferência" ◄────  PDF
                                     5. solta o PDF na tela: navegador corta em partes
                                     6. POST lote → PUT parte 0..n (servidor lê e descarta)
                                     7. leitor → grupos (no projeto, fora, chave não cadastrada,
                                        erro, duplicado) → aviso receipt_out_of_project
                                     8. GET lote: conciliação FIFO por soma exata, na hora
                                     9. descarta/restaura o que precisar
                                    10. "Confirmar baixa" (transação única, projeto travado)
11. entrevistas viram pagas (paidAt) ◄── payment_received para cada entrevistador (+ WhatsApp opcional)
12. entrevistador vê "Pago em dd/mm/aaaa" em /ganhos; sai da planilha e do aviso de vencimento
```

Rotas atuais (`backend/api/finance.py`, prefixo `/projects/{project_id}/finance`, todas com `require_finance` = admin, supervisor, financeiro, exceto a planilha):

| Método | Rota | Faz | Rate limit |
|---|---|---|---|
| GET | `/summary` | orçamento, lançado, pago, a pagar, saldo; total e por entrevistador | 60/min |
| POST | `/receipt-batches` `{parts}` (1–10000) | abre o lote (`enviando`) | 30/min |
| PUT | `/receipt-batches/{id}/parts/{n}` (`file`, `page_offset` 0–100000) | lê uma parte, idempotente; 413 acima de 25 MB | 600/min |
| GET | `/receipt-batches` | histórico, com `outOfProjectCount` e `paidTotal` | 60/min |
| GET | `/receipt-batches/{id}` | comprovantes + conciliação calculada na hora + erros das partes | 120/min |
| PATCH | `/receipt-batches/{id}/receipts/{rid}` `{discarded}` | descarta/restaura antes de confirmar | 120/min |
| POST | `/receipt-batches/{id}/confirm?sendWhatsapp=` | dá baixa; 409 se faltam partes ou já confirmado | 20/min |
| DELETE | `/receipt-batches/{id}` | cancela lote não confirmado (apaga comprovantes e partes) | 20/min |
| GET | `/payments.xlsx` | planilha (`require_payment_sheet` = admin e financeiro) | 20/min |

Fora do prefixo: `PATCH /projects/{id}/budget` (orçamento), `POST /projects/{id}/interviews/log-validated` e `/set-count` (lançamento), `GET /interviewers/me/earnings[/history]` e `GET /projects/{id}/earnings[/history][.csv]` (ganhos).

Casos negados das rotas do Financeiro (mensagens exatas, todas com teste em `test_verif_financeiro.py`):

| Situação | HTTP | `detail` |
|---|---|---|
| Sem token | 401 | (padrão do login) |
| Entrevistador em qualquer rota | 403 | Acesso ao Financeiro é necessário |
| Supervisor ou entrevistador baixa a planilha | 403 | Só o Financeiro pode baixar a planilha de pagamentos |
| Projeto inexistente | 404 | Projeto não encontrado |
| Lote inexistente ou de outro projeto | 404 | Envio de comprovantes não encontrado |
| Comprovante inexistente | 404 | Comprovante não encontrado |
| Mexer em lote confirmado (parte, descarte, cancelar, confirmar de novo) | 409 | Esse envio já foi confirmado e não pode mais ser alterado |
| Confirmar com partes faltando | 409 | Ainda faltam partes do PDF para terminar de enviar |
| Parte acima de 25 MB | 413 | Parte grande demais — divida o PDF em partes menores |
| Índice da parte fora do lote | 422 | Parte fora do intervalo deste envio |
| `parts` fora de 1–10000, `page_offset` negativo ou > 100000 | 422 | (validação) |

## 4. Conciliação (`reconcile`)

Trecho real, encurtado (`backend/services/finance.py`):

```python
pending = [r for r in receipts
           if r.group == GROUP_IN_PROJECT and r.status == "pendente"
           and r.amount and r.id not in excluded]
queues = _unpaid_by_interviewer(db, project_id, {r.matched_interviewer_id for r in pending})
# fila = completed, earnedValue não nulo, payment_receipt_id nulo, ORDER BY createdAt, id
cursor: dict[int, int] = {}
for receipt in sorted(pending, key=lambda r: (r.paidOn or date.min, r.page, r.id)):
    queue = queues.get(receipt.matched_interviewer_id, [])
    start = cursor.get(receipt.matched_interviewer_id, 0)
    target = Decimal(receipt.amount)
    remaining_total = sum((Decimal(i.earnedValue) for i in queue[start:]), Decimal("0"))
    if target > remaining_total:
        result[receipt.id] = Reconciliation(status="pago_a_mais", message="… lance a produção antes de dar baixa")
        continue
    running, matched = Decimal("0"), []
    for interview in queue[start:]:
        running += Decimal(interview.earnedValue); matched.append(interview.id)
        if running >= target:
            break
    if running == target:
        cursor[receipt.matched_interviewer_id] = start + len(matched)   # consome a fila
        result[receipt.id] = Reconciliation(status="bate", interview_ids=matched, ...)
    else:
        result[receipt.id] = Reconciliation(status="nao_fecha", ...)    # NÃO consome a fila
```

Regras do algoritmo:

- **FIFO por pessoa:** a entrevista mais antiga é paga primeiro.
- **Comprovantes em ordem de data do Pix**, depois página, depois id. Não é a ordem do PDF.
- **Menor prefixo** da fila cuja soma é **exatamente** o valor. Usa a soma de `earnedValue`, nunca `valor ÷ valuePerInterview`, porque o valor é congelado por entrevista e pode ter mudado no meio do projeto.
- Comprovante que **não fecha não consome** a fila: o próximo comprovante da mesma pessoa começa do mesmo ponto.
- Nada é gravado no `GET`. No `confirm`, a conta é **refeita** com o projeto travado; só `bate` vira baixa.
- Dinheiro sempre `Decimal`.

### Exemplo 1: quatro Pix para duas entrevistas de R$ 20 (`test_non_matching_receipt_does_not_consume_the_queue`)

Fila da pessoa: E1 = 20,00, E2 = 20,00 (total a pagar 40,00).

| Ordem (data) | Pix | Fila restante | Conta | Resultado |
|---|---|---|---|---|
| 01/02 | 30,00 | [20, 20] = 40 | 20 → 40 (passou de 30 sem igualar) | `nao_fecha`; cursor fica em 0 |
| 02/02 | 20,00 | [20, 20] = 40 | 20 = 20 | `bate` (E1); cursor → 1 |
| 03/02 | 20,00 | [20] = 20 | 20 = 20 | `bate` (E2); cursor → 2 |
| 04/02 | 20,00 | [] = 0 | 20 > 0 | `pago_a_mais` ("lance a produção antes de dar baixa") |

Confirmar: 2 comprovantes pagos, 2 entrevistas, 1 pessoa; os outros 2 ficam `pendente` para consulta.

### Exemplo 2: valor congelado diferente e ordem por data (`test_receipts_are_reconciled_by_payment_date_not_page`)

Fila: E1 = 20,00 (lançada em 01/01), E2 = 40,00 (02/01). PDF: página 1 = Pix de 40,00 em 20/02; página 2 = Pix de 20,00 em 18/02.

- Ordenado por data: primeiro o de 20,00 (18/02) leva E1; depois o de 40,00 (20/02) leva E2. Os dois `bate`.
- Se fosse por página, o de 40,00 tentaria 20 + 40 = 60 e daria `nao_fecha`.

### Exemplo 3: projeto com R$ 1.000 de orçamento, 4 entrevistas de R$ 20 (`test_confirm_marks_interviews_paid_and_is_not_repeatable`)

- Pix 40,00 (E1) → `bate` (2 entrevistas). Pix 30,00 (E2) → `nao_fecha` com as 2 restantes de 20.
- Depois de confirmar, o resumo fica: lançado 80, pago 40, a pagar 40, saldo 920. `paidAt` = data do Pix (18/02/2026), não a data da confirmação.
- Mesmo PDF num lote novo: `duplicado`. Confirmar de novo o mesmo lote: 409.

### Confirmação (`confirm_batch`)

1. `_lock_batch`: `SELECT … FOR UPDATE` no **projeto** e relê o lote (`populate_existing`). Se o lote sumiu → 404; se já confirmado → 409.
2. `_paid_elsewhere`: comprovante pendente cujo e2eId foi pago em **outro lote** depois desta leitura vira `duplicado`.
3. `reconcile` de novo; para cada `bate`: `UPDATE interviews SET payment_receipt_id, paidAt = receipt.paidOn or date.today()`; comprovante → `pago`.
4. Lote → `confirmado`, `confirmedAt`, `confirmed_by_user_id`.
5. Uma notificação `payment_received` **por entrevistador** ("Pagamento de R$ X em {projeto}"), sem notificar quem confirmou; WhatsApp `pagamento_realizado` só com `sendWhatsapp=true` e consentimento. Falha de aviso é registrada no log e não desfaz a baixa.
6. Um `commit` só. Retorna `paidReceipts`, `paidInterviews`, `paidTotal`, `interviewers`, `whatsappQueued`.

Confirmar um lote sem nenhum `bate` é permitido: o lote vira `confirmado` com 0 pagos.

## 5. Leitor do comprovante (`backend/services/receipt_parser.py`)

Puro, sem banco: recebe o texto de cada página e devolve `ParsedReceipt(page, payee_name, pix_key, amount, paid_at, e2e_id, auth_code, error)`.

**Layout Itaú/Sispag** (texto que o `pypdf` extrai; fixture fictícia de `test_receipts.py`):

```
Comprovante de Transferência          ← início de cada comprovante (não a página)
dados do pagador                      ← bloco IGNORADO (tem o CNPJ da Pesquise+)
nome do pagador:  EMPRESA FICTICIA LTDA
CPF / CNPJ do pagador:  11.222.333/0001-81
dados do recebedor                    ← único bloco lido como recebedor
nome do recebedor:  FULANA DE TESTE
chave:  fulana.teste@gmail com        ← ponto do domínio virou espaço na extração
CPF / CNPJ do recebedor:  *****000000-**   ← descartado
dados da transação
valor:  R$ 40,00
data da transferência:  18/02/2026
autenticação no comprovante:
A0000000000000000000000000000000000000A0   ← valor na linha de baixo
ID da transação:
E00000000202601011200TESTE000001           ← valor na linha de baixo
controle:
```

| Campo | Rótulo | Regra de leitura | Obrigatório |
|---|---|---|---|
| `payee_name` | `nome do recebedor:` | só dentro do bloco `dados do recebedor`; espaços colapsados | não |
| `pix_key` | `chave:` | só no bloco do recebedor; `_fix_email` troca "gmail com" por "gmail.com" | **sim** |
| `amount` | `valor:` | regex `[\d.]+,\d{2}` → `Decimal` ("1.234,50" → 1234.50); sem centavos = erro | **sim** |
| `paid_at` | `data da transferência:` | `dd/mm/aaaa`; data inválida vira `None` | não |
| `e2e_id` | `ID da transação:` | valor na própria linha ou na próxima não vazia; se a próxima é outro rótulo (`controle:`), o campo veio vazio | **sim** |
| `auth_code` | `autenticação no comprovante:` | idem; lido, mas **não é gravado** | não |

Detalhes que já foram bug e têm teste:

- Rótulos comparados sem acento e em minúsculas (`_fold`): a extração varia a acentuação.
- Corte por título "Comprovante de Transferência", não por página: cobre 2 por página e 1 quebrado em 2 páginas. Texto antes do primeiro título é ignorado.
- Faltou chave, valor ou ID: `error = "Não foi possível ler: chave, valor, ID da transação"` → grupo `erro_leitura`.
- `page_offset`: a parte que começa na página 51 chega com `page_offset=50`, e a página mostrada é a do PDF original.
- `extract_pdf_pages`: recusa o que não começa com `%PDF` e PDF com senha (`UnreadablePdf`). Erro numa parte fica em `ReceiptBatchPart.error` e o lote continua.

**Normalização da chave** (`backend/core/pix.py: normalize_pix_key`), usada no cadastro **e** no comprovante, antes do `hash_pix` (HMAC-SHA256 com `PIX_SECRET_KEY`):

| Entrada | Saída |
|---|---|
| `Fulano@Gmail.com` | `fulano@gmail.com` |
| `123.456.789-09` (CPF válido) | `12345678909` |
| `11.222.333/0001-81` (CNPJ) | `11222333000181` |
| `(11) 98765-4321` | `+5511987654321` |
| `5511987654321` (12/13 dígitos com 55) | `+5511987654321` |
| UUID em maiúsculas | UUID em minúsculas |

Uma sequência de 11 dígitos que **é** CPF válido vira CPF; se não é, vira telefone. Mudar essa regra muda hashes: exige o script `scripts/rehash_pix_keys.py` (simula por padrão, `--apply` grava, colisões só relatadas).

**Máscara** (`mask_pix_key`): e-mail mantém 3 letras + domínio (`hmo***@gmail.com`); o resto mantém 3 no começo e 2 no fim; até 5 caracteres vira `***`.

**Divisão do PDF no navegador** (`frontend/src/app/admin/projetos/[id]/financeiro/page.tsx: splitPdf`, com `pdf-lib`):

- `PAGES_PER_PART = 25`; se uma parte passar de `MAX_PART_BYTES = 24 MB`, ela é dividida ao meio de novo, até caber (o servidor aceita 25 MB).
- Nunca recusa por quantidade de páginas. PDF com senha ou ilegível: mensagem em pt-BR ("Esse PDF está protegido por senha. Gere o arquivo de comprovantes sem senha no banco e envie de novo.").
- Cada parte sobe com o `pageOffset` da primeira página; a tela mostra o progresso e reenvia só a parte que falhou.
- No servidor, `process_part` roda em `run_in_threadpool` (pypdf é síncrono; sem isso a API inteira trava).

## 6. Estados e transições

**Lote (`ReceiptBatch.status`):**

```
enviando ──(última parte lida)──► pronto ──(POST confirm)──► confirmado   (final)
    │                               │
    └──────(DELETE)─────────────────┴──► apagado (linhas removidas; não existe status "cancelado")
```

- Confirmar em `enviando` → 409. Confirmar, enviar parte, descartar ou cancelar em `confirmado` → 409.
- A passagem para `pronto` dispara `receipt_out_of_project` se houver comprovantes fora do projeto ou com chave não cadastrada.

**Comprovante (`PaymentReceipt.status`):**

```
pendente ◄──PATCH {discarded}──► descartado        (só antes de confirmar o lote)
pendente ──(confirm, se "bate")──► pago            (final; PATCH em pago não muda nada)
```

**Grupo (`PaymentReceipt.group`):** fixado na leitura. A única mudança posterior é para `duplicado`, quando o mesmo e2eId é pago em outro lote antes desta confirmação (na tela, calculado; na confirmação, gravado).

**Conciliação (`reconcileStatus`, calculado, não gravado):** `bate`, `pago_a_mais`, `nao_fecha`, `pago`, `descartado` ou vazio (fora da conciliação). Abas na tela: Batem (`bate`/`pago`), Divergentes (`pago_a_mais`/`nao_fecha`), Fora do projeto, Chave não cadastrada, Erros (`erro_leitura`, `duplicado` e erros de parte), Descartados.

**Entrevista:** `a pagar` (`payment_receipt_id` nulo) → `paga` (`payment_receipt_id` + `paidAt`). Não existe estorno pela aplicação. Paga não pode ser apagada nem entrar em redução de total.

## 7. Planilha de pagamentos (`backend/services/payment_sheet.py`)

- `GET /projects/{id}/finance/payments.xlsx`, só **admin e financeiro**. Arquivo `pagamentos-projeto-{id}-{aaaa-mm-dd}.xlsx` (data de São Paulo), aba "A pagar".
- **Filtro:** entrevistas do projeto `completed`, com `earnedValue`, **sem baixa**. Uma linha por pessoa, ordenada por nome.

| Coluna | Conteúdo |
|---|---|
| Nome | `User.name` (texto) |
| Tipo de chave Pix | CPF, CNPJ, E-mail, Celular, Chave aleatória (texto) |
| Chave Pix | **completa**, decifrada de `User.pixKeyEncrypted` (texto) |
| Entrevistas a pagar | quantidade |
| Valor a pagar (R$) | soma de `earnedValue`, formato `#,##0.00` |
| Primeira / Última entrevista | datas de lançamento (São Paulo), `DD/MM/YYYY` |
| Previsão de pagamento | da **primeira** entrevista a pagar da pessoa: lançamento + prazo atual |
| Projeto | `PRJ-{id} {título}` (texto) |

- Linha "Total" no fim (quantidade e valor). Sem nada a pagar: baixa só o cabeçalho.
- **Sem CPF**: o CPF só existe como hash de mão única. Se a chave é do tipo CPF, o número aparece na própria chave.
- **Injeção de fórmula:** Nome, Tipo, Chave e Projeto são gravados com `cell.data_type = "s"` (texto literal). Não usa o prefixo `'` para a chave de celular (`+55…`) continuar copiável. Teste: nome `=1+1` e título `=HYPERLINK(...)` saem como texto.
- **Auditoria:** uma linha em `export_logs` (`export_type="payment_sheet"`, `filters={"project_id": …}`, `row_count`) por download e uma linha em `pii_access_logs` (`fields=["pixKey"]`) por chave de **outra** pessoa decifrada (não loga a própria nem chave vazia).
- Valores saem como `float` só na célula do Excel; a conta é em `Decimal`.

## 8. Notificações financeiras

| Tipo | Quando | Para quem | Texto (título) | Código |
|---|---|---|---|---|
| `budget_threshold` | lançamento cruza 80% ou chega a 100% (só o maior limiar cruzado, sem repetir na faixa) | admin, supervisores, financeiro | "{projeto} passou de 80% do orçamento" / "{projeto} chegou a 100% do orçamento" | `notify_after_launch` |
| `payment_pending` | todo lançamento com valor > 0 | admin e financeiro, **menos quem lançou** | "R$ X lançados a pagar em {projeto}" | `notify_after_launch` |
| `budget_changed` | orçamento criado/alterado | admin, supervisores, financeiro, menos quem alterou | "Orçamento alterado em {projeto}", corpo "R$ X → R$ Y" | `_record_budget_change` |
| `payment_due` | rotina diária: previsão até hoje + 3 dias ou vencida; **um aviso por projeto por dia** (data no título) | admin e financeiro | "Pagamento vencendo em {projeto} (dd/mm)" / "Pagamento atrasado em …" | `notify_payments_due` |
| `receipt_out_of_project` | lote fica `pronto` com fora do projeto ou chave não cadastrada | admin e supervisores (`staff_user_ids`) | "N comprovantes de pessoas fora do projeto {projeto}" | `_notify_out_of_project` |
| `payment_received` | baixa confirmada; um por entrevistador | o entrevistador (link `/ganhos`) | "Pagamento de R$ X em {projeto}" | `confirm_batch` |

- A rotina diária (`run_daily_notifications`) é idempotente: confere tipo + título (cortado como será salvo) antes de criar. Roda no máximo uma vez por dia por processo, na primeira consulta do contador de não lidas (`DAILY_NOTIFICATIONS_ENABLED`) ou via `scripts/run_daily_notifications.py` (com `force`).
- `notify(...)` não dá commit e nunca derruba a ação principal (erros vão para o log, sem dado pessoal).
- WhatsApp (Zenvia) é opcional por ação: só `payment_received` tem, modelo `pagamento_realizado` com variáveis `valor` ("1.234,56 reais", sem "$") e `projeto`.

## 9. O que vai para onde

Proposta coerente com as decisões do [01](01-visao-escopo-e-decisoes.md) (fronteira) e o contrato do [07](07-integracao-com-o-connect.md). O ponto que muda tudo: **hoje a baixa é uma transação só no mesmo banco**; separados, ela vira "Financeiro confirma → Connect grava a baixa com idempotência".

| Arquivo do Connect | Responsabilidade | Destino |
|---|---|---|
| `backend/services/receipt_parser.py` | leitura do PDF Itaú/Sispag | **Vai para o Financeiro** (copiar como está, atrás de uma interface `ReceiptParser`) |
| `backend/core/pix.py` | normalização da chave | **Copiar para os dois**, idêntico. Divergir quebra o casamento |
| `backend/core/security.py: hash_pix` | HMAC da chave | **Vira API (decisão aberta)**: ou o Financeiro manda a chave normalizada e o Connect casa, ou os dois compartilham `PIX_SECRET_KEY` (ver [02](02-arquitetura-e-stack.md)) |
| `backend/services/finance.py` (lote, partes, `_classify`, `reconcile`, `confirm_batch`, resumo) | conciliação e baixa | **Vai para o Financeiro**. `_classify` precisa de API "quem tem esta chave e se está aprovado no projeto"; `_unpaid_by_interviewer` usa o espelho de entrevistas; `confirm_batch` chama a API de baixa do Connect |
| `backend/models/payment_receipt.py` | lotes, partes, comprovantes | **Vai para o Financeiro** (com o índice parcial de e2eId) |
| `backend/api/finance.py` | rotas | **Vai para o Financeiro**, sem o papel supervisor (decisão do 01) |
| `backend/services/payment_sheet.py` | planilha | **Vai para o Financeiro**; a chave Pix completa vem do Connect sob demanda, por rota com escopo e `pii_access_logs` **no Connect** |
| `backend/models/interview.py` (`payment_receipt_id`, `paidAt`) | status pago | **Fica no Connect**. A FK para `payment_receipts` vira referência externa (id/e2eId do Financeiro, sem FK) |
| `backend/services/interview.py` | lançamento, trava, 409 de orçamento | **Fica no Connect** |
| `backend/services/project.py` (`ensure_budget_available`, `set_project_budget`, `get_budget_used`) e `models/budget_change_log.py` | orçamento | **Fica no Connect** (a checagem precisa da mesma transação do lançamento). O Financeiro edita via `PATCH /projects/{id}/budget` por API |
| `backend/services/earnings.py`, `frontend/src/components/PaymentStatus.tsx`, `/ganhos` | "Pago em", previsão | **Fica no Connect** |
| `backend/services/finance_notifications.py` | avisos | `budget_threshold`, `budget_changed`, `payment_received` **ficam no Connect**; `payment_pending`, `payment_due` e `receipt_out_of_project` **vão para o Financeiro** (alimentados por evento do Connect) |
| `backend/core/text.py` (`launch_date`, `expected_payment_date`, `format_brl`) | fuso e moeda | **Copiar para os dois** (mesmo relógio de São Paulo) |
| `backend/models/export_log.py`, `pii_access_log.py` | auditoria | **Cada sistema tem a sua** |
| `backend/core/crypto.py` | AES-256-GCM | **Copiar** (o Financeiro cifra `payeeNameEncrypted` com chave própria) |
| `backend/scripts/rehash_pix_keys.py` | realinhar hashes | **Fica no Connect** |
| `frontend/src/app/admin/projetos/[id]/financeiro/page.tsx` (`splitPdf`, abas, confirmação) | tela | **Vai para o Financeiro**; no Connect fica só o resumo de valores para o supervisor |
| `frontend/e2e/receipts.ts`, `financeiro.spec.ts` | PDF sintético e jornada | **Vai para o Financeiro** |

## 10. Invariantes que não podem quebrar

Cada uma tem teste no Connect. No sistema novo, cada uma precisa de teste próprio **dos dois lados** quando cruza a API.

1. **Pagamento único por Pix:** índice único parcial em `e2eId` onde `status = 'pago'`. Um lote só conferido não trava o mesmo PDF em outro lote. No sistema novo, o e2eId também é a `Idempotency-Key` natural da baixa.
2. **Baixa nunca cria entrevista** e nunca paga entrevista já paga. Separados: o Connect recusa (409) baixa de entrevista já paga ou inexistente, sem efeito parcial.
3. **Confirmação atômica**, com trava. Hoje: `with_for_update` no projeto. Separados: transação no Financeiro + baixa idempotente e "tudo ou nada" no Connect.
4. **O arquivo nunca é persistido** enquanto o DPO não definir retenção.
5. **O bloco do pagador nunca vira recebedor** (o CNPJ da Pesquise+ está lá).
6. **Orçamento:** checado antes de criar entrevista, com o projeto travado, sem override.
7. **Hash Pix sempre sobre a chave normalizada.** Nunca comparar string crua.
8. **Dinheiro em `Decimal`**, datas de negócio no fuso de São Paulo.
9. **Chave Pix completa só na planilha**, auditada; CPF nunca.
10. **Nenhum dado pessoal no log** (chave, nome do comprovante, texto do PDF).

## 11. Casos de borda com teste

Não existem `test_receipt_parser.py`, `test_payment_sheet*.py` nem `test_verif_orcamento.py` separados: o parser está em `test_receipts.py` e `test_verif_financeiro.py`, a planilha em `test_verif_financeiro.py` e `test_semana1.py`, e o orçamento em `test_verif_orcamento_notificacoes.py`.

| Caso | Teste (`backend/tests/`) |
|---|---|
| Bloco do recebedor; e-mail "gmail com" corrigido | `test_receipts.py::test_parses_payee_block_and_fixes_email_dot` |
| CNPJ do pagador nunca vira chave | `test_receipts.py::test_payer_cnpj_is_never_read_as_payee_key` |
| Vários por página + `page_offset` | `test_receipts.py::test_several_receipts_per_page_and_page_offset` |
| Arquivo que não é PDF | `test_receipts.py::test_extract_rejects_non_pdf` |
| Os 5 grupos + alerta fora do projeto + nada em claro guardado | `test_receipts.py::test_groups_receipts_and_warns_about_people_outside_project` |
| Confirmar paga, não repete; mesmo Pix em lote novo = duplicado | `test_receipts.py::test_confirm_marks_interviews_paid_and_is_not_repeatable` |
| Pago a mais não paga | `test_receipts.py::test_paid_more_than_launched_is_flagged_not_paid` |
| Reenvio de parte idempotente; confirmar espera todas | `test_receipts.py::test_resending_a_part_is_idempotent_and_confirm_waits_for_all_parts` |
| Lote só conferido em outro projeto não trava o PDF | `test_receipts.py::test_unconfirmed_batch_elsewhere_does_not_block_same_pdf` |
| 401 sem token; entrevistador 403 em tudo; admin e financeiro fazem o fluxo | `test_verif_financeiro.py::test_finance_endpoints_require_authentication`, `test_interviewer_is_blocked_from_every_finance_endpoint`, `test_admin_and_financeiro_run_the_whole_receipt_flow` |
| Lote de outro projeto = 404 em todas as rotas | `test_verif_financeiro.py::test_batch_from_another_project_is_404_everywhere` |
| Parte fora do intervalo, `page_offset` inválido, parte > 25 MB | `test_part_index_outside_batch_is_422`, `test_negative_page_offset_is_422`, `test_page_offset_above_limit_is_422_before_reaching_the_database`, `test_part_too_big_is_413_and_nothing_is_read` |
| Leitura fora do event loop | `test_part_is_processed_outside_the_event_loop` |
| Parte ilegível não derruba o lote | `test_unreadable_part_is_recorded_without_breaking_the_batch` |
| Cancelar/descartar com lote velho não desfaz a confirmação | `test_cancel_or_discard_with_stale_batch_does_not_undo_confirmation` |
| Ordem por data do Pix; não-fecha não consome a fila | `test_receipts_are_reconciled_by_payment_date_not_page`, `test_non_matching_receipt_does_not_consume_the_queue` |
| Só conta lançada, sem baixa, deste projeto | `test_only_launched_unpaid_interviews_of_this_project_count` |
| Descartar e restaurar volta a bater | `test_discard_and_restore_receipt_brings_back_the_match` |
| Mesmo e2eId duas vezes no lote paga uma vez | `test_same_transaction_twice_in_one_batch_pays_once` |
| Pago em outro lote enquanto este esperava | `test_pending_receipt_paid_in_another_batch_meanwhile_is_not_paid_again` |
| Fora do projeto e chave desconhecida nunca pagos; "nunca se candidatou" | `test_out_of_project_and_unknown_keys_are_never_paid`, `test_interviewer_who_never_applied_is_flagged` |
| Um aviso por entrevistador; registra quem confirmou | `test_confirm_notifies_each_paid_interviewer_once_and_records_who_confirmed` |
| Tela nunca expõe chave completa nem nome de quem é conhecido | `test_review_screen_never_exposes_full_pix_key_or_payee_name_of_known_people` |
| Máscara | `test_verif_financeiro.py::test_mask_pix_key` |
| Resumo sem orçamento e de projeto vazio | `test_summary_without_budget_and_per_interviewer_breakdown`, `test_summary_of_empty_project` |
| Planilha: exclui pagos, agrupa, loga cada chave; vazia; não loga a própria | `test_payment_sheet_excludes_paid_groups_by_person_and_logs_each_key`, `test_payment_sheet_of_project_without_pending_payments_is_just_the_header`, `test_payment_sheet_does_not_log_access_to_own_key_or_missing_key` |
| Planilha com Pix completo, sem CPF, auditada; supervisor 403; sem fórmula | `test_semana1.py::test_payment_sheet_lists_unpaid_with_full_pix_and_is_audited`, `test_supervisor_cannot_download_payment_sheet`, `test_payment_sheet_never_writes_formulas` |
| Parser: sem título, sem bloco do recebedor, valor sem centavos, valor grande e data inválida, ID vazio, autenticação vazia | `test_verif_financeiro.py::test_receipt_without_title_…`, `test_receipt_without_payee_block_is_unreadable`, `test_amount_without_cents_is_unreadable`, `test_large_amount_and_invalid_date`, `test_missing_transaction_id_is_an_error_not_the_next_label`, `test_missing_auth_code_is_empty_not_the_next_label` |
| Normalização, hash igual, duplicidade no cadastro, rehash, CNPJ, fixo com DDI | `test_pix_normalization.py` (5 testes), `test_verif_financeiro.py::test_landline_with_country_code_normalizes_like_with_plus` |
| Orçamento: fecha exato passa; 0 bloqueia; reduzido abaixo do usado = "restam R$ 0,00" | `test_verif_orcamento_notificacoes.py::test_launch_that_exactly_fills_budget_is_allowed`, `test_zero_budget_blocks_any_launch`, `test_budget_lowered_below_used_reports_zero_available_not_negative` |
| Paga não é apagada; ajustar total não apaga pagas | `test_delete_paid_interview_is_refused`, `test_set_count_decrease_never_deletes_paid_interviews` |
| 80%/100% sem repetir; `payment_pending` exclui quem lançou | `test_single_launch_from_zero_to_full_budget_sends_only_100_percent`, `test_threshold_is_not_repeated_on_later_launches_within_same_band`, `test_payment_pending_excludes_actor_but_budget_threshold_does_not` |
| Vencimento: janela de 3 dias, atrasado, um por projeto, idempotente | `test_payments_due_window_boundary`, `test_payments_due_overdue_title_and_aggregated_total`, `test_payments_due_one_notice_per_project`, `test_payments_due_idempotent_for_long_project_title` |
| Previsão usa o prazo atual do projeto | `test_project_payment_term.py` (ex.: `test_my_earnings_history_uses_project_term`) |
| E2E: grupos, alerta, Confirmar baixa, "Pago em"; planilha | `frontend/e2e/financeiro.spec.ts` |

**Sem teste hoje (risco a cobrir no sistema novo):** um comprovante que começa na última página de uma parte e termina na primeira da seguinte. O leitor corta por título dentro de cada parte, então esse comprovante tende a virar `erro_leitura` (falta o ID) e a continuação é ignorada. No layout atual do Itaú isso não aparece, mas um teste deveria fixar o comportamento.

## 12. Perguntas abertas

| Pergunta | Quem decide | Hoje |
|---|---|---|
| Entrevistador vê ou baixa o próprio comprovante? | Vivi + jurídico | Não; só "Pago em dd/mm" |
| Retenção dos dados de comprovantes | DPO | Nada é apagado automaticamente; lote cancelado é apagado na hora |
| Aval do DPO sobre a planilha com chave Pix completa | DPO | Implementada com auditoria |
| Resumo de pagamentos para o Financeiro: diário ou semanal? | Financeiro | Aviso diário (vencendo em até 3 dias ou atrasado) |
| ROPA/RIPD com a operação "conciliação de pagamentos por comprovante" | DPO | Pendente |
| Baixar em outro projeto um comprovante "fora do projeto" | PO | Não existe; fica como alerta |
| Outros bancos e comprovante em imagem (OCR) | PO | Só Itaú/Sispag em PDF com texto |
| Como casar a chave sem copiar a chave Pix | — | **Decidido:** o Connect casa pela rota `pix-key-matches`; nenhuma chave secreta é compartilhada (ver [07](07-integracao-com-o-connect.md)) |
| Auditoria de upload e confirmação de lote | técnico | Ainda não entram na linha do tempo de auditoria do Connect |

## Checklist

- [ ] Sei explicar com as minhas palavras: lote, parte, e2eId, baixa, bate, divergente, fora do projeto, chave não cadastrada, duplicado, a pagar, prazo e previsão.
- [ ] Refiz à mão o exemplo 1 da conciliação e cheguei em `nao_fecha, bate, bate, pago_a_mais`.
- [ ] O `receipt_parser.py` e o `core/pix.py` foram copiados sem mudança de regra, com os testes de parser e de normalização passando no repositório novo.
- [ ] As fixtures de comprovante são texto fictício (como `receipt_text`) ou PDF gerado na hora (como `e2e/receipts.ts`); nenhum PDF real no repositório.
- [ ] Cada invariante da seção 10 tem teste no sistema novo, incluindo o lado do Connect quando cruza a API.
- [ ] A baixa no Connect é idempotente (e2eId), tudo ou nada e recusa entrevista já paga.
- [ ] A planilha continua sem CPF, com células de texto e com `export_logs` + `pii_access_logs`.
- [ ] Os casos negados da seção 3 têm teste com HTTP e mensagem exata.
- [ ] As perguntas da seção 12 estão em `docs/planning/perguntas-abertas.md` do repositório novo.
