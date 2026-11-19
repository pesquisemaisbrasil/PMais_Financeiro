# 2026-11-16: Testes em conjunto com o financeiro

- **Data:** 16/11/2026, 15h09, 48 min, online (transcrição automática do Teams). A transcrição bruta é o `Reunião Financeiro _ Testes em conjunto.docx`, na raiz do repositório; o .docx não é versionado, por isso este registro.
- **Quem:** Bruna Palagano e Camila Fernochi (financeiro); Bruno Conrado (desenvolvimento) e João Paulo, o PO (P+).
- **O que é:** a primeira vez que o financeiro usou a **versão de demonstração** (as telas reais, com dados fictícios e o backend no navegador; ver [publicar-a-versao-de-teste](../operations/publicar-a-versao-de-teste.md)). O Bruno mostrou as telas, a Bruna simulou um lançamento como faz no dia a dia e a Camila testou as ações em lote. O objetivo era colher a rotina e os ajustes antes de entregar o MVP para uso de verdade.
- **Como ler:**
  - é um **resumo** com o minuto (`mm:ss` da transcrição), não a fala bruta;
  - ficaram fora números de projeto, valores, nomes de terceiros e as brincadeiras do fim da reunião;
  - a transcrição tem muito ruído (frases soltas em inglês e nomes que ninguém disse); trechos duvidosos estão marcados *(a confirmar)*.

## Decisões e informações

| # | Decisão / informação | Minuto |
|---|---|---|
| T1 | O **MVP para uso de verdade**, com banco de dados, sai **talvez até a segunda-feira seguinte (23/11/2026)**, como alinhado com o João e o Marco *(a confirmar: a transcrição diz "arco" e "Macau")*. Começa por **cadastros**, Contas a pagar e Contas a receber. Até lá, a demonstração guarda tudo só no navegador de cada pessoa: o lançamento que a Camila fez não apareceu para a Bruna | 2:32–3:10, 17:11–17:50, 22:08–22:58 |
| T2 | **Rotina do piloto:** o financeiro cadastra os **projetos que têm contas no mês** e **relança essas contas** no Financeiro como lança no sistema atual, para comparar. Uma reunião por semana acompanha; se der, 15 a 20 minutos de uso por dia | 17:50–18:20, 46:26–46:48 |
| T3 | **Unidade e centro de custo vêm do projeto**: são cadastrados no projeto e o lançamento os preenche sozinho, como no sistema atual. Dá para alterar, "mas não deve". No lançamento, o que se muda é o **plano de contas (categoria)** | 7:38–8:20, 9:15–11:15 |
| T4 | **Projeto é obrigatório** em todo lançamento. Mesmo a despesa administrativa tem projeto ("o administrativo ele é um projeto"). Na demonstração deu para lançar sem projeto | 23:07–23:22 |
| T5 | **Fim de semana: avisar, não bloquear.** Quase nunca pagam no sábado ou domingo, mas há exceção urgente (passagem de avião, por exemplo), e o banco joga o pagamento para segunda | 15:33–16:21 |
| T6 | A tela de **Incentivos** (Relatórios) **foi engavetada**. O Bruno propôs importar a planilha no modelo em que ela chega (entrevistados, chave Pix, se tem nota, valor) e ver os incentivos por projeto ali. A Camila disse que ver um a um não ajuda: ela paga copiando da planilha para o banco o valor, a chave Pix completa e o número do job. A tela volta a ser discutida quando houver pagamento automático pelo banco | 32:40–39:03 |
| T7 | Lançar incentivo **é um lançamento normal**: o valor total (por exemplo, 10 incentivos), com a **planilha anexada**. O trabalho pesado vem depois: copiar e colar cada Pix no banco, aprovar e gerar os comprovantes. Na próxima sessão, o financeiro faz um lançamento de incentivo junto com o Bruno para mapear o processo | 37:43–38:58 |
| T8 | A **busca universal** (Ctrl+K para achar qualquer conta, projeto, fornecedor ou cliente), sugerida pelo João, fica **para o futuro**. Bruna: "não é uma coisa que a gente utiliza no dia a dia", mas é interessante (por exemplo, todos os pagamentos a uma pessoa no ano) | 13:05–14:49 |
| T9 | **Projetos poderão ser cadastrados no Financeiro por enquanto**, até o Connect entregar os projetos, para não atrasar o financeiro. A Bruna lembrou o risco de "criar dois": quando a regra for abrir o projeto no Connect, o financeiro não cadastra aqui | 44:10–45:02 |
| T10 | O João vai mandar ao Bruno o **modelo do comprovante do Itaú** e o código que já o lê no Connect | 32:26–32:30 |
| T11 | Ainda estão **"em breve"** na demonstração: notas, RPA, conferência bancária, divergências, fluxo de caixa e outros relatórios. A Bruna chamou o relatório do projeto e o fluxo de "coisas muito importantes" | 18:20–18:42, 39:16–39:47, 43:41 |

## O que foi visto e aprovado

| # | O que | Minuto |
|---|---|---|
| V1 | O **Início** é resumo; "contas vencidas" são as que passaram do vencimento sem baixa | 5:34–6:46 |
| V2 | A **programação** já vem com a data de hoje | 7:09–7:13 |
| V3 | **Aviso de dia não útil** no vencimento e na programação, com antecipar, manter ou postergar | 7:14–7:38, 10:43 |
| V4 | **Vírgula automática** no valor: "isso para mim é perfeito". O teclado dela só tem ponto, e às vezes "eu quero lançar 20 reais, quando eu vejo está 2000" | 11:23–11:46 |
| V5 | **Descrição obrigatória**, sem mínimo de caracteres | 11:39–12:03 |
| V6 | **Rateio** opcional, manual ou colado do Excel (só número do projeto e valor) | 12:03–12:46 |
| V7 | Anexar **vários arquivos de uma vez**, sem precisar salvar depois | 26:39–26:52 |
| V8 | **Tudo numa página só** no lançamento (Camila) | 17:07 |
| V9 | **"Substituir pelo valor real"** na provisão | 29:06–29:13 |
| V10 | **Atalho de comprovante** na linha da lista, sem abrir a conta | 29:18–29:37 |
| V11 | **Contas a receber** "é igual contas a pagar" | 39:16 |
| V12 | Período **"Tudo"** na lista: todos os lançamentos, sem filtro de data | 43:04–43:17 |

## Pedidos de ajuste

Base para as demandas. Tipo: **ajuste** (muda o que já existe), **novo**, **bug**, **a decidir** (precisa de resposta antes) ou **a confirmar** (a transcrição não deixa claro).

### Lançamento (nova conta e edição)

| # | Pedido | Quem | Minuto | Tipo |
|---|---|---|---|---|
| A1 | **Ordem dos campos:** fornecedor, projeto, unidade, centro de custo, forma de pagamento e categoria. O projeto sobe; forma de pagamento e categoria vão para o fim, "já que a gente lança primeiro o projeto para depois puxar o resto" | Bruna, Camila | 8:20–8:55 | Ajuste |
| A2 | Ao escolher o projeto, **preencher unidade e centro de custo** com o que está no projeto (T3) | Bruna | 7:38–10:59 | Ajuste (conferir se já faz) |
| A3 | **Projeto obrigatório** (T4) | Bruna | 23:07–23:22 | Ajuste |
| A4 | **Editar abre tudo de novo, inclusive o rateio:** "se eu precisar editar, preciso que edite tudo" | Bruna | 23:53–24:45 | Ajuste |
| A5 | Em **Registrar baixa**, o Bruno notou que a tela "não traz a parte" de alguma informação *(a confirmar: provavelmente o rateio)* | Bruno | 24:55–25:12 | A confirmar |

### Datas, feriados e recorrência

| # | Pedido | Quem | Minuto | Tipo |
|---|---|---|---|---|
| A6 | **Aviso de dia não útil também ao repetir a conta** (todo mês, toda semana, parcelado). "Isso a gente usa muito": hoje abrem mês a mês para achar conta no sábado e mudar à mão | Bruna | 14:58–15:33 | Ajuste |
| A7 | **Feriado municipal e estadual** (por exemplo, 25/01 em São Paulo): ter o cadastro de feriados ou um calendário que já saiba. Pagamento em feriado pede para postergar ou antecipar | Bruna | 45:09–45:51 | Ajuste |
| A8 | **Setas de dia anterior e próximo** ao lado da data do filtro, sem abrir o calendário; o calendário fica para datas distantes | Bruna | 18:42–19:05 | Novo |
| A9 | O **calendário abriu abaixo do fim da tela** e não dava para clicar; foi preciso diminuir a tela | Bruna | 19:14–19:29 | Bug |

### Lista do Contas a pagar e ações em lote

| # | Pedido | Quem | Minuto | Tipo |
|---|---|---|---|---|
| A10 | **Buscar pelo valor:** ela procurou pelo valor a conta que tinha lançado e não achou | Bruna, Camila | 19:51–19:54 | Novo |
| A11 | **Busca tolerante:** sem diferença de acento e maiúscula, por pedaço da palavra ("pro" acha professor e provisão), aceitando letra trocada. João: "tem que deixar o filtro soltinho" | Bruna, João | 42:28–43:00 | Ajuste |
| A12 | **Reclassificar em lote** também muda **vencimento e valor**, como no sistema atual (hoje só projeto, categoria e centro de custo) | Camila | 25:29–26:18 | Ajuste |
| A13 | **Anexar um arquivo em vários lançamentos** selecionados de uma vez. Hoje, ao ratear, duplicam os lançamentos e a folha fica num só, com "anexo folha" escrito nos outros | Camila | 26:55–27:30 | Novo |
| A14 | **Ações em lote além da baixa:** editar e anexar arquivo | Bruna | 27:32–27:48 | Novo |
| A15 | **Clipe de anexo na linha:** sempre visível, **verde** quando o lançamento tem anexo e **cinza** quando não tem; clicar abre o atalho para anexar. Serve para perceber que se deu baixa e esqueceu o comprovante. Pedido antigo, que o sistema atual nunca teve | Bruna, Camila; formato proposto pelo Bruno | 27:48–28:53 | Novo |
| A16 | **"Canceladas":** explicar na tela o que é uma conta cancelada (não vale, mas fica registrada e pode voltar) e decidir se ela aparece na lista. A Bruna não se opôs; só precisava "entender o que é o cancelado" | Bruna; explicação do Bruno e do João | 20:26–21:57 | A decidir |
| A17 | Um item **sumiu da lista e voltou** quando passaram o mouse por cima ou voltaram à tela *(a confirmar: pela transcrição não dá para saber qual)* | Bruna | 43:17–43:33 | Bug |

### Comprovantes e anexos

| # | Pedido | Quem | Minuto | Tipo |
|---|---|---|---|---|
| A18 | No atalho de comprovante, **o projeto vem do lançamento**, sem campo para escolher ("fiquei pensando pra que esse projeto aí") | Camila, Bruna; Bruno | 29:41–30:08 | Ajuste |
| A19 | O botão **"Ler comprovantes"** confunde: "eu sou muito literal… eu não quero ler o comprovante, eu quero salvar". O João explicou que a leitura **confere** o comprovante com o que foi lançado (valor, chave Pix, pessoa do projeto), como no Connect. Falta escolher o nome e confirmar se a conferência fica | Bruna; João | 30:09–32:38 | A decidir |

### Relatório do projeto e cadastros

| # | Pedido | Quem | Minuto | Tipo |
|---|---|---|---|---|
| A20 | **Busca por número do projeto** no relatório, procurando em **todo o período** (um projeto pode começar no fim de 2025 e ir até 2026): "aqui só tem 2, mas daqui a pouco vai ter 2000" | Bruna | 40:16–41:15 | Novo |
| A21 | **Filtro de período** no relatório (por exemplo, quanto uma pessoa recebeu de fevereiro a maio). A Bruna lembrou que isso se consulta no Contas a pagar, pelo fornecedor | Camila, Bruna | 41:16–41:53 | A confirmar |
| A22 | **Cadastrar projeto** no Financeiro, por enquanto (T9) | Bruna; Bruno | 44:10–45:02 | Novo |
| A23 | **Caixa de sugestões** na versão de uso real (correção de regra, bug, melhoria), que vira o backlog do Bruno | Bruno | 18:20–18:42, 46:26–46:48 | Novo (prometido) |

## Falas do financeiro

As falas da Bruna e da Camila que sustentam os pedidos. Citações fiéis e curtas (a transcrição é automática, então só a pontuação foi arrumada).

| # | Quem | Minuto | Fala | Consequência |
|---|---|---|---|---|
| C1 | Camila | 8:41 | "A gente lança primeiro o projeto para depois puxar o resto, né?" | A1 |
| B1 | Bruna | 10:30 | "A gente pode, mas não deve, porque essas informações têm a ver com o projeto, então não tem por que a gente alterar" | T3, A2 |
| B2 | Bruna | 15:20 | "Isso a gente precisa, porque isso a gente usa muito… tem coisas no sábado, ou eu tenho que ficar abrindo mês por mês… e mudar manual" | A6 |
| B3 | Bruna | 16:01 | "Não é bom bloquear porque pode ocorrer… o banco joga automaticamente depois para segunda-feira" | T5 |
| C2 | Camila | 17:07 | "Com todas as informações, tudo que a gente precisa lançar numa página só" | V8 |
| B4 | Bruna | 24:27 | "Precisa ter, porque às vezes, na pressa, não colocou a informação… Se eu precisar editar, preciso que edite tudo" | A4 |
| C3 | Camila | 27:16 | "Eu duplico todos os lançamentos quando eu vou ratear, e num deles eu tinha que escrever 'anexo folha'; a folha só está naquele lançamento" | A13 |
| B5 | Bruna | 28:12 | "Se eu dei baixa… e vai que eu esqueci de colocar o comprovante aqui dentro, aí a gente vai saber" | A15 |
| C4 | Camila | 29:26 | "Já que a gente está criando o negócio dos sonhos, vamos fazer" | Atalhos são bem-vindos (V10, A15, A18) |
| B6 | Bruna | 30:18 | "Eu sou muito literal, entendeu? Eu não quero ler o comprovante, eu quero salvar" | A19 |
| C5 | Camila | 35:34–36:00 | "Não vale para mim nada eu ver eles individualmente aqui. Eu preciso ver a planilha para pegar o Pix completo e fazer o pagamento. Eu uso Ctrl+C, Ctrl+V" | T6 |
| B7 | Bruna | 36:44 | "Esse relatório de incentivos realmente nesse momento não faz sentido" | T6 |
| B8 | Bruna | 37:17 | Para o banco pagar sozinho, ele precisa ter o campo da observação que identifica o número do projeto, "senão não tem serventia" | Futuro do pagamento automático (T6) |
| C6 | Camila | 37:33 | Não sabe se o pagamento automático pelo banco vai dar certo, por causa das chaves Pix erradas | Futuro do pagamento automático (T6) |
| B9 | Bruna | 38:15–38:48 | "No sistema é simples… o processo depois do pagamento é que é trabalhoso: a gente abre a planilha e fica no copia e cola para o banco." Para lançar, "é um lançamento normal… e anexo a planilha" | T7 |
| B10 | Bruna | 42:47 | Que a busca reconheça pedaço e letra trocada: "se você escreve 'pro', já puxa tudo que tem 'pro': professor, provisão" | A11 |
| B11 | Bruna | 44:38–44:51 | "Se ficar a regra que tem que abrir o projeto lá, o pessoal vai abrir lá… É só para não ter risco de criar dois" | T9 |
| B12 | Bruna | 45:28 | "O legal seria talvez ter o cadastro ou já ter o calendário inteligente ali para saber que dia 25 de janeiro é feriado em São Paulo" | A7 |

## O que pode mudar nos specs

Nada foi mudado ainda. Quando os pedidos virarem demanda:

- **Incentivos (T6, T7):** o kickoff ([K5, K6 e K12](2026-11-03-kickoff-com-o-financeiro.md)) previa importar a planilha e gerar **um lançamento por data de pagamento** ([contas-a-pagar](../specs/contas-a-pagar.md)). Agora a Bruna descreveu o incentivo como **um lançamento normal com a planilha anexada**, e a tela de Incentivos foi engavetada. Confirmar com o PO o que fica; o lançamento de incentivo feito junto na próxima sessão deve esclarecer.
- **Projeto cadastrado no Financeiro (T9, A22):** contraria a D4 das [decisões de 21/10](2026-10-21-decisoes-pos-reuniao.md) ("o Financeiro não tem projeto próprio"). É provisório e é decisão do PO; se ficar, entra em [projetos-financeiros](../specs/projetos-financeiros.md) e [cadastros-e-dimensoes](../specs/cadastros-e-dimensoes.md), com ADR.
- **Unidade e centro de custo no projeto (T3, A1, A2):** [cadastros-e-dimensoes](../specs/cadastros-e-dimensoes.md) e [contas-a-pagar](../specs/contas-a-pagar.md).
- **Dia não útil (T5, A6, A7):** hoje o [contas-a-pagar](../specs/contas-a-pagar.md) diz que o aviso **não vale** na tabela de ocorrências da recorrência (a simulação já manda o vencimento para o próximo dia útil) e conta os feriados nacionais e os cadastrados. O pedido é ver o aviso também na recorrência e ter os feriados municipais e estaduais. Para fim de semana pediram **não bloquear**; para feriado a Bruna disse que o sistema "não aceita" e pede para postergar ou antecipar: confirmar se o feriado também só avisa.
- **Canceladas e "Ler comprovantes" (A16, A19):** [contas-a-pagar](../specs/contas-a-pagar.md) e [comprovantes-e-baixa](../specs/comprovantes-e-baixa.md).
- **Ações em lote e anexos (A12 a A15):** [contas-a-pagar](../specs/contas-a-pagar.md) e [baixas-recorrencia-e-anexos](../specs/baixas-recorrencia-e-anexos.md).
- **Busca universal (T8):** entra como [futuro](../specs/futuro/README.md).
- **Tag de origem nos specs:** `[Testes 16/11 mm:ss]`.

## O que foi feito (17/11/2026)

Decisões do Bruno em 17/11: projeto cadastrado no Financeiro **agora, como provisório** ([ADR 0021](../architecture/adr/0021-projeto-cadastrado-no-financeiro-provisorio.md)); o botão de comprovantes vira **Salvar comprovantes**; A5 e A17 ficam de fora (não lembrava o que eram). O roteiro de teste está no [roadmap](../planning/roadmap.md).

| # | Situação |
|---|---|
| A1, A2, A3, A22 | Feito. Ordem dos campos, projeto obrigatório e o projeto que traz a unidade e o centro de custo, cadastrado em Cadastros > Projetos |
| A4 | Feito. Editar conta muda projeto, divisão e unidade |
| A5 | De fora: a confirmar o que faltava em Registrar baixa |
| A6 | Feito. A tabela da recorrência avisa cada vencimento que foi para o próximo dia útil |
| A7 | Já existia o cadastro de feriados locais (Cadastros > Feriados). Se o feriado bloqueia ou só avisa: Q53 |
| A8, A9 | Feito. Setas da data e calendário que não passa do fim da tela |
| A10, A11 | Feito. Busca por valor, sem acento, por pedaço e no projeto e na categoria. Letra trocada não é corrigida (numa lista de dinheiro, achar a conta errada é pior) |
| A12, A13, A14 | Feito. Reclassificar com vencimento e valor; Anexar em várias contas |
| A15 | Feito. Clipe verde ou cinza na linha |
| A16 | Feito com o que já estava: canceladas continuam, agora explicadas na lista e no detalhe. Se devem sumir: Q54 |
| A17 | De fora: a confirmar o que sumia da lista |
| A18 | Feito em 18/11 (Bruno pediu de novo): o projeto vem do lançamento, achado pelo número do projeto no Connect, sem ligação nova no banco |
| A19 | Feito. Botão Salvar comprovantes |
| A20 | Feito. Busca no relatório do projeto |
| A21 | De fora: o Contas a pagar pelo fornecedor já responde quanto uma pessoa recebeu num período |
| A23 | De fora: guardar print com dado real no servidor depende do DPO (Q56) |

## Perguntas que ficaram

Entraram em [perguntas-abertas](../planning/perguntas-abertas.md) como Q52 (projeto no Financeiro), Q53 (feriado), Q54 (canceladas), Q55 (incentivo) e Q56 (caixa de sugestões).

| Pergunta | Dono | Proposta |
|---|---|---|
| Feriado só avisa, como o fim de semana, ou não deixa programar? | Financeiro (Vivi) | Avisar, como o fim de semana (T5) |
| A conta cancelada continua na lista? | Financeiro | Fica, com explicação na tela e filtro para esconder |
| Nome do botão "Ler comprovantes" e se a conferência com o que foi lançado fica | PO + financeiro | Nome literal ("Salvar comprovantes") e a conferência mantida |
| Incentivo: importar a planilha e gerar um lançamento por data (K6) ou lançar normal, com a planilha anexada (T7)? | PO + financeiro | Decidir na sessão do lançamento de incentivo |
| Até quando o projeto é cadastrado no Financeiro e como evitar duplicar com o Connect? | PO | Cadastro provisório até o Connect entregar os projetos |

## Próximos passos

- **Bruno:** fazer os ajustes acima, preparar uma base zerada para o financeiro simular o dia a dia e subir o MVP com banco de dados (talvez até 23/11).
- **Próxima sessão** de cerca de 1 hora na semana seguinte, com um **lançamento de incentivo feito junto** para mapear o processo.
- **João:** mandar ao Bruno o modelo do comprovante do Itaú e o código que o lê.
- **Financeiro:** usar 15 a 20 minutos por dia, quando der, e mandar as sugestões pela própria plataforma.
