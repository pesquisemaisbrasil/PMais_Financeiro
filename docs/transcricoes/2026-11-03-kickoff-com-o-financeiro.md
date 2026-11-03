# 2026-11-03: Kickoff com o financeiro

- **Data:** 03/11/2026, 25 min (a transcrição bruta está em `Financeiro P+ _ KickOff.docx`, nesta pasta; o .docx não é versionado, por isso este registro).
- **Quem:** Bruna Palagano e Camila Fernochi (financeiro); Bruno Conrado e João Paulo, o PO (P+).
- **O que é:** a primeira demonstração do protótipo de validação ([prototipo/financeiro](../../prototipo/financeiro/)) ao financeiro. Os specs apontam para este registro. Minutos no formato `mm:ss` da transcrição.
- **A reunião foi interrompida.** A chamada caiu por volta de 18:00 (queda de internet em Maringá, depois do temporal de 02/11) e **o resto do protótipo não foi visto**. Será **remarcada**; até lá o feedback segue pelo grupo.

## Decisões e informações

| # | Decisão / informação | Minuto |
|---|---|---|
| K1 | O dia a dia do financeiro é **contas a pagar e a receber**. O pagamento de entrevistadores (entrevista validada no Connect) chega **sozinho como lançamento agrupado em Contas a pagar**: um lançamento por projeto × data de pagamento, com itens por pessoa. O financeiro não precisa entrar numa tela de projeto para pagar. **O Contas a pagar alimenta o projeto, e não o contrário**: a Bruna lança, baixa e anexa no CP, e o projeto só reflete isso (B4, B5) | 8:26–10:53 |
| K2 | **Comprovantes, planilha e NF ficam no lançamento de Contas a pagar.** O PDF de comprovantes é enviado a partir do lançamento; a baixa volta ao Connect e o entrevistador recebe o aviso "pagamento realizado" (acaba com gente perguntando). A Bruna chegou a perguntar se anexaria o comprovante no CP ou "em cima da planilha" (9:48) e, na discussão seguinte, escolheu o CP. Bruna: "Não precisa ficar caçando em nenhum outro lugar… eu vou abrir as contas do dia e sei que os anexos de planilha, nota fiscal, vai estar tudo ali" (B7) | 8:04–9:22, 9:48–10:53, 13:06–13:23 |
| K3 | Na lista de Contas a pagar, o lançamento agrupado (entrevistadores ou incentivos) **abre a planilha e os itens ali mesmo**, sem ir para outra tela. Camila: "tem 14 entrevistados… eu clico e abro a planilha", senão "alguns eu pego aqui, alguns em entrevista, alguns em folhas" (C1, C2). O detalhe é opcional: "se quiser uma visão mais detalhada, clica; se não, não" (C3). Clicar no **código do projeto**, na coluna Projeto, abre a visão do projeto (sugestão do Bruno, aceita pelas duas, X1) | 10:58–12:36 |
| K4 | A tela por projeto (hoje "Entrevistadores") vira **relatório do projeto**: orçamento, lançado, pago, a pagar, saldo e os anexos de todos os lançamentos do projeto. Bruna: "ele pode puxar para lá como se fosse um relatório" (B6); "entrevistadores para mim é relatório" (B7). Uso: fechar relatório e responder "quanto foi gasto no 1804". Não é onde se paga | 12:05–13:23 |
| K5 | **Incentivo a respondentes** chega hoje **por e-mail, em planilha**, tirada do banco de dados de respondentes. O Connect **não** tem entrevistados/respondentes; isso é evolução futura (coordenador → supervisor → entrevistador → entrevistado). Por agora, **importar a planilha de incentivos** no Financeiro. Volume: 5 nomes ou 200+ (no dia, 3 planilhas de ~250) | 13:23–16:27 |
| K6 | O **prazo do incentivo depende do tipo de projeto**, em **dias úteis a partir da data da resposta**: Health, cerca de 10 dias úteis; "CLT", 3 a 4 dias úteis (termo da transcrição; confirmar se é CATI ou outro tipo, F22). Uma planilha traz respostas de várias datas, e **o sistema lê a coluna "data da pesquisa" e gera um lançamento por data de pagamento** ("5 incentivos no dia X, 10 no dia Y"). Hoje a Camila calcula à mão e devolve o cronograma ao projeto; o sistema deve gerar esse cronograma. Lançar com uma data única vinda do Connect seria errado (C5). Quando a planilha já traz a data de pagamento, vale K12 | 15:07–17:50 |
| K7 | Nem todo projeto tem incentivo. Bruno sugeriu marcar no projeto o **tipo de projeto, se tem incentivo e o prazo**. Onde configurar (Connect ou Financeiro) ficou aberto (F23) | 16:31–17:10 |
| K8 | A tela **Início** é um resumo e foi aceita sem objeção. O feedback pode vir pelo botão "Regra a validar" ou pelo grupo; a Bruna está nas **duas primeiras semanas do mês corridas**, então a validação é assíncrona e pontual (B1, B2) | 0:03–4:27 |
| K9 | As próximas demonstrações vão usar **dados reais** carregados do SGE4B (o login de consulta já foi recebido) | 0:46–1:34 |
| K10 | **Contas a pagar é o único lugar onde se paga** (decisão do PO depois da reunião, com base em B4, B5, C1, C2 e B7). Ficam no CP: os lançamentos agrupados (entrevistadores do Connect, folha de campo, incentivos), a **importação de planilha** e as **provisões**. A tela "Folha, incentivos e notas" vira **"Notas e RPA"**: só NF pendente, lista de RPA e conferência de notas do portal | depois da reunião |
| K11 | O Contas a pagar **abre nas contas do dia**, com a opção de semana, mês e ano que já existe (B7, C1) | 10:58–11:36, 13:23 |
| K12 | A planilha de incentivo pode **já trazer a data de pagamento** (caso "CLT": "200 incentivos, valor unitário, total, para pagar tal dia"). A importação usa a data informada quando houver; senão calcula pela data da pesquisa + o prazo do tipo de projeto (B8) | 15:40–16:15 |
| K13 | O **Contas a receber ganha filtros** no mesmo padrão do CP: período, situação, cliente, projeto, empresa e busca (pedido do PO, sem fala na reunião) | depois da reunião |

Também ficou dito (sem decisão nova): o pagamento de entrevistadores é um lançamento por projeto (ex.: 1804), e a mesma lógica de planilha vale para entrevistadores e incentivos (7:40–8:04); o Connect agrupa por projeto, com coordenador e supervisor como hoje (6:34–7:09).

## Falas do financeiro

As falas da Bruna e da Camila que sustentam as decisões. Citações fiéis e curtas (a transcrição é automática, então só a pontuação foi arrumada). X1 e X2 são do Bruno, mas condicionam o que as duas aceitaram.

| # | Quem | Minuto | Fala | Consequência |
|---|---|---|---|---|
| B1 | Bruna | 0:03–0:38 | "É muito corrida essas duas primeiras semanas do mês… eu vou olhar e falar assim: está isso mesmo" | Validação pontual e assíncrona (K8) |
| B2 | Bruna | 3:28 | "A página inicial é um resumo" | Início = resumo (K8) |
| B3 | Bruna | 5:49 | Achou que o supervisor preencheria a planilha e a subiria no sistema; o João corrigiu: ela vem sozinha do Connect | A planilha nasce do Connect (K1) |
| B4 | Bruna | 8:26–9:48 | "Ele vai abrir um lançamento para mim lá no dia, desse projeto?… Sandra Ribeiro tem que pagar 120 reais… vai estar um lançamento para mim lá no contas a pagar." Pergunta se anexa o comprovante no CP ou "em cima da planilha" | O lançamento nasce no CP, na data de pagamento (K1, K2) |
| B5 | Bruna | 10:15–10:53 | "Nosso dia a dia é contas a pagar e receber. A gente abre, faz o lançamento, dá baixa e anexa o comprovante aí… a gente lançando aí, ele jogue para a parte do projeto." O projeto é só "para fechar relatório ou acompanhar"; ir de uma tela à outra é mais difícil | **O CP alimenta o projeto, não o contrário.** Tudo se opera no CP (K1, K10) |
| C1 | Camila | 10:58–11:36 | Uma linha do CP pode ser uma planilha de incentivos; o CP "relaciona tudo que tem para pagar no dia". "Eu consigo clicar ali e abrir a planilha?" Senão "alguns eu pego aqui, alguns em entrevista, alguns em folhas" | **Nada a pagar fora do CP**: folha, incentivo, entrevistadores, provisão (K3, K10) |
| C2 | Camila | 11:52 | "Tem 14 entrevistados… tem que ter como eu pegar a planilha ali, sem sair daí para outra tela" | Itens e planilha abertos na linha do CP (K3) |
| B6 | Bruna | 12:05 | "Ele pode puxar para lá como se fosse um relatório" | O projeto é relatório (K4) |
| X1 | Bruno | 12:11 | Clicar no projeto, na coluna Projeto do CP, expande para a visão do projeto. Camila e João concordam | Código do projeto vira link (K3) |
| C3 | Camila | 12:34 | "Se quiser uma visão mais detalhada, clica; se não quiser detalhar, não" | Detalhe opcional; lista enxuta por padrão (K3) |
| B7 | Bruna | 12:41–13:23 | "Entrevistadores para mim seria tipo relatório." "Quanto foi gasto no 1804: eu entro no relatório, tenho orçamento, gastei tanto." "De anexos, ele joga no contas a pagar." "**Eu vou abrir as contas do dia** e sei que os anexos de planilha, nota fiscal, vai estar tudo ali" | K4; o CP abre nas contas do dia (K11); anexos no lançamento (K2) |
| C4 | Camila | 14:09–14:42 | "A gente recebe por e-mail a planilha." Se o Connect tivesse o banco de respondentes, "pode ser que se consiga de lá" | Importar a planilha por ora (K5); respondentes no Connect é [futuro](../specs/futuro/respondentes-e-incentivos-no-connect.md) |
| B8 | Bruna | 15:07–16:27 | O prazo depende do tipo de projeto (Health: 10 dias úteis). A planilha traz respostas de 30/10, 31/10, 01/11 e 02/11; a Camila conta os dias úteis e devolve "5 incentivos no dia tal, 10 no dia tal", e a Bruna lança "100 reais tal dia, 200 reais tal dia, em cima daquela planilha". "CLT": 3 dias úteis (Camila, 16:01: "de 3 a 4"). "Geralmente elas já mandam: 200 incentivos, valor unitário é tanto, valor total é tanto, para ser pago tal dia." De 5 a 200 nomes; "hoje recebemos 3 planilhas de 250" | K6 e K12 |
| C5 | Camila | 17:24 | O problema de lançar direto no CP é a data: o pessoal respondeu em várias datas "e eu distribuiria em 5 dias diferentes"; o Connect lançaria uma data só | Nunca uma data única (K6) |
| B9 | Bruna | 17:40 | "O sistema teria que ler a coluna da data da pesquisa para destrinchar o que vai ficar em cada dia" | Um lançamento por data de pagamento (K6) |
| X2 | Bruno | 24:56 | Estavam mudando algumas regras "porque vocês passaram como funciona o dia a dia"; falta "alinhar os outros pontos" em outra call | Reunião a remarcar |

## O que muda nos specs

- **K1, K2, K10, K11:** o ponto de entrada do pagamento é o **lançamento agrupado em Contas a pagar**, que abre nas contas do dia. A tela de projeto deixa de ser o lugar de pagar; a importação de planilha e as provisões ficam no CP, e a tela de notas e RPA fica só com o que é fiscal. Planilha, PDF de comprovantes, NF e a baixa ficam no lançamento, e a baixa aplicada gera o aviso "pagamento realizado" ao entrevistador, no Connect. Ver [contas-a-pagar](../specs/contas-a-pagar.md), [pagamentos-a-pagar](../specs/pagamentos-a-pagar.md), [comprovantes-e-baixa](../specs/comprovantes-e-baixa.md) e [integracao-com-o-connect](../specs/integracao-com-o-connect.md).
- **K3:** o lançamento agrupado abre os itens na própria lista; o código do projeto leva ao relatório do projeto ([contas-a-pagar](../specs/contas-a-pagar.md)).
- **K4:** a tela do projeto vira relatório ([relatorios-e-analises](../specs/relatorios-e-analises.md), [projetos-financeiros](../specs/projetos-financeiros.md)).
- **K13:** filtros no [contas-a-receber](../specs/contas-a-receber.md).
- **K5, K6, K7, K12:** incentivo importado por planilha, com prazo em dias úteis por tipo de projeto (ou a data que a planilha já traz) e **um lançamento por data de pagamento** ([contas-a-pagar](../specs/contas-a-pagar.md), [folha-de-campo](../specs/folha-de-campo.md), [regras-de-pagamento-de-campo](../specs/regras-de-pagamento-de-campo.md), [lotes-de-pagamento-de-campo](../specs/lotes-de-pagamento-de-campo.md)). Respondentes no Connect entram como [futuro](../specs/futuro/README.md).
- **K8, K9:** [roadmap](../planning/roadmap.md) (protótipo revisto, reunião a remarcar, dados reais).
- **Tag de origem nos specs:** `[Kickoff 03/11 mm:ss]`.
- **Sem decisão (volta ao PO):** o prazo do incentivo por tipo, onde marcar o tipo de projeto, as colunas da planilha de incentivos e se o lançamento de entrevistadores é por projeto × data ou por ciclo. Ver as perguntas abaixo.

## Perguntas novas

Entram em [perguntas-abertas](../planning/perguntas-abertas.md), seção "Kickoff de 03/11 (novas)".

| # | Pergunta | Dono | Proposta |
|---|---|---|---|
| F22 | Tabela de prazos do incentivo por tipo de projeto (Health 10 dias úteis? "CLT"/CATI 3 ou 4? consumo?). Conta a partir da data da resposta? | Financeiro (Camila) | Prazo em dias úteis no projeto, contado da data da resposta |
| F23 | Onde se marca tipo de projeto, "tem incentivo" e prazo: no Connect (coordenador) ou no Financeiro? | PO | Connect, lido pelo Financeiro; no protótipo, campo no cadastro do projeto |
| F24 | Colunas padrão da planilha de incentivos (nome, CPF?, chave Pix, valor, data da resposta, projeto) | Financeiro | Modelo fixo para importar |
| F25 | Entrevistadores: um lançamento por projeto × data de pagamento ou um por ciclo com vários projetos? | PO + financeiro | Um por projeto × data de pagamento |

**Futuro:** respondentes/entrevistados no Connect (base de respondentes, com o incentivo saindo de lá). Ver o [spec futuro](../specs/futuro/respondentes-e-incentivos-no-connect.md).

## Próximos passos

- **Remarcar** a reunião para ver o resto do protótipo (planilha, comprovantes, conciliação, relatórios). Bruno propôs falar pelo grupo.
- Usar o botão "Regra a validar" ou o grupo para o feedback pontual, sem reunião.
- Carregar **dados reais** do SGE4B na próxima demonstração (K9).
