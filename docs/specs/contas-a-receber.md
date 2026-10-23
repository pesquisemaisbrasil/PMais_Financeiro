# Spec: Contas a receber

> **Módulo 3 — Contas a pagar e a receber.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato dos títulos a receber de clientes, simétrico ao [contas-a-pagar](contas-a-pagar.md), trocando fornecedor por cliente e pago por recebido.

## Comportamento

- O painel, a visão por período, os filtros, a lista e as abas são os mesmos de contas a pagar, com estas trocas:
  - fornecedor → **cliente**;
  - Pagos → **Recebidos**;
  - Vencidos = **inadimplência**.
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
- [ ] Um recebimento parcial mantém o saldo pendente e aparece como parcial nos indicadores e nos relatórios.
- [ ] A lista de inadimplência mostra o cliente com 2 títulos vencidos, os dias de atraso e o total.
- [ ] A receita da ficha do projeto bate com a soma dos títulos; diferença mostra aviso.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:


- [SGE4B §5.5, §6.2, §10 CT-02, CT-04].

## Ajustes

- 2026-10-23: o título a receber guarda **valor bruto, abatimentos (retenções) e valor líquido**; a retenção é lançada junto da NF emitida, como o financeiro faz hoje ([respostas do financeiro](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), A5). Os impostos apurados pela contabilidade não são calculados aqui.
- 2026-10-23: a **emissão da NF fica fora** (o financeiro emite no site da prefeitura). O título guarda **número e data da NF** e aceita o **PDF anexado**, inclusive o da invoice internacional (moeda: pergunta F14). A cobrança e a comunicação com o cliente seguem por e-mail, fora do sistema (F19).
