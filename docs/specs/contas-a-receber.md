# Spec: Contas a receber

> **Módulo 3 — Contas a pagar e a receber.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato dos títulos a receber de clientes, simétrico ao [contas-a-pagar](contas-a-pagar.md), trocando fornecedor por cliente e pago por recebido.

## Comportamento

- O painel, a visão por período, os filtros, a lista e as abas são os mesmos de contas a pagar, com estas trocas:
  - fornecedor → **cliente**;
  - Pagos → **Recebidos**;
  - Vencidos = **inadimplência**.
- **Filtros combináveis**, no mesmo padrão do contas a pagar [Kickoff 03/11, K13]: período (vencimento, competência ou recebimento), situação, cliente, projeto, empresa e palavra-chave. Os indicadores (Total, Recebidos, Pendentes, Vencidos, Hoje, A vencer) abrem a lista já filtrada, e a exportação leva os filtros no cabeçalho.
- **Lançamento:**
  - **classificação:** cliente*, contrato, empresa*, unidade*, projeto*, centro de custo*, plano de contas*;
  - **descrição e documento:** descrição*, documento (nota/fatura);
  - **valores e datas:** valor*, emissão, competência*, vencimento*, condição;
  - **(a validar)** retenções sobre a nota.
- **Parcelamento/recorrência** da receita do projeto (por exemplo, 30% na aprovação, 70% na entrega) com simulação ([baixas-recorrencia-e-anexos](baixas-recorrencia-e-anexos.md)).
- **Recebimento:** total ou parcial, por conta bancária e forma de recebimento. Anexos: nota, contrato, comprovante e cobrança.
- **Receita do projeto:** a soma dos títulos a receber do projeto é a **receita vendida** da ficha, usada na margem ([projetos-financeiros](projetos-financeiros.md)). Diferença entre a ficha e os títulos gera um aviso.
- **Inadimplência:** lista de vencidos por cliente, com dias de atraso e total. Aviso ao comercial no vencimento + N dias (a validar).

## Regras

1. Mesmas regras de situação derivada, pendente calculado, auditoria, exclusão e interseção de filtros de contas a pagar (regras 1, 2, 4, 5 e 6).
2. Projeto é obrigatório no título a receber: toda receita pertence a um projeto (a validar: há receita sem projeto?).
3. A soma das parcelas é igual ao valor do título. Diferença bloqueia o salvamento.
4. Recebimento retroativo em período fechado é bloqueado ([bancos-e-conciliacao](bancos-e-conciliacao.md) regra 4).

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Título sem projeto | 422 | Informe o projeto da receita |
| Parcelas não somam o valor do título | 422 | As parcelas somam R$ X, mas o título é de R$ Y |
| Receber mais que o pendente | 409 | O valor recebido passa do saldo pendente (R$ X) |
| Excluir título com recebimento | 409 | Esse título tem recebimentos — estorne antes de excluir ou cancele |

## Critérios de aceite

- [x] Uma receita parcelada em 3 tem parcelas com número, vencimento, valor e status próprios.
- [x] Um recebimento parcial mantém o saldo pendente e aparece como parcial nos indicadores e nos relatórios.
- [x] A lista de inadimplência mostra o cliente com 2 títulos vencidos, os dias de atraso e o total.
- [ ] A receita da ficha do projeto bate com a soma dos títulos; diferença mostra aviso.
- [x] Filtrar por cliente, projeto e situação "vencido" ao mesmo tempo traz só os títulos que cumprem as três condições.
- [x] Filtrar por empresa, período e palavra-chave traz a interseção exata, e limpar os filtros volta à lista completa.
- [x] Clicar no indicador "Vencidos" abre a lista já filtrada por situação, com a mesma contagem e o mesmo total do indicador.

## Onde está no código

- Backend: `backend/models/receivable.py`, `backend/services/receivable.py`, `backend/api/receivables.py`, `backend/schemas/receivable.py`; cadastro de cliente em `backend/services/records.py` (tipo `customers`).
- Frontend: `frontend/src/app/(app)/contas-a-receber/` (`page.tsx` e `dialogs.tsx`) e `frontend/src/lib/receivables.ts`; a tela de repetir e o diálogo da série são os mesmos do Contas a pagar (`frontend/src/components/RecurrenceFields.tsx` e `SeriesDialog.tsx`).
- Série e parcelas: `backend/services/receivable_series.py`, que usa `backend/services/recurrence.py` (simulação) e a mesma tabela `payable_series` do Contas a pagar.
- Testes: `backend/tests/test_receivables.py`, `test_receivable_series.py`, `test_receivable_adjustments.py`, `test_receivable_attachments.py`, `frontend/src/lib/receivables.test.ts`, `frontend/e2e/contas-a-receber.spec.ts`.

Origem do requisito:


- [SGE4B §5.5, §6.2, §10 CT-02, CT-04].

## Ajustes

- 2026-10-23: o título a receber guarda **valor bruto, abatimentos (retenções) e valor líquido**; a retenção é lançada junto da NF emitida, como o financeiro faz hoje ([respostas do financeiro](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), A5). Os impostos apurados pela contabilidade não são calculados aqui.
- 2026-10-23: a **emissão da NF fica fora** (o financeiro emite no site da prefeitura). O título guarda **número e data da NF** e aceita o **PDF anexado**, inclusive o da invoice internacional (moeda: pergunta F14). A cobrança e a comunicação com o cliente seguem por e-mail, fora do sistema (F19).
- 2026-11-03: o contas a receber ganha **filtros** (período, situação, cliente, projeto, empresa e busca), no mesmo padrão do contas a pagar. Pedido do PO depois do kickoff com o financeiro; a Bruna e a Camila disseram que o dia a dia delas é "contas a pagar e receber" ([registro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), B5, K13).
- 2026-11-06 (fatia 1 entregue): cliente, título a receber (lançar, alterar, cancelar, excluir, auditoria), recebimento total ou parcial com estorno, indicadores, filtros combináveis, visão por período e **inadimplência** por cliente. Ficam para a próxima fatia: parcelamento e recorrência da receita, recebimento em lote, exportação em CSV, anexos da nota (dependem do armazenamento de arquivos, Q18), faixas de vencimento e a receita da ficha do projeto (depende do módulo de projetos). *Atualização de 09/11/2026: parcelamento, recorrência e anexos já foram entregues (ver abaixo).*
- 2026-11-06: **retenção.** O título guarda o **bruto**, os **abatimentos** (um único valor, sem separar ISS, IR e demais) e o **líquido** (bruto menos abatimentos). O pendente e os recebimentos contam sobre o líquido. Abatimentos iguais ou maiores que o bruto são recusados (422). *(Os abatimentos viraram a lista de **impostos**: veja o ajuste de acréscimos, descontos e impostos, abaixo.)*
- 2026-11-06: **atraso** em dias corridos, a partir do dia seguinte ao vencimento (vencido ontem = 1 dia). No dia do vencimento o título é "Vence hoje", não inadimplente. O aviso ao comercial no vencimento + N dias fica fora até o financeiro dizer o N (Q28).
- 2026-11-06: **situação.** Título vencido continua "Vencida" mesmo com recebimento parcial (como no Contas a pagar); "Parcial" é do que ainda não venceu. O indicador **Recebidos** soma só o que foi recebido por inteiro, como "Pagos". Os cancelados saem do Total e têm indicador próprio, aberto pela situação "Cancelada" nos Filtros.
- 2026-11-06: **contrato** é texto livre (sem cadastro de contratos). **Conta de receita:** o plano de contas ganhou o tipo despesa ou receita: Contas a pagar só aceita despesa, Contas a receber só receita, e o tipo de uma conta em uso não muda. Recebimento no passado pede observação, e o mesmo ID de transação não vale para dois recebimentos.
- 2026-11-06: **projeto obrigatório** (regra 2), com a mensagem "Informe o projeto da receita"; projeto fechado não recebe título novo. Se existe receita sem projeto é pergunta ao financeiro (Q27).
- 2026-11-06 (fatia 2 entregue): **parcelamento e recorrência da receita** (todo mês, toda semana ou parcelado, de 2 a 60 ocorrências) com a tabela simulada editável antes de salvar, e **exportação em CSV** com os filtros e a busca na primeira linha. As regras são as do Contas a pagar: dia que não existe vira o último do mês, fim de semana e feriado vão para o próximo dia útil, a diferença de centavos do parcelado fica na última parcela, e só a primeira ocorrência leva o número e a data da nota.
- 2026-11-06: no **parcelado**, a soma das parcelas tem de ser igual ao valor do título: se não for, 422 "As parcelas somam R$ X, mas o título é de R$ Y" e nada é criado. Dá para ajustar valor e data de cada parcela antes de salvar (por exemplo, 30% na aprovação e 70% na entrega).
- 2026-11-06: **alterar ou cancelar a série** ("só este", "este e os seguintes", "todos em aberto") nunca mexe em título que já tem recebimento: ele fica de fora, e se o título escolhido em "só este" já recebeu, a resposta é 409 ("Títulos com recebimento não são alterados pela série").
- 2026-11-06: **recebimento em lote não foi feito**: a spec só fala em recebimento total ou parcial de um título, e o lote existe no Contas a pagar por pedido do financeiro. Vira pedido se a Vivi quiser. Continuam para a fatia 3: anexos da nota (depende do armazenamento de arquivos, Q18), faixas de vencimento e a receita da ficha do projeto. *(Faixas e anexos já foram entregues; só falta a receita da ficha do projeto.)*
- 2026-11-06 (filtros): como no Contas a pagar, **cada filtro aceita mais de uma opção** (cliente, projeto, conta de receita, empresa, unidade, centro de custo e situação), com "ou" dentro do filtro e "e" entre filtros. A situação **"Cancelada" não combina** com as outras: título cancelado só aparece no indicador próprio, então marcar "Cancelada" desmarca as demais, e marcar outra desmarca "Cancelada".
- 2026-11-06 (faixas de vencimento): a inadimplência mostra o saldo por **faixa de atraso**, no total e por cliente: **1 a 30**, **31 a 60**, **61 a 90** e **mais de 90 dias** (dia 30 ainda é da primeira faixa, dia 31 já é da segunda). Faixas-padrão de cobrança escolhidas pelo PO em 06/11/2026; os limites ficam a validar com a Vivi e moram num lugar só (`DELINQUENCY_BANDS`, em `services/receivable.py`). A API devolve sempre as quatro faixas, mesmo vazias, e a soma delas é o total do cliente. Continuam para a fatia 3: anexos da nota (Q18) e a receita da ficha do projeto (módulo de projetos). *(Os anexos já foram entregues; só falta a receita da ficha do projeto.)*
- 2026-11-06 (Excel): como no Contas a pagar, **Exportar** oferece **Excel (.xlsx)** e **CSV**, com data e dinheiro como número de verdade, a linha de **Total** (valor principal, acréscimos, descontos, impostos, líquido, recebido e pendente) e texto sempre como texto. `GET /receivables/export?format=xlsx`.
- 2026-11-06 (acréscimos, descontos e impostos): o título a receber ganhou as mesmas três listas do Contas a pagar (**Acréscimos**, **Descontos** e **Impostos**, cada uma com descrição e valor, pelos botões do formulário). Elas **substituem o campo único de abatimentos**: o que já estava lançado virou, na migração, um imposto "Abatimento lançado antes", e o líquido de cada título continua o mesmo. O **líquido** (valor principal + acréscimos − descontos − impostos) é o que a lista, o pendente e o recebimento usam; a lista mostra o líquido com o valor principal embaixo. Líquido zero ou negativo é recusado (422), e editar não deixa o líquido ficar abaixo do que já foi recebido (409). A coluna `receivables.withheld` ficou como legado, sem uso, e sai numa migração futura. **Parcelado** recusa as listas na criação (422), e mensal e semanal as repetem em cada ocorrência. A exportação traz Bruto, Acréscimos, Descontos, Impostos e Líquido.
- 2026-11-06 (lugar dos valores): o mesmo bloco de valores do Contas a pagar (valor principal, os três totais com seus botões e o valor líquido), alinhado à esquerda e sem moldura. Em **nova conta a receber** ele vem depois da classificação (empresa, unidade e centro de custo) e antes do documento; em **alterar título**, logo abaixo do vencimento. Pedido do PO.
- 2026-11-06 (nome): o **valor bruto** do título passa a se chamar **valor principal**, na tela e na planilha, como no Contas a pagar (pedido do PO). Nos ajustes anteriores, "bruto" quer dizer o valor principal. O campo da API continua `amount`.
- 2026-11-09 (título aberto): o mesmo resumo do Contas a pagar (**valor, recebido e pendente**, com a barra) acima das abas; a aba **Repetir** nos títulos de série (`GET /receivables/{id}/series`); e a aba **Documentos**, com tipo, baixar, renomear e tirar com motivo, no mesmo cofre cifrado (ver [baixas-recorrencia-e-anexos](baixas-recorrencia-e-anexos.md)).
- 2026-11-09 (imprimir): o botão **Imprimir**, ao lado de Exportar, como no Contas a pagar: todos os resultados dos filtros, folha A4 deitada, com as colunas Vencimento, Cliente, Descrição, Documento, Projeto, Situação, Líquido, Recebido e Pendente e o total. Rota `GET /receivables/print`.
- 2026-11-09 (título aberto, no desenho da conta a pagar): o detalhe tem uma linha de abas com cara de botão: **Detalhes** (antes "Resumo", agora com rótulo e valor ao lado, tudo à esquerda), **Editar título**, **Recebimentos**, **Documentos**, **Repetir** (só em série), **Cancelar título** e **Histórico**. Abre em Detalhes. **Registrar recebimento** fica dentro da aba Recebimentos; editar e cancelar são abas (título cancelado perde as duas), e o rodapé fica só com Excluir e Fechar. Na **nova conta a receber**, a **Descrição** vem abaixo do valor líquido, numa caixa de várias linhas (até 255 letras), e o **Projeto** tem busca. "Programação" e "Pagar em" não têm par aqui: a Emissão é outro conceito, e a data prevista de recebimento não foi pedida.
