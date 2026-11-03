# Spec: Lotes de pagamento de campo

> **Módulo 5 — Folha de campo e pagamento em lote.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato do lote que transforma as folhas aprovadas e as planilhas de incentivo em pagamentos Pix, da baixa desses itens e, numa segunda etapa, do envio direto ao banco.

Hoje o financeiro lança **um** pagamento no sistema por planilha e faz **um Pix por pessoa** no internet banking, um por um. Isso pode chegar a centenas de pagamentos num dia [Reunião 21/10 6:39–8:01, 11:23–11:45].

## Comportamento

- **Incentivo por planilha:** a planilha importada vira **um lançamento por data de pagamento** ([contas-a-pagar](contas-a-pagar.md)), e o lote usa esses lançamentos, não uma data única [Kickoff 03/11 15:07–17:50].
- O financeiro gera o **lote** a partir das folhas `aprovadas` e das planilhas de incentivo, de um ou mais projetos (identificados pelo código do job). O lote agrupa **por pessoa** (`connect_interviewer_id`), com o detalhe por projeto e por tipo.
- **Planilha do lote:** mesmo formato e mesmas regras da planilha do escopo atual ([../pagamentos-a-pagar](pagamentos-a-pagar.md)):
  - nome e chave completa vêm do Connect na hora;
  - células como texto;
  - auditoria nos dois lados.
- **Comprovantes:** o PDF do banco entra pela mesma tela e pelo mesmo `ReceiptParser` de [../comprovantes-e-baixa](comprovantes-e-baixa.md). A conciliação por soma exata e FIFO passa a considerar também os itens de folha da pessoa.
- **Baixa:**
  - itens de folha são baixados **no Financeiro** (são dele);
  - entrevistas continuam com a baixa pedida ao Connect (`POST /payments`).
- **Pix de natureza mista** (entrevistas + diárias da mesma pessoa num só Pix) depende da pergunta **F2**: o `POST /payments` do Connect exige `amount` = soma das entrevistas. Até a decisão:
  - cada natureza tem Pix próprio: a planilha do lote sai separada da planilha de entrevistas;
  - um Pix que só fecha somando as duas naturezas vira `nao_fecha` (divergência).
- **Devolvido pelo banco:** a linha fica `devolvida`, a pessoa é sinalizada ("conferir chave Pix") e o valor volta para o próximo lote.
- **Etapa 2: envio direto ao banco** ("sonho" da direção; depende da pesquisa N1) [Reunião 21/10 11:23–13:16]:
  - o sistema gera e envia o lote ao Itaú (API Pix em lote ou arquivo de remessa), sem digitar Pix um por um;
  - o banco devolve o resultado **por pagamento**; o sistema mostra, **dentro do próprio lote**, quem falhou, com nome, projeto (job) e motivo ("98 de 100 pagos no job 1804; falharam Maria e João: chave inválida");
  - a correção da chave é pedida ao supervisor ou à pessoa no Connect; o reenvio sai só para quem falhou, com o mesmo lote de origem;
  - o retorno do banco substitui o comprovante em PDF como prova de pagamento, e a conciliação continua por soma exata.

## Regras

1. Só folhas `aprovadas` entram em lote, e cada linha entra num único lote ativo.
2. **Valor exato:** Pix = soma dos itens alocados. Não existe resto.
3. Nada é pago sem "Confirmar baixa".
4. Quem gera ou baixa o lote não pode ser quem aprovou a folha.
5. Pessoa sem chave Pix válida no Connect fica fora do lote, com aviso. **NF pendente não tira ninguém do lote**: é só aviso ([documentos-fiscais](documentos-fiscais.md); decisão do PO em 28/10/2026).
6. Item de folha pago vira, em contas a pagar, um item baixado do lançamento agrupado em nome da pessoa, para o fluxo de caixa e o DRE ficarem completos.
7. Duplicidade (mesmo `e2eId`) é bloqueada pelo mesmo índice do Módulo 1.
8. Envio ao banco (etapa 2): cada pagamento leva uma chave de idempotência; reenviar o lote nunca paga duas vezes quem já foi pago; a confirmação humana continua obrigatória **antes do envio**, com MFA.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Usuário sem `download_payment_sheet` baixa o lote | 403 | Só o Financeiro pode baixar a planilha de pagamentos |
| Gerar lote sem folha aprovada no ciclo | 409 | Não há folha aprovada para pagar nesse ciclo |
| Quem aprovou a folha tenta gerar ou baixar o lote | 409 | Quem aprova a folha não pode ser quem paga o lote |
| Cancelar lote com linhas já baixadas | 409 | Esse lote já tem pagamentos baixados — retire linha por linha |

## Critérios de aceite

- [ ] Uma planilha de incentivos com respostas de 4 datas entra no lote como 4 grupos, cada um na sua data de pagamento.
- [ ] Três folhas aprovadas de projetos diferentes viram um lote com uma linha por pessoa.
- [ ] O PDF de comprovantes do lote é lido pela mesma tela e concilia por soma exata.
- [ ] Depois de confirmar, a folha passa a `paga`, o ledger do projeto mostra o realizado e nenhuma chamada vai ao Connect (itens de folha).
- [ ] Um Pix que só fecha somando entrevista + diária aparece como divergência enquanto F2 não for decidida.
- [ ] Pix devolvido marca a pessoa e põe o valor no próximo lote.
- [ ] (Etapa 2) Um lote de 100 enviado ao banco com 2 chaves inválidas volta com 98 pagos e 2 falhas nomeadas, com o job; o reenvio sai só para os 2.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Kickoff 03/11 15:07–17:50]: incentivo dividido por data de pagamento.
- [Reunião 21/10 6:39–13:23]: um lançamento por planilha, Pix um por um, integração com o banco e retorno de erros por pessoa.
- [S1 30:09–32:13, 50:35–51:09]: envio ao financeiro, consolidado devolvido, pagamento periódico.
- [Connect: financeiro] regras 2, 4, 6, 7; [SWOT S05, RF07].
- [handoff/07 §4.6] (baixa no Connect exige `amount` = soma das entrevistas). Pendências F2, F4, N1. Pagar direto pelo banco estava fora do escopo em [handoff/01](../handoff/01-visao-escopo-e-decisoes.md); a reunião de 21/10 pôs como etapa 2, a pesquisar.

## Ajustes

- 2026-10-28: pessoa com NF pendente **entra** no lote; a NF não é mais obrigatória para pagar. Decisão do PO em 28/10/2026 ([documentos-fiscais](documentos-fiscais.md)).
- 2026-11-03: o incentivo importado por planilha é dividido em **um lançamento por data de pagamento** (prazo em dias úteis por tipo de projeto), e o lote respeita essas datas ([kickoff com o financeiro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), K5, K6).
