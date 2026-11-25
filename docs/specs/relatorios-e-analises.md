# Spec: Relatórios e análises

> **Módulo 7 — Relatórios e fluxo de caixa.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato das consultas, das análises gerenciais e da exportação. Primeiro: consultas a pagar/receber, resultado por projeto e relatório de folha. Depois: fluxo de caixa, DRE, fluxo mensal e recebimentos de projeto × ano.

## Comportamento

| Relatório | Ordem | O que mostra |
|---|---|---|
| Lançamentos a pagar | 1 | Filtros por programação, empresa, fornecedor, projeto e centro de custo, com intervalo de datas. Colunas: programação, pagamento, fornecedor, plano de contas, valor líquido, pago, pendente, projeto, unidade, centro de custo, empresa, conta, situação e descrição [SGE4B §5.6] |
| Lançamentos a receber | 1 | O mesmo, com cliente |
| Relatório do projeto | 1 | Por projeto, para fechar relatório: orçamento, lançado, pago, a pagar, saldo e **anexos de todos os lançamentos** de Contas a pagar (planilhas, comprovantes, notas), com link para cada lançamento. Abre pelo código do projeto na lista de Contas a pagar. Não é onde se paga [Kickoff 03/11 12:41–13:23] |
| Resultado por projeto | 1 | Por projeto: receita, custo por rubrica (planejado × realizado), margem, resultado, causa; filtros por área, gestora, cliente, mês de venda/execução, status e resultado |
| Causas de resultado negativo | 1 | Contagem e valor por causa, por período e por área (base para aprender o orçamento) |
| Folha e pagamentos de campo | 1 | Por ciclo, projeto e pessoa: quantidades, valores, exceções, pago e devolvido |
| Wallet consolidada | 1 | Todos os projetos em campo com semáforo, % consumido e projeção (painel da direção) |
| Fluxo de caixa | 1 | Diário/semanal/mensal: previsto (**provisões** do orçamento + títulos em aberto por vencimento) × realizado (baixas), saldo projetado por conta e consolidado. É o que a direção usa para saber quanto vai precisar em cada data. O do SGE4B "fica confuso" e é refeito à mão [Reunião 21/10 29:38–30:44, 47:49–48:25] |
| Extrato × despesas | 1 | Saída do extrato × baixas do sistema por dia e por mês, com a diferença explicada (voltas, pendências, não conciliado). Exportável: hoje essa tela não gera relatório [Reunião 21/10 17:01–20:36] |
| DRE | 2 | Por linha do DRE e período, competência; por empresa, unidade, projeto ou centro de custo |
| Fluxo mensal | 2 | Entradas e saídas por mês e por plano de contas, comparando meses |
| Recebimentos de projetos × ano | 2 | Recebido por projeto e por mês dentro do ano |
| Previsto × realizado | 2 | Por dimensão, orçado × realizado com desvio em R$ e % |

- Em todos: filtros combináveis, escolha de colunas, ordenação, agrupamento, totais e subtotais, **salvar filtro favorito** e indicadores clicáveis.
- Exportação **XLSX, CSV e PDF**. Impressão com cabeçalho dos filtros usados, data/hora e usuário.

## Regras

1. Totais do relatório = soma exata das linhas exibidas (mesma interseção de filtros).
2. DRE e "Resultado por projeto" usam **competência**. O fluxo de caixa e o relatório de contas pagas usam a **data de baixa** (realizado), nunca a data do lançamento; o previsto usa o vencimento. No SGE4B o relatório puxa pela data de lançamento e não bate com o extrato quando há volta [Reunião 21/10 17:01–17:40].
3. Períodos fechados ficam congelados. Um lançamento novo em período fechado é impossível ([bancos-e-conciliacao](bancos-e-conciliacao.md) regra 6).
4. O usuário só vê as linhas do seu escopo. Os totais não incluem o que está fora dele.
5. Exportação com nome de pessoa de campo grava `export_log`. Nenhum relatório exporta chave Pix completa ou CPF (só o lote faz isso).
6. Exportação: campos de texto saem como texto (evita injeção de fórmula), como no Connect.
7. Relatório pesado (> 50 mil linhas, a validar) roda em segundo plano e avisa quando estiver pronto.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Supervisor abre relatório financeiro geral | 403 | Seu perfil não permite essa ação |
| Período inicial maior que o final | 422 | A data inicial deve ser anterior à final |
| Exportação acima do limite síncrono | 202 | Relatório grande — avisaremos quando o arquivo estiver pronto |

## Critérios de aceite

- [ ] O filtro por empresa + unidade + projeto + centro de custo + linha do DRE traz exatamente a interseção, e os totais batem com a soma das linhas.
- [x] Na exportação, aparecem os filtros usados, os totais e os IDs dos títulos (serve para auditoria e migração).
- [x] O relatório do projeto 1804 mostra orçamento, lançado, pago, a pagar, saldo e os anexos de todos os seus lançamentos; clicar no código do projeto em Contas a pagar abre esse relatório.
- [ ] O resultado por projeto de um projeto fechado bate com o fechamento financeiro dele.
- [x] O DRE do mês bate com a soma das contas analíticas vinculadas a cada linha.
- [x] O fluxo de caixa previsto da próxima semana lista os títulos em aberto por vencimento, e o realizado as baixas.
- [ ] Um favorito salvo reabre com os mesmos filtros e colunas.

## Onde está no código

- Relatório do projeto: `backend/services/project_report.py`, `backend/api/project_reports.py` (`GET /reports/projects` e `GET /reports/projects/{código}`), `backend/schemas/project_report.py`, tela em `frontend/src/app/(app)/relatorios/projeto/page.tsx` (`/relatorios/projeto`, e `?codigo=` para um projeto). Testes: `backend/tests/test_project_report.py`, `frontend/e2e/relatorio-do-projeto.spec.ts`.
- Os demais relatórios: a criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Reunião 21/10 17:01–20:36, 47:49–48:25]: data de baixa, extrato × despesas, fluxo de caixa.
- [Kickoff 03/11 12:41–13:23]: relatório do projeto.


- [SGE4B §5.6, §6.3, §10 CT-07, CT-10].
- [S1 09:37–11:20; S2 01:15]: positivo/negativo e causas; [SWOT §8.1] métricas.

## Ajustes

- 2026-11-03: entra o **relatório do projeto** (orçamento, lançado, pago, a pagar, saldo e anexos de todos os lançamentos), que substitui a tela de pagamento por projeto ([kickoff com o financeiro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), K4).
- 2026-11-11 (**relatório do projeto entregue, para o piloto**): **Relatórios → Relatório do projeto** abre a lista dos projetos (com lançado, pago e a pagar de cada um) e, por projeto, o relatório: cartões de **orçamento**, **lançado**, **pago**, **a pagar**, **saldo do orçamento**, **gasto total** e **provisionado a pagar**; o aviso "Aqui não se paga"; a lista **Lançamentos de Contas a pagar** com **só a parte do projeto** em cada conta (valor, pago e pendente; a conta repartida entre projetos mostra a parte de cada um, e a diferença de centavos fica com o último), com o total no pé; as **provisões em aberto** à parte; e os **documentos de todos os lançamentos**, que baixam do próprio relatório (cada download fica no histórico da conta). O **código do projeto** na lista de Contas a pagar abre o relatório, e **Pagar em Contas a pagar** volta para a lista já filtrada pelo projeto. Regras: usa o **valor líquido** da conta (Q39); **conta cancelada, substituída ou excluída não é gasto** e fica de fora, nos totais e nas linhas (os totais são a soma exata das linhas); **provisão não é gasto** e não entra no lançado; só **admin e financeiro** abrem. O **orçamento** e o **saldo** ficam em "—" até o Financeiro ler o orçamento do Connect (Q40). Fora desta entrega: impressão, exportação, margem, e o resultado por projeto.
- 2026-11-17 (**busca no relatório do projeto**, testes de 16/11, A20, [registro de 16/11](../transcricoes/2026-11-16-testes-em-conjunto-com-o-financeiro.md)): a lista de projetos do relatório ganha a busca pelo **número ou nome** ("aqui só tem 2, mas daqui a pouco vai ter 2000"), sem acento e sem maiúscula. Cada projeto mostra tudo o que já foi lançado nele, de qualquer data: não há filtro de período a ajustar.
- 2026-11-25 (**número da conta na exportação**, PF-73): a planilha de Contas a pagar (Excel e CSV) ganha a coluna **Nº da conta** e a de Contas a receber a coluna **Nº do título**, no fim da linha, para auditoria e migração. Elas ficam por último para as outras colunas não mudarem de posição (a impressão e os totais continuam iguais), e não entram no total. Com isso, as listas de Contas a pagar e a receber cumprem o relatório de lançamentos da fase 1, menos o filtro por linha do DRE e os favoritos, que vão com o DRE (PF-76).
- 2026-11-25 (**DRE e Resultado por projeto**, decisões do Bruno, [registro de 25/11](../transcricoes/2026-11-25-decisoes-dos-relatorios.md)): o **DRE usa os grupos do plano de contas** importados do SGE4B, e cada grupo vira uma linha do DRE. O vínculo pode ser mudado em Cadastros, e a Vivi confere (fecha a parte do DRE da F3). O **Resultado por projeto espera** o Connect real (o planejado vem do orçamento) e a lista de causas do resultado negativo.
- 2026-11-25 (**fluxo de caixa**, PF-74): a tela **Relatórios → Fluxo de caixa** (`GET /reports/cash-flow`, só lê) mostra, por **dia, semana (de segunda a domingo) ou mês**, as **entradas e saídas previstas** e **realizadas** e o **saldo projetado** acumulado. Ela abre desta semana até 4 semanas depois, e o período vai até 3 anos e 400 períodos. Cada parte:
  - **Previsto:** o que ainda falta pagar ou receber dos títulos em aberto, pelo vencimento, com as **provisões** do Contas a pagar. A conta parcial entra pelo que falta.
  - **Realizado:** as baixas e os recebimentos que valem (sem estornados nem Pix devolvidos), pela data do dinheiro.
  - **Saldo:** parte do **saldo inicial das contas bancárias ativas que entram no fluxo de caixa** ("Entra no fluxo de caixa", de 24/11). O que a conta movimentou antes da data do saldo já está nele. A conta que começa dentro do período entra na data do saldo dela. A conta fora do fluxo (cartão, Caixinha) não entra no saldo nem no realizado.
  - **Atraso:** o que está em aberto e venceu **antes do período** aparece à parte (a receber e a pagar) e **já entra no saldo projetado**, para não sumir da conta.
  - **Por conta bancária:** só o realizado, porque o previsto não tem conta até a baixa.
  - **Ver:** abre os títulos e as baixas do período (`GET /reports/cash-flow/detail`), com o link para cada um.
  - **Exportar Excel** (`/reports/cash-flow/export`): os períodos, com o saldo inicial e o atraso na primeira linha. O saldo, que é acumulado, fica fora do total.

  A tela é bloqueável por pessoa (`fluxo-de-caixa`). Ainda **fora**: a transferência entre empresas (F15) não é eliminada no consolidado; não há filtro por empresa; e o consumo do orçamento lido do Connect não entra, porque as provisões são as do Financeiro.
- 2026-11-25 (**extrato × despesas exportável**, PF-74): a aba **Extrato × sistema** da Conferência bancária, que já comparava as saídas do extrato com as baixas por dia (PF-71), ganha **Exportar Excel** (`/bank-accounts/{id}/difference/export`): uma linha por dia (saídas do extrato, baixas do sistema e diferença), o total, e na primeira linha a conta, o mês e o que explica a diferença (saídas sem par, baixas sem linha e voltas).
- 2026-11-25 (**DRE**, PF-76, decisão do Bruno de usar os grupos): a tela **Relatórios → DRE** (`GET /reports/dre`, só lê) mostra **Receitas**, **Despesas** e **Resultado** (receitas menos despesas) por mês, de 1º de janeiro até hoje ao abrir, com até 24 meses. As regras:
  - **Linhas:** cada **grupo do plano de contas** é uma linha, na ordem do código do grupo, com as **contas analíticas** dele embaixo (botão Mostrar as contas). A conta sem grupo vai para "Sem grupo". O grupo que tem conta de receita e de despesa aparece uma vez em cada bloco. A linha é sempre a soma das contas dela.
  - **Competência:** a do título. A conta a pagar sem competência usa o mês da emissão.
  - **Valor:** o **principal** do título, sem os acréscimos, descontos e impostos. As linhas de dedução ficam para quando a Vivi definir o DRE completo.
  - **Fora:** cancelado, substituído, excluído e as **provisões**, que são estimativa.
  - **Filtros:** empresa, unidade, projeto e centro de custo. Com o projeto, a conta repartida entre projetos entra só com a **parte do projeto**. Exportar com um filtro de cadastro que não existe mais dá 422 "O filtro de ... não existe mais. Limpe e escolha de novo".
  - **Exportar Excel** (`/reports/dre/export`): as linhas, as contas e o resultado, com o período e os filtros na primeira linha e sem linha de total, porque as linhas já são subtotais umas das outras.

  A tela é bloqueável por pessoa (`dre`). **Falta da PF-76:** o fluxo mensal por plano de contas, os recebimentos de projetos × ano, o previsto × realizado (depende do orçamento) e o filtro favorito salvo.
