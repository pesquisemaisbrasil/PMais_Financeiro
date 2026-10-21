# Spec: Bancos e conciliação

> **Módulo 6 — Conciliação bancária.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato de contas bancárias, importação de extrato, conciliação **linha a linha do extrato** contra os lançamentos, e do fechamento do mês que vai para a contabilidade. Substitui o "Extrato/Controle bancário" do SGE4B e a planilha de conciliação mantida à mão.

## Comportamento

- **Conta bancária:** empresa*, banco* (hoje Itaú), agência, conta, tipo (corrente, aplicação, caixa), saldo inicial e data, status.
- **Importar extrato:** OFX ou CSV do Itaú, com pré-visualização antes de gravar. A API do banco depende da pendência N1.
- **Conciliação** pelo extrato, como a Bruna faz hoje [Reunião 21/10 13:36–16:57]. A tela tem duas colunas: extrato × lançamentos/itens.
  - **Um lançamento, várias linhas no extrato:** o lançamento de R$ 1.000 de 5 incentivos aparece no extrato como 5 Pix de R$ 200. A conciliação casa cada linha com um **item** do lançamento ([contas-a-pagar](contas-a-pagar.md), lançamento agrupado), não com o total.
  - **Sugestão automática** por valor + data (±3 dias) + favorecido + ID da transação; com itens, por item.
  - **Classificação de cada linha** (o que a contabilidade precisa):
    - tipo: incentivo, adiantamento, pagamento com NF, RPA, sem NF, reembolso, tarifa, transferência, outro;
    - com NF: número e data de emissão.
    - A classificação vem do item ou do documento fiscal quando já existe ([documentos-fiscais](documentos-fiscais.md)). O que não vem é preenchido na tela, e a pessoa **nunca deduz** o tipo só pelo valor [Reunião 21/10 13:52–14:12].
  - Para cada linha: **conciliar** com uma baixa existente, **baixar** um título em aberto, **criar** um lançamento (tarifa, rendimento) ou marcar **exceção** com motivo.
  - **Voltas:** um crédito de Pix devolvido casa com a baixa original e gera a devolução no título ([baixas-recorrencia-e-anexos](baixas-recorrencia-e-anexos.md)).
  - Pix de entrevistador casa com o comprovante já conciliado em [comprovantes-e-baixa](comprovantes-e-baixa.md).
- **Diferença extrato × despesas:** por dia e por mês, mostra a saída do extrato contra as baixas do sistema, e explica a diferença: voltas, pendências, linhas não conciliadas [Reunião 21/10 17:01–20:31].
- **Saldo mensal:** por conta e consolidado: saldo inicial, entradas, saídas e saldo final.
- **Fechamento do mês:** o financeiro fecha o mês por empresa quando tudo está conciliado e exporta a **planilha de conciliação para a contabilidade**: cada linha do extrato com a classificação, o número da NF, a data de emissão e o lançamento [Reunião 21/10 16:32–16:57].

## Regras

1. A transação importada é imutável. Reimportar o mesmo extrato não duplica (chave = conta + ID da transação, ou data + valor + descrição).
2. Toda baixa tem conta bancária e **data de baixa = data em que o dinheiro saiu**. O saldo da conta = saldo inicial + baixas conciliadas.
3. A soma das linhas conciliadas a um lançamento agrupado não passa do valor dele. O que falta aparece como "itens não pagos".
4. Linha sem classificação não deixa fechar o mês.
5. Transação conciliada só se desfaz com motivo e auditoria.
6. **Período fechado** bloqueia baixa, estorno e lançamento com data naquele mês, para todos. Reabrir é só para um administrador, com motivo.
7. Fechar o mês exige zero linha sem conciliar e sem classificar (exceção aceita conta como conciliada).

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Arquivo de extrato inválido | 422 | Não foi possível ler o extrato — envie OFX ou CSV do banco |
| Conciliar linhas acima do valor do lançamento | 409 | As linhas somam R$ X, mas o lançamento é de R$ Y |
| Fechar mês com linhas pendentes ou sem classificação | 409 | Há N linhas não conciliadas ou sem classificação em {conta} |
| Lançar em período fechado | 409 | O período de {mês} está fechado |
| Reabrir período sem ser administrador | 403 | Só um administrador pode reabrir um período fechado |

## Critérios de aceite

- [ ] Um lançamento de 5 incentivos (R$ 1.000) concilia com 5 Pix de R$ 200 do extrato, um por item, e cada linha sai classificada como "incentivo".
- [ ] Um pagamento de fornecedor com NF concilia trazendo o número e a data de emissão da nota anexada.
- [ ] Um Pix devolvido em agosto e pago em setembro aparece na diferença de agosto explicado como "volta", e o fechamento de setembro bate com o extrato.
- [ ] Importar o mesmo OFX duas vezes não duplica.
- [ ] A planilha da contabilidade tem uma linha por transação, com classificação, NF e data de emissão.
- [ ] Depois de fechar março, nenhuma baixa com data de março é aceita.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Reunião 21/10 13:23–21:29]: conciliação pelo extrato, classificação, voltas, diferença extrato × relatório.
- [SGE4B §1.2, §5.6, §7.2, §10 CT-08]; [SWOT S05].
