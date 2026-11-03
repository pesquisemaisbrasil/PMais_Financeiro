# 2026-11-03: Kickoff com o financeiro

- **Data:** 03/11/2026, 25 min (a transcrição bruta está em `Financeiro P+ _ KickOff.docx`, nesta pasta; o .docx não é versionado, por isso este registro).
- **Quem:** Bruna Palagano e Camila Fernochi (financeiro); Bruno Conrado e João Paulo, o PO (P+).
- **O que é:** a primeira demonstração do protótipo de validação ([prototipo/financeiro](../../prototipo/financeiro/)) ao financeiro. Os specs apontam para este registro. Minutos no formato `mm:ss` da transcrição.
- **A reunião foi interrompida.** A chamada caiu por volta de 18:00 (queda de internet em Maringá, depois do temporal de 02/11) e **o resto do protótipo não foi visto**. Será **remarcada**; até lá o feedback segue pelo grupo.

## Decisões e informações

| # | Decisão / informação | Minuto |
|---|---|---|
| K1 | O dia a dia do financeiro é **contas a pagar e a receber**. O pagamento de entrevistadores (entrevista validada no Connect) chega **sozinho como lançamento agrupado em Contas a pagar**: um lançamento por projeto × data de pagamento, com itens por pessoa. O financeiro não precisa entrar numa tela de projeto para pagar | 8:26–10:53 |
| K2 | **Comprovantes, planilha e NF ficam no lançamento de Contas a pagar.** O PDF de comprovantes é enviado a partir do lançamento; a baixa volta ao Connect e o entrevistador recebe o aviso "pagamento realizado" (acaba com gente perguntando). Bruna: "Não precisa ficar caçando em nenhum outro lugar… eu vou abrir as contas do dia e sei que os anexos de planilha, nota fiscal, vai estar tudo ali" | 8:04–9:22, 13:06–13:23 |
| K3 | Na lista de Contas a pagar, o lançamento agrupado (entrevistadores ou incentivos) **abre a planilha e os itens ali mesmo**, sem ir para outra tela. Camila: "tem 14 entrevistados… eu clico e abro a planilha". Clicar no **código do projeto**, na coluna Projeto, abre a visão do projeto (sugestão do Bruno, aceita) | 10:58–12:36 |
| K4 | A tela por projeto (hoje "Entrevistadores") vira **relatório do projeto**: orçamento, lançado, pago, a pagar, saldo e os anexos de todos os lançamentos do projeto. Uso: fechar relatório e responder "quanto foi gasto no 1804". Não é onde se paga | 12:41–13:23 |
| K5 | **Incentivo a respondentes** chega hoje **por e-mail, em planilha**, tirada do banco de dados de respondentes. O Connect **não** tem entrevistados/respondentes; isso é evolução futura (coordenador → supervisor → entrevistador → entrevistado). Por agora, **importar a planilha de incentivos** no Financeiro. Volume: 5 nomes ou 200+ (no dia, 3 planilhas de ~250) | 13:23–16:27 |
| K6 | O **prazo do incentivo depende do tipo de projeto**, em **dias úteis a partir da data da resposta**: Health, cerca de 10 dias úteis; "CLT", 3 a 4 dias úteis (termo da transcrição; confirmar se é CATI ou outro tipo, F22). Uma planilha traz respostas de várias datas, e **o sistema lê a coluna "data da pesquisa" e gera um lançamento por data de pagamento** ("5 incentivos no dia X, 10 no dia Y"). Hoje a Camila calcula à mão e devolve o cronograma ao projeto; o sistema deve gerar esse cronograma. Lançar com uma data única vinda do Connect seria errado | 15:07–17:50 |
| K7 | Nem todo projeto tem incentivo. Bruno sugeriu marcar no projeto o **tipo de projeto, se tem incentivo e o prazo**. Onde configurar (Connect ou Financeiro) ficou aberto (F23) | 16:31–17:10 |
| K8 | A tela **Início** é um resumo e foi aceita sem objeção. O feedback pode vir pelo botão "Regra a validar" ou pelo grupo; a Bruna está nas **duas primeiras semanas do mês corridas**, então a validação é assíncrona e pontual | 0:03–4:27 |
| K9 | As próximas demonstrações vão usar **dados reais** carregados do SGE4B (o login de consulta já foi recebido) | 0:46–1:34 |

Também ficou dito (sem decisão nova): o pagamento de entrevistadores é um lançamento por projeto (ex.: 1804), e a mesma lógica de planilha vale para entrevistadores e incentivos (7:40–8:04); o Connect agrupa por projeto, com coordenador e supervisor como hoje (6:34–7:09).

## O que muda nos specs

- **K1, K2:** o ponto de entrada do pagamento de entrevistadores é o **lançamento agrupado em Contas a pagar**. A tela de projeto deixa de ser o lugar de pagar. Planilha, PDF de comprovantes, NF e a baixa ficam no lançamento, e a baixa aplicada gera o aviso "pagamento realizado" ao entrevistador, no Connect. Ver [contas-a-pagar](../specs/contas-a-pagar.md), [pagamentos-a-pagar](../specs/pagamentos-a-pagar.md), [comprovantes-e-baixa](../specs/comprovantes-e-baixa.md) e [integracao-com-o-connect](../specs/integracao-com-o-connect.md).
- **K3:** o lançamento agrupado abre os itens na própria lista; o código do projeto leva ao relatório do projeto ([contas-a-pagar](../specs/contas-a-pagar.md)).
- **K4:** a tela do projeto vira relatório ([relatorios-e-analises](../specs/relatorios-e-analises.md), [projetos-financeiros](../specs/projetos-financeiros.md)).
- **K5, K6, K7:** incentivo importado por planilha, com prazo em dias úteis por tipo de projeto e **um lançamento por data de pagamento** ([contas-a-pagar](../specs/contas-a-pagar.md), [folha-de-campo](../specs/folha-de-campo.md), [regras-de-pagamento-de-campo](../specs/regras-de-pagamento-de-campo.md), [lotes-de-pagamento-de-campo](../specs/lotes-de-pagamento-de-campo.md)). Respondentes no Connect entram como [futuro](../specs/futuro/README.md).
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

**Futuro:** respondentes/entrevistados no Connect (base de respondentes, com o incentivo saindo de lá). Ver [futuro](../specs/futuro/README.md).

## Próximos passos

- **Remarcar** a reunião para ver o resto do protótipo (planilha, comprovantes, conciliação, relatórios). Bruno propôs falar pelo grupo.
- Usar o botão "Regra a validar" ou o grupo para o feedback pontual, sem reunião.
- Carregar **dados reais** do SGE4B na próxima demonstração (K9).
