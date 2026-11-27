# 2026-11-26: Reunião de testes com o financeiro, já com os dados reais

- **Data:** 26/11/2026, 15h02, 1h09, online (transcrição automática do Teams). A transcrição bruta é o `Reunião testes _ Novo sistema financeiro.docx`, em `docs/transcricoes/`. O .docx não é versionado (`.gitignore`), por isso este registro.
- **Quem:** Bruna Palagano e Camila Fernochi, do financeiro; Bruno Conrado, do desenvolvimento; João Paulo (PO), que saiu aos 53 min. A Vivi foi chamada, mas não entrou.
- **O que é:** o primeiro uso do Financeiro no servidor local com os dados reais: contas a pagar e a receber de outubro e de novembro até 22 ou 23/11, e os cadastros do sistema antigo. A Camila compartilhou a tela e fez:
  - baixas, uma sozinha e outras em conjunto;
  - uma baixa parcial;
  - anexos;
  - o Carregar incentivos.

  No fim, o Bruno mostrou o relatório do projeto e perguntou como os lançamentos do Connect devem chegar.
- **Como ler:**
  - é um **resumo** com o minuto (`mm:ss` da transcrição), não a fala bruta;
  - ficaram fora valores, números de projeto e nomes de terceiros;
  - a transcrição tem muito ruído (frases soltas em inglês e nomes trocados), e os trechos duvidosos estão marcados *(a confirmar)*.

## Pedidos e decisões

| # | Pedido / decisão | O que foi feito | Minuto |
|---|---|---|---|
| R1 | **Sessão:** só cair depois de **2 horas sem uso**. Bruna: "pelo menos umas 2 horas". João: "De ociosidade, então… está tranquilo". No Connect, para administradores, são 15 minutos | Feito em 27/11: a sessão parada há mais de 2 horas cai (`SESSION_IDLE_MINUTES`), e a tela renova enquanto a pessoa mexe. Spec [acesso-e-auditoria](../specs/acesso-e-auditoria.md) | 3:15–4:20 |
| R2 | **Empresas não se misturam em Contas a pagar.** Bruna: "no contas a pagar ele não pode misturar as contas das empresas". Sugestão: "deixar uma preferencial". Ela também contou que só ela mexe na IRIA, que a Camila só vê a Pesquise+ e que outra pessoa só veria a IRIA | Feito em 27/11: escolha da **empresa** no alto de Contas a pagar e a receber, lembrada para cada pessoa (decisão do Bruno). **Limitar o acesso por conta** fica para a Vivi (Q65) | 14:44–17:40 |
| R3 | **Ordenar a lista.** Camila: "Não tem como classificar aqui por ordem?". Bruno: "vou colocar para as outras partes também" | Feito em 27/11: dá para ordenar também por projeto, centro de custo, forma e empresa (no a receber, por projeto). Toda coluna que ordena mostra o ícone | 19:54–20:23 |
| R4 | **Recarregar a página não volta para hoje.** Bruna: "ele atualiza a página e ele volta para o dia… é bom ele ficar na página que a gente está mexendo e só sair de lá se a gente mandar" | Feito em 27/11: cada aba lembra o dia, o período, os filtros, a busca e a ordem depois do F5. A lembrança fica na aba do navegador e some ao fechar a aba ou sair do sistema | 23:10–23:30 |
| R5 | **Observação na lista.** Bruna quis ver as observações na lista. A Camila preferiu escrever na **descrição** ("senão são 2 campos para preencher"), e a Bruna pediu "um campinho maior, de 2 linhas" | Feito em 27/11: na janela da conta, a descrição tem 2 linhas, e a quebra de linha aparece na lista. O campo Observações saiu das janelas de conta (o Bruno pediu ao validar) | 23:38–24:49 |
| R6 | **Número do documento na lista e no relatório.** Bruna: "é nota fiscal 112… isso para mim é importante, tanto para quando aparecer no relatório quanto no dia a dia". Pode ser "só mais uma linhazinha", sem destaque | Feito em 27/11: o número do documento aparece numa linha discreta embaixo da descrição. A coluna Documento, na lista e na exportação, mostra só o número (o do sistema antigo já vem como "NF 68") | 24:57–28:14 |
| R7 | **Projeto pelo nome.** A Bruna reconhece o projeto pelo nome, não pelo número. A busca pelo nome já funciona ("já ajuda") | Feito em 27/11: o filtro de projeto mostra o código e o nome | 28:43–30:40 |
| R8 | **Abrir a mesma tela em duas abas.** Bruna: deixa outubro aberto e duplica os lançamentos para novembro, "me permite abrir a mesma tela com buscas diferentes" | Feito em 27/11: o duplo clique no menu numa tela já aberta abre outra aba dela, por exemplo "Contas a pagar (2)" | 31:54–32:57 |
| R9 | **Carregar incentivos: data em outro formato** não era lida. Bruno: precisava ser "exatamente desse mesmo jeito" | Feito em 27/11: a data em texto é lida como 27/11/2026, 27/11/26, 27-11-2026, 27.11.2026 ou 2026-11-27. O erro diz o formato | 39:59–40:30 |
| R10 | **Carregar incentivos: sábado 28/11 foi para 01/12**, pulando a segunda 30/11. Bruna: "ele pulou dia 30" | Causa: o feriado estadual de Alagoas em 30/11 contava para o sistema todo, porque os feriados das 27 capitais valiam (ADR 0024). Feito em 27/11: **só os feriados nacionais contam** (decisão do Bruno), e os das capitais saem na próxima busca | 40:54–42:03 |
| R11 | **Carregar incentivos: a planilha de exemplo do Bruno não carregou.** Bruna: o plano de contas dela não bate com o cadastrado ("tem que estar incentivos") | Não é falha do sistema: a planilha modelo baixada da tela já traz as listas dos projetos, dos planos e das formas cadastrados | 44:04–44:57 |
| R12 | **Forma de pagamento:** as contas vieram com "Não informada (sistema antigo)", e "Pix" não existia no cadastro | Feito em 27/11: uma migração cadastra as 16 formas da baixa do sistema antigo (PIX, TED, Boleto, cartões e as outras), a pedido do Bruno | 21:38–21:48, 38:17–38:43 |
| R13 | **Lançamento de incentivo (como é hoje):** a Camila calcula a data de pagamento (10 dias depois da pesquisa) e faz **um lançamento por data**, com o total, "pagamento de N incentivos" e quem mandou a planilha, mais a planilha filtrada anexada. Depois anexa os comprovantes. Com o Carregar incentivos, continua **um lançamento** com o detalhe de cada pessoa dentro | Já é assim no sistema (um lançamento por projeto e data, com as pessoas dentro) | 45:35–50:18 |
| R14 | **Lançamentos do Connect precisam de conferência antes de virar conta a pagar.** Bruna: hoje ela confere cada nota com o Excel e devolve a folha com divergências; o sistema precisa saber se a mesma nota (número, data de emissão, valor) já foi usada em outro projeto ou pagamento; e a data de pagamento que o projeto põe pode não ser viável. Bruno: dá para o financeiro **rejeitar o lançamento** com o motivo e devolver ao Connect | Pergunta aberta para a próxima conversa com o Connect (Q66) | 55:13–1:03:32 |
| R15 | **Relatório do projeto:** para a Vivi e o Fabiano, mais para consulta. Bruna sugeriu a coluna do **orçamento original** e, talvez, o lucro do projeto | Pergunta aberta (Q67). Depende do orçamento vir do Connect | 1:03:32–1:05:21 |
| R16 | **Começar a usar só o sistema novo:** a Bruna propôs puxar de novo o que mudou desde 23/11 no fim de semana e começar na segunda, usando só o sistema novo ("não dá para lançar nos 2 ao mesmo tempo") | Em conversa (Q68): o Bruno fala com o João e o Marco (27/11). Hoje, reenviar o relatório só cria as contas que faltam, e a conta já importada que foi paga depois continua a pagar | 1:05:44–1:07:43 |
| R17 | **Integração com o Itaú:** o banco deu até 10 dias úteis, e a Vivi pode acelerar com o contato de lá *(a confirmar)* | Nada a fazer agora | 7:36–8:11 |

## O que foi visto e funcionou

- **Contas a pagar:** o total de outubro bateu com o do sistema antigo quando todas as empresas estavam no filtro (12:44–14:36).
- Também funcionaram:
  - baixa sozinha e em conjunto;
  - copiar código de barras;
  - baixa parcial com o pendente;
  - clipe azul quando há anexo (19:04–22:40).
- **Busca geral** (Ctrl+K) pelo nome do projeto, que traz contas, cadastros e notas (30:56–31:52).
- **Demandas:** abrir um chamado de correção pelo sistema (1:07:45–1:08:33).
