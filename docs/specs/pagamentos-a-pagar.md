# Spec: Pagamentos a pagar

Contrato do espelho de itens a pagar, do resumo financeiro do projeto, da planilha de pagamentos e dos avisos de pagamento. A referência é o comportamento atual do Connect ([handoff/08 §1, §7, §8](../handoff/08-dominio-e-codigo-atual.md)).

## Comportamento

- **Lista de projetos** (`/financeiro`): projetos do Connect com item a pagar ou baixa nos últimos 30 dias, com lançado, pago, a pagar, orçamento e saldo.
- **Resumo do projeto** (`GET /projects/{projectId}/finance/summary`):
  - orçamento, lançado, pago, a pagar e saldo;
  - total e quebra por entrevistador, com nome e chave **mascarada** vindos do Connect (`interviewers:read`).
  - `projectId` é o id do projeto no Connect.
- **Espelho** (`payable_items`): uma linha por entrevista com valor, alimentada pelos eventos e pela sincronização ([integracao-com-o-connect](integracao-com-o-connect.md)). Guarda só ids, valor, datas e status; sem nome e sem chave.
- **Planilha de pagamentos** (`GET /projects/{projectId}/finance/payments.xlsx`, papel `financeiro` ou `admin` com `download_payment_sheet`, depois da reautenticação MFA):
  - arquivo `pagamentos-projeto-{id}-{aaaa-mm-dd}.xlsx`, aba "A pagar";
  - uma linha por pessoa com item `a_pagar`, ordenada por nome;
  - colunas: Nome, Tipo de chave Pix, Chave Pix (completa), Entrevistas a pagar, Valor a pagar (R$), Primeira e Última entrevista, Previsão de pagamento (da primeira entrevista a pagar) e Projeto (`PRJ-{id} {título}`);
  - linha Total no fim;
  - nome e chave completa vêm do Connect na hora (`POST /interviewers/payment-data`, `purpose=payment_sheet`), só em memória.
- **Marca "chave alterada":** se chegar `interviewer.pix_changed` depois de a planilha ser gerada, a planilha é marcada e a pessoa aparece com o aviso "Chave Pix alterada depois da planilha — gere de novo antes de pagar".
- **Avisos** (no Financeiro; os outros avisos ficam no Connect):

| Tipo | Quando | Para quem | Título |
|---|---|---|---|
| `payment_pending` | evento `interviews.launched` com valor > 0 | admin e financeiro | "R$ X lançados a pagar em {projeto}" |
| `payment_due` | rotina diária: previsão até hoje + 3 dias, ou vencida; um aviso por projeto por dia | admin e financeiro | "Pagamento vencendo em {projeto} (dd/mm)" / "Pagamento atrasado em {projeto} (dd/mm)" |

## Regras

1. **A pagar** = item `a_pagar` no espelho (no Connect: entrevista `completed`, com `earnedValue`, sem baixa).
2. O valor é o `earnedValue` congelado no Connect. O Financeiro nunca recalcula valor.
3. A **previsão** (`dueOn`) vem calculada do Connect (lançamento em São Paulo + prazo **atual** do projeto). Mudou o prazo (`project.changed`), o Financeiro relê.
4. O orçamento, o lançado e o saldo vêm de `GET /projects/{id}/budget` do Connect. **O Financeiro não altera orçamento.**
5. Planilha:
   - **sem CPF**;
   - Nome, Tipo, Chave e Projeto gravados como texto literal (sem injeção de fórmula, e o `+55…` continua copiável);
   - a conta é feita em `Decimal`;
   - sem nada a pagar, baixa só o cabeçalho.
6. Auditoria da planilha:
   - uma linha em `export_logs` (`payment_sheet`, `filters={"projectId"}`, `rowCount`) por download;
   - uma linha em `pii_access_logs` por chave completa recebida (`purpose=payment_sheet`);
   - o Connect grava a sua própria `pii_access_logs` por pessoa.
7. A chave completa nunca é gravada no Financeiro (nem banco, nem log, nem cache).
8. Item com `status: removed` no Connect vira `cancelado` no espelho e sai da planilha. Se já estava numa planilha gerada, aparece aviso.
9. Rotina diária idempotente (confere tipo + título antes de criar).

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Sem token | 401 | (padrão do login) |
| Usuário sem `download_payment_sheet` baixa a planilha | 403 | Só o Financeiro pode baixar a planilha de pagamentos |
| Projeto que o Connect não conhece | 404 | Projeto não encontrado |
| Connect fora do ar ao gerar a planilha | 503 | O P+ Connect não respondeu — tente de novo em alguns minutos |
| Limite diário de chaves completas atingido no Connect | 429 | Limite diário de consultas de chave Pix atingido — fale com o administrador |

## Critérios de aceite

- [ ] Um projeto com 3 pessoas a pagar gera uma planilha com 3 linhas, chave completa, sem coluna de CPF e com total no fim.
- [ ] Nome "=1+1" e título "=HYPERLINK(...)" saem como texto no Excel.
- [ ] Cada download gera 1 `export_logs` e 1 `pii_access_logs` por chave, no Financeiro, e a linha correspondente no Connect.
- [ ] Projeto sem nada a pagar baixa só o cabeçalho.
- [ ] Trocar a chave Pix no Connect depois de gerar a planilha marca a pessoa com "Chave Pix alterada".
- [ ] Mudar o prazo do projeto no Connect de 30 para 15 dias muda a previsão no resumo e na planilha.
- [ ] Entrevista apagada no Connect some da lista a pagar.
- [ ] A janela de 3 dias do `payment_due`, o "atrasado" e o aviso único por projeto por dia têm teste.

## Onde está no código

- Destino: `backend/api/payments.py`, `backend/services/payment_sheet.py`, `backend/services/payables.py`, `backend/models/payable_item.py`, `backend/models/project_ref.py`, `backend/services/finance_notifications.py`
- Frontend: `frontend/src/app/financeiro/page.tsx`, `frontend/src/app/financeiro/projetos/[id]/page.tsx`
- Testes: `backend/tests/test_payment_sheet.py`, `test_payables_sync.py`, `test_finance_notifications.py`
- Referência no Connect: `services/payment_sheet.py`, `services/finance.py` (resumo), `services/finance_notifications.py`; testes `test_verif_financeiro.py`, `test_semana1.py`, `test_verif_orcamento_notificacoes.py`
