# Roadmap

Ordem dos módulos do Financeiro e o estado de cada um. O que fazer agora e o que espera resposta está em [proximos-passos](proximos-passos.md). Cada módulo segue o mesmo caminho:

1. **Protótipo** rápido e genérico, validado com o financeiro (Bruna e Camila) até o "é isso" [Reunião 21/10 45:39–46:21].
2. **Specs** atualizados com o que o protótipo mostrou.
3. **Construção** na arquitetura e nos padrões do [handoff](../handoff/README.md) (02 a 10), com um PR por entrega.
4. **Uso em paralelo** com o SGE4B até bater, e depois troca.

## Ações antes de começar

- [x] Login de consulta no SGE4B para o time de desenvolvimento (funcionalidades e relatórios). Já existe (05/11/2026).
- [ ] Reunião só para levantar as **11 bases** e os relatórios usados, e pedir ao fornecedor do SGE4B a **exportação completa**. **Adiada** (05/11/2026): a migração das bases fica para depois, sem data.
- [ ] Levantar com a Camila os dados de RPA e da ficha de fornecedor (N3).
- [ ] Ampliar o contrato `v1` com o que as decisões de 21/10 pedem (N4): itens do orçamento com data, modelo fiscal e status da NF, consumo do orçamento, prazo do projeto. ADR da integração no Connect.
- [ ] Pesquisas técnicas: integração Itaú (N1) e captura automática de NF (N2).

## Módulos

| # | Módulo | Specs | Depende de | Estado |
|---|---|---|---|---|
| 0 | Fundação do repositório | [handoff/11 fase 0](../handoff/11-plano-de-implementacao.md) | — | em andamento: login com MFA e SSO, CI, compose e componentes entregues; o armazenamento de arquivos entrou com os anexos das contas (provisório, [ADR 0012](../architecture/adr/0012-anexos-das-contas-cifrados-por-arquivo.md); a escolha final segue na Q18); faltam AGENTS.md, skills e revisores (PF-11) |
| 1 | Pagamento de entrevistadores | acesso-e-auditoria, pagamentos-a-pagar, comprovantes-e-baixa, integracao-com-o-connect | 0; API de integração no Connect | em andamento: comprovantes e baixa entregues com o Connect simulado (PF-56); faltam a planilha de pagamento e o cliente real do Connect |
| 2 | Cadastros, papéis e migração | cadastros-e-dimensoes, papeis-e-escopo-ampliados | 0; exportação do SGE4B | specs prontos; falta a exportação |
| 3 | Contas a pagar e a receber | contas-a-pagar, contas-a-receber, baixas-recorrencia-e-anexos, documentos-fiscais | 2 | em andamento: Início e primeira fatia do Contas a pagar na `homolog`; importar planilha, exportar, editar e anexos entregues; faltam o prazo de guarda dos anexos (Q5), o antivírus e as ações listadas na spec |
| 4 | Projetos, orçamento e provisionamento | projetos-financeiros, orcamento-e-saude-financeira | 1, 3; categorias do orçamento no Connect (N4) | specs prontos |
| 5 | Folha de campo e pagamento em lote | regras-de-pagamento-de-campo, folha-de-campo, lotes-de-pagamento-de-campo | 1, 3, 4; etapa 2 depende de N1 | specs prontos |
| 6 | Conciliação bancária | bancos-e-conciliacao | 3 | specs prontos |
| 7 | Relatórios e fluxo de caixa | relatorios-e-analises | 3, 4, 6 | specs prontos |

**Por que essa ordem:**
- o Módulo 1 já está desenhado em detalhe pelo handoff e tira o risco da integração com o Connect;
- o 2 e o 3 substituem o uso diário do SGE4B;
- o 4 e o 5 eliminam a redigitação;
- o 6 e o 7 dependem de lançamentos e baixas confiáveis.

O 2 pode começar em paralelo ao 1, porque não depende do Connect.

## Plano dos 3 primeiros meses (apresentado à direção)

Decidido em 22 e 23/10 ([registro](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), E9 a E11). Antes de tudo, o **protótipo do Marco** com dados de exemplo, aprovado pelo financeiro. Depois, 6 entregas em 12 semanas, com reunião de status semanal ou quinzenal e acompanhamento no Jira:

| Semanas | Entrega | Módulos | Observação |
|---|---|---|---|
| 1–2 | Base do sistema e cadastros | 0, 2 | Importação **de teste** do SGE4B; a definitiva fica perto da troca |
| 3–4 | Pagamento de entrevistadores | 1 | **Porta o que já roda no Connect** (planilha, PDF de comprovantes, baixa) |
| 5–6 | Contas a pagar | 3 | Rateio, baixa parcial e em lote, recorrência, código de barras |
| 7–8 | Folha, incentivos, notas e provisões | 3, 4, 5 (parte) | Lançamento agrupado com itens; NF do entrevistador sobe no Connect; provisão vem do orçamento por itens do Connect |
| 9–10 | Contas a receber e dashboards | 3, 7 (parte) | Bruto, abatimentos e líquido; dashboards dentro do plano |
| 11–12 | Conferência do banco e caixa | 6 | Conciliação com sugestão; IA fica para depois; treinamento e balanço |

**Fora dos 3 meses ("próximas evoluções"):** captura automática de NF, conciliação com IA, autorização para passar do orçamento, folha de campo e pagamento em lote pelo Itaú, fechamento do mês, relatórios por projeto, DRE por empresa/unidade/Grupo, planejamento do Grupo × realizado, pipeline de propostas, integrações com bancos, novos perfis.

**Dependência no Connect (mudanças em outro repositório):** papel de **coordenador**, escopo do supervisor por projeto, histórico de alterações do projeto, gasto por item do orçamento e convite de cadastro de entrevistadores. O Financeiro lê `items[].spent` e a provisão a partir de `/integrations/v1/projects/{id}/budget`.

## Kickoff com o financeiro (03/11/2026)

[Registro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md). O protótipo foi mostrado a Bruna e Camila, mas a chamada caiu e o resto **não foi visto: a reunião será remarcada**. O que mudou no plano:

- o pagamento de entrevistadores chega como **lançamento agrupado em Contas a pagar**, e a tela por projeto vira relatório (K1 a K4); isso afeta as entregas 2 e 3;
- o **incentivo** entra por planilha importada, dividido por data de pagamento, com prazo em dias úteis por tipo de projeto (K5 a K7); entra na entrega 4;
- o protótipo é **revisto** com isso; as próximas demonstrações usam **dados reais** do SGE4B (K9);
- perguntas novas F22 a F25 em [perguntas-abertas](perguntas-abertas.md).

## Testes em conjunto com o financeiro (16/11/2026)

[Registro](../transcricoes/2026-11-16-testes-em-conjunto-com-o-financeiro.md). A Bruna e a Camila usaram a demonstração e pediram ajustes antes do MVP de uso real. O que é novo (17/11):

- **Projeto cadastrado no Financeiro**, por enquanto ([ADR 0021](../architecture/adr/0021-projeto-cadastrado-no-financeiro-provisorio.md), Q52): número, nome, cliente e **unidade e centro de custo padrão**. Na Nova conta a pagar, escolher o projeto preenche a unidade e o centro de custo;
- **toda conta tem projeto**, e os campos seguem a ordem da equipe (fornecedor, projeto, unidade, centro de custo, forma de pagamento e categoria);
- **editar a conta edita tudo**: projeto, divisão entre projetos e unidade;
- **Reclassificar** muda também o vencimento e o valor; **Anexar** leva o mesmo arquivo a várias contas; o **clipe** da linha mostra se a conta tem documento;
- **busca** sem acento, por pedaço, no projeto e na categoria, e **pelo valor**; **setas** para o dia anterior e o próximo; o calendário não passa do fim da tela;
- a tabela da **recorrência** avisa cada vencimento que foi para o próximo dia útil; **canceladas** explicadas na lista e no detalhe;
- o botão **Salvar comprovantes** no envio de comprovantes; **busca** no relatório do projeto.

Ficaram de fora: A18 (o projeto do Connect vindo do lançamento: plano futuro, junto com a ligação do projeto daqui ao do Connect), A5 e A17 (a confirmar com o Bruno), A21 (o Contas a pagar pelo fornecedor já responde) e A23 (caixa de sugestões no sistema de verdade, Q56). Perguntas novas Q52 a Q56.

## Navegador liberado (17/11/2026)

Pedido do Bruno: além da senha e do autenticador, a conta só entra pelos computadores (navegadores) que um admin liberou ([ADR 0022](../architecture/adr/0022-navegador-liberado-por-cookie.md), [spec](../specs/acesso-e-auditoria.md)). O primeiro computador de cada conta é liberado sozinho; os outros viram pedido na tela **Acessos**, que só o admin vê. Vale para todos, e admin não libera o próprio computador. Pergunta nova: Q57 (prazo de guarda).

## Cadastro de projeto como na tela antiga (18/11/2026)

Pedido do Bruno com os prints da tela antiga ([spec](../specs/cadastros-e-dimensoes.md), Ajustes de 18/11): o cadastro de projeto pede **código, nome, unidade, cliente e centro de custo**, todos obrigatórios. A edição ganha **Inativo** (some das escolhas de lançamento novo, e o que já foi lançado fica) e **Excluir** (só projeto sem lançamento). Código com espaço, como no sistema antigo, ainda é recusado (Q58). No mesmo dia, a **Nova conta a pagar** passou para a disposição e a ordem da tela antiga (um campo por linha, o nome à esquerda: fornecedor, vencimento, programação, valor, forma de pagamento, projeto com o rateio, unidade, centro de custo, plano de contas e descrição), e **Categoria** passou a se chamar **Plano de contas** ([spec](../specs/contas-a-pagar.md), Ajustes de 18/11).

## Busca em todo o sistema (18/11/2026)

Pedido do Bruno ([spec](../specs/busca-geral.md)): no alto de todas as telas, **Buscar em todo o sistema** (Ctrl+K). Uma palavra mostra, separado por grupo, as contas a pagar e a receber, as notas fiscais, os projetos, os clientes, os fornecedores e os outros cadastros, com a palavra marcada; o clique abre o item.

## Carregar incentivos (18/11/2026)

Pedido do Bruno ([spec](../specs/contas-a-pagar.md), Ajustes de 18/11): o botão **Carregar incentivos**, no Contas a pagar, lê a planilha de incentivos em lote e cria um lançamento por projeto e data de pagamento, com as pessoas dentro. A janela tem **Baixar planilha modelo**, que mostra como preencher. Projeto, plano de contas e forma de pagamento são obrigatórios em cada linha da planilha; empresa, unidade e centro de custo vêm do cadastro de cada projeto.

## Impostos retidos (19/11/2026)

Pedido do Bruno ([spec](../specs/contas-a-pagar.md), Ajustes de 19/11): toda **Nova conta a pagar** já traz PIS (0,65%), COFINS (3%), CSLL (1%) e IR (1,5%) calculados sobre o valor principal. Cada valor pode ser mudado ou zerado na janela de impostos. Os percentuais ficam na nova aba **Cadastros › Impostos retidos**, valem para todos e só nas contas novas. No mesmo dia, o link **Feriados** saiu do menu; a tela fica só pelo endereço até os feriados virem sozinhos (Q60).

## Feriados das capitais pelo feriados.dev (19/11/2026)

Pedido do Bruno ([ADR 0024](../architecture/adr/0024-feriados-das-capitais-pelo-feriados-dev.md), Q60): os feriados estaduais e municipais das 27 capitais entram sozinhos, a cada 6 horas, do feriados.dev que roda no nosso servidor. Os nacionais continuam da BrasilAPI.

## Níveis de acesso e demandas (19/11/2026)

Pedido do Bruno ([acesso-e-auditoria](../specs/acesso-e-auditoria.md), [demandas](../specs/demandas.md), [ADR 0023](../architecture/adr/0023-tres-niveis-de-acesso-e-telas-por-pessoa.md)): três níveis, **super admin**, **admin** e **usuário**. Em **Acessos > Pessoas e telas**, o admin bloqueia telas de cada usuário; a tela some do menu e a API recusa. Todos têm **Abrir demanda** no menu, com tipo, descrição e anexo obrigatórios; só o super admin vê a tela **Demandas**.

## Abas de telas (23/11/2026)

Pedido do Bruno ([transcrição](../transcricoes/2026-11-23-abas-como-no-vs-code.md), [ADR 0025](../architecture/adr/0025-abas-de-telas-com-activity.md)): abas como no VS Code, abaixo da busca geral. **Duplo clique** numa tela do menu abre a tela noutra aba; o clique simples troca a tela da aba atual. Uma aba por tela. Cada aba guarda o que a pessoa fez (filtros, busca, seleção, o que foi digitado) até ser fechada; depois do F5 as abas voltam, mas cada tela recomeça do zero. Pergunta nova: Q62 (avisar antes de fechar aba com algo digitado).

## Login não trava por quem é de fora (PF-53, 23/11/2026)

As 10 senhas erradas por hora que barram o login passam a contar por **e-mail e rede juntos** ([acesso-e-auditoria](../specs/acesso-e-auditoria.md), Ajustes de 23/11). Antes, bastava saber o e-mail de alguém para deixar a pessoa uma hora sem entrar, mesmo com a senha certa.

## Adiantamento do Connect, parte de leitura (23/11/2026)

O Connect passou a descontar o adiantamento do "a pagar" ([relatório](../specs/RELATORIO_ADIANTAMENTO_FINANCEIRO.md), [integração, Ajustes de 23/11](../specs/integracao-com-o-connect.md)). O Financeiro guarda no espelho só o que falta pagar, sem a parte do adiantamento: a conciliação do comprovante e a baixa somam o valor líquido, como a planilha. A entrevista que o adiantamento pagou inteira nunca vai para pagamento, e as duas recusas novas do Connect viram divergência com mensagem em palavras simples. Falta mostrar o adiantamento e o saldo negativo de cada pessoa na tela (Q63).

## Cadastros iguais aos do sistema antigo (24/11/2026)

Pedido do Bruno ([registro](../transcricoes/2026-11-24-cadastros-iguais-ao-sistema-antigo.md), [cadastros, Ajustes de 24/11](../specs/cadastros-e-dimensoes.md)): empresa, unidade, centro de custo, cliente e fornecedor ganham o código no sistema antigo (à parte do gerado), que a coluna Código das listas mostra; o cliente, a origem; o fornecedor, a mesma ficha do cliente; clientes e fornecedores, a lista do sistema antigo (Código | Apelido | Nome | Fones | Emails | Infos | Ações); a empresa e a unidade, a IE; e a unidade, apelido e CNPJ. A empresa aparece pelo apelido em todas as telas (Pesquise+), e a lista de Unidades fica como a do sistema antigo (Empresa | Unidade | Código | Infos | Ações). O script `backend/scripts/importar_relatorio_receber_antigo.py` faz o mesmo com o relatório "Lançamentos a Receber" (títulos a receber e os recebimentos). O script `backend/scripts/importar_cadastros.py` popula os cadastros com o .csv que o sistema antigo exporta, um tipo por vez (empresas, unidades, centros de custo, clientes, fornecedores, plano de contas, com os grupos, projetos, com a unidade e o centro de custo obrigatórios, e o número único dentro da empresa, e contas bancárias, com os tipos CC, CI, Interna e Crédito). Conferência bancária e Divergências ficam "Em breve" no menu.

## Senha inicial de primeiro acesso (25/11/2026)

Pedido do Bruno ([acesso-e-auditoria, Ajustes de 25/11](../specs/acesso-e-auditoria.md)): a conta da equipe nasce com uma senha inicial (`create_user.py --primeiro-acesso`, ou `make conta` no servidor), que vale só para o primeiro login. Depois dela, a tela **Crie a sua senha** pede a senha nova duas vezes e diz para anotá-la; daí em diante, o cadastro do autenticador, os códigos de recuperação e o primeiro computador liberado, como antes. As 5 contas da equipe já estão no banco local e vão no pacote para o servidor.

## Banco local no servidor e atualização às 22h (25/11/2026)

Pedido do Bruno ([registro de 24/11](../transcricoes/2026-11-24-cadastros-iguais-ao-sistema-antigo.md), [ADR 0026](../architecture/adr/0026-banco-local-no-servidor-e-atualizacao-as-22h.md)): o `scripts/gerar-dump-local.sh` gera, na pasta `backups/` (fora do git), o pacote do banco local inteiro (o banco, os arquivos do cofre e as três chaves que os abrem), e o `make restaurar-local` do servidor põe esse pacote no ar. Na primeira instalação, o `make subir-projeto IP=<IP> CONFIRMAR=sim` (ou `DOMINIO=<nome>`) faz tudo de uma vez: confere o pacote, configura, sobe, põe o banco do pacote, liga as 22h e gera o certificado (pelo IP) ou o arquivo do nginx (por nome). Até 26/11 era `HOST=<IP>` (ADR 0027). O `make agendar` liga a atualização automática da `development` todo dia às 22h: sem versão nova, só o backup; com versão nova que não sobe, volta sozinho à de antes com o banco do backup. O `make verificar` avisa quando o fuso do servidor não é o de São Paulo.

## Servidor pelo IP ou por nome, atrás do nginx (26/11/2026)

No primeiro deploy, o servidor já tinha o nginx nas portas 80 e 443, atendendo outros sistemas, e o `make verificar` parou nelas. Agora o Financeiro abre de dois jeitos, sem usar essas portas ([ADR 0027](../architecture/adr/0027-nginx-do-servidor-na-frente-do-caddy.md)):

- **pelo IP**, enquanto não há nome no DNS: `make configurar IP=192.168.30.15`, com as telas em `https://IP:8444` e a API em `https://IP:8443`, e o certificado da própria máquina instalado nos computadores (`make certificado`);
- **por nome**, como o P+ Connect: `make configurar DOMINIO=financeiro.pesquisemais.com.br`. O nginx cuida do HTTPS (certbot) e repassa a um Caddy que só escuta em `127.0.0.1:8089`; o `make nginx` gera o arquivo do nginx, e só a rede do escritório abre (Q64).

O `make trocar-endereco` passa de um para o outro sem mexer em chaves, banco e arquivos. `make atualizar`, `make agendar` e `make voltar` seguem iguais. O `HOST=` de antes virou `IP=`.

## Fluxo de caixa, DRE e o número na exportação (25/11/2026)

Tarefas do Jira PF-74, PF-76 (o DRE) e PF-73 ([relatorios-e-analises, Ajustes de 25/11](../specs/relatorios-e-analises.md)). **Relatórios → Fluxo de caixa** abre desta semana até 4 semanas depois. O que mostra:

- **Por período (dia, semana ou mês):** o previsto, que são os títulos em aberto de Contas a pagar (com as provisões) e a receber, pelo vencimento; o realizado, que são as baixas e os recebimentos que valem, pela data do dinheiro; e o saldo projetado acumulado.
- **No alto:** o saldo das contas bancárias que entram no fluxo de caixa e o que já estava em atraso antes do período, que entra no saldo.
- **Por conta bancária:** o realizado de cada conta.
- **Ver:** abre os títulos e as baixas do período, com o link para cada um. **Exportar Excel** leva a tabela para a planilha.

A aba **Extrato × sistema** da Conferência bancária também exporta para o Excel. As planilhas de Contas a pagar e a receber ganham o **número da conta** na última coluna. **Relatórios → DRE** mostra receitas, despesas e resultado por mês, pela competência: cada grupo do plano de contas é uma linha, com as contas dele, e dá para filtrar por empresa, unidade, projeto e centro de custo e exportar. O Resultado por projeto espera o Connect (decisões do Bruno, [registro](../transcricoes/2026-11-25-decisoes-dos-relatorios.md)).

## Fluxo mensal, recebimentos × ano e favoritos (26/11/2026)

O resto da tarefa PF-76 que não depende do Connect ([relatorios-e-analises, Ajustes de 26/11](../specs/relatorios-e-analises.md)).

- **Relatórios → Fluxo mensal:** as mesmas linhas do DRE, pelo mês em que o dinheiro saiu ou entrou.
- **Relatórios → Recebimentos × ano:** o que entrou de cada projeto em cada mês do ano.
- **Botão Favoritos:** guarda os filtros, e nas listas também as colunas, com um nome, só no navegador (decisão do Bruno, [registro](../transcricoes/2026-11-26-favoritos-dos-relatorios.md)). Está nas listas de Contas a pagar e a receber e nos relatórios.

Da PF-76 falta o previsto × realizado, que espera o orçamento do Connect.

Fluxo de caixa, DRE, Fluxo mensal e Recebimentos × ano ficam **"Em breve" no menu** (pedido do Bruno, 26/11) e abrem pelo endereço, como a Conferência bancária. As quatro telas também ganham a margem das outras: a tabela por mês não empurra mais a página, e a coluna da linha fica parada ao rolar os meses.

## Notas e RPA (26/11/2026)

A tela **Financeiro → Notas e RPA** (tarefas PF-66 e PF-67, [documentos-fiscais, Ajustes de 26/11](../specs/documentos-fiscais.md)) acompanha os documentos fiscais da folha de campo, sem pagar nada. Decisões do Bruno no [registro](../transcricoes/2026-11-26-notas-e-rpa.md).

- **NF pendente:** quem recebe por NF e ainda não mandou a nota. Registrar NF grava o número e a emissão, e a pessoa sai da lista.
- **RPA do mês:** quem recebe por RPA e foi paga no mês, com bruto, INSS e líquido, e Exportar Excel para a contabilidade.
- **INSS:** o percentual vai para Cadastros → Impostos retidos (11% hoje) e vale para as próximas folhas importadas.

A conferência das notas do portal (PF-68) espera um arquivo exportado do portal.

## Pedidos da reunião de testes (27/11/2026)

Na reunião de 26/11 com a Bruna e a Camila, já com os dados reais ([registro](../transcricoes/2026-11-26-reuniao-de-testes-com-o-financeiro.md)), saíram estes pedidos:

- **Empresa no topo** de Contas a pagar e a receber, ao lado dos botões, lembrada para cada pessoa: a lista abre na empresa dela e não mistura as outras. Limitar o acesso por conta fica para a Vivi (Q65).
- **F5 não volta para hoje:** cada aba lembra o dia, os filtros, a busca e a ordem.
- **A mesma tela em duas abas:** o duplo clique no menu numa tela já aberta abre "Contas a pagar (2)".
- **Ordenar por mais colunas:** projeto, centro de custo, forma e empresa.
- **O número do documento** aparece embaixo da descrição e na coluna Documento (só o número). A descrição da conta ganhou 2 linhas, e o campo Observações saiu (fica só a descrição).
- **Sessão:** cai só depois de **2 horas sem uso**.
- **Feriados:** só os **nacionais** contam. O feriado de Alagoas em 30/11 levava o sábado 28/11 para 01/12.
- **Carregar incentivos:** a data é lida em mais formatos (27/11/26, 27-11-2026…).
- **Formas de pagamento** da baixa do sistema antigo cadastradas: Agendamento de Pagamento, Boleto, Cartão de Crédito (à vista), Cartão de Crédito (parcelado), Cartão de Débito, Carteira Digital, Cheque, Crédito em Conta, Débito Automático, Débito em Conta, Dinheiro (espécie), DOC, PIX, PIX QR Code, TED e Transferência entre Contas.
- **Coluna Ações** com título, e os títulos de valor alinhados com os números. Em **Colunas**, **Limpar seleção** volta à disposição normal.
- **Baixa em lote com comprovante:** cada conta leva o seu comprovante, e a baixa só sai com todos.

**Como testar** (http://localhost:3010):

1. Em **Contas a pagar**, escolha a empresa no topo, ao lado de Importar planilha, volte um dia e aperte **F5**: a empresa e o dia continuam. Abra **Contas a receber**: abre na mesma empresa.
2. Dê **dois cliques** em Contas a pagar no menu: as abas viram "Contas a pagar (1)" e "(2)". Busque algo diferente em cada aba e aperte F5: cada uma volta como estava. Feche a (1): a outra fica, sem número.
3. Clique no título **Projeto** da lista: as contas ficam na ordem dos projetos.
4. Abra uma conta, ponha o número do documento **112** e salve: "112" aparece embaixo da descrição e na coluna Documento.
5. Em **Carregar incentivos**, uma data de pagamento escrita como texto "27/11/26" é lida. Um sábado vai para a segunda seguinte, e não para a terça.
6. Selecione duas contas e clique em **Dar baixa**: cada conta pede o seu comprovante, e o botão só libera com os dois. Depois da baixa, o clipe das duas fica azul.
7. Deixe o sistema parado por mais de 2 horas e clique: volta ao login. Mexendo na tela, ele não cai.

## Incentivos: a planilha da equipe e a baixa pelos comprovantes (27/11/2026)

Pedido do Bruno ([registro](../transcricoes/2026-11-27-incentivos-planilha-e-baixa-pelos-comprovantes.md), [ADR 0028](../architecture/adr/0028-baixa-de-incentivos-pelos-comprovantes-casados-pela-chave.md)):

- **Planilha modelo nova**, no estilo da que a equipe usa, sem CPF e dados de banco, com Projeto, Plano de contas e Forma de pagamento no fim. Uma planilha traz vários projetos: cada projeto e cada data em PAGAR vira um lançamento, com as pessoas dentro. A chave Pix de cada pessoa é obrigatória.
- **Baixar pelos comprovantes:** envie os PDFs de comprovantes Pix do Itaú. Cada comprovante é casado com a pessoa pela chave, e a baixa só libera quando todas batem e a soma fecha com a conta. Confirmar dá um Pix por pessoa e anexa o comprovante de cada uma nela.

**Como testar** (http://localhost:3010):

1. Em **Carregar incentivos**, baixe a planilha modelo e preencha pessoas de dois projetos, com a chave Pix, o valor, a data em PAGAR, o projeto, o plano de contas e a forma: entram dois lançamentos.
2. Deixe uma pessoa sem chave Pix: a conferência diz o motivo e ela fica de fora.
3. Na linha de um lançamento, clique em **Baixar pelos comprovantes**, envie o PDF com o comprovante de uma só pessoa e confira: aparece quem está sem comprovante.
4. Envie também o das outras e confira: "Tudo bate". Escolha a conta e confirme a baixa: a conta fica paga, e no drill down cada pessoa tem o botão do comprovante dela.
5. Abra a conta, aba **Baixas**: marque só uma pessoa (ou **Selecionar todas**), clique em **Estornar selecionadas**, escreva o motivo e confirme. Quem foi estornado volta a ficar a pagar, e **Baixar pelos comprovantes** aparece de novo. Mande o PDF de todos: os de quem continua pago ficam de fora, e a baixa sai só para os estornados.

## Acesso por empresa (27/11/2026)

Pedido do Bruno ([registro](../transcricoes/2026-11-27-acesso-por-empresa.md), [ADR 0029](../architecture/adr/0029-acesso-por-empresa-com-filtro-central.md)): o admin escolhe, em **Acessos**, se cada pessoa vê todas as empresas ou só algumas. O servidor esconde as outras em todas as telas, relatórios, planilhas e na busca.

**Como testar** (http://localhost:3010, entrando com um admin):

1. Em **Acessos › Pessoas e telas**, clique em **Empresas** de um usuário, marque **Só algumas** e escolha uma.
2. Entre com essa pessoa (outro navegador): Contas a pagar, a receber, o Início, a busca e os Cadastros mostram só a empresa escolhida.
3. Abra pelo endereço uma conta de outra empresa (`/contas-a-pagar?conta=...`): "Conta não encontrada".
4. Volte para **Todas as empresas** em Acessos: a pessoa vê tudo de novo ao recarregar.

## Como testar

Cada módulo, ao ser entregue, ganha aqui o roteiro manual de teste (como no roadmap do Connect).

### Notas e RPA (26/11)

1. Importe em Contas a pagar uma folha de campo com uma pessoa NF sem número, uma NF com número e uma RPA de R$ 1.000.
2. Em Financeiro → Notas e RPA (como no protótipo: os três números no alto, a Lista de RPA e a NF pendente lado a lado e a conferência embaixo), só a pessoa NF sem número aparece na NF pendente, com o lançamento (o link abre a conta), o projeto e o valor. A tela não tem baixa nem importação.
3. Registrar NF sem o número: "Informe o número e a data de emissão da nota.". Com o número e a data, a pessoa sai da lista, e o histórico do lançamento diz quem registrou.
4. Dê baixa no lançamento inteiro. Na Lista de RPA, a pessoa RPA aparece no mês de hoje, com bruto de R$ 1.000,00, INSS de R$ 110,00 e líquido de R$ 890,00. Exportar Excel baixa a lista com o total. O mês anterior fica vazio.
5. Em Cadastros → Impostos retidos, mude o INSS do RPA para 10% e importe outra folha: a pessoa RPA de R$ 1.000 fica com R$ 900. Uma conta a pagar nova continua com PIS, COFINS, CSLL e IR, sem INSS.
6. Os testes:
   - em `backend/`: `pytest tests/test_notas_e_rpa.py tests/test_impostos_retidos.py`;
   - em `frontend/`: `npx playwright test e2e/notas-e-rpa.spec.ts`.

### Fluxo mensal, recebimentos × ano e favoritos (26/11)

1. No menu, Relatórios mostra Fluxo de caixa, DRE, Fluxo mensal e Recebimentos × ano como "Em breve", sem link. Dê baixa hoje numa conta com competência de um mês passado. Em `/relatorios/fluxo-mensal`, ela aparece no mês de hoje, na linha do grupo dela. No DRE, ela fica no mês da competência.
2. Estorne a baixa, ou pague pelo cartão: ela sai do fluxo mensal.
3. Filtre por um projeto. A baixa parcial de uma conta dividida entre projetos entra na proporção da parte dele: 500 pagos de 1.000, com 600 do projeto, dá 300.
4. Receba um título de um projeto. Em `/relatorios/recebimentos-projetos`, o projeto aparece com o valor no mês, e o total do mês embaixo. Troque o ano e a empresa, e use Exportar Excel.
5. Em `/relatorios/dre`, com um ano inteiro, os meses e o Total cabem na tela e a coluna da linha fica parada ao rolar para o lado. Escolha um projeto e Mostrar as contas. Em Favoritos, salve como "Projeto X". Mude os filtros e recarregue a página. Em Favoritos → "Projeto X", os filtros voltam. O X ao lado do nome apaga o favorito.
6. Em Contas a pagar, digite uma busca, troque as colunas e salve um favorito. Limpe tudo e abra o favorito: a busca e as colunas voltam, e o período continua o da tela.
7. Os testes:
   - em `backend/`: `pytest tests/test_fluxo_mensal.py tests/test_recebimentos_projetos.py`;
   - em `frontend/`: `npx vitest run src/lib/favorites.test.ts src/lib/projectReceipts.test.ts` e `npx playwright test e2e/relatorios-fase-2.spec.ts`.

### Fluxo de caixa, DRE e o número na exportação (25/11)

1. Em Relatórios → Fluxo de caixa, a tela abre desta semana até 4 semanas depois, por semana. Uma conta a pagar em aberto que vence na semana que vem aparece em Saídas previstas daquela semana. Ver lista a conta, com o link para ela.
2. Dê baixa numa conta hoje: o valor sai do previsto e entra em Saídas realizadas desta semana, e a conta bancária mostra a saída. Estorne a baixa: ela volta ao previsto.
3. Uma conta vencida antes do período aparece em "Em atraso antes do período" e já entra no saldo projetado.
4. Em Cadastros → Contas bancárias, marque uma conta como fora do fluxo de caixa: ela some do saldo e da tabela por conta.
5. Troque para Mês e para Dia; ponha a data final antes da inicial: "A data final vem antes da inicial". Exportar Excel baixa a planilha com o saldo inicial na primeira linha.
6. Na Conferência bancária (pelo endereço), aba Extrato × sistema, Exportar Excel baixa uma linha por dia, com o total.
7. Em Contas a pagar e a receber, Exportar: a última coluna é o Nº da conta (ou do título).
8. Em Relatórios → DRE, cada grupo do plano de contas é uma linha; Mostrar as contas abre as contas de cada grupo, e a linha é a soma delas. Mude o grupo de uma conta em Cadastros → Plano de contas: ela passa para a linha do grupo novo. Filtre por um projeto: a conta dividida entre projetos entra só com a parte dele. Provisões e contas canceladas não entram.
9. Os testes: `pytest tests/test_fluxo_de_caixa.py tests/test_bank_reports.py tests/test_dre.py` em `backend/` e `npx playwright test e2e/fluxo-de-caixa.spec.ts e2e/fechamento.spec.ts e2e/dre.spec.ts` em `frontend/`.

### Cadastros iguais aos do sistema antigo (24/11)

1. Em Cadastros → Unidades, a lista tem Empresa | Unidade | Código | Infos | Ações. Nova unidade: preencha Código no sistema antigo (UN9), Nome e IE e cadastre: a coluna Código mostra UN9, e a janela de editar mostra o código gerado (0001...).
2. Na mesma janela, troque o CNPJ por um CPF e salve: "Por enquanto, só CNPJ: CPF não é guardado aqui".
3. Em Cadastros → Empresas, uma empresa com apelido (Pesquise+): em Contas a pagar, na escolha da unidade e na lista, ela aparece pelo apelido.
4. Importar o .csv do sistema antigo: `python scripts/importar_cadastros.py --tipo empresas --email voce@... < Empresas.csv` mostra a prévia; com `--gravar`, grava. Depois `--tipo unidades`, `--tipo centros`, `--tipo clientes`, `--tipo fornecedores`, `--tipo plano`, `--tipo projetos` e `--tipo contas --empresa Pesquise+ --empresa-das-contas "IHEA=7,20,21,22"`. Em Cadastros → Plano de contas, a lista em árvore: o grupo em destaque e as contas embaixo; Novo grupo ao lado de Nova conta. Rodar de novo não cria nada.
5. Os testes: `pytest tests/test_records.py tests/test_importar_cadastros.py` em `backend/` e `npx playwright test e2e/cadastros.spec.ts` em `frontend/`.

### Senha inicial de primeiro acesso (25/11)

1. Crie uma conta com `python scripts/create_user.py --email teste@... --name "Teste" --primeiro-acesso` (no servidor: `make conta EMAIL=... NOME="..." NIVEL=financeiro`).
2. Entre com a senha inicial: aparece **Crie a sua senha**. Senhas diferentes nos dois campos: "As duas senhas não são iguais. Digite de novo." A mesma senha inicial: "A senha nova precisa ser diferente da senha inicial".
3. Com uma senha nova válida, a tela segue para **Cadastre o segundo fator**, e o resto é o primeiro login de sempre.
4. Saia e entre com a senha inicial: "E-mail ou senha incorretos". Com a nova, vai direto ao código do app.
5. Os testes: `pytest tests/test_senha_inicial.py` em `backend/` e `npx playwright test e2e/login.spec.ts` em `frontend/`.

### Servidor pelo IP ou por nome (26/11)

1. No servidor: `make verificar IP=192.168.30.15` não reclama mais das portas 80 e 443; confere a 8444 e a 8443. `make verificar HOST=...` recusa e diz para usar `IP=`.
2. `make configurar IP=192.168.30.15`, `make subir` e `make certificado`: com o certificado instalado, `https://192.168.30.15:8444` abre o login, e o `make conferir` dá `[ok]` nas telas e na API.
3. Com um nome no DNS: `make trocar-endereco DOMINIO=financeiro.pesquisemais.com.br` sobe de novo com o mesmo banco; `make nginx` e os comandos dele (com o certbot) ligam o HTTPS, e `https://<DOMINIO>` abre sem certificado instalado. De fora da rede do escritório, o nginx responde 403.
4. `make trocar-endereco IP=...` volta ao IP, com o mesmo certificado raiz de antes.
5. A CI do deploy (`.github/workflows/deploy.yml`) roda os dois modos, com o login, o backup, o `make voltar`, o `make subir-projeto` e a troca de um modo para o outro.

### Banco local no servidor e atualização às 22h (25/11)

1. Na máquina do desenvolvimento, com o `docker compose` no ar: `bash scripts/gerar-dump-local.sh` gera os 3 arquivos em `backups/` e diz quantas contas de acesso, contas a pagar e a receber levam.
2. Num servidor novo, depois do `git clone`: os 3 arquivos em `backups/` e `make subir-projeto IP=<IP> CONFIRMAR=sim` (ou `DOMINIO=<nome>`). Sem `CONFIRMAR=sim`, sem o endereço ou sem um dos 3 arquivos, ele recusa sem mexer em nada. Num servidor já instalado: `make atualizar` e `make restaurar-local ARQUIVO=backups/local-<data>-banco.dump CONFIRMAR=sim`.
3. Entre com uma conta da máquina do desenvolvimento: Contas a pagar e Cadastros mostram o mesmo que lá.
4. `make status`: "Atualização automática: ligada, às 22h" (o `make subir-projeto` liga; à mão, `make agendar`). No dia seguinte, `backups/logs/` tem o log da noite. `make desagendar` desliga.
5. A CI do deploy (`.github/workflows/deploy.yml`) roda o `make subir-projeto` (com o `restaurar-local` e o `agendar` dentro) e o `make desagendar` num Ubuntu.

### Adiantamento do Connect (23/11)

1. Os testes: `pytest tests/test_connect_http.py tests/test_confirmation.py` em `backend/` (o exemplo do relatório: 5 entrevistas de R$ 100 e R$ 250 de adiantamento dão R$ 250 a pagar, com as duas mais antigas fora do pagamento).
2. Com o Connect de dev (quando a conta de serviço existir, PF-77): lance um adiantamento numa pessoa do projeto de teste e rode `python scripts/connect_dev_check.py`. A baixa do roteiro soma o valor líquido e o Connect aceita.

### Login não trava por quem é de fora (PF-53, 23/11)

1. Num celular fora da rede do escritório (4G), erre 10 vezes a senha de uma conta (espere 1 minuto a cada 5 tentativas): a 11ª diz "Muitas tentativas — aguarde alguns minutos", mesmo com a senha certa.
2. No computador do escritório, entre com a mesma conta e a senha certa: entra normalmente.
3. Os testes: `pytest tests/test_auth.py` em `backend/`.

### Abas de telas (23/11)

1. Entre: com uma tela só, a fileira de abas não aparece.
2. Um clique em **Contas a pagar** no menu: a tela troca (continua uma aba só, sem fileira). Busque **grafica**.
3. Dois cliques em **Contas a receber**: a fileira aparece, com a aba nova ao lado, já na frente. Busque **satisfacao** e mude o período para **Tudo**.
4. Clique na aba **Contas a pagar**: a busca "grafica" e a lista estão como você deixou. Volte para **Contas a receber**: "satisfacao" e o período Tudo também.
5. Clique de novo em **Contas a pagar** no menu: vai para a aba dela, sem abrir outra.
   Com uma janela aberta e pela metade (por exemplo, **Nova conta a pagar** com a descrição digitada), clique na outra aba e volte: a janela continua aberta com o que foi digitado. A fileira fica presa no alto ao rolar, e as janelas abrem abaixo dela.
6. **F5**: as duas abas voltam, cada tela do zero (busca vazia).
7. No **×** da aba da frente: ela fecha e a vizinha vem para a frente; sobrando uma, a fileira some. O botão do meio do mouse também fecha.
8. Os testes: `npx vitest run src/lib/tabs.test.ts` e `npx playwright test e2e/abas.spec.ts` em `frontend/`.

### Navegador liberado

Com dois administradores (por exemplo os dois do banco local) e o sistema rodando. **As contas que já existiam não têm navegador: o primeiro login de cada uma depois da entrega libera o navegador em que ela entrar.**

1. Entre com a conta A no Chrome: entra direto (primeiro computador).
2. Abra uma janela anônima (ou outro navegador) e entre de novo com a conta A: depois do código aparece **"Computador ainda não liberado"**, sem entrar.
3. Entre com a conta B no navegador dela: o sino mostra "... pediu para entrar de um computador novo". Em **Acessos > Pedidos**, **Liberar** e confirme.
4. Volte à janela anônima, **Voltar ao login**, e entre de novo com a conta A: agora abre o Início.
5. Em **Acessos > Liberados**, **Revogar** o computador da janela anônima: a sessão dela cai, e o próximo login ali vira pedido de novo.
6. Caso negado: a conta B não libera o próprio computador (no pedido dela aparece "É o seu computador: outro administrador libera." no lugar do Liberar; pela API, 409).
7. Sem outro admin, no servidor: `make liberar-navegador EMAIL=...` (ou `python scripts/liberar_navegador.py --email ...` em `backend/`).
8. Os testes: `pytest tests/test_navegador_liberado.py` em `backend/` e `npx playwright test e2e/navegador-liberado.spec.ts` em `frontend/`.

### Feriados das capitais (19/11)

1. `docker compose up -d --build` (o primeiro build do `feriados` leva alguns minutos). Espere `docker compose ps` mostrar o `feriados` como *healthy*.
2. Em `/cadastros?aba=holidays`, **Buscar feriados do ano**: a mensagem conta os nacionais e "Das capitais, N feriados estaduais e municipais novos". Na lista, a origem deles é **feriados.dev (capitais)**, com a cidade ou a UF em "Onde vale".
3. Sem clicar em nada, a API busca sozinha 90 segundos depois de subir e a cada 6 horas (o log da API diz "Feriados de 2026 buscados").
4. Lance uma conta com vencimento no aniversário de São Paulo (25/01): aparece o aviso de dia não útil.
5. Os testes: `pytest tests/test_feriados_dev.py tests/test_holidays.py` em `backend/`.

### Níveis de acesso e demandas (19/11)

1. Torne a sua conta super admin: `make definir-nivel EMAIL=voce@pesquisemais.com.br NIVEL=superadmin` (ou `python scripts/definir_nivel.py --email ... --nivel superadmin` em `backend/`). Recarregue a página: o menu mostra **Demandas** e o seu nível aparece como "Super admin".
2. Entre com um admin: **Acessos > Pessoas e telas** lista todos, com o nível. Em um usuário, **Telas**, desmarque **Contas a receber** e **Cadastros** e salve.
3. Entre com esse usuário: o menu não tem Contas a receber nem Cadastros, nem Acessos e Demandas. Abra `/contas-a-receber` pelo endereço: aparece **Tela não liberada**.
4. Ainda como usuário, **Abrir demanda**: Enviar sem nada pede Tipo, Descrição e Anexo. Escolha **Correção de bugs**, escreva, cole um print com Ctrl + V e envie.
5. Como super admin: o sino avisa a demanda nova; em **Demandas** aparecem o tipo, a descrição, a tela, quem abriu, a situação **Aberta** e **Baixar**. Clique em **Concluído** e confirme: a situação vira **Concluída**, e quem abriu vê no sino "Sua demanda foi concluída".
6. Caso negado: o admin não muda as próprias telas nem as de outro admin (na lista aparece "Só o super admin muda").
7. Os testes: `pytest tests/test_niveis_de_acesso.py` em `backend/`, `npx vitest run src/lib/access.test.ts` e `npx playwright test e2e/niveis-de-acesso.spec.ts` em `frontend/`.

### Impostos retidos (19/11)

1. Em **Cadastros › Impostos retidos**, confira PIS 0,65, COFINS 3, CSLL 1 e IR 1,5. Escreva 150 no IR e salve: aparece "Informe o percentual de IR entre 0 e 100, como 1,5.". Volte para 1,5 e salve.
2. Em **Contas a pagar**, **Nova conta a pagar**: embaixo dos valores aparece "Impostos retidos já calculados sobre o valor principal: PIS 0,65%, COFINS 3%, CSLL 1% e IR 1,5%".
3. Valor principal 1.000,00: **(−) Total de impostos** mostra 61,50 e o líquido 938,50. Troque para 2.000,00: os impostos vão para 123,00.
4. Abra **Impostos**: PIS 13,00, COFINS 60,00, CSLL 20,00 e IR 30,00. Apague o IR e salve: o total vai para 93,00. Troque o valor principal: os impostos não mudam mais.
5. Lance a conta e confira o líquido na lista.
6. O menu de Cadastros não tem mais **Feriados**; `/cadastros?aba=holidays` ainda abre a tela.
7. Os testes: `pytest tests/test_impostos_retidos.py` em `backend/`, `npx vitest run src/lib/adjustments-impostos.test.ts` e `npx playwright test e2e/impostos-retidos.spec.ts` em `frontend/`.

### Carregar incentivos (18/11)

1. Em **Contas a pagar**, clique em **Carregar incentivos**. A janela só pede a planilha: projeto, plano de contas e forma de pagamento vêm dela.
2. **Baixar planilha modelo**: o arquivo `modelo-carregar-incentivos.xlsx` tem as abas **Incentivos** (só os títulos), **Como preencher**, **Projetos**, **Plano de contas** e **Formas de pagamento**.
3. Preencha com dados fictícios de 2 projetos e 2 datas, e clique em **Ler planilha**: a conferência mostra o cronograma por projeto e data.
4. Coloque uma data de sábado: ela vai para o próximo dia útil, com o aviso. Coloque um projeto que não existe, ou deixe o plano de contas vazio: a linha fica de fora, com o motivo. Apague a coluna **Forma de pagamento**: a planilha é recusada e diz qual coluna falta.
5. **Criar**: a tela **Carregando incentivos** conta "N de M incentivos", e demora mais numa planilha maior. No fim, os lançamentos aparecem na lista, com as pessoas dentro e a chave Pix mascarada.
6. Repita com as colunas da planilha atual (`Nome Completo:`, `Beneficiário:`, `PIX:`, `VALOR TOTAL`, `STATUS`, `DATA DE REALIZAÇÃO DA PESQUISA`, `PAGAR (PREENCHIDO PELO FINANCEIRO)`), acrescentando as colunas Projeto, Plano de contas e Forma de pagamento. A linha com STATUS "Pago" aparece como **Já paga** e não entra.
7. Os testes: `pytest tests/test_carregar_incentivos.py` em `backend/`, `npx vitest run src/lib/carregar-incentivos.test.ts` e `npx playwright test e2e/carregar-incentivos.spec.ts` em `frontend/`.

### Reclassificar com edição em lote e anexo (18/11)

1. Em **Contas a pagar**, marque duas ou mais contas e clique em **Reclassificar**: a janela tem as abas **Todas de uma vez**, **Conta por conta** e **Anexar comprovante**.
2. **Conta por conta**: mude a descrição de uma linha. A caixa da esquerda dela fica marcada sozinha, e o rodapé mostra "Marcadas: 1 conta" e o valor. **Salvar 1 conta**: só ela muda; a outra fica como estava.
3. Uma conta paga mostra o valor bloqueado; uma com pessoas (incentivo) mostra o fornecedor e o valor bloqueados.
4. **Anexar comprovante**: escolha um PDF e **Anexar em 2 contas**: as duas ganham o documento (o clipe fica verde).
5. A competência aparece e se digita como mm/aaaa.
6. Os testes: `pytest tests/test_edicao_em_lote.py` em `backend/`, `npx vitest run src/lib/batch-edit.test.ts` e `npx playwright test e2e/testes-16-11.spec.ts` em `frontend/`.

### Busca em todo o sistema (18/11)

1. Em qualquer tela, clique na **lupa** no alto, à direita (ou Ctrl+K) e digite **itau**: aparece **Contas bancárias** com "Itaú · PPlus", com "Itaú" marcado.
2. Digite o nome de um cliente: ele aparece em **Contas a receber** e em **Clientes**, cada um no seu grupo. Clique no cliente: abre Cadastros > Clientes com a busca preenchida.
3. Digite o nome de um fornecedor e clique numa conta a pagar: abre Contas a pagar com a conta aberta.
4. Digite um número de NF ou um valor ("1.250,00"): a conta aparece, e a NF também em **Notas fiscais**.
5. Com 1 letra aparece "Digite ao menos 2 letras."; sem achado, "Nada encontrado para ...".
6. Os testes: `pytest tests/test_busca_geral.py` em `backend/`, e `npx vitest run src/lib/search.test.ts` e `npx playwright test e2e/busca-geral.spec.ts` em `frontend/`.

### Cadastro de projeto como na tela antiga (18/11)

1. Em **Cadastros > Projetos**, **Novo projeto** e **Salvar** sem preencher: aparece "Falta preencher: código, nome, unidade, cliente, centro de custo.".
2. Preencha **Código**, **Nome**, **Unidade**, **Cliente** e **Centro de custo** e salve: o projeto aparece na lista.
3. **Editar** o projeto: a janela tem os mesmos campos, mais **Inativo** e **Excluir** (tipo de projeto e incentivo não aparecem mais). Marque **Inativo = Sim** e salve: a Situação mostra **Inativo**, e o projeto some da **Nova conta a pagar**. As contas que já estavam nele continuam.
4. **Excluir** um projeto com conta lançada: aparece "Esse projeto tem lançamentos — inative em vez de excluir". Um projeto sem conta sai da lista.
5. Em **Contas a pagar**, **Nova conta a pagar**: os campos vêm um por linha, na ordem fornecedor, vencimento, programação, valor principal, forma de pagamento, projeto (com "Dividir entre projetos" logo abaixo), unidade, centro de custo, **plano de contas** e descrição. **Lançar conta** sem preencher lista os que faltam na mesma ordem.
6. Os testes: `pytest tests/test_projeto_cadastro.py` em `backend/` e `npx playwright test e2e/testes-16-11.spec.ts e2e/contas-a-pagar.spec.ts e2e/campos-obrigatorios.spec.ts` em `frontend/`.

### Pedidos dos testes de 16/11

Com o sistema rodando e os dados fictícios (`seed_demo`) carregados. **A demonstração recomeça do zero nesta versão** (a tabela de projetos mudou): avise a equipe antes de publicar.

1. **Cadastros > Projetos > Novo projeto**: salvar vazio diz "Falta preencher: número, nome."; o número 1804 é recusado ("Já existe o projeto PRJ-1804"). Cadastre 1950 com unidade **CATI Curitiba** e centro **Tecnologia**: a lista mostra "CATI Curitiba · Tecnologia".
2. **Nova conta a pagar**: o Projeto fica ao lado do Fornecedor, e Forma de pagamento e Categoria na última linha. Escolha o PRJ-1950: a Unidade vira CATI Curitiba e o Centro de custo, Tecnologia. Lançar sem projeto: a mensagem pede o Projeto.
3. Abra a conta, **Editar conta**: troque o projeto (ou divida entre dois) e a unidade. O histórico mostra "projeto PRJ-1950 → ...". Numa conta com baixa, uma unidade de outra empresa é recusada.
4. Na lista, as setas **Dia anterior** e **Próximo dia** andam um dia; em **Tudo** elas somem. Numa janela baixa, o calendário continua inteiro na tela.
5. Busque **grafica** (sem acento), **prj-1804** e um valor como **1.300,00**: as contas aparecem.
6. Selecione duas contas: **Anexar** um PDF leva o arquivo às duas ("Documento anexado em 2 contas."), e o clipe delas fica verde. **Reclassificar** com um vencimento e um valor muda as duas.
7. Clique no card **Canceladas**: a lista explica o que é uma conta cancelada; abra uma, e o aviso mostra o motivo.
8. **Repetir esta conta** com vencimento 31/01/2027 e **Simular**: a linha 1 diz "31/01 caiu em domingo: foi para seg 01/02".
9. No lançamento do Connect, **Enviar comprovantes**: o botão do primeiro passo é **Salvar comprovantes** (o projeto continua sendo escolhido).
10. **Relatórios > Relatório do projeto**: busque 1790; só ele fica na lista.
11. Os testes: `pytest tests/test_testes_16_11.py tests/test_recurrence.py` em `backend/`, `npx vitest run src/lib/testes-16-11.test.ts` e `npx playwright test e2e/testes-16-11.spec.ts` em `frontend/`.

### Início e Contas a pagar

Com o sistema rodando e as contas fictícias carregadas (`.venv/Scripts/python scripts/seed_demo.py`, em `backend/`):

1. Entre: a tela abre no **Início**, com contas vencidas, a pagar em 7 dias, o que precisa de atenção, fluxo previsto e próximos vencimentos. A receber e saldo nos bancos ficam com "—".
2. Em **Contas a pagar**, a tela abre no dia de hoje. Troque para semana, mês, ano e tudo. Clique na data para abrir o calendário: a data inicial e depois a final já aplicam o intervalo.
3. Clique nos indicadores e nas abas: a lista e os totais acompanham. Combine com filtros e busca, e use **Limpar filtros**.
4. Na linha de **14 entrevistados**, abra a seta: as pessoas aparecem na própria lista, com busca por nome.
5. Provisão e **Do Connect** não têm o botão de baixa. Na conta de passagens, **Dar baixa**: a situação vira "Paga" e o contador do menu diminui.
6. Em **Ver detalhes → Baixas**, estorne com motivo: as duas linhas ficam visíveis, e o valor volta a pendente. O **Histórico** mostra quem fez o quê.
7. **Nova conta a pagar**: em **Dividir entre projetos**, clique em **Adicionar projeto** e escolha o projeto e o valor de cada parte; a tela diz quanto falta para fechar. Um rateio que não fecha não salva. Para muitas linhas, abra **Colar várias linhas da planilha**, cole o código e o valor (separados por espaço, tabulação ou ponto e vírgula) e clique em **Passar para os campos**.
8. Selecione duas contas e dê baixa em lote. Tente excluir uma com baixa: o sistema recusa até estornar.
9. Recolha o menu lateral pelo botão ao lado do logo: ficam só os ícones, e a escolha continua depois de recarregar.
10. **Filtros** abre um painel lateral: a lista muda enquanto você escolhe, e o botão de baixo mostra quantas contas sobraram. Digite na lista de **Fornecedor** para achar sem rolar, sem precisar de acento. Experimente **Plano de contas** (o antigo "Categoria", com código e nome), **Unidade**, **Situação**, **Tipo** e **Período por**. Todos os filtros aceitam **mais de uma opção**: marque duas situações ou dois projetos e a lista traz as contas de qualquer um deles. A lista fica aberta enquanto você marca (Esc fecha), e a primeira linha, "Todos", limpa a marcação.
11. Em **Colunas**, ligue mais colunas e escolha a densidade **Compacta**. A escolha fica guardada neste navegador.
12. **Exportar** oferece **Excel (.xlsx)** e **CSV** com tudo o que os filtros mostram. No Excel, valor e data já vêm como número e data (dá para somar e ordenar), com os filtros na primeira linha e o **Total** no fim. O CSV abre no Excel com os acentos certos.
13. Selecione contas e use **Reclassificar**: sem escolher nada, o sistema pede o que vai mudar. O **Histórico** mostra o antes e o depois.
14. Selecione uma conta e use **Duplicar**: a cópia aparece no mês seguinte, sem baixas.
15. Em **Nova conta a pagar**, marque **É uma provisão** e lance sem fornecedor. Na linha, **Substituir pelo valor real**: o total conta só o real, sem contar duas vezes. Cancele o real: a provisão volta a valer.
16. **Abrir e editar a conta:** clique em qualquer lugar da linha (menos nos botões e na caixa de seleção) para abrir a conta. Em **Editar conta** mude fornecedor, categoria, centro de custo, forma de pagamento, documento, código de barras, competência, documentação recebida e observações; a aba **Detalhes** organiza tudo em blocos, com quem incluiu e alterou por último e os valores (valor principal, acréscimos, descontos e líquido); a aba **Baixas** mostra todas as baixas e estornos, e **Histórico** traz o antes e o depois de cada mudança.
17. **Documentos da conta:** na conta aberta, aba **Documentos**: escolha um ou mais arquivos (PDF, JPG, PNG, XLSX, DOCX ou XML, até 20 MB). **Baixar** devolve o mesmo arquivo e o download aparece no **Histórico**; **Tirar** pede o motivo, e o arquivo continua guardado. Um arquivo de outro tipo (ou um .exe renomeado para .pdf) é recusado com o motivo. Sem o cofre configurado (`FILES_*` no `backend/.env`), a tela avisa que os anexos não estão disponíveis.
18. **Acréscimos, descontos e impostos:** os valores ficam num bloco só, alinhado à esquerda e sem moldura, na ordem do sistema antigo (valor principal, os três totais e o valor líquido). Em **Nova conta a pagar** ele vem logo depois de Forma de pagamento e Projeto, e **antes** da divisão entre projetos (e do "Colar várias linhas da planilha"); em **Editar conta**, depois da classificação e antes do documento; em **Nova conta a receber** e em **Alterar título**, o mesmo bloco. Em cada um, cada tipo tem um total só para leitura e um botão: ele abre a lista de lançamentos, com descrição e valor. Em "Valor líquido", o formulário mostra valor principal + acréscimos − descontos − impostos. A lista e o pendente passam a usar o líquido, e a conta aberta mostra o valor principal, os três totais e as linhas. Se os descontos e impostos zerarem o valor, a tela avisa. Vale também em Contas a receber.
19. **Conta aberta:** acima das abas ficam **Valor, Pago e Pendente** e a barra de quanto já foi pago (o título a receber também). Em conta que aceita baixa, o **Dar baixa** está dentro dela. Documentação que chegou com menos de 3 dias do vencimento vira aviso amarelo. Em conta de série, a aba **Repetir** mostra todas as ocorrências: **Abrir** troca de uma para outra, e **Alterar a série** e **Cancelar contas da série** funcionam de dentro dela.
20. **Documentos com tipo:** na aba Documentos escolha o **Tipo do documento** e anexe; **Renomear** muda o nome (a extensão fica) e o tipo, e o Histórico mostra os dois. No **Contas a receber**, a mesma aba existe no título aberto, com baixar, renomear e tirar com motivo.
21. **Imprimir resultados:** ao lado de Exportar, **Imprimir** abre a impressão com **todos** os resultados dos filtros (não só a página), folha deitada, com o total no fim. O menu e os filtros não saem no papel. Vale nas duas telas.
22. **Nova conta a pagar:** o campo de data se chama **Programação**; a **Descrição** vem abaixo do valor líquido, numa caixa grande (palavra comprida quebra dentro dela); **Forma de pagamento** e **Projeto** têm busca.
23. **Pagar em:** em **Editar conta**, preencha **Pagar em**. Ele aparece na aba Detalhes e no Histórico, e não muda o vencimento, a lista nem a baixa.
24. **Título a receber aberto:** a mesma linha de abas da conta a pagar (**Detalhes**, **Editar título**, **Recebimentos**, **Documentos**, **Repetir**, **Cancelar título** e **Histórico**), abrindo em Detalhes, com rótulos e valores à esquerda. **Registrar recebimento** está na aba Recebimentos. Em **Nova conta a receber**, a Descrição vem abaixo do valor líquido, em caixa grande, e o Projeto tem busca.
25. **Cadastro pelo CNPJ:** em **Cadastros**, **Novo fornecedor**, **Novo cliente** ou **Nova empresa** abrem com o **CNPJ** no topo. O **Tipo** é pessoa jurídica (padrão) ou física; pessoa física fica sem documento, porque o CPF não é guardado. Digite um CNPJ completo (ou clique em **Buscar**): a Receita preenche o Nome / razão social e o Apelido, e você edita o que quiser. CNPJ baixado mostra um aviso; CNPJ que a Receita não conhece avisa e deixa preencher à mão; CPF é recusado. O **Código** é gerado sozinho (0001, 0002...), não repete e não muda (também em **Unidades**). A lista mostra Código, Apelido · nome e CNPJ. No alto de cada aba, quatro totais: **Exibindo** (muda com a busca), **Total de …**, **Ativos** e **Inativos** (em Projetos: Em andamento e Encerrados). (Na tela de teste, só valem os CNPJs inventados do modo simulado.)
26. **Centros de custo em árvore:** em **Cadastros → Centros de custo**, **Novo centro de custo** pergunta o tipo: **Centro principal** (código gerado **001**, **002**...) ou **Sub-centro**, que pede o **Superior** (o principal em que ele fica) e leva o código dele, um ponto e a ordem: **001.001**, **001.002**.... São dois níveis só. A lista mostra o principal e, embaixo, os sub-centros dele, com o código. Nos lançamentos (nova conta a pagar e a receber, filtros e importação), principais e sub-centros podem ser escolhidos, e a escolha mostra `001.001 · Administrativo › Adm_Geral`; a lista da conta mostra `Administrativo › Adm_Geral`. O superior não muda depois de cadastrado (o código depende dele), o mesmo nome pode existir em superiores diferentes, e principal que tem sub-centros não é excluído (inative ou apague os sub-centros antes). Os centros que já existiam viraram principais, com código na ordem em que foram criados.
27. **Ordenar pelo cabeçalho nos Cadastros:** em qualquer aba de **Cadastros**, clique no nome de uma coluna (Código, Nome, CNPJ, Situação...) para ordenar; clique de novo para inverter. As colunas sem ordem mostram uma seta dupla apagada, e a ordenada mostra a seta para cima (A a Z) ou para baixo (Z a A). Em **Centros de custo**, os sub-centros continuam embaixo do principal dele, na ordem escolhida.
28. **Ajustes da revisão de 11/11/2026:** (a) em **Contas a pagar → Filtros → Situação**, escolher **Cancelada** ou **Substituída** lista essas contas (antes vinha vazio); (b) em **Repetir**, simule, mude o valor ou o vencimento e a tabela some com o aviso para simular de novo; ao voltar ao valor simulado ela volta; (c) o mesmo **ID de transação** com espaço ou em minúscula é recusado como repetido, e uma baixa por comprovante não paga um Pix já baixado à mão; (d) **Reclassificar** em lote não aceita conta de receita; (e) o histórico e o aviso mostram **data e hora** de São Paulo; (f) **Cancelar a série** mostra até quantas contas serão alcançadas; (g) na **Cadastros**, excluir o último item de uma página volta para a página anterior; (h) a **baixa, o recebimento e a edição de centro de custo** funcionam no Postgres (a trava de linha dava erro nas contas com série e nos centros com superior).
29. **Cliente em etapas:** em **Cadastros → Clientes → Novo cliente**, o cadastro tem três etapas no alto: **Principal** (CNPJ, apelido, nome, IE, contato, três telefones com DDD, e-mail principal e alternativo, observações), **Endereço** (opcional) e **Documentos** (opcional). **Avançar** vai para a próxima etapa; **Cadastrar e fechar** salva sem preencher o resto; **Salvar e anexar documentos** salva o cliente e abre a etapa de documentos, onde você anexa, baixa, renomeia e tira arquivos. Na edição, as mesmas etapas mostram o que já foi guardado. Cliente com documento não é excluído (inative). RG e CPF não são guardados.
30. **Relatório do projeto (piloto com o Connect):** (a) em **Cadastros → Projetos**, **Atualizar do Connect** traz os projetos de lá (cada um vira projeto de Contas a pagar, com o código do Connect); (b) lance contas para o projeto em **Contas a pagar** (uma conta pode ser dividida entre projetos) e anexe os documentos; (c) em **Relatórios → Relatório do projeto**, a lista mostra o lançado, o pago e o a pagar de cada projeto; (d) **Abrir relatório** mostra os cartões, só a parte do projeto em cada conta, as provisões à parte e os documentos de todos os lançamentos, que baixam dali; (e) o **código do projeto** (PRJ-1804) na lista de Contas a pagar abre o relatório, e **Pagar em Contas a pagar** volta para a lista filtrada pelo projeto. O orçamento e o saldo ficam em "—" até o Financeiro ler o orçamento do Connect.
31. **Passeio de introdução:** na **primeira visita ao Início** (de cada navegador), o sistema abre sozinho um passeio de 8 passos que destaca o menu, o Início, o Financeiro, os Relatórios, os Cadastros e o sino de avisos. Use **Próximo** e **Voltar**; **Concluir** ou o **×** fecham, e o passeio não abre mais sozinho. Para rever, clique em **Conhecer o sistema**, no rodapé do menu (funciona também com o menu recolhido). **Passeio de cada tela (13/11/2026):** nas telas **Contas a pagar**, **Contas a receber**, **Conferência bancária**, **Divergências**, **Cadastros**, **Relatório do projeto** e **Incentivos**, o mesmo botão abre o passeio daquela tela: o cabeçalho, os cartões de resumo, a barra de período e filtros, a busca e a lista, cada um com o que faz. O passo cujo bloco não está na tela (lista vazia, por exemplo) é pulado. O passeio de tela só abre pelo botão, nunca sozinho, e não mexe no "já visto" do passeio geral. No Início, o botão continua abrindo o passeio geral.
32. **Botão no protótipo (versão de teste no mesmo site):** no protótipo do Netlify, abaixo de **Restaurar dados de exemplo**, o botão **Abrir para teste de produção** abre `teste/` no mesmo site, em outra aba. Enquanto a versão real em teste não estiver publicada ali, aparece uma página de aviso com o botão **Voltar ao protótipo**. No outro sentido, o Financeiro real publicado como teste mostra no topo a faixa **Ambiente de teste com dados fictícios. Não digite dado real.**, com o link **Voltar ao protótipo** (só com `NEXT_PUBLIC_TEST_ENV=1`). O que falta para publicar: [publicar a versão de teste](../operations/publicar-a-versao-de-teste.md) (Q41).

33. **Campo de valor com máscara (16/11/2026):** em qualquer campo de digitar valor (valor principal, valor pago, juros, desconto, valor de cada projeto, de cada parcela e de cada acréscimo, saldo da conta bancária), digite só os números: `123456` mostra `1.234,56`, e `26000` mostra `260,00`. **Atenção: digitar `260` mostra `2,60`.** Apague com a tecla Backspace (tira o último centavo, e apagando tudo o campo esvazia). Ao entrar num campo já preenchido, o valor fica selecionado e o primeiro número digitado o troca. Cole `1.234,56`, `1500.50` ou `R$ 1.234,56`: o valor copiado é mantido. O saldo da conta bancária aceita o sinal `-` na frente. Passou de 12 números, a tecla é ignorada.
34. **Unidade e empresa no lançamento (16/11/2026):** em **Nova conta a pagar**, **não há campo Empresa**: escolha a **Unidade** (obrigatória, com busca, e cada unidade vem com a empresa ao lado, por exemplo "Consumo SP · PPlus"). Nos detalhes da conta, **Empresa** e **Unidade** mostram a empresa da unidade e a unidade. Sem unidade, a mensagem de campos obrigatórios cita "Unidade" e nunca "Empresa" nem "Projeto" (o projeto continua opcional). Em **Nova conta a receber**, ao contrário, o campo **Empresa** continua e a **Unidade** não tem asterisco: já vem em "Sem unidade", e o título entra sem ela (nos detalhes aparece "—"). Uma unidade que não é da empresa do título continua recusada.
35. **Importar o relatório do sistema antigo (16/11/2026):** em **Contas a pagar → Importar planilha**, escolha o Tipo **Relatório do sistema antigo** (em teste, só com arquivo fictício: o relatório real fica na máquina de quem importa e nunca vai para o repositório). (a) Marque a **Forma de pagamento** (o relatório não traz) e, se quiser, os padrões de **Unidade, Centro de custo, Plano de contas, Projeto** e **Conta bancária**, que valem para o que o relatório não diz ou diz com um nome que não existe nos cadastros. (b) Escolha o arquivo, que pode ser o `.xls` que o sistema antigo exporta ou o relatório salvo como `.xlsx` ou `.csv`, e clique em **Ler relatório**. (c) A prévia **não grava nada**: mostra as linhas lidas, quantas entram, quantas são pagas (entram com a baixa) e quantas ficam a pagar, o motivo de cada linha que fica de fora e o que o sistema decidiu sozinho em cada uma (fornecedor só com o nome, projeto em branco, padrão usado, **CPF retirado** da descrição). (d) **Importar N contas** cria uma conta por linha com a origem **Importado de relatório**: aparece a etiqueta na lista, a aba/grupo "Importados de relatório" e, nas pagas, a baixa com a data, o valor e a conta bancária do relatório. A linha digitável do boleto, quando vem na descrição, vai para o código de barras da conta. (e) Enviar **o mesmo relatório de novo não cria nada** ("Já importada antes"), e um relatório mais novo só cria o que faltava. Teste automático: `backend/tests/test_report_import.py` e `frontend/e2e/importar-relatorio.spec.ts`. Perguntas abertas com a Vivi e o DPO: Q49.
36. **Menu lateral e título da tela (16/11/2026):** (a) em qualquer tela do menu, a **página em que você está** fica em **azul cheio** no menu lateral e a **seção dela** (Financeiro, Relatórios ou Cadastros) fica com o **fundo azul claro**, com o grupo aberto ou recolhido; passar o mouse por cima de outro item só clareia, não marca. Isso vale também na versão de demonstração (antes, lá, nenhuma página ficava marcada). (b) O **título da tela** diz a seção e a página: **Financeiro - Contas a pagar**, **Financeiro - Contas a receber**, **Financeiro - Conferência bancária**, **Financeiro - Divergências**, **Relatórios - Relatório do projeto**, **Relatórios - Incentivos** e, em Cadastros, o nome da lista que você abriu: **Cadastros - Fornecedores**, **Cadastros - Plano de contas**, **Cadastros - Feriados** etc. O Início e o relatório de um projeto aberto mantêm o título que já tinham. Teste automático: `frontend/e2e/menu-e-titulos.spec.ts`, `frontend/e2e-demo/demonstracao.spec.ts` e `frontend/src/lib/nav.test.ts`.
37. **Dois acessos e solicitações na demonstração (16/11/2026):** (a) a tela de entrada da demonstração não tem mais Google nem Microsoft e tem duas abas: **Financeiro** (o das meninas, já preenchido) e **Desenvolvimento** (pede a chave). (b) No acesso Financeiro, clique em **Enviar solicitação** (no menu, acima de Conhecer o sistema): sem preencher, o modal pede Tipo, Descrição e Imagem; escolha **Correção de bug**, **Correção de regra** ou **Melhoria**, escreva a descrição, anexe um print (ou cole com Ctrl + V) e envie. Esse acesso não tem a tela Solicitações. (c) Saia, vá na aba **Desenvolvimento**: a chave errada mostra "Chave errada."; a certa entra, e no menu aparece **Solicitações**, com o pedido, a tela de onde veio, quem enviou e **Ver imagem**. Para funcionar no Netlify, publique com `scripts/deploy-demo.mjs` e crie a variável `SOLICITACOES_CHAVE` no site ([como publicar](../operations/publicar-a-versao-de-teste.md)). Só dados de exemplo nos prints. Teste automático: `frontend/netlify/solicitacoes.test.ts`, `frontend/src/lib/feedback.test.ts`, `frontend/e2e-demo/demonstracao.spec.ts`, `backend/tests/test_demo_runtime.py` e `test_seed_demonstracao.py`.

Para **importar planilha**, use um arquivo fictício, nunca uma planilha real em ambiente de teste. Em **Contas a pagar → Importar planilha**:

1. Escolha **Incentivos**, o PRJ-1804, os cadastros e um arquivo com as colunas `Nome`, `Valor` e `Data da pesquisa`, em .xlsx ou .csv.
2. **Ler planilha** mostra o cronograma: um lançamento por data de pagamento, 10 dias úteis depois da pesquisa, pulando feriados. Linha com `R$` no valor fica de fora e diz o motivo.
3. Com o PRJ-1790, que não tem prazo, a tela avisa e não deixa criar, a não ser que a planilha traga a coluna `Data de pagamento`.
4. **Copiar cronograma para o projeto** gera o texto para o e-mail. **Criar** abre os lançamentos na aba **Planilhas e agrupados**, com as pessoas na seta da linha.
5. Na seta de um lançamento importado, cada pessoa mostra a **data da pesquisa** (incentivos), o número e a emissão da **nota**, o **bruto e o INSS** (RPA) e o **pagamento**: "A pagar" até a baixa do lançamento, e "Paga em dd/mm" depois dela.
6. Em **Folha de campo**, use `Nome`, `Documento`, `Valor`, `Número da NF` e `Emissão`: RPA de R$ 1.000,00 entra como R$ 890,00, e NF sem número fica como pendente.
7. **Uma planilha, vários projetos, empresas e centros de custo:** acrescente colunas com o nome cadastrado: `Projeto` (código, `1804` ou `PRJ-1804`), `Empresa`, `Unidade`, `Centro de custo`, `Categoria` e `Forma de pagamento`. Deixe os campos da tela em "Todos ... da planilha" e a conferência mostra um lançamento por combinação e data de pagamento, com a classificação de cada um e o prazo do projeto. Marque só alguns e as linhas dos outros aparecem como "Fora da seleção", sem virar erro. Nome que não existe, cadastro inativo ou projeto fechado fica de fora e diz o motivo. Campo sem coluna na planilha: marque um só na tela.

Em **Cadastros**, no menu:

1. **Novo fornecedor**: apelido e nome são obrigatórios. Um CNPJ com dígito errado é recusado, e um CPF também, porque CPF não fica guardado. Teste com `11.222.333/0001-81`.
2. O mesmo CNPJ em outro fornecedor ativo é recusado.
3. Um cadastro com lançamento não mostra **Excluir**, só **Inativar**. Inativado, ele some da **Nova conta a pagar** e continua na lista de contas.
4. Em **Projetos**, marque o tipo, o incentivo e o prazo. Volte ao **Importar planilha**: o projeto passa a calcular o cronograma.

### Incentivos: agenda, dia útil e feriados

Com o sistema rodando, em **Cadastros → Feriados**:

1. **Buscar nacionais do ano** traz os feriados nacionais do ano escolhido (a BrasilAPI, ou os inventados no modo de teste). Buscar de novo avisa que já estavam cadastrados.
2. **Novo feriado** cadastra um local, por exemplo o aniversário da cidade (âmbito municipal, com UF e cidade). Campo vazio diz quais faltam, e o mesmo feriado de novo é recusado.
3. Em **Incentivos → Importar planilha**, use uma planilha fictícia com `Nome`, `Valor` e `Data de pagamento` numa **sexta-feira, sábado ou domingo** e outra num feriado cadastrado. **Ler planilha** avisa cada data que mudou e o motivo ("07/11 caiu em sábado; vai para 09/11"), e **Criar** abre os lançamentos já no próximo dia útil.
4. **Incentivos** (fora do menu desde 18/11, engavetada: só pelo endereço `/incentivos`; antes ficava no menu Relatórios, abaixo de Relatório do projeto; a lista aparece sozinha depois da importação): uma linha por lançamento, em ordem de vencimento, com **a data na frente do nome** (vermelha se já venceu e falta pagar), as pessoas e o que falta pagar. Os cartões **Vencidos**, **Vencem hoje**, **A vencer** e **Pagos** filtram a lista, e **Abrir** leva à conta no Contas a pagar, com as pessoas.
   Na seta de cada lançamento, o dropdown abre as **pessoas a pagar**: o resumo ("0 de 2 pagos · R$ 200,00 em aberto"), a busca por nome, as abas **Todos**, **Em aberto** e **Pagos** e a tabela com pessoa, **chave Pix mascarada** (a planilha precisa da coluna "Chave Pix"), data da pesquisa, **nota** ("Sem nota") e valor e situação. Embaixo do resumo, a tela diz **de onde o lançamento veio** ("Veio da planilha de incentivos." ou "Veio do Connect."). A chave completa nunca aparece.
   No topo do dropdown: **Baixar planilha** baixa um Excel de controle das pessoas (com a chave mascarada, total no fim e a situação de cada uma); **Enviar PDF de comprovantes** anexa um ou vários PDFs ao lançamento (outro tipo de arquivo é recusado, com o nome dele). O PDF aparece em "comprovante anexado", com **Baixar**, e ninguém passa a "pago": a baixa continua no Contas a pagar. Use só PDF e planilha fictícios.
5. Em **Contas a pagar → Nova conta → Repetir esta conta → Simular**, um vencimento que cai num feriado cadastrado vai para o próximo dia útil.
6. **Aviso na hora de lançar:** em **Nova conta a pagar** ou **Nova conta a receber**, digite num **Vencimento** que cai em sábado, domingo ou feriado. Embaixo do campo aparece "é sábado" (ou "é feriado nacional", ou o nome do feriado cadastrado) e os botões **Antecipar para** (dia útil anterior), **Postergar para** (próximo dia útil) e **Manter**. Clicar troca a data do campo. O mesmo vale na edição (só se a data mudou) e no vencimento da folha de campo, na importação.

### Conferência bancária: conta e extrato (PF-69)

Com o sistema rodando. Use só um extrato **fictício** (nome e valores inventados): extrato real nunca vai para o repositório nem para o chat.

1. Em **Cadastros → Contas bancárias → Nova conta bancária**, escolha a empresa e veja o **Banco** já preenchido com Itaú. Preencha **Agência**, **Conta**, **Tipo** e **Saldo inicial**. Agência com letras é recusada, e saldo sem **Data do saldo** também. A lista mostra "Itaú · ag. 1234 · conta 12345-6 · Conta corrente" embaixo do nome.
2. Em **Financeiro → Conferência bancária**, escolha a conta e clique em **Importar extrato**. Envie um **OFX** (ou um CSV com as colunas data, lançamento e valor). Um arquivo que não é extrato mostra "Não foi possível ler o extrato — envie OFX ou CSV do banco", e outro tipo de arquivo é recusado antes de enviar.
3. A **prévia** mostra as linhas novas, as que já estavam, o período, as entradas e saídas novas e as primeiras linhas, e **nada é gravado** até o botão **Importar N linhas novas**. Se o arquivo parece ser de outra conta, aparece um aviso.
4. Importe **o mesmo arquivo de novo**: a prévia avisa que ele já foi importado e o botão vira **Nada novo para importar**. Importe um **outro extrato que se sobrepõe**: só as linhas novas entram.
5. A lista mostra as linhas da mais nova para a mais antiga, com **De** e **Até** para filtrar (os totais de entradas e saídas acompanham), e **Extratos importados** diz quem importou o quê. A conta com extrato não se exclui, só se inativa.
6. Ainda **não concilia**: ligar cada linha a uma conta a pagar, classificar e fechar o mês são as próximas etapas (PF-70 a PF-72). O layout real do CSV do Itaú e o prazo de guarda do extrato dependem da Q44.

### Conferência bancária: conciliar o extrato (PF-70, fatia 1)

Com o extrato importado (seção anterior) e pelo menos uma conta a pagar **com baixa** na mesma conta bancária e de valor igual a uma linha do extrato. Só dados fictícios.

1. Em **Financeiro → Conferência bancária**, cada linha tem uma **Situação** (Pendente, Conciliada ou Exceção) e as abas **Todas**, **Pendentes**, **Conciliadas** e **Exceções** mostram as contagens e filtram a lista.
2. **Conciliar** numa linha abre a conciliação: à esquerda a linha, à direita os **lançamentos sugeridos** (com baixa na mesma conta, valor igual e até 3 dias de diferença), cada um dizendo por que foi sugerido ("valor igual · 1 dia(s) de diferença · nome na descrição"). Escolha um, confira a **Classificação** e clique em **Conciliar**. **Pagamento com NF** pede o número e a emissão da nota. Lançamento com pessoas (incentivo, folha) pede a pessoa, e o valor da linha tem de ser o dela.
3. Sem lançamento que sirva, a mesma janela diz o que fazer ("Dê a baixa no Contas a pagar ou marque a linha como exceção"). Na aba **Marcar exceção**, escreva o **motivo** e escolha a **classificação** (os dois obrigatórios): a linha vira **Exceção** e conta como conciliada.
4. **Desfazer** (na linha conciliada ou na exceção) pede o **motivo**, devolve a linha a **Pendente** e fica no histórico, com quem desfez.
5. As linhas de um lançamento nunca passam do valor dele, e uma pessoa só casa com uma linha: a tela mostra a mensagem do servidor ("As linhas somam R$ X, mas o lançamento é de R$ Y").
6. **Ainda não faz:** dar a baixa a partir da linha, criar o lançamento (tarifa, rendimento) e tratar o Pix devolvido como volta. A Q45 pergunta à Vivi se isso muda a regra de só conciliar com lançamento que já tem baixa.

### Conferência bancária: extrato × sistema, saldo do mês e fechamento (PF-71 e PF-72)

Em **Financeiro → Conferência bancária**, as abas **Extrato × sistema**, **Saldo do mês** e **Fechamento** têm o seletor de mês (anterior e próximo). Com um extrato importado e algumas linhas conciliadas (seções anteriores). Só dados fictícios.

1. **Extrato × sistema:** escolha a conta e o mês. Os três números no alto são as **saídas do extrato**, as **baixas no sistema** e a **diferença** (verde se bate). A tabela **Por dia** destaca os dias com diferença, e **O que explica a diferença** lista as **saídas do extrato sem par** (cada uma diz se está pendente ou é exceção), as **baixas sem linha no extrato** e as **voltas** (Pix devolvido). Um Pix devolvido em um mês e pago de novo no seguinte aparece como volta no primeiro, e o segundo mês bate.
2. **Saldo do mês:** uma linha por conta e o **Consolidado**: saldo inicial, entradas, saídas, saldo final pelo extrato, saldo pelo sistema (só as linhas já conferidas) e o que falta **conferir**. O saldo inicial é o cadastrado na conta (com a data dele), e cada mês começa onde o anterior terminou.
3. **Fechamento:** um cartão por empresa. Ele diz o que falta (extrato não importado, linhas sem conferir, linhas sem classificação), e **Fechar {mês}** só liga quando tudo está resolvido. **Planilha da contabilidade** baixa o Excel do mês a qualquer hora (uma linha por transação, com classificação, NF, lançamento e situação).
4. Depois de **Fechar**, ninguém dá baixa, estorna, recebe nem lança com data daquele mês: a tela mostra "O período de {mês} está fechado. Só um administrador pode reabrir". Desfazer a conciliação de uma linha do mês também é recusado.
5. **Reabrir (administrador)** pede o motivo. Quem não é administrador não vê o botão, e a API recusa (403). **Meses fechados** lista o que está fechado.
6. A **exceção** agora exige a classificação, porque sem ela o mês não fecha. O que a trava ainda **não** cobre (editar ou cancelar lançamento existente, anexar documento) está na Q46.

### Integração com o Connect de dev (cliente e roteiro de teste)

Não tem tela. É o cliente das rotas do Connect (baixa, consulta e cancelamento de baixa, chave completa, casamento de chave, feed de eventos) e o comando que o confere contra o **dev**. Detalhes em [testar-com-o-connect-dev](../operations/testar-com-o-connect-dev.md).

1. Sem o Connect: `pytest tests/test_connect_http.py tests/test_connect_check.py tests/test_connect_dev_script.py` (em `backend/`) roda o cliente e o roteiro contra um Connect de mentira que segue o guia do João.
2. Com o Connect de dev: o João cria a conta `financeiro-dev`; o segredo vai para `backend/.env.connect` (nunca para o chat ou o git); de `backend/`, `python scripts/connect_dev_check.py`. O comando recusa qualquer endereço que não seja o do dev, e cada passo sai como `OK`, `FALHOU` ou `PULADO`.
3. O que o Financeiro ainda não faz: receber o webhook, ler orçamento e situação fiscal pelo Connect e usar essas chamadas nas telas.

### Demonstração: as telas reais no site do protótipo

O botão **Abrir para teste de produção** do protótipo abre `teste/`, onde fica o **Financeiro real com dados fictícios**: as mesmas telas e regras do repositório, com o backend (Python) rodando dentro do navegador, sem servidor ([ADR 0017](../architecture/adr/0017-demonstracao-com-o-backend-no-navegador.md)). O teste real com o Connect continua só na máquina do Bruno.

1. Gerar e ver na máquina (em `frontend/`): `DEMO_DIST_DIR=.next-demo node scripts/build-demo.mjs` e `node scripts/serve-demo.mjs .next-demo 3020`; abrir <http://localhost:3020/teste/>. Detalhes em [publicar a versão de teste](../operations/publicar-a-versao-de-teste.md).
2. Na tela de entrada o login fictício já vem preenchido: clique em **Entrar** e abre o Início, com contas vencidas, vencendo hoje, fluxo previsto e agenda de incentivos.
3. Navegue pelo menu (o que você fizer fica guardado no navegador e sobrevive ao F5): em **Contas a pagar**, dê baixa no lançamento de incentivos e veja **Pagos** subir; na **Conferência bancária**, veja o extrato conciliado e o Fechamento do mês.
4. Recarregue a página (F5): a sessão e o que você fez continuam. **Restaurar dados de exemplo** (menu, com confirmação) apaga tudo e recomeça.
5. Os testes: `DEMO_DIST_DIR=.next-demo npx playwright test -c playwright.demo.config.ts` (9 testes), e `pytest tests/test_seed_demonstracao.py tests/test_demo_runtime.py tests/test_security.py` em `backend/`.
6. Para publicar: o site do Netlify precisa estar ligado ao repositório (o `netlify.toml` gera o `teste/`), e o João precisa responder a **Q47** (o código Python do backend fica baixável no site).

Troca do `passlib` pelo `bcrypt` direto (`backend/core/security.py`): mesmo hash, as senhas já gravadas continuam valendo.

### Comprovantes e baixa (PF-56)

Com o sistema rodando e as contas fictícias carregadas. Para testar sem o Connect, ponha `CONNECT_MODE=simulated` no `backend/.env` (só fora de produção) e reinicie a API:

1. Em **Contas a pagar**, a linha "Do Connect" (4 entrevistadores) tem o botão **Enviar comprovantes**; as outras contas não têm.
2. No diálogo, escolha o projeto e o PDF de comprovantes do banco (Comprovante de Transferência). Sem projeto ou sem arquivo, nada é enviado.
3. O PDF sobe em partes, com a barra de progresso, e a conferência abre em abas: **Batem**, **Divergentes**, **Fora do projeto**, **Chave não cadastrada**, **Erros** e **Descartados**.
4. A chave aparece mascarada (`mar***@exemplo.com`) e nunca inteira. O nome lido do comprovante só aparece para chave que ninguém tem.
5. Descarte um comprovante e restaure: ele sai e volta da conferência.
6. Escolha a conta e a forma de pagamento (Pix já vem escolhida). Quem tem autenticador digita o código. Código errado: "Código de verificação inválido", e nada é pago.
7. **Confirmar baixa**: o resumo mostra os Pix pagos, cada linha vira "Baixa aplicada", e o lançamento passa a mostrar o saldo menor.
8. Envie o mesmo PDF de novo: os Pix já pagos caem em **Erros** e nada é pago outra vez.
9. Com o Connect fora do ar na hora de confirmar, a baixa fica "Aguardando o Connect". Ela é reenviada sozinha se `PAYMENT_DISPATCH_SECONDS` estiver ligado, ou com `python scripts/dispatch_payments.py` (em `backend/`), sem pagar duas vezes.
10. No lançamento do Connect, abra a lista de pessoas: quem foi paga mostra "Paga em dd/mm/aaaa"; as outras seguem a pagar.
11. O **sino** ao lado do seu nome mostra os avisos (comprovante de pessoa fora do projeto, baixa recusada). Clicar leva para a tela certa e marca como lido.
12. **Financeiro > Divergências** lista as baixas que o Connect recusou, com o motivo.

A baixa real depende das entregas 1 e 2 do Connect ([entregas-do-connect](../specs/entregas-do-connect.md)).

### Contas a receber (fatia 1)

Com o sistema rodando. Em **Financeiro > Contas a receber**:

1. Em **Cadastros > Plano de contas**, crie uma conta do tipo **Receita**; em **Cadastros > Clientes**, um cliente com CNPJ.
2. **Nova conta a receber:** cliente, projeto (opcional: nem toda receita tem projeto), conta de receita, empresa, unidade, centro de custo, valor principal e, pelos botões **Acréscimos**, **Descontos** e **Impostos**, o que soma ou tira dele (uma linha por lançamento). O líquido aparece enquanto você digita. Sem projeto, o título entra e a lista mostra "Sem projeto". Com campo obrigatório vazio, a mensagem diz quais faltam.
3. Os seis cards (Total, Recebidos, Pendentes, Vencidos, Hoje e A vencer) abrem a lista já filtrada, com a mesma contagem e o mesmo total. O período e os **Filtros** (cliente, projeto, conta, empresa, unidade, centro de custo, situação e "período por") funcionam como no Contas a pagar, inclusive com mais de uma opção por filtro (a situação "Cancelada" não combina com as outras).
4. **Registrar recebimento** (botão da linha): data, valor, conta e forma. Menos que o saldo é recebimento parcial; mais que o saldo é recusado.
5. **Ver detalhes:** resumo, recebimentos (com **Estornar**, que pede o motivo) e histórico. Dá para alterar, cancelar (sem recebimento) e excluir.
6. **Inadimplência:** vencidos por cliente, com os dias de atraso e o total, e botão para abrir cada título. No alto, o saldo por **faixa de atraso** (1 a 30, 31 a 60, 61 a 90 e mais de 90 dias), e cada título diz em que faixa está.
7. **Parcelar a receita:** em **Nova conta a receber**, marque **Repetir esta conta**, escolha "Parcelado" e a quantidade, e clique em **Simular**. Ajuste valor e data de cada parcela na tabela (a soma tem de fechar com o título) e lance. Cada parcela aparece com o número na série (`1/3`).
8. O botão de série da linha altera "só este", "este e os seguintes" ou "todos em aberto" (valor ou descrição) ou cancela a série; quem já recebeu não muda.
9. **Exportar** oferece **Excel (.xlsx)** e **CSV** do que está na tela, com os filtros e a busca na primeira linha.

### Repetir uma conta (PF-57)

Em **Contas a pagar**, com o sistema rodando:

1. **Nova conta a pagar**, preencha como sempre e marque **Repetir esta conta**. Escolha "Todo mês", "Toda semana" ou "Parcelado" e quantas vezes (com a primeira).
2. Sem clicar em **Simular**, o botão de lançar avisa que falta conferir as ocorrências.
3. **Simular** mostra a tabela. Dia que não existe no mês vira o último dia, e fim de semana ou feriado vai para o próximo dia útil. Mude uma data ou um valor na própria tabela, se precisar.
4. **Lançar conta** cria todas de uma vez. Cada linha ganha a marca da série (por exemplo `2/3`).
5. No botão de série da linha, **Alterar**: "só esta", "esta e as seguintes" ou "todas em aberto", com novo valor ou descrição. Uma conta de luz estimada em R$ 150 pode ter só a de outubro trocada por R$ 163,40.
6. **Cancelar as contas da série** pede o motivo. O que já foi pago continua como está.
7. Em "Parcelado", o valor é dividido (a diferença de centavos vai na última parcela) e o rateio entre projetos acompanha.

### Login com MFA, Google e Microsoft

Com o sistema rodando ([README](../../README.md#como-rodar)):

1. Abra `http://localhost:3010/`: sem sessão, cai em `/login`.
2. Entre com a senha errada: "E-mail ou senha incorretos", igual para e-mail sem conta.
3. Entre com a senha certa pela primeira vez: pede o cadastro do segundo fator. Abrir `/` em outra aba ainda cai em `/login`.
4. Leia o QR code com um app autenticador e digite o código: aparecem os 10 códigos de recuperação. Só depois de **Já guardei, continuar** a tela inicial abre.
5. Recarregue a página e abra outra aba: continua logado nas duas, sem pedir código.
6. Clique em **Sair** e abra `/`: volta para `/login`.
7. Entre de novo: agora pede só o código do app. Repetir o mesmo código não entra.
8. Saia e entre com **Usar um código de recuperação**: entra, e o mesmo código não vale uma segunda vez.
9. Erre a senha 6 vezes em um minuto: "Muitas tentativas — aguarde alguns minutos".
10. A tela de entrada tem só e-mail e senha (os botões do Google e da Microsoft saíram em 17/11/2026). Sem as chaves do provedor, o endereço do backend `/auth/sso/google/start` (ou `microsoft`) volta para o login avisando que ainda não está disponível.
11. Com as chaves no `backend/.env` e a conta criada com o mesmo e-mail: o botão leva ao provedor e volta para a tela inicial, sem código no Financeiro. E-mail sem conta volta para o login com o aviso de falta de acesso.
