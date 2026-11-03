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
  - internos fixos (supervisor, gerente, coordenador) continuam como lançamento individual [Reunião 21/10 22:31];
  - **o lançamento abre os itens ali mesmo**, na lista, sem ir para outra tela: com 14 entrevistados, clicar no lançamento mostra a planilha com os 14 itens [Kickoff 03/11 10:58–12:36];
  - **comprovantes, planilha e NF ficam no lançamento**: o PDF de comprovantes é enviado a partir dele e os anexos ficam todos ali [Kickoff 03/11 8:04–9:22, 13:06–13:23];
  - clicar no **código do projeto**, na coluna Projeto, abre o relatório do projeto ([relatorios-e-analises](relatorios-e-analises.md)) [Kickoff 03/11 12:11–12:36].
- **Pagamento de entrevistadores chega sozinho** [Kickoff 03/11 8:26–10:53]:
  - quando a entrevista é validada no Connect, o Financeiro cria um **lançamento agrupado** em Contas a pagar, **um por projeto × data de pagamento** (a data vem do prazo do projeto), com um item por pessoa. Marcado "Do Connect";
  - o financeiro não precisa entrar numa tela de projeto para pagar: baixa o lançamento, envia o PDF de comprovantes e a baixa volta ao Connect, que avisa cada entrevistador ("pagamento realizado");
  - se o lançamento é por projeto × data ou um por ciclo com vários projetos é a pergunta F25.
- **Incentivo a respondentes por planilha** [Kickoff 03/11 13:23–17:50]:
  - hoje a planilha chega por e-mail (tirada do banco de respondentes, que o Connect ainda não tem); o financeiro a **importa** aqui, com 5 ou mais de 200 nomes;
  - o **prazo depende do tipo de projeto**, em **dias úteis a partir da data da resposta** (Health: cerca de 10; outros tipos: 3 a 4; tabela a confirmar, F22). Os feriados entram na conta de dias úteis;
  - o sistema lê a coluna **"data da pesquisa"** e gera **um lançamento por data de pagamento**, cada um com os seus itens e a planilha anexada. Importar não cria um lançamento único com data única;
  - a prévia mostra o **cronograma** ("N incentivos → pagar dd/mm · R$ X"), que o financeiro pode devolver ao projeto;
  - projeto sem incentivo não recebe planilha de incentivos; tipo de projeto, "tem incentivo" e prazo ficam no projeto (onde configurar: F23); colunas da planilha: F24.
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
   - a **NF pendente é só aviso** e não bloqueia o pagamento do item (decisão do PO em 28/10/2026, ver [documentos-fiscais](documentos-fiscais.md));
   - item com documento "NF" recebida exige número e data de emissão antes de ser conciliado (ver [documentos-fiscais](documentos-fiscais.md));
   - a importação de incentivos **divide por data de pagamento**: cada data é um lançamento, e a soma dos lançamentos é igual ao total da planilha.
5. **Prazo do incentivo** = data da pesquisa + N dias úteis do tipo do projeto, pulando fins de semana e feriados. Vencimento nunca cai em dia não útil. Projeto sem prazo de incentivo definido não importa planilha (ver Casos negados).
6. Ação em lote:
   - mostra antes quantos títulos e qual o total afetado;
   - pede confirmação;
   - grava uma linha de auditoria por título.
7. **Não se exclui título com baixa:** estorne antes. Excluir em lote só aceita títulos sem baixa.
8. Toda alteração de valor, vencimento, classificação ou situação grava auditoria (antes → depois).
9. Filtros combinados retornam só a interseção das condições.
10. Título acima do orçado da categoria fica `pendente_autorizacao` ([orcamento-e-saude-financeira](orcamento-e-saude-financeira.md) regra 2).
11. Título de projeto `fechado` não é criado nem muda de valor.

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
| Importar incentivos em projeto sem prazo de incentivo definido | 409 | Defina o prazo do incentivo no projeto antes de importar a planilha |
| Planilha de incentivos sem a coluna de data da pesquisa | 422 | A planilha precisa da coluna "data da pesquisa" |

## Critérios de aceite

- [ ] Colar 50 linhas "código; valor" gera um lançamento rateado; cada projeto mostra a sua parte na carteira.
- [ ] Um rateio com 1 linha a mais de R$ 10 mostra a diferença e não salva.
- [ ] Importar uma planilha de 14 incentivos de uma só data cria 1 lançamento com 14 itens, a planilha anexada e o total batendo.
- [ ] Uma planilha de 15 incentivos de 4 datas de resposta num projeto Health (10 dias úteis) gera 4 lançamentos, cada um com vencimento 10 dias úteis depois da sua data, pulando feriados, e a soma bate com o total da planilha.
- [ ] Num projeto de tipo com prazo de 3 dias úteis, a mesma planilha gera os vencimentos 3 dias úteis depois de cada data.
- [ ] A prévia da importação mostra o cronograma "N incentivos → pagar dd/mm · R$ X" por data.
- [ ] Uma entrevista validada no Connect aparece em Contas a pagar como lançamento "Do Connect" do projeto, sem o financeiro abrir tela de projeto; clicar nele abre os itens na própria lista.
- [ ] Enviar o PDF de comprovantes a partir do lançamento dá baixa nos itens, anexa a planilha e os comprovantes ao lançamento e o entrevistador recebe "pagamento realizado".
- [ ] Clicar no código do projeto na lista abre o relatório do projeto.
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
- [Kickoff 03/11 8:04–17:50]: pagamento de entrevistadores como lançamento agrupado, anexos no lançamento, itens abertos na lista, incentivo por planilha com prazo em dias úteis e divisão por data.
- [SGE4B §5.1, §6.1, §10 CT-01, CT-07]; [SGE4B §4.3].

## Ajustes

- 2026-10-23: o lançamento ganha o campo **código de barras / linha digitável**, separado da observação, porque hoje o financeiro o guarda na observação e copia para o banco ([respostas do financeiro](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), A3). Ler o boleto do e-mail automaticamente é futuro (F16).
- 2026-10-23: gasto de **cartão de crédito** é lançamento rateado por fornecedor, projeto e categoria, conforme o extrato (A2). Importar a fatura é futuro (F17).
- 2026-10-23: **boletos de impostos** vêm da contabilidade e entram como contas a pagar comuns; o sistema não apura impostos (A5). **Adiantamentos de viagem** são lançamentos comuns com anexos; o controle de saldo a comprovar é futuro ([spec](futuro/adiantamentos-e-prestacao-de-contas.md)).
- 2026-10-23: **transferência entre empresas** do Grupo (hoje não usada, mas pode acontecer) é marcada no lançamento, para o consolidado não contar duas vezes (F15).
- 2026-10-28: item com NF pendente não bloqueia o pagamento (decisão do PO em 28/10/2026, ver [documentos-fiscais](documentos-fiscais.md)).
- 2026-11-03: o pagamento de entrevistadores chega **sozinho como lançamento agrupado** (um por projeto × data de pagamento); planilha, comprovantes e NF ficam no lançamento, que abre os itens na lista; o código do projeto abre o relatório do projeto; a planilha de incentivos é importada e **dividida por data de pagamento**, com prazo em dias úteis por tipo de projeto ([kickoff com o financeiro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), K1 a K3, K5 a K7). Perguntas F22 a F25.
