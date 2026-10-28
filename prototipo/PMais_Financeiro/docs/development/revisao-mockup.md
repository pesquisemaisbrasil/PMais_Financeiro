# Revisão do mockup interativo

**Data:** 25/10/2026  
**Escopo:** inspeção somente leitura de `client/src/pages/demo`, `DemoStore`, modelo/validação, CSS e testes já existentes, contra `plan.md:15-23` e `TODO.md:7-18`. Não houve browser, nova bateria de aceitação, escrita no banco, migration, upload, API externa ou alteração de código. O output informado para esta versão (`pnpm check` e 58 testes em 5 arquivos, incluindo 11 do demo) foi reutilizado; não foi reexecutado.

## Parecer curto

O caminho normal está coerente de UI → estado local → título/provisão/lote/folha → `bankTransaction` → relatórios. Os testes existentes cobrem a criação de liquidação, sincronização de entrevistadores/folha, provisão substituída, duplicidade de seleção, pendência documental e fechamento/reabertura. Os achados abaixo são de interatividade/consistência do mockup, não de produção: o servidor financeiro continuar indisponível, não haver DB/sessão/Connect e os dados permanecerem sintéticos são decisões deliberadas.

## Atualização posterior do agente principal

Os cinco achados abaixo foram corrigidos após esta revisão: filtro de categoria no M7 e erro de período; guardas de datas/períodos no store e reducer; links da folha para `/demo/contas` e `/demo/conciliacao`; estilos efetivos em `demo-enhancements.css`; e unicidade global de liquidação/transação no validador. Foram rechecados tipos, build, testes dirigidos de transição/estado e renderização. Não houve nova revisão independente ou bateria completa de aceitação; a evidência posterior está em `validacao-mockup.md`. Os textos e números de linha abaixo registram o achado inicial e podem ter mudado com as correções.

## Achados concretos da revisão inicial

### 1. M7 não oferece o filtro de categoria exigido — prioridade alta

- **Evidência:** `client/src/pages/demo/DemoReportsPage.tsx:189-194` mantém somente visão, período, datas e `projectId`; `:201-204` implementa `matchesProject` e `matchesDate`, sem `categoryId`; `:451-475` renderiza período/data/projeto, sem seletor de categoria.
- **Impacto:** todas as seis visões e o CSV calculam totais coerentes para os filtros presentes, mas não permitem o recorte por categoria previsto em `TODO.md:17`. A ausência não é apenas visual: nenhuma linha é filtrada por `title.categoryId` ou `provision.categoryId`.
- **Recomendação confirmada:** adicionar estado/controle de categoria e aplicar o mesmo predicado aos títulos, provisões, liquidações, resultado, aging, conciliação por origem e folhas; refletir o filtro no resumo, mensagem de consulta e exportação.

### 2. Fechamento de período não é uma barreira uniforme no estado — prioridade alta

A UI de conciliação bloqueia as ações de linha em período fechado (`DemoReconciliationPage.tsx:151-154` e `:174-178`), mas o store permite caminhos monetários que usam outra data para a mesma operação:

- `DemoStore.tsx:284-291` converte uma provisão verificando somente `provision.dueDate`; o título criado usa `issueDate`/`competenceDate` de hoje (`:289-290`). Uma provisão futura pode, portanto, virar título com competência no mês já fechado.
- `DemoStore.tsx:298-310` cria lote de entrevistadores verificando somente o vencimento do lote (`:303`), embora o título receba emissão/competência de hoje (`:309`).
- `DemoStore.tsx:338-349` aprova folha verificando somente `sheet.date` (`:341`), embora o título receba emissão/competência de hoje (`:348`).
- Os reducers correspondentes (`DemoStore.tsx:111-115`, `:117-123` e `:140-144`) também não revalidam o período; dependem do helper/UI.
- `reconcileTransaction` e `markTransactionException` (`DemoStore.tsx:363-371`) não verificam período fechado no helper, e `RECONCILE`/`EXCEPTION` (`:165-166`) não verificam no reducer. Hoje a tela impede o uso normal, mas o callback de estado fica bypassável por estado obsoleto ou outro chamador do `createDemoStore`.

**Recomendação confirmada:** centralizar uma checagem de período fechado no limite do store/reducer, usando todas as datas que a ação cria ou altera; retornar erro para chamadas bloqueadas em vez de depender apenas da tela. Não classifiquei `window.confirm`, centro de custo ou pendência documental como achados, conforme o escopo em conexão informado.

### 3. Atalhos da folha saem do mockup interativo — prioridade média

- **Evidência:** `DemoPayrollPage.tsx:215-219` aponta “M3 Contas a pagar” e “M6 Conciliação” para `/modulos/contas` e `/modulos/conciliacao`; `:511-514` aponta o título criado para `/modulos/contas`.
- **Confirmação de destino:** `App.tsx:31` e `:34` registram as telas interativas em `/demo/contas` e `/demo/conciliacao`, enquanto `App.tsx:37-38` envia `/modulos/:id` ao `ModuleGuide`; o guia informa “sem operação disponível” (`ModuleGuide.tsx:31-34`).
- **Impacto:** depois de aprovar uma folha ou pagar demonstrativamente, o usuário não chega ao título/linha bancária recém-criados por esses atalhos; é levado à documentação somente leitura. Isso quebra a demonstração de interdependência M5 → M3/M6, apesar de o estado compartilhado estar correto.
- **Recomendação confirmada:** trocar esses três destinos para `/demo/contas` e `/demo/conciliacao`.

### 4. As tabelas de relatório usam classes sem CSS efetivo — prioridade média

- **Evidência:** `DemoReportsPage.tsx:172-177` aplica `table-scroll` e `data-table`. Busca no CSS do cliente não encontra definições dessas classes. As regras que existem são para `demo.css:45-51`, com `demo-table-wrap`/`demo-table` (`width:100%`, `overflow-x:auto`, bordas e colapso).
- **Impacto:** a tabela M7 não recebe o alvo de largura nem a rolagem horizontal do restante do mockup; em colunas longas pode exceder o painel/viewport e fica com aparência de tabela padrão. O relatório ainda renderiza linhas e valores, mas a responsividade/legibilidade declarada não é aplicada.
- **Recomendação confirmada:** alinhar `ReportTable` a `demo-table-wrap`/`demo-table` ou criar regras equivalentes para `table-scroll`/`data-table`, incluindo `width:100%` e `overflow-x:auto`.

Há outros modificadores usados sem regra própria: `demo-alert*` em `DemoBudgetPage.tsx:400-447`, `demo-form-inline` em `:554-585`, e `demo-button-secondary`/`demo-button-danger`/`demo-button-quiet` em contas/folha. As regras base (`.demo-grid`, `.demo-form`, `.demo-button`) ainda se aplicam, mas os modificadores não alteram aparência; por exemplo, o alerta de consumo e a ação de cancelamento não recebem o tratamento visual pretendido. Isso é CSS ausente, não falha de cálculo.

### 5. Validação de estado local aceita referência duplicada de liquidação — prioridade média, fora do fluxo normal

- **Evidência:** `demoValidation.ts:41-43` garante unicidade somente dos IDs dos arrays de primeiro nível; não garante unicidade de `settlement.id` dentro dos títulos nem de `bankTransactionId` entre liquidações. Em `:52-55`, cada liquidação apenas procura uma transação correspondente; duas liquidações podem apontar para a mesma linha e ainda satisfazer essa verificação.
- **Efeito derivado:** `DemoReportsPage.tsx:217-224` faz `flatMap` de todas as liquidações; um estado persistido assim exibiria a mesma linha no realizado mais de uma vez (inclusive com chave React repetida) e inflaria o total filtrado.
- **Limitação importante:** não encontrei caminho normal da UI que gere essa duplicidade. `appendSettlement` cria IDs novos (`DemoStore.tsx:43-61`), exige saldo pendente e, para interviewer/field, soma exata; os testes existentes cobrem segunda tentativa de lote (`server/demo.test.ts:65-75`) e liquidação após saldo zerado (`:32-40`). O achado é uma lacuna real de validação contra estado local corrompido/manipulado, não alegação de duplicação na operação normal.
- **Recomendação confirmada:** validar unicidade global de `settlement.id`/`bankTransactionId` e exigir relação um-para-um antes de aceitar o estado carregado; manter as guardas de saldo/status existentes.

## Conferência dos fluxos compartilhados

- **Contas (M3):** `DemoAccountsPage.tsx:199-245` filtra títulos por busca, direção, status e projeto; os totais somam `settledCents` e `pendingCents` das mesmas linhas. `:317-327` cria título local; `:409-423` chama `settleTitle`. No store, `appendSettlement` grava settlement e `bankTransaction` vinculados (`DemoStore.tsx:43-64`).
- **Provisão (M4):** `DemoBudgetPage.tsx:184-203` calcula previsto somente para provisões `prevista`, comprometido por `pendingCents` e realizado por `settledCents`; `DemoStore.tsx:111-116` evita contar provisão convertida duas vezes. A exceção é o bypass de período descrito no achado 2.
- **Entrevistadores (M1):** `DemoPaymentsPage.tsx:102-120` seleciona itens do mesmo projeto e mostra a soma exata; `DemoStore.tsx:117-128` cria título e marca itens `em_lote`, e a liquidação completa cria uma linha bancária e marca os itens `paga_simulada`.
- **Folha (M5):** `DemoPayrollPage.tsx:171-205` cria/aprova/paga a folha. `DemoStore.tsx:131-154` marca itens `em_lote`, cria título na aprovação e, na liquidação, sincroniza folha/itens para `paga_simulada` e cria a transação. O teste existente confirma essa sequência (`server/demo.test.ts:77-88`).
- **Conciliação (M6):** `DemoReconciliationPage.tsx:121-141` filtra por mês/estado; `:151-202` classifica ou registra exceção sem dupla conciliação; `:204-240` fecha/reabre localmente. As linhas vêm exclusivamente de `bankTransactions` geradas pelo store.
- **Relatórios (M7):** as linhas são derivadas do mesmo estado. Não há divergência observada entre linhas e totais para os filtros disponíveis; a deficiência é a dimensão de categoria ausente e o CSS da tabela.

## Auditoria de dinheiro, datas, filtros e totais do M7

| Visão | Data usada nas linhas | Fonte/valor somado | Resultado da comparação |
|---|---|---|---|
| Pagar/receber | `title.dueDate` (`DemoReportsPage.tsx:206-215`) | valor total, liquidado e pendente (`:308-310`); tabela mostra os três (`:523-532`) | Coerente para as linhas filtradas. |
| Realizado | `settlement.date` (`:217-224`) | cada settlement (`:311-312`); tabela mostra cada baixa (`:546-553`) | Coerente e separa liquidações parciais. |
| Previsto | vencimento de título pendente e de provisão `prevista` (`:226-251`) | valor pendente/provisionado (`:313-314`); tabela mostra as mesmas linhas (`:566-574`) | Coerente; provisão substituída não entra novamente. |
| Resultado por projeto | `title.competenceDate` (`:253-271`) | valor integral por direção (`:315-316`); tabela mostra receita, despesa e resultado (`:588-595`) | Coerente com competência, não com baixa. |
| Aging | título filtrado por vencimento; faixa calculada em relação a hoje (`:273-291`) | apenas pendentes (`:317-318`); tabela mostra pagar/receber/saldo (`:608-614`) | Totais coerentes; a faixa é explicitamente “em relação a hoje”, inclusive quando o período consultado é histórico. |
| Conciliação pendente | `transaction.date` (`:293-300`) | valor de cada movimento não conciliado ou com exceção (`:319-320`); tabela mostra cada movimento (`:629-635`) | Coerente com o conjunto exibido. |

O período personalizado não valida `De <= Até`; quando invertido, a consulta apenas fica vazia. Isso não produz total incorreto, mas merece mensagem de validação se a interação for ampliada. A ausência de categoria continua sendo a falha de filtro relevante para o TODO.

## Limites e recomendações finais

Este relatório avalia interatividade local, derivação de valores e aplicação de CSS; não certifica domínio contábil, segurança, persistência corporativa, integração, acessibilidade por leitor de tela ou produção. `plan.md:17-23` e `ADR-002-mockup-interativo.md:10-18` deixam explícito que os registros são sintéticos, ficam no browser e não provam operação financeira.

Recomendações em ordem: (1) bloquear no store/reducer todas as mutações que criem/alterem registros em períodos fechados; (2) implementar o filtro de categoria do M7 e manter seus totais/exportação no mesmo predicado; (3) corrigir os três links da folha para as rotas `/demo`; (4) aplicar CSS real às tabelas e aos modificadores de layout/estado; (5) endurecer a validação um-para-um de settlements e linhas bancárias. Nenhuma delas exige DB, sessão, Connect, upload ou endpoint financeiro.
