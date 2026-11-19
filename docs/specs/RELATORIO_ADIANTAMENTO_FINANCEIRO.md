# Adiantamento no P+ Connect: o que muda para o sistema Financeiro

Relatório para quem desenvolve o sistema Financeiro. Explica o adiantamento, a conta do "a pagar", o que muda no contrato da integração (`/integrations/v1`) e o que o Financeiro precisa fazer do lado dele.

Referências no repositório do Connect: `docs/integracao/contrato-api.md` (seções 4.1, 4.2, 4.2.1 e 4.6, e a tabela "Mudanças do v1"), `docs/integracao/guia-financeiro-*.md` e os exemplos em `contract/v1/`.

---

## 1. O que é um adiantamento

- É dinheiro que o Financeiro **já pagou** à pessoa no meio do projeto, **fora da planilha** de pagamentos. O valor muda a cada vez.
- Quem registra no Connect: o supervisor, o coordenador ou o admin do projeto. Eles escolhem a linha de pagamento "Adiantamento" e digitam o valor que já foi pago.
- O Connect **não paga** o adiantamento. Ele só registra o valor, para não mandar pagar de novo.
- O adiantamento vale **só no mesmo projeto e para a mesma pessoa**. O adiantamento de um projeto nunca desconta de outro projeto, nem de outra pessoa.
- Ele não tem comprovante nem baixa no Connect: é "já pago" por natureza.

## 2. Como ele entra no "a pagar"

Por pessoa e por projeto:

```
a pagar = feito − já pago − adiantado     (nunca menor que zero)
```

- **feito**: tudo o que foi lançado para a pessoa no projeto (entrevistas, diárias, bonificações), pago ou não;
- **já pago**: o dinheiro que já saiu por baixa (comprovante Pix ou baixa pela integração);
- **adiantado**: a soma dos adiantamentos da pessoa no projeto.

**Exemplo 1 (normal).** Feito R$ 1.000, já pago R$ 0, adiantado R$ 300.
A pagar = 1.000 − 0 − 300 = **R$ 700**.

**Exemplo 2 (saldo negativo).** Feito R$ 200, já pago R$ 0, adiantado R$ 300.
200 − 0 − 300 = −100. A pagar = **R$ 0** e a pessoa fica com **saldo negativo de R$ 100** (recebeu mais do que fez até agora). Não se paga nada a ela neste projeto até o feito passar do adiantado.

O gasto do projeto (orçamento) não muda: por pessoa, conta o maior entre o feito e o adiantado, sem somar os dois.

## 3. Qual entrevista o adiantamento já pagou (regra de cobertura)

Para a integração poder dizer, entrevista por entrevista, o que ainda é a pagar, o Connect usa uma regra fixa:

> Por pessoa e projeto, o adiantamento cobre as entrevistas ainda sem baixa **da mais antiga para a mais nova** (data do lançamento; empate pelo `interviewId`).

- Entrevista coberta **por inteiro**: já está paga pelo adiantamento. Não é a pagar.
- Entrevista coberta **em parte**: só o resto é a pagar.
- A soma do que sobra é exatamente o "a pagar" da seção 2.

Exemplo: 5 entrevistas de R$ 100 e R$ 250 de adiantamento.

| Entrevista | Valor | Situação | Parte coberta | Falta pagar |
|---|---|---|---|---|
| 1ª (mais antiga) | 100,00 | paga pelo adiantamento | 100,00 | 0,00 |
| 2ª | 100,00 | paga pelo adiantamento | 100,00 | 0,00 |
| 3ª | 100,00 | a pagar | 50,00 | 50,00 |
| 4ª | 100,00 | a pagar | 0,00 | 100,00 |
| 5ª | 100,00 | a pagar | 0,00 | 100,00 |

Total a pagar: R$ 250 (= 500 − 0 − 250).

Quando a 3ª entrevista recebe baixa, ela é paga pelos R$ 50 que faltam, e o Connect guarda que os outros R$ 50 vieram do adiantamento. Assim o "já pago" não desconta o adiantamento duas vezes.

## 4. O que muda no contrato da integração

Todas as mudanças são **aditivas** no `v1` (campo, status, rota e código de erro novos). Nada foi removido nem mudou de nome.

### 4.1 `GET /payables`: campos e status novos

| Campo | O que é |
|---|---|
| `amount` | **Sem mudança**: o valor cheio da entrevista |
| `advanceCovered` (novo) | Parte do `amount` que o adiantamento já pagou |
| `payableAmount` (novo) | O que **falta pagar** desta linha. Em `to_pay`: `amount − advanceCovered`. Em `covered`, `paid` e `removed`: `"0.00"` |
| `status` | Ganhou o valor `covered`: entrevista sem baixa que o adiantamento já pagou inteira |

- `status=to_pay` **não traz mais** as entrevistas que o adiantamento pagou inteiras. Para vê-las, use `status=covered` ou não filtre o status.
- Sem adiantamento no projeto, nada muda na prática: `advanceCovered` vem `"0.00"` e `payableAmount` é igual ao `amount`.

Antes (5 entrevistas de R$ 100, R$ 250 de adiantamento), `status=to_pay` trazia as 5 assim:

```json
{ "interviewId": 5529, "interviewerId": 87, "projectId": 12, "amount": "100.00", "status": "to_pay" }
```

Agora, sem filtro de status:

```json
{
  "items": [
    { "interviewId": 5529, "amount": "100.00", "status": "covered", "advanceCovered": "100.00", "payableAmount": "0.00" },
    { "interviewId": 5530, "amount": "100.00", "status": "covered", "advanceCovered": "100.00", "payableAmount": "0.00" },
    { "interviewId": 5531, "amount": "100.00", "status": "to_pay",  "advanceCovered": "50.00",  "payableAmount": "50.00" },
    { "interviewId": 5532, "amount": "100.00", "status": "to_pay",  "advanceCovered": "0.00",   "payableAmount": "100.00" },
    { "interviewId": 5533, "amount": "100.00", "status": "to_pay",  "advanceCovered": "0.00",   "payableAmount": "100.00" }
  ],
  "nextCursor": null
}
```

(Os itens trazem também `interviewerId`, `projectId`, `launchedOn`, `dueOn`, `paidOn`, `paymentRef`, `updatedAt`, `kind` e `interviewsDone`, como antes. Aqui foram cortados para caber.)

### 4.2 `GET /projects/{id}/balances` (rota nova, escopo `payables:read`)

O saldo de cada pessoa no projeto:

```json
{
  "projectId": 12,
  "items": [
    { "interviewerId": 87, "earned": "1000.00", "paid": "0.00", "advancedValue": "300.00", "netPayable": "700.00", "negativeBalance": false, "negativeValue": "0.00" },
    { "interviewerId": 91, "earned": "200.00",  "paid": "0.00", "advancedValue": "300.00", "netPayable": "0.00",   "negativeBalance": true,  "negativeValue": "100.00" }
  ]
}
```

- `earned` = feito; `paid` = já pago por baixa; `advancedValue` = adiantamento já pago; `netPayable` = a pagar líquido (nunca negativo).
- `negativeBalance: true` e `negativeValue` = saldo negativo (não pagar).
- Só ids e valores, sem nome. Projeto que não existe: 404.

### 4.3 `GET /projects/{id}/budget`

- Campo novo `advanced`: soma dos adiantamentos do projeto.
- `toPay` já vinha descontado do adiantamento (sem mudança).
- `paid` agora é o dinheiro que saiu por baixa, sem a parte de uma entrevista que o adiantamento já tinha pago. Só difere de antes quando houve baixa de entrevista coberta em parte.

### 4.4 `POST /payments` (baixa): limites novos

| Situação | Resposta |
|---|---|
| Alguma entrevista do pedido o adiantamento já pagou inteira (`status: covered`) | **409 `covered_by_advance`**, com a lista `interviewIds` |
| `amount` diferente da soma dos `payableAmount` das entrevistas | **422 `amount_mismatch`** (a mensagem avisa que o adiantamento já foi descontado) |
| `amount` maior que o `netPayable` da pessoa no projeto | **409 `exceeds_net_payable`**, com `netPayable`. É uma defesa extra: com as regras acima não deve acontecer; se acontecer, há inconsistência e alguém precisa olhar |

Exemplo: pagar a 3ª e a 4ª entrevistas do exemplo acima. O valor certo é 50 + 100 = **R$ 150** (não R$ 200):

```json
{
  "paymentRef": "fin-pay-000300",
  "e2eId": "E00000000202611191302ABCDEF123456",
  "interviewerId": 87,
  "projectId": 12,
  "amount": "150.00",
  "paidOn": "2026-11-19",
  "interviewIds": [5531, 5532],
  "confirmedBy": { "financeUserId": 7 }
}
```

O adiantamento em si **nunca** é item da integração: não tem `interviewId` e não pode ser baixado.

Cancelar uma baixa (`POST /payments/{ref}/reversal`) apaga a parte coberta guardada; a entrevista volta a "a pagar" com a cobertura recalculada.

### 4.5 Eventos

Quando a cobertura muda (adiantamento lançado, corrigido ou excluído; lançamento editado ou apagado; baixa desfeita), as entrevistas afetadas ganham `updatedAt` novo e o Connect envia `interviews.changed` com `change: "status_changed"`. A sincronização por `updatedSince` relê o status certo. Nenhum evento novo foi criado.

### 4.6 Outras regras que já existiam

- `POST /interviewers/payment-data` não entrega a chave Pix de quem o adiantamento já cobre (a pagar zero ou saldo negativo).
- No Connect, corrigir ou excluir um adiantamento para menos do que ele já descontou de um pagamento feito é recusado.

## 5. O que a planilha de pagamentos mostra hoje

A planilha que o Connect gera (`payments.xlsx`) já sai líquida:

- "Valor a pagar (R$)" = feito − já pago − adiantado.
- Quatro colunas novas **no fim** (nenhuma coluna antiga mudou de lugar): **Total feito (R$)**, **Já pago antes (R$)**, **Adiantamento já pago (R$)** e **Saldo (R$)**.
- A quantidade de entrevistas, as datas e a previsão de pagamento de cada pessoa contam só o que falta pagar (a entrevista que o adiantamento pagou inteira não entra).
- Quem o adiantamento cobre por inteiro sai da planilha. Quem tem saldo negativo aparece com valor 0, a marca de saldo negativo e **sem a chave Pix**.

## 6. O que o sistema Financeiro precisa fazer

1. **Mostrar o adiantamento** por pessoa e projeto (`advancedValue` de `/balances`) na tela de pagamento, junto do feito e do já pago.
2. **Pagar pelo `payableAmount`**, nunca pelo `amount`. A soma do que se paga a uma pessoa num projeto nunca passa do `netPayable`.
3. **Nunca pagar o adiantamento pela integração.** Ele já foi pago.
4. **Tratar `status: covered`** como "já pago pelo adiantamento": não oferecer para pagamento e não contar como pendente.
5. **Saldo negativo**: não pagar a pessoa no projeto e mostrar o aviso.
6. **Tratar os erros novos** `covered_by_advance` e `exceeds_net_payable` como divergência para uma pessoa olhar (reler `/payables` e `/balances`).
7. Ignorar campos desconhecidos continua valendo. Aceitar o valor `covered` em `status` é necessário; de agora em diante, tratar **qualquer status desconhecido como "não pagar"** (é a regra de versão do `v1`).
8. **Paginação:** com `status=to_pay` ou `status=covered` (como já era com `dueTo`), a página pode vir curta ou até vazia com `nextCursor` preenchido. Siga o cursor até ele vir `null`.

## 7. Pergunta em aberto (121): como o Financeiro registra o adiantamento do lado dele

O Connect registra o valor do adiantamento, mas não sabe como o Financeiro lança, na contabilidade dele, o dinheiro que saiu. Opções para decidir:

- **A. Lançamento manual no Financeiro**, com referência ao projeto e à pessoa, e conferência pelo `advancedValue` de `/balances`. Mais simples; depende de a equipe lançar nos dois lugares.
- **B. Rota nova de escrita no Connect** para o Financeiro registrar o adiantamento quando paga (o Connect passaria a receber o adiantamento da integração em vez de digitado). Evita lançar duas vezes; exige contrato novo, escopo novo e regra de quem corrige.
- **C. O Financeiro só lê** o `advancedValue` e concilia com o extrato bancário. Sem escrita nova; a conferência fica no extrato.

Enquanto não houver decisão, o caminho seguro é a opção A ou C: o Connect continua sendo onde o adiantamento é registrado.

## 8. Quando

- **Hoje:** o pagamento é pela **planilha**, que já desconta o adiantamento (seção 5).
- **Fim do ano:** o Financeiro passa a pagar **pela integração**. A partir daí valem as regras da seção 4: pagar pelo `payableAmount`, respeitar o `netPayable` e tratar `covered`.
- As mudanças do contrato descritas aqui já estão no Connect (ambiente de desenvolvimento primeiro, depois produção), então dá para testar o lado do Financeiro antes da virada.
