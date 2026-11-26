# 26/11/2026 · Decisões da tela Notas e RPA (PF-60)

Pedido do Bruno, na conversa com o agente: "Vamos começar as telas de Notas e RPA". O agente fez três perguntas, e o Bruno escolheu uma opção em cada.

## Quando a NF chega

Pergunta: hoje o status da NF (recebida ou pendente) só vem da planilha da folha de campo, e o Connect ainda não manda esse status. Quando a nota de uma pessoa chegar, como ela sai da lista de "NF pendente"?

> **Registrar na própria tela.** Botão "Registrar NF" na linha: o financeiro digita o número e a data de emissão, e o aviso some. Fica no histórico quem registrou. Quando o Connect mandar o status, ele preenche sozinho.

## O mês da lista de RPA

Pergunta: a lista de RPA do mês, que vai para a contabilidade, é montada por qual data?

> **Data do pagamento.** Entra no mês em que a pessoa foi paga (a baixa). Item ainda não pago não entra.

## Conferência das notas do portal

Pergunta: a conferência das notas do portal (prefeitura e Emissor Nacional) precisa de um arquivo exportado do portal para saber o formato. Você consegue um?

> **Consigo, depois.** Agora vêm a NF pendente e o RPA. Quando o arquivo chegar, ele vai para a pasta `importar/` (fora do git); o agente lê só o formato e escreve os testes com dados inventados.

## Onde está

- Spec [documentos-fiscais](../specs/documentos-fiscais.md), na seção Ajustes de 26/11.
