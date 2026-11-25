# 24/11/2026 · Cadastros iguais aos do sistema antigo

Pedido do Bruno, na conversa com o agente, enquanto populava o banco local com os .csv que o sistema antigo (SGE4B) exporta. Fala bruta, sem edição.

## O que o Bruno escreveu

> Certo agora eu quero fazer o seguinte, eu quero popular os cadastros, eu consigo exportar um csv do sistema deles com os cadastros, e eu quero popular o meu banco local

> Eu quero fazer gradual, vamos por modolus acabaei de colocar o de empresas na pasta

> Coloquei um de unidades agora

> Eu preciso que o cadastro na noss aplataforma seja identico ao do csv

> E não deixe o Pesquise Mais, deixe sempre Pesquise+

(com o print da lista de Unidades do Financeiro mostrando "0004 · Pesquise Mais")

> Preciso que a vizualização nos cadastros seja igual aa aqui também

(com o print da lista de unidades do sistema antigo: colunas **Empresa | Unidade | Código | Infos | Ações**, a linha "Pesquise+ · Administrativo · 001 · #Ativo · editar")

> Saão apenas 24 unidades

> Coloquei o de centro de custs agora

> Agora coloquei a de clientes na pasta

> Faça essa separação no e-mail ou no fone

(com o print da lista de clientes do sistema antigo: colunas **Codigo | Apelido | Nome | Fones | Emails | Infos | Ações**, cada telefone numa linha)

> Agora eu coloquei o de fornecedores

> E assim que está exibidos ?

(com o print da lista de fornecedores do sistema antigo: **Codigo | Apelido | Nome | Fones | Emails | Documentos | Infos | Ações**, com "PJ" e o CNPJ em Documentos)

> Coloquei o PlanoDeContas agora

Nas perguntas do agente, escolheu: **criar os grupos** do plano (como no sistema antigo, com o código único dentro do grupo); a conta com o **nome repetido** no mesmo grupo recebe as contas do relatório pela de **código menor**; e o **tipo** vem do grupo (010 e 020 são receita; os outros, despesa).

> No sistema antigo tem um destaque para os planos supreiores  de código 010 por exemplo

(com o print da lista do plano de contas do sistema antigo: **Tipo | Plano de Contas | Codigo | Linha do DRE | Infos | Ações**, o grupo "Receitas Líquida Operacional" 010 numa linha escura e a conta "Vendas - Analises de Dados" 010.001 embaixo, recuada)

> Agora eu coloquei os projetos na pasta eu precciso que obrigatoriamente els já vão com os CC e as unidades preenchidas

Nas perguntas do agente, escolheu: o **mesmo número de projeto em empresas diferentes** (o código único só dentro da empresa); "CARPE DIEM" **troca o espaço por _**; e **guardar as Observações** do projeto.

> T[a porque no relatorio que eu estou vendo diz que tem 2080 projetos masi foram s[o importados esses

(o arquivo exportado trazia só 644 projetos)

> Agora chat eu coloquei uma planilha de dados a receber DADOSARECEBER_20261124_223237 faça a mesma coisa que o de dados a pagar

> A parte de projetos tem que ficar igual ao do sistema antigo também

(com os prints da lista de projetos do sistema antigo: **Código | Projeto | Cliente | Empresa | Unidade | C.Custo | Infos | Ações**, agrupada por empresa e unidade, com a faixa "Pesquise+ Administrativo" e "Pesquise+ Agro")

> Agora adicionei o de contas bancarias

(com o print da lista de contas bancárias do sistema antigo: **Empresa | Código | Nome | Tipo | Banco | Agência | Conta | Infos | Ações**)

> Essas partes de conferencia bancaria ainda deixe em "Em breve"

Nas perguntas do agente, escolheu: as contas 1 a 6 na Pesquise+ e 7, 20, 21 e 22 na IHEA; os **tipos iguais aos do sistema antigo** (CC, CI, Interna, Crédito); e **guardar** "Impacta fluxo de caixa".

Sobre os pontos em aberto que o agente levantou, respondeu:

- o segundo "Health Full Service" (005.012, mesmo nome do 005.007 no mesmo superior) entrar como "Health Full Service (005.012)": "Pode sim";
- os projetos "xxx" e "XXX": "Deixe os dois e mantenham do jeito que estão";
- as 27 unidades do arquivo (ele tinha dito 24): "mantenha do jeito que está no CSV";
- os 4 fornecedores com o CNPJ de outro, que ficaram de fora: "Tudo certo";
- o "Empréstimo Bancário", que o relatório cria como SGE-001: "mantenha como est[a no CSV".

E pediu o banco no servidor e a atualização automática:

> E sobre isso aqui , eu quero gerar um dump do banco local da minha maquina para eu mandar para o joáo para ele subir no servidor, entáo crie um script para eler esse dump e subir os dados, depois disso ele salva tudo apenas numma pasta local no servidor os backups do banco em uma pasta que náo vai para o git, e eu quero fazer uma rotina com crom que atualiza o projeto no caso na branch de developmente todo dia no final do dia

Nas perguntas do agente:

> Quero o dump do banco inteiro de tudo que subimos para o nosso local leve senhas de usuusairo s e usuarios cadastrados e tudo mais

e a atualização **às 22h, todo dia**. Como ficou: [ADR 0026](../architecture/adr/0026-banco-local-no-servidor-e-atualizacao-as-22h.md) e [DEPLOY.md](../../DEPLOY.md), seções 7 e 8.

## As escolhas dele, nas perguntas do agente

- **Código:** o código antigo vai num **campo à parte**. O código gerado pelo Financeiro (0001...) continua, como o João decidiu em 09/11.
- **Colunas:** guardar todas. A unidade ganha apelido, CNPJ e IE, e a empresa ganha a IE. O CNPJ "0" ou zerado entra vazio.
- **Coluna Código da lista de Unidades:** mostra o código **do sistema antigo** (001, UN1, IHEA...). Unidade sem código antigo mostra o gerado. O gerado aparece na janela de editar.
- **Ordem dos módulos:** um por vez (empresas, depois unidades, depois os próximos), sempre antes do relatório "Lançamentos a Pagar".

## Como ficou

Spec [cadastros-e-dimensoes](../specs/cadastros-e-dimensoes.md) (Ajustes de 24/11) e script `backend/scripts/importar_cadastros.py`.
