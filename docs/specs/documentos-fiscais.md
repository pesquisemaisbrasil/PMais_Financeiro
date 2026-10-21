# Spec: Documentos fiscais (NF, RPA e notas recebidas)

> **Módulo 3 — Contas a pagar e a receber**, com uma parte no **Módulo 1** (a NF do entrevistador libera o pagamento). Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato de como cada pagamento fica amarrado ao seu documento fiscal (nota fiscal, RPA, DANFE, cupom de reembolso ou "sem documento"), de como as notas são guardadas e de como a contabilidade recebe o que precisa.

## Comportamento

**Modelo fiscal do prestador** (entrevistador, recrutador, supervisor autônomo):
- No **cadastro do Connect**, a pessoa escolhe como recebe [Reunião 21/10 40:11–41:41]:
  - **NF** (pessoa jurídica): razão social, nome fantasia, CNPJ e o que mais o financeiro pedir (a fechar com a Camila: regime tributário? pendência N3);
  - **RPA** (autônomo, pessoa física): dados para o recibo, como o **PIS/NIT** (a fechar com a Camila: N3). O cadastro avisa que há **desconto de 11% de INSS**.
- O cadastro deixa claro que a empresa trabalha só com esses dois modelos [Reunião 21/10 41:21–41:37].
- Isso mora no Connect, que é dono da pessoa. O Financeiro recebe só o modelo e o status do documento pela API (pendência N4).

**NF do entrevistador** (libera o pagamento):
- A NF é enviada **no sistema**, pelo entrevistador ou pelo supervisor do projeto, e não mais por e-mail ao supervisor [Reunião 21/10 23:28, 34:35, 42:30].
- Ela fica ligada aos itens a pagar daquele pagamento (projeto + período).
- **Quem recebe por NF e não enviou a nota não entra na planilha de pagamento.** Aparece em "Aguardando NF" com o valor [Reunião 21/10 42:30–42:44].

**RPA:**
- O Financeiro gera a **lista de RPA** do período (pessoa, valor bruto, projeto) para a **contabilidade**, que emite os recibos e devolve [Reunião 21/10 39:44–40:11].
- O valor a pagar é o **líquido**, depois do desconto de INSS.
- O RPA devolvido é anexado ao item.

**Incentivo ao respondente:** não tem nota fiscal [Reunião 21/10 39:16]. O item fica "incentivo — sem documento".

**Notas recebidas de fornecedores** (cerca de 300 por mês [Reunião 21/10 38:57–39:16]):

| Tipo | Exemplo | Como chega |
|---|---|---|
| NFS-e (serviço) | prestadores PJ, fornecedores de serviço | e-mail; consulta no site da prefeitura e no Emissor Nacional |
| NF-e / DANFE com XML (produto) | compras | e-mail com XML |
| NFC-e (cupom) | padaria, mercado, material de apoio (reembolsos) | a pessoa envia junto com o pedido de reembolso |

- Cada nota é anexada ao título com:
  - número, data de emissão, fornecedor/emitente, valor e data de pagamento;
  - status (válida, cancelada).
- **Nome padrão do arquivo**, como a Bruna já usa: `{data de pagamento} {número da NF} {fornecedor} {valor} {data de emissão}` [Reunião 21/10 15:18].
- **Conferência de notas recebidas:** tela que cruza as notas emitidas contra o CNPJ da empresa (prefeitura / Emissor Nacional) com as notas anexadas aos títulos. Mostra as que faltam e as **canceladas** [Reunião 21/10 35:18–36:41].
  - A **captura automática** depende de pesquisa (pendência N2). A primeira versão importa o arquivo exportado desses portais.

## Regras

1. Todo item pago tem um documento fiscal ou a marca explícita "sem documento" com o motivo (incentivo, adiantamento, reembolso sem cupom, outro).
2. Item de prestador "NF" só entra em planilha ou lote com a NF anexada e com número e data de emissão preenchidos.
3. A **data de emissão** é guardada separada da data de pagamento: há notas emitidas num mês e pagas no seguinte, com crédito de imposto já usado [Reunião 21/10 15:18–15:57].
4. **Guarda fiscal de 5 anos** (auditoria fiscal [Reunião 21/10 15:02]), no cofre cifrado de [handoff/06 §4](../handoff/06-seguranca-e-lgpd.md), com `retainUntil`. Apagar antes do prazo é bloqueado. O prazo final é definido com o DPO e a contabilidade (Q5).
5. Nota marcada **cancelada** na origem gera alerta no título pago com ela.
6. RPA:
   - o desconto de INSS é calculado, nunca digitado;
   - a alíquota fica em configuração (11% hoje), com vigência;
   - o teto do INSS e as outras retenções são confirmados com a contabilidade (N3).
7. O arquivo de NF de pessoa de campo é dado pessoal fiscal: acesso só do financeiro e do admin, com cada download auditado.
8. A exportação para a contabilidade (planilha de conciliação do mês) leva, por pagamento: data, valor, tipo de documento, número da NF, data de emissão e emitente.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Incluir na planilha quem recebe por NF sem NF enviada | 409 | {N} pessoas recebem por NF e ainda não enviaram a nota |
| NF sem número ou data de emissão | 422 | Informe o número e a data de emissão da nota |
| Apagar nota antes do prazo de guarda | 409 | Essa nota precisa ser guardada até dd/mm/aaaa |
| Arquivo de nota fora dos tipos aceitos | 422 | Envie PDF ou XML da nota |
| Usuário sem permissão baixa a NF de um entrevistador | 403 | Seu perfil não permite essa ação |

## Critérios de aceite

- [ ] Um entrevistador cadastrado como NF com R$ 600 a pagar fica em "Aguardando NF" até enviar a nota. Depois de enviada, entra na planilha.
- [ ] Um entrevistador RPA com R$ 1.000 brutos aparece na lista de RPA e é pago pelo líquido (R$ 890 com 11%).
- [ ] Um lançamento agrupado de 10 pessoas mostra, por item: 5 NF, 2 RPA, 2 incentivos e 1 "falta NF".
- [ ] A conferência do mês lista uma NFS-e emitida contra o CNPJ que não está anexada a nenhum título.
- [ ] Uma nota cancelada na prefeitura gera alerta no título pago com ela.
- [ ] A exportação para a contabilidade traz número e data de emissão de cada NF.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md). O cadastro do modelo fiscal e o envio da NF ficam no Connect (pendência N4).

Origem do requisito:

- [Reunião 21/10 14:12–22:55, 23:28–25:50, 34:35–42:44].
- [handoff/01 "Fora do escopo"]: NF/RPA estava fora; a reunião de 21/10 trouxe para dentro.

## Ajustes

- 2026-10-21: spec criado a partir da reunião de 21/10.
