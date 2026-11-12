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

## Como testar

Cada módulo, ao ser entregue, ganha aqui o roteiro manual de teste (como no roadmap do Connect).

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
31. **Passeio de introdução:** na **primeira visita ao Início** (de cada navegador), o sistema abre sozinho um passeio de 8 passos que destaca o menu, o Início, o Financeiro, os Relatórios, os Cadastros e o sino de avisos. Use **Próximo** e **Voltar**; **Concluir** ou o **×** fecham, e o passeio não abre mais sozinho. Para rever, clique em **Conhecer o sistema**, no rodapé do menu (funciona também com o menu recolhido).
32. **Botão no protótipo (versão de teste no mesmo site):** no protótipo do Netlify, abaixo de **Restaurar dados de exemplo**, o botão **Abrir para teste de produção** abre `teste/` no mesmo site, em outra aba. Enquanto a versão real em teste não estiver publicada ali, aparece uma página de aviso com o botão **Voltar ao protótipo**. No outro sentido, o Financeiro real publicado como teste mostra no topo a faixa **Ambiente de teste com dados fictícios. Não digite dado real.**, com o link **Voltar ao protótipo** (só com `NEXT_PUBLIC_TEST_ENV=1`). O que falta para publicar: [publicar a versão de teste](../operations/publicar-a-versao-de-teste.md) (Q41).

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
4. Em **Projetos (Connect)**, marque o tipo, o incentivo e o prazo. Volte ao **Importar planilha**: o projeto passa a calcular o cronograma.

### Incentivos: agenda, dia útil e feriados

Com o sistema rodando, em **Cadastros → Feriados**:

1. **Buscar nacionais do ano** traz os feriados nacionais do ano escolhido (a BrasilAPI, ou os inventados no modo de teste). Buscar de novo avisa que já estavam cadastrados.
2. **Novo feriado** cadastra um local, por exemplo o aniversário da cidade (âmbito municipal, com UF e cidade). Campo vazio diz quais faltam, e o mesmo feriado de novo é recusado.
3. Em **Incentivos → Importar planilha**, use uma planilha fictícia com `Nome`, `Valor` e `Data de pagamento` numa **sexta-feira, sábado ou domingo** e outra num feriado cadastrado. **Ler planilha** avisa cada data que mudou e o motivo ("07/11 caiu em sábado; vai para 09/11"), e **Criar** abre os lançamentos já no próximo dia útil.
4. **Incentivos** (menu Relatórios, abaixo de Relatório do projeto; a lista aparece sozinha depois da importação): uma linha por lançamento, em ordem de vencimento, com **a data na frente do nome** (vermelha se já venceu e falta pagar), as pessoas e o que falta pagar. Os cartões **Vencidos**, **Vencem hoje**, **A vencer** e **Pagos** filtram a lista, e **Abrir** leva à conta no Contas a pagar, com as pessoas.
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
3. Sem lançamento que sirva, a mesma janela diz o que fazer ("Dê a baixa no Contas a pagar ou marque a linha como exceção"). Na aba **Marcar exceção**, escreva o **motivo** (obrigatório) e, se quiser, a classificação: a linha vira **Exceção** e conta como conciliada.
4. **Desfazer** (na linha conciliada ou na exceção) pede o **motivo**, devolve a linha a **Pendente** e fica no histórico, com quem desfez.
5. As linhas de um lançamento nunca passam do valor dele, e uma pessoa só casa com uma linha: a tela mostra a mensagem do servidor ("As linhas somam R$ X, mas o lançamento é de R$ Y").
6. **Ainda não faz:** dar a baixa a partir da linha, criar o lançamento (tarifa, rendimento) e tratar o Pix devolvido como volta. A Q45 pergunta à Vivi se isso muda a regra de só conciliar com lançamento que já tem baixa.

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
10. Sem as chaves do provedor, **Entrar com Google** e **Entrar com Microsoft** voltam para o login avisando que ainda não está disponível.
11. Com as chaves no `backend/.env` e a conta criada com o mesmo e-mail: o botão leva ao provedor e volta para a tela inicial, sem código no Financeiro. E-mail sem conta volta para o login com o aviso de falta de acesso.
