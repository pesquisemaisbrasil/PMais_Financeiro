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

- [ ] Uma receita parcelada em 3 tem parcelas com número, vencimento, valor e status próprios.
- [x] Um recebimento parcial mantém o saldo pendente e aparece como parcial nos indicadores e nos relatórios.
- [x] A lista de inadimplência mostra o cliente com 2 títulos vencidos, os dias de atraso e o total.
- [ ] A receita da ficha do projeto bate com a soma dos títulos; diferença mostra aviso.
- [x] Filtrar por cliente, projeto e situação "vencido" ao mesmo tempo traz só os títulos que cumprem as três condições.
- [x] Filtrar por empresa, período e palavra-chave traz a interseção exata, e limpar os filtros volta à lista completa.
- [x] Clicar no indicador "Vencidos" abre a lista já filtrada por situação, com a mesma contagem e o mesmo total do indicador.

## Onde está no código

- Backend: `backend/models/receivable.py`, `backend/services/receivable.py`, `backend/api/receivables.py`, `backend/schemas/receivable.py`; cadastro de cliente em `backend/services/records.py` (tipo `customers`).
- Frontend: `frontend/src/app/(app)/contas-a-receber/` (`page.tsx` e `dialogs.tsx`) e `frontend/src/lib/receivables.ts`.
- Testes: `backend/tests/test_receivables.py`, `frontend/src/lib/receivables.test.ts`, `frontend/e2e/contas-a-receber.spec.ts`.

Origem do requisito:


- [SGE4B §5.5, §6.2, §10 CT-02, CT-04].

## Ajustes

- 2026-10-23: o título a receber guarda **valor bruto, abatimentos (retenções) e valor líquido**; a retenção é lançada junto da NF emitida, como o financeiro faz hoje ([respostas do financeiro](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), A5). Os impostos apurados pela contabilidade não são calculados aqui.
- 2026-10-23: a **emissão da NF fica fora** (o financeiro emite no site da prefeitura). O título guarda **número e data da NF** e aceita o **PDF anexado**, inclusive o da invoice internacional (moeda: pergunta F14). A cobrança e a comunicação com o cliente seguem por e-mail, fora do sistema (F19).
- 2026-11-03: o contas a receber ganha **filtros** (período, situação, cliente, projeto, empresa e busca), no mesmo padrão do contas a pagar. Pedido do PO depois do kickoff com o financeiro; a Bruna e a Camila disseram que o dia a dia delas é "contas a pagar e receber" ([registro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), B5, K13).
- 2026-11-06 (fatia 1 entregue): cliente, título a receber (lançar, alterar, cancelar, excluir, auditoria), recebimento total ou parcial com estorno, indicadores, filtros combináveis, visão por período e **inadimplência** por cliente. Ficam para a próxima fatia: parcelamento e recorrência da receita, recebimento em lote, exportação em CSV, anexos da nota (dependem do armazenamento de arquivos, Q18), faixas de vencimento e a receita da ficha do projeto (depende do módulo de projetos).
- 2026-11-06: **retenção.** O título guarda o **bruto**, os **abatimentos** (um único valor, sem separar ISS, IR e demais) e o **líquido** (bruto menos abatimentos). O pendente e os recebimentos contam sobre o líquido. Abatimentos iguais ou maiores que o bruto são recusados (422).
- 2026-11-06: **atraso** em dias corridos, a partir do dia seguinte ao vencimento (vencido ontem = 1 dia). No dia do vencimento o título é "Vence hoje", não inadimplente. O aviso ao comercial no vencimento + N dias fica fora até o financeiro dizer o N (Q28).
- 2026-11-06: **situação.** Título vencido continua "Vencida" mesmo com recebimento parcial (como no Contas a pagar); "Parcial" é do que ainda não venceu. O indicador **Recebidos** soma só o que foi recebido por inteiro, como "Pagos". Os cancelados saem do Total e têm indicador próprio, aberto pela situação "Cancelada" nos Filtros.
- 2026-11-06: **contrato** é texto livre (sem cadastro de contratos). **Conta de receita:** o plano de contas ganhou o tipo despesa ou receita: Contas a pagar só aceita despesa, Contas a receber só receita, e o tipo de uma conta em uso não muda. Recebimento no passado pede observação, e o mesmo ID de transação não vale para dois recebimentos.
- 2026-11-06: **projeto obrigatório** (regra 2), com a mensagem "Informe o projeto da receita"; projeto fechado não recebe título novo. Se existe receita sem projeto é pergunta ao financeiro (Q27).
