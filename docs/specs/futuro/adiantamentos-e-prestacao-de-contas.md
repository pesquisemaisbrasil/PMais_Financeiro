# Spec (futuro): Adiantamentos e prestação de contas

> **Não implementar sem decisão do PO.** Origem: resposta do financeiro em 23/10 ([registro](../../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), A4). Hoje um adiantamento é um lançamento comum no contas a pagar, com anexos.

## Comportamento

- Ajuda de custo de viagem: o financeiro deposita um valor com base na **diária** e a pessoa precisa **comprovar os gastos** com notas.
- No fim da viagem a pessoa envia **um e-mail com um Excel de relatório de despesas e as notas**; o financeiro confere à mão.
- Proposta (a validar): o adiantamento vira um título com **saldo a comprovar**. A prestação de contas anexa as notas e baixa o saldo. O que sobrar é devolvido, e o que faltar vira reembolso.

## Regras

1. (a validar) O adiantamento é lançado como despesa da pessoa, na categoria e no projeto da viagem, e fica **em aberto** até a prestação de contas.
2. (a validar) Cada nota da prestação de contas tem valor, data e categoria. A soma não passa do adiantamento sem aprovação.
3. (a validar) Adiantamento sem prestação de contas depois do prazo aparece em alerta, como documento pendente.

## Casos negados

(a definir com o financeiro)

## Critérios de aceite

(a definir quando o PO trouxer o tema para o escopo)

## Origem

- [Financeiro, 23/10, A4]: "depositamos o valor, considerando um valor diário, e a pessoa precisa enviar as notas justificando os gastos; no final da viagem envia um e-mail com um excel de relatório de despesas de viagem".
- Perguntas ao financeiro: quem aprova o valor da diária? Existe teto por pessoa ou por viagem? A prestação de contas passa a ser enviada no sistema?
