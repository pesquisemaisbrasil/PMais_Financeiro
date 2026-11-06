# Spec: Contas a pagar

> **Módulo 3 — Contas a pagar e a receber.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato dos títulos a pagar (fornecedores, folhas, incentivos, internos, despesas, provisões), com o painel, o rateio e as ações em lote que o financeiro usa hoje no SGE4B.

## Comportamento

- **Contas a pagar é o único lugar onde se paga** [Kickoff 03/11 8:26–10:53, 10:58–11:36]: lançamentos comuns, folhas de campo, entrevistadores do Connect, incentivos e provisões ficam todos aqui, com a **importação de planilha**. Não há outra tela para pagar. A tela de projeto e a de notas e RPA não pagam: o projeto é relatório e só reflete o que se lança aqui.
- **Painel** com visão por dia, semana, mês, ano ou período, navegação entre períodos, "hoje", atualizar e "nova conta a pagar". **Abre na visão do dia (hoje)**: "eu vou abrir as contas do dia e sei que os anexos… vai estar tudo ali" [Kickoff 03/11 13:23]. Semana, mês e ano continuam a um clique.
- **Indicadores** (quantidade e valor; clicar abre a lista filtrada): Total, Pagos, Pendentes, Vencidos, Hoje, A vencer e **Provisões**.
- **Filtros combináveis:** fornecedor, projeto, categoria (plano de contas), linha do DRE, palavra-chave, empresa, unidade, centro de custo, forma de pagamento, situação, tipo (real/provisão) e intervalo de datas (vencimento, competência ou **baixa**). Cada filtro aceita **mais de uma opção** (dois projetos, duas situações): dentro do filtro vale "ou", entre filtros vale "e".
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
  - o usuário **escolhe o projeto e o valor de cada parte** nos campos (botão "Adicionar projeto") ou **cola** a lista "código do projeto + valor" (só números, sem "R$"), e o sistema distribui;
  - exemplo: quem recebe por projeto tem 50 projetos numa fatura e vira um lançamento só [Reunião 21/10 1:53–2:26, 46:55].
- **Lançamento agrupado com itens** (folha de entrevistadores, planilha de incentivos):
  - **um lançamento** por planilha ou projeto, com a planilha anexada [Reunião 21/10 6:55–8:01];
  - **importar a planilha** cria os **itens** do lançamento, um por pessoa: pessoa, valor, documento fiscal (NF com número e data de emissão, RPA, sem NF, incentivo) e status;
  - os itens permitem conciliar pagamento por pagamento e saber quem tem nota [Reunião 21/10 20:36–22:55];
  - internos fixos (supervisor, gerente, coordenador) continuam como lançamento individual [Reunião 21/10 22:31];
  - **o lançamento abre os itens ali mesmo**, na lista, sem ir para outra tela: com 14 entrevistados, clicar no lançamento mostra a planilha com os 14 itens [Kickoff 03/11 10:58–12:36]. O detalhe é opcional: a lista continua enxuta e só abre quando o usuário clica;
  - a **importação da planilha** (folha de campo ou incentivos) é feita aqui, na lista de Contas a pagar, e não em outra tela;
  - **comprovantes, planilha e NF ficam no lançamento**: o PDF de comprovantes é enviado a partir dele e os anexos ficam todos ali [Kickoff 03/11 8:04–9:22, 13:06–13:23];
  - clicar no **código do projeto**, na coluna Projeto, abre o relatório do projeto ([relatorios-e-analises](relatorios-e-analises.md)) [Kickoff 03/11 12:11–12:36].
- **Pagamento de entrevistadores chega sozinho** [Kickoff 03/11 8:26–10:53]:
  - quando a entrevista é validada no Connect, o Financeiro cria um **lançamento agrupado** em Contas a pagar, **um por projeto × data de pagamento** (a data vem do prazo do projeto), com um item por pessoa. Marcado "Do Connect";
  - o financeiro não precisa entrar numa tela de projeto para pagar: baixa o lançamento, envia o PDF de comprovantes e a baixa volta ao Connect, que avisa cada entrevistador ("pagamento realizado");
  - se o lançamento é por projeto × data ou um por ciclo com vários projetos é a pergunta F25.
- **Incentivo a respondentes por planilha** [Kickoff 03/11 13:23–17:50]:
  - hoje a planilha chega por e-mail (tirada do banco de respondentes, que o Connect ainda não tem); o financeiro a **importa** aqui, com 5 ou mais de 200 nomes;
  - o **prazo depende do tipo de projeto**, em **dias úteis a partir da data da resposta** (Health: cerca de 10; outros tipos: 3 a 4; tabela a confirmar, F22). Os feriados entram na conta de dias úteis;
  - a planilha **pode já trazer a data de pagamento** ("200 incentivos, valor unitário, total, para pagar tal dia"): então vale a data informada [Kickoff 03/11 15:40–16:15];
  - sem data de pagamento na planilha, o sistema lê a coluna **"data da pesquisa"** e gera **um lançamento por data de pagamento**, cada um com os seus itens e a planilha anexada. Importar não cria um lançamento único com data única;
  - a prévia mostra o **cronograma** ("N incentivos → pagar dd/mm · R$ X"), que o financeiro pode devolver ao projeto;
  - projeto sem incentivo não recebe planilha de incentivos; tipo de projeto, "tem incentivo" e prazo ficam no projeto (onde configurar: F23); colunas da planilha: F24.
- **Ações em lote** sobre os títulos selecionados:
  - **dar baixa** em todos de uma vez (por exemplo, todas as parcelas de rateio de uma pessoa);
  - **reclassificar** (projeto, categoria, centro de custo);
  - **copiar/duplicar**;
  - **excluir** [Reunião 21/10 8:15–9:18].
- **Provisão:** título `provisao` vindo do orçamento do projeto ([orcamento-e-saude-financeira](orcamento-e-saude-financeira.md)) ou criado à mão. **Fica na lista de Contas a pagar** (indicador e filtro "Provisões"), junto dos títulos reais [Kickoff 03/11, K10]:
  - "Substituir por real" vincula o título real e encerra a provisão;
  - "Atualizar do orçamento do Connect" refaz as provisões a partir do orçamento;
  - a provisão nunca é paga.
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
2. **Pendente = líquido + juros + multa − desconto − baixas**, calculado. O **líquido** é o valor principal + acréscimos − descontos − impostos da conta (veja os Ajustes de 06/11/2026); os juros, a multa e o desconto são os da **baixa**.
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
5. **Data de pagamento do incentivo:**
   - se a planilha **traz a data de pagamento**, vale ela (cada data distinta vira um lançamento);
   - se não traz, é a data da pesquisa + N dias úteis do tipo do projeto, pulando fins de semana e feriados. Vencimento calculado nunca cai em dia não útil;
   - projeto sem prazo de incentivo definido não importa planilha sem data de pagamento (ver Casos negados).
6. Ação em lote:
   - mostra antes quantos títulos e qual o total afetado;
   - pede confirmação;
   - grava uma linha de auditoria por título.
7. **Não se exclui título com baixa:** estorne antes. Excluir em lote só aceita títulos sem baixa.
8. Toda alteração de valor, vencimento, classificação ou situação grava auditoria (antes → depois).
9. Filtros combinados retornam só a interseção das condições.
10. Título acima do orçado da categoria fica `pendente_autorizacao` ([orcamento-e-saude-financeira](orcamento-e-saude-financeira.md) regra 2).
11. Título de projeto `fechado` não é criado nem muda de valor.
12. **Só se paga em Contas a pagar** (K10): baixa, envio de comprovantes e importação de planilha acontecem aqui. A tela de projeto e a de notas e RPA não dão baixa. Provisão não se paga, só se substitui por real.

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
| Importar incentivos sem data de pagamento em projeto sem prazo de incentivo definido | 409 | Defina o prazo do incentivo no projeto antes de importar a planilha |
| Pagar ou dar baixa numa provisão | 409 | Provisão não é paga — substitua pelo lançamento real |
| Planilha de incentivos sem a coluna de data da pesquisa | 422 | A planilha precisa da coluna "data da pesquisa" |

## Critérios de aceite

- [ ] Colar 50 linhas "código; valor" gera um lançamento rateado; cada projeto mostra a sua parte na carteira.
- [ ] Um rateio com 1 linha a mais de R$ 10 mostra a diferença e não salva.
- [ ] Importar uma planilha de 14 incentivos de uma só data cria 1 lançamento com 14 itens, a planilha anexada e o total batendo.
- [ ] Uma planilha de 15 incentivos de 4 datas de resposta num projeto Health (10 dias úteis) gera 4 lançamentos, cada um com vencimento 10 dias úteis depois da sua data, pulando feriados, e a soma bate com o total da planilha.
- [ ] Num projeto de tipo com prazo de 3 dias úteis, a mesma planilha gera os vencimentos 3 dias úteis depois de cada data.
- [ ] A prévia da importação mostra o cronograma "N incentivos → pagar dd/mm · R$ X" por data.
- [ ] Uma planilha de 200 incentivos que já traz a data de pagamento (valor unitário e total) gera um lançamento nessa data, sem recalcular pelo prazo do projeto, e o total bate.
- [ ] Ao abrir Contas a pagar, a lista mostra o período "dia" em hoje, com os lançamentos do dia e os anexos acessíveis; trocar para semana, mês ou ano continua possível.
- [ ] A importação de planilha (folha e incentivos) é feita pela própria tela de Contas a pagar, e nenhuma outra tela dá baixa.
- [ ] As provisões aparecem na lista e no filtro "Provisões" de Contas a pagar; tentar pagar uma provisão é negado, e "Substituir por real" a troca pelo título real.
- [ ] Com um lançamento de 14 entrevistados, a lista fica enxuta até o clique; clicar abre os 14 itens e os anexos sem trocar de tela.
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

- `backend/models/payable.py`, `backend/models/reference.py`, `backend/services/payable.py`, `backend/api/payables.py`.
- `frontend/src/app/(app)/contas-a-pagar/` e `frontend/src/lib/payables.ts`.
- `backend/scripts/seed_demo.py`: dados fictícios para ver as telas localmente.

**O que já funciona (primeira fatia do MVP):** painel que abre no dia, abas, indicadores, filtros, busca, colunas, lançamento com rateio, itens abertos na linha, baixa parcial e em lote, juros, multa e desconto, estorno, Pix devolvido, cancelar, excluir e histórico.

**O que ainda falta:** anexar ao lançamento a planilha importada (Q19), recorrência, provisão gerada do orçamento do Connect, autorização acima do orçamento, link do código do projeto para o relatório, lançamentos chegando do Connect (PF-6), reautenticação na baixa (Q20), seleção em mais de uma página e o filtro de linha do DRE, que depende do cadastro dessas linhas.

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
- 2026-11-04: a baixa é recusada com data no futuro, porque é o dia em que o dinheiro saiu. A spec não dizia, e foi resolvido do jeito mais seguro. Excluir é lógico: o título sai das listas e o histórico fica.
- 2026-11-04 (revisão da primeira fatia): baixa em lote é tudo ou nada e usa uma conta bancária só. Lançamento do Connect não é editado, cancelado nem excluído aqui. O mesmo projeto não se repete no rateio. Conta cancelada sai de Total e fica no indicador "Canceladas". Um ID de transação não dá baixa duas vezes; depois do estorno, vale de novo. Mudar o valor de título com itens ou rateio é recusado.
- 2026-11-04 (pedido do Bruno): o controle de período e a busca ficam dentro do quadro da lista, junto dos registros, e clicar na data abre um calendário para escolher um dia ou um intervalo, com as duas pontas incluídas. O menu lateral recolhe e lembra da escolha neste navegador.
- 2026-11-04: como no protótipo validado no kickoff, o prazo prevalece sobre `parcial` (título parcial que vence hoje mostra "Vence hoje"), a provisão aparece em Hoje e Vencidos, e Pix devolvido conta como vencido. A confirmar com o financeiro: Q21.
- 2026-11-03 (falas da Bruna e da Camila, K10 a K12): **Contas a pagar é o único lugar onde se paga**; a importação de planilha e as **provisões** ficam aqui; a tela abre **nas contas do dia**; e a planilha de incentivo que já traz a **data de pagamento** usa essa data, sem recalcular pelo prazo. O CP alimenta o projeto, e não o contrário ([kickoff](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), B4, B5, B7, C1, B8).
- 2026-11-04 (segunda fatia): **provisão** pode ser criada à mão, sem fornecedor, e aparece como "Provisão" na lista. Ao substituir, a pessoa escolhe uma conta real do mesmo projeto, ainda sem provisão ligada, ou lança o real agora com valor e fornecedor. O real lançado agora herda o vencimento, a competência e a classificação, e cada projeto mantém a sua proporção. Provisão substituída fica só no histórico: não é editada, cancelada nem excluída.
- 2026-11-04 (segunda fatia): **se a conta real for cancelada ou excluída, a provisão volta a valer**, com uma linha no histórico. O protótipo não tratava esse caso, e o previsto sumiria sem aviso; foi resolvido do jeito mais seguro.
- 2026-11-04 (segunda fatia): **duplicar** copia para o mês seguinte, e o dia que não existe vira o último do mês (31/01 vai para 28/02). Baixas não vão junto, e o número do documento, a emissão, o código de barras e a documentação recebida ficam em branco, porque são do mês original. Lançamento do Connect não é duplicado nem reclassificado aqui, porque quem manda nele é o Connect.
- 2026-11-04 (segunda fatia): **reclassificar** muda projeto, categoria ou centro de custo de várias contas, com uma linha no histórico por conta. Mudar o projeto deixa a conta 100% nele. Projeto fechado e conta encerrada são recusados, e o lote é tudo ou nada.
- 2026-11-04 (segunda fatia): **exportar** gera CSV com `;` e BOM para o Excel, com todas as contas dos filtros, sem paginar, e os filtros na primeira linha. Célula que começa com `=`, `+`, `-` ou `@` ganha um `'` na frente, para a planilha não executar fórmula.
- 2026-11-04 (segunda fatia): o intervalo de datas pode seguir o **vencimento, a competência ou a data da baixa**. Baixa estornada ou devolvida não conta na visão por data da baixa, porque o dinheiro não ficou fora.
- 2026-11-04 (importar planilha): a planilha é **lida em memória e descartada**. Até a Q19 e a Q22, ela não fica anexada ao lançamento, e **chave Pix e CPF não são lidos**: só as colunas do modelo saem do arquivo. Fica guardado um resumo do arquivo, que não permite recuperar o conteúdo, para avisar quando a mesma planilha vier de novo. O aviso não bloqueia, como no protótipo.
- 2026-11-04 (importar planilha): a planilha sem a coluna "data da pesquisa" é aceita quando traz a coluna "data de pagamento", porque o caso dos 200 incentivos (K12) já vem com a data. Linha com erro fica de fora e diz o motivo; a importação cria todos os lançamentos ou nenhum. Valor com mais de duas casas é recusado, para nunca arredondar sem ninguém ver.
- 2026-11-04 (detalhes por pessoa): a lista de pessoas do lançamento mostra, além de nome, documento e valor, a **data da pesquisa** (só incentivo, e só nas planilhas importadas a partir de agora), o **número e a emissão da nota**, o **bruto e o INSS do RPA** e o **pagamento**. O sistema ainda não registra o pagamento por pessoa, então a coluna mostra o do lançamento inteiro ("A pagar", "Paga em dd/mm/aaaa" ou "Baixa parcial do lançamento"). O pagamento por pessoa vem com o PDF de comprovantes. Duplicar o lançamento leva o bruto do RPA, mas não a nota, a emissão nem a data da pesquisa, que são do mês original.
- 2026-11-04 (importar planilha): tipo do projeto, "tem incentivo" e prazo ficam no projeto, aqui no Financeiro, até a F23 ser decidida. Os dias úteis pulam sábado, domingo e feriado nacional, como no protótipo; feriado municipal ainda não conta. Na folha de campo, o RPA paga o líquido com 11% de INSS, sem teto até a resposta da N3, e o bruto fica guardado no item.
- 2026-11-06 (filtros): **cada filtro aceita mais de uma opção** (fornecedor, projeto, categoria, empresa, unidade, centro de custo, forma, situação e tipo). Dentro de um filtro vale "ou"; entre filtros vale "e". Na API os valores vão separados por vírgula (`project=3,5`), no máximo 50 por filtro, e valor que não é número ou opção conhecida volta 422 "Filtro inválido". Um título rateado em dois projetos marcados aparece uma vez só. O CSV exportado escreve as opções com "ou" (`projeto=PRJ-1804 ou PRJ-1790`). Pedido do PO em 06/11/2026.
- 2026-11-06 (importar planilha): **projeto, empresa, unidade, centro de custo, categoria e forma de pagamento** podem vir em colunas opcionais da planilha, com o nome cadastrado: `Projeto` (ou `Código do projeto`, pelo código, com ou sem `PRJ-`), `Empresa`, `Unidade`, `Centro de custo`, `Categoria` (ou `Plano de contas`, pelo código ou pelo nome) e `Forma de pagamento` (ou `Forma`). Na tela, cada um desses campos aceita vários: vazio vale "Todos os da planilha", e marcar alguns deixa as outras linhas **fora da seleção** (não é erro). Célula vazia vale o que foi marcado, se houver um só, e é erro se houver nenhum ou vários. Nome que não existe, cadastro inativo, projeto encerrado e categoria de receita são erro da linha. A unidade é procurada dentro da empresa da linha, e unidade de outra empresa é erro. Campo **sem coluna** exige exatamente um marcado (422 "A planilha não tem a coluna ... Escolha um só ... na tela ou inclua a coluna na planilha"). Sai **um lançamento por combinação** de projeto, empresa, unidade, centro de custo, categoria e forma, vezes a data de pagamento (incentivos), ou um por combinação (folha, com `· PRJ-código` na descrição quando há mais de um, e a classificação quando o mesmo projeto aparece com mais de uma). Cada projeto usa o próprio prazo; se faltar prazo em algum, 409 citando todos. O **Tipo** (incentivos ou folha) continua um só, porque as colunas dos dois são diferentes. Pedido do PO em 06/11/2026; atualiza a F24.
- 2026-11-06 (dividir entre projetos): a divisão do valor passou a ser feita **em campos** (projeto e valor de cada parte, com "Adicionar projeto" e um aviso ao vivo de quanto falta ou passou), sem ninguém digitar separador. A **colagem** da planilha continua, agora num bloco "Colar várias linhas da planilha", e aceita o código e o valor separados por **espaço, tabulação (como o Excel cola) ou ponto e vírgula**; as linhas coladas viram campos para conferir antes de lançar. As recusas são as mesmas (projeto inexistente, valor com texto, soma diferente do valor), e agora também "escolha o projeto" e projeto repetido. Projeto fechado não aparece na lista. Pedido do PO em 06/11/2026: o ponto e vírgula obrigatório era ruim de digitar.
- 2026-11-06 (Excel): **Exportar** passou a oferecer **Excel (.xlsx)** e **CSV**. O Excel leva os mesmos filtros e colunas do CSV, com a primeira linha dizendo os filtros usados, **data e dinheiro como data e número de verdade** (o Excel soma, ordena e filtra), filtro nas colunas, primeira linha congelada e uma linha de **Total** (valor, pago e pendente). Texto que começa com `=`, `+`, `-` ou `@` fica como texto, nunca vira fórmula. Na API: `GET /payables/export?format=xlsx` (o padrão continua `csv`; outro valor volta 422). Pedido do PO em 06/11/2026. O CSV segue para quem importa em outros sistemas.
- 2026-11-06 (abrir e editar a conta): **clicar na linha** abre a conta (o ícone do olho continua), com as abas Detalhes, Baixas, Itens e Histórico, e o botão **Editar conta** no alto. A edição, que só mudava descrição, valor e vencimento, passou a mudar também **fornecedor, categoria, centro de custo, forma de pagamento, documento (tipo, número e emissão), código de barras, competência, documentação recebida e observações**, com uma única linha de auditoria com o antes e o depois. Empresa, unidade e projetos continuam fora da edição (projeto, categoria e centro de custo mudam em **Reclassificar**). As recusas são as do lançamento: nota fiscal exige número e emissão, categoria de receita e cadastro inativo são recusados, conta real não fica sem fornecedor, e projeto fechado trava a mudança de categoria e centro de custo. Lançamento com itens não muda de fornecedor aqui. Na API, `PATCH /payables/{id}` aceita os campos novos como opcionais: o que não vier não muda, e `null` limpa texto e data. Também ficou mais rígida a **competência**, que agora recusa mês inválido (`2026-13`), na criação e na edição. Pedido do PO em 06/11/2026.
- 2026-11-06 (anexos): a aba **Documentos** da conta aberta anexa, baixa e tira arquivos, como descreve [baixas-recorrencia-e-anexos](baixas-recorrencia-e-anexos.md). A planilha importada continua lida em memória e descartada (Q19, Q22).
- 2026-11-06 (detalhes da conta): a aba **Detalhes** segue o desenho do sistema antigo: rótulo à direita e valor ao lado, em blocos (situação e quem incluiu e alterou por último; empresa, unidade e fornecedor; plano de contas, centro de custo e projetos com a parte de cada um; descrição, observações, forma e documento; competência e vencimento; valores). "Última alteração" ignora o download de documento. Os valores seguem o ajuste de acréscimos, descontos e impostos, abaixo: **valor principal**, os três totais, **valor líquido**, pago e pendente. **Pagar em** do sistema antigo não aparece: não há data de pagamento prevista além do vencimento.
- 2026-11-06 (acréscimos, descontos e impostos): o formulário da conta (nova e editar) ganhou três totais, cada um com o botão que abre a **lista de lançamentos** (descrição e valor, quantas linhas quiser): **Acréscimos**, **Descontos** e **Impostos**. O total fica só para leitura. O **valor líquido** (valor principal + acréscimos − descontos − impostos) é o que a **lista**, os totais do topo, o **pendente**, a **baixa** e a exportação usam; o valor principal aparece na conta aberta e na planilha (colunas Valor principal, Acréscimos, Descontos, Impostos, Valor líquido). Líquido zero ou negativo é recusado (422), e editar não deixa o líquido ficar abaixo do que já foi pago (409). Cada mudança nas listas entra no histórico ("impostos R$ 30,00 → R$ 0,00"). O imposto lançado aqui é **retenção sobre o pagamento ao fornecedor**; a guia do imposto é outra conta (o sistema não apura imposto, A5). Conta **com pessoas** (folha, incentivo) não tem as listas (409), e conta **parcelada** recusa na criação (422): lance em cada parcela depois. Mensal e semanal repetem as listas em cada ocorrência, e duplicar copia. Dúvidas para a Vivi: Q29.
- 2026-11-06 (lugar dos valores): o **valor principal**, os três totais (acréscimos, descontos e impostos, cada um com o botão da lista) e o **valor líquido** formam **um bloco só**, na ordem do sistema antigo, alinhado à esquerda, com o rótulo em cima de cada campo e sem moldura em volta. Em **nova conta a pagar** o bloco vem logo depois de **Forma de pagamento** e **Projeto**, e **antes da divisão entre projetos** (e do "Colar várias linhas da planilha"), que vem antes de "Repetir esta conta"; a linha do topo tem só a data e o vencimento. Em **editar conta**, vem depois da classificação (fornecedor, categoria, centro de custo e forma de pagamento) e antes do documento; conta com pessoas mostra só o valor principal. Pedido do PO.
- 2026-11-06 (nome): o valor lançado da conta, que antes aparecia como "valor" e depois como "valor bruto", passa a se chamar **valor principal**, na tela e nas planilhas (pedido do PO). O nome interno da API continua `grossAmount`. O "bruto" do RPA, que é o valor antes do INSS, não muda.
