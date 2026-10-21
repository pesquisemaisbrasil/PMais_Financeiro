# Spec: Relatórios e análises

> **Módulo 7 — Relatórios e fluxo de caixa.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato das consultas, das análises gerenciais e da exportação. Primeiro: consultas a pagar/receber, resultado por projeto e relatório de folha. Depois: fluxo de caixa, DRE, fluxo mensal e recebimentos de projeto × ano.

## Comportamento

| Relatório | Ordem | O que mostra |
|---|---|---|
| Lançamentos a pagar | 1 | Filtros por programação, empresa, fornecedor, projeto e centro de custo, com intervalo de datas. Colunas: programação, pagamento, fornecedor, plano de contas, valor líquido, pago, pendente, projeto, unidade, centro de custo, empresa, conta, situação e descrição [SGE4B §5.6] |
| Lançamentos a receber | 1 | O mesmo, com cliente |
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
3. Períodos fechados ficam congelados. Um lançamento novo em período fechado é impossível ([bancos-e-conciliacao](bancos-e-conciliacao.md) regra 4).
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
- [ ] Na exportação, aparecem os filtros usados, os totais e os IDs dos títulos (serve para auditoria e migração).
- [ ] O resultado por projeto de um projeto fechado bate com o fechamento financeiro dele.
- [ ] O DRE do mês bate com a soma das contas analíticas vinculadas a cada linha.
- [ ] O fluxo de caixa previsto da próxima semana lista os títulos em aberto por vencimento, e o realizado as baixas.
- [ ] Um favorito salvo reabre com os mesmos filtros e colunas.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Reunião 21/10 17:01–20:36, 47:49–48:25]: data de baixa, extrato × despesas, fluxo de caixa.


- [SGE4B §5.6, §6.3, §10 CT-07, CT-10].
- [S1 09:37–11:20; S2 01:15]: positivo/negativo e causas; [SWOT §8.1] métricas.
