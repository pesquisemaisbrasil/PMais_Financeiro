# Spec: Contas a pagar

> **Módulo 3 — Contas a pagar e a receber.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato dos títulos a pagar (fornecedores, folhas, incentivos, internos, despesas, provisões), com o painel, o rateio e as ações em lote que o financeiro usa hoje no SGE4B.

## Comportamento

- **Painel** com visão por dia, semana, mês, ano ou período, navegação entre períodos, "hoje", atualizar e "nova conta a pagar".
- **Indicadores** (quantidade e valor; clicar abre a lista filtrada): Total, Pagos, Pendentes, Vencidos, Hoje, A vencer e **Provisões**.
- **Filtros combináveis:** fornecedor, projeto, categoria (plano de contas), linha do DRE, palavra-chave, empresa, unidade, centro de custo, forma de pagamento, situação, tipo (real/provisão) e intervalo de datas (vencimento, competência ou **baixa**).
- **Lista:**
  - colunas: seleção, vencimento, fornecedor, descrição, documento, valor, pago, pendente, projeto, categoria, centro de custo, forma de pagamento, conta, situação e ações;
  - colunas ordenáveis e escolhidas pelo usuário;
  - **ícones de ação com legenda**, que hoje faz falta [Reunião 21/10 8:50].
- **Lançamento** (* = obrigatório):
  - **primeira página:** data*, fornecedor*, projeto (ou rateio), categoria*, centro de custo*, forma de pagamento* (importante no fechamento [Reunião 21/10 1:30]), valor*, vencimento*, descrição*;
  - seletores com lista suspensa **e** busca;
  - **segunda página, opcional:** observações, contrato, documento, competência;
  - abas Baixas, Documentos, Repetir e Histórico ([baixas-recorrencia-e-anexos](baixas-recorrencia-e-anexos.md)).
- **Rateio entre projetos:**
  - um lançamento só, sem projeto único;
  - o usuário **cola** a lista "código do projeto + valor" (só números, sem "R$") e o sistema distribui;
  - exemplo: quem recebe por projeto tem 50 projetos numa fatura e vira um lançamento só [Reunião 21/10 1:53–2:26, 46:55].
- **Lançamento agrupado com itens** (folha de entrevistadores, planilha de incentivos):
  - **um lançamento** por planilha ou projeto, com a planilha anexada [Reunião 21/10 6:55–8:01];
  - **importar a planilha** cria os **itens** do lançamento, um por pessoa: pessoa, valor, documento fiscal (NF com número e data de emissão, RPA, sem NF, incentivo) e status;
  - os itens permitem conciliar pagamento por pagamento e saber quem tem nota [Reunião 21/10 20:36–22:55];
  - internos fixos (supervisor, gerente, coordenador) continuam como lançamento individual [Reunião 21/10 22:31].
- **Ações em lote** sobre os títulos selecionados:
  - **dar baixa** em todos de uma vez (por exemplo, todas as parcelas de rateio de uma pessoa);
  - **reclassificar** (projeto, categoria, centro de custo);
  - **copiar/duplicar**;
  - **excluir** [Reunião 21/10 8:15–9:18].
- **Provisão:** título `provisao` vindo do orçamento do projeto ([orcamento-e-saude-financeira](orcamento-e-saude-financeira.md)) ou criado à mão. "Substituir por real" vincula o título real e encerra a provisão.
- **Prazo de documentação:** folha, nota ou planilha que chega com menos de 3 dias da data de pagamento fica marcada como "documentação atrasada", e o projeto entra num relatório de atrasos [Reunião 21/10 27:41–28:07].
- Título com projeto alimenta a carteira do projeto: comprometido quando lançado, realizado quando baixado.

## Regras

1. Situação **derivada**, nunca digitada:
   - `pago`: pendente = 0;
   - `parcial`;
   - `vencido`;
   - `hoje`;
   - `a_vencer`;
   - `devolvido` (Pix voltou e aguarda novo pagamento);
   - `cancelado`;
   - `pendente_autorizacao`.
2. **Pendente = valor + juros + multa − desconto − baixas**, calculado.
3. **Rateio:**
   - a soma das partes é igual ao valor do título;
   - cada código de projeto precisa existir;
   - a linha que não fecha é mostrada antes de salvar;
   - cada parte conta na carteira do seu projeto.
4. **Itens do lançamento agrupado:**
   - a soma dos itens é igual ao valor do lançamento;
   - item com documento "NF" exige número e data de emissão antes de ser conciliado (ver [documentos-fiscais](documentos-fiscais.md)).
5. Ação em lote:
   - mostra antes quantos títulos e qual o total afetado;
   - pede confirmação;
   - grava uma linha de auditoria por título.
6. **Não se exclui título com baixa:** estorne antes. Excluir em lote só aceita títulos sem baixa.
7. Toda alteração de valor, vencimento, classificação ou situação grava auditoria (antes → depois).
8. Filtros combinados retornam só a interseção das condições.
9. Título acima do orçado da categoria fica `pendente_autorizacao` ([orcamento-e-saude-financeira](orcamento-e-saude-financeira.md) regra 2).
10. Título de projeto `fechado` não é criado nem muda de valor.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Salvar sem campo obrigatório | 422 | (validação por campo) |
| Rateio que não soma o valor do título | 422 | As partes do rateio somam R$ X, mas o lançamento é de R$ Y |
| Código de projeto do rateio inexistente | 422 | Projeto {código} não encontrado (linha N) |
| Valor do rateio com "R$" ou texto | 422 | Linha N: use só números no valor |
| Itens que não somam o lançamento | 422 | Os itens somam R$ X, mas o lançamento é de R$ Y |
| Excluir título com baixa (sozinho ou em lote) | 409 | N títulos têm baixa — estorne antes de excluir |
| Programar ou pagar título `pendente_autorizacao` | 409 | Esse lançamento está acima do orçamento e ainda não foi autorizado |
| Lançar em projeto fechado | 409 | Projeto fechado — peça a reabertura a um administrador |

## Critérios de aceite

- [ ] Colar 50 linhas "código; valor" gera um lançamento rateado; cada projeto mostra a sua parte na carteira.
- [ ] Um rateio com 1 linha a mais de R$ 10 mostra a diferença e não salva.
- [ ] Importar uma planilha de 14 incentivos cria 1 lançamento com 14 itens, a planilha anexada e o total batendo.
- [ ] Selecionar as 8 parcelas de rateio de uma pessoa e dar baixa em lote baixa as 8 com a mesma data e conta.
- [ ] Reclassificar 3 títulos para outro projeto grava 3 linhas de auditoria.
- [ ] Os ícones de ação mostram legenda ao passar o mouse e ao focar pelo teclado.
- [ ] Uma provisão de R$ 6.000 substituída por uma folha real de R$ 5.800 some do previsto e aparece o real.
- [ ] Uma folha recebida 1 dia antes do vencimento aparece como "documentação atrasada".
- [ ] Filtros combinados trazem a interseção exata, e a exportação leva os filtros no cabeçalho.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Reunião 21/10 1:04–9:53, 20:36–23:06, 27:41, 46:33–47:49]: lançamento atual, rateio, lote, provisão, atraso de documentação.
- [SGE4B §5.1, §6.1, §10 CT-01, CT-07]; [SGE4B §4.3].
