# Para o João: decisões e ajuda que o Financeiro precisa

**Posição em 06/11/2026.** Este documento junta, num lugar só, tudo o que está parado esperando uma decisão ou uma ajuda sua. Cada item diz o que o sistema faz hoje (vale se ninguém responder), a nossa proposta e o que a resposta destrava. Para responder, basta dizer o número e "aceito", "outra" ou "depois", por exemplo: "D1 aceito, D2 outra: ..., A3 faço segunda". As perguntas completas estão em [perguntas-abertas](perguntas-abertas.md).

O que foi construído até aqui e como testar está em [roadmap](roadmap.md) e [proximos-passos](proximos-passos.md).

## Resumo

| # | O que | Tipo | Destrava |
|---|---|---|---|
| D1 | Datas e responsáveis das entregas do Connect | Decisão do Connect | Pagar de verdade (baixa e planilha de pagamento) |
| D2 | Regra do bloqueio de login (PF-53) | Decisão de regra | Fechar a segurança do login |
| D3 | Reautenticar a baixa de quem entra por SSO (Q20) | Decisão de regra | MFA da confirmação |
| D4 | Substituto do MinIO e guarda de arquivos (Q18, Q19) | Decisão técnica e LGPD | Anexos nos lançamentos |
| D5 | Cancelar baixa (Q4) e segregação de funções (Q8) | Decisão de regra | Estorno de baixa de entrevistador |
| D6 | Chave Pix do respondente e CPF de fornecedor (Q22, Q23) | Decisão LGPD | Importar planilha com chave, fornecedor pessoa física |
| D7 | Plano de contas completo e linhas do DRE (F3) | Decisão com a Vivi e a direção | Relatórios e DRE |
| D8 | Onde se marca tipo de projeto, incentivo e prazo (F23, F25) | Decisão de produto | Importar planilha sem depender do Financeiro |
| A1 | Teste do login Microsoft e verificação em duas etapas (PF-50, PF-51) | Ajuda com acesso | Login em produção |
| A2 | Conta de serviço do Connect para ligar a leitura de verdade | Ajuda com acesso | Ver projetos e itens a pagar reais |
| A3 | Revisar as mudanças em `.github/` e autorizar o PR `homolog` → `main` | Ajuda com revisão | Subir a versão validada |
| A4 | Tirar o Claude da lista de contribuidores do GitHub | Ajuda com o repositório | Histórico do repositório |
| A5 | Avisar o time do Connect da versão nova do FastAPI | Ajuda com o Connect | Evitar surpresa ao copiar código |
| A6 | Migração do SGE4B: reunião das 11 bases e pedido ao fornecedor | Ajuda com terceiro | Migração |
| P1 | Prazo de guarda dos registros de login (Q26) | Levar ao DPO | Ligar a rotina de limpeza (já escrita) |
| P2 | Dados de RPA e notas de fornecedor (Q15, Q17, N3) | Levar ao DPO e à contabilidade | Notas e RPA |
| P3 | Itaú e captura de notas (N1, N2) | Pesquisa técnica | Pagar pelo banco, conferir notas |

## Decisões

### D1. Datas e responsáveis das entregas do Connect (PF-58, PF-6)

O time do Connect preenche **data** e **responsável** de cada entrega em [entregas-do-connect](../specs/entregas-do-connect.md). Sem as entregas 1 e 2, o Financeiro lê comprovantes e mostra contas, mas **não paga de verdade**.

| # | Entrega | Prioridade | O que trava sem ela |
|---|---|---|---|
| 1 | Dados de pagamento e busca por chave Pix (`payment-data`, `pix-key-matches`) | Caminho crítico | Planilha de pagamento ao banco; achar a pessoa pelo comprovante em produção (hoje responde 503) |
| 2 | Baixa (`POST /payments`) com chave de idempotência | Caminho crítico | "Confirmar baixa" de verdade (hoje só com o Connect simulado) |
| 3 e 4 | Eventos assinados e feed `GET /events` | Logo depois | Saber na hora o que mudou e conferir o dia |
| 5 | Modelo fiscal (NF ou RPA) e status da NF | Pode vir depois do primeiro pagamento | "NF pendente" e o líquido do RPA vindos do Connect |
| 6 | `FINANCE_EXTERNAL_ENABLED` | Antes de produção | Evitar o mesmo Pix baixado nos dois sistemas |
| 7 | Exemplos JSON em `contract/v1/` | Com a 1 | Testar o Financeiro contra o mesmo contrato |
| 8 | Cancelamento de baixa | Só depois da D5 | — |

### D2. Regra do bloqueio de login (PF-53)

- **Hoje:** `/auth/token` aceita 5 tentativas por minuto por IP e **10 falhas por hora por e-mail**. Com 10 falhas no mesmo e-mail, o sistema recusa até a senha certa.
- **O problema:** para travar a conta de alguém basta saber o e-mail, e o seu aparece na tela de login do Connect. Qualquer pessoa digita 10 senhas erradas e a conta fica travada, e pode repetir de hora em hora.
- **Proposta:** contar as falhas por **e-mail e rede juntos** (o IP já é guardado mascarado). Falhas vindas de outra rede deixam de travar a pessoa. Em troca, um ataque vindo de muitos IPs passa a ser limitado só pelas 5 tentativas por minuto de cada IP.
- **Muda** a regra 9 de [acesso-e-auditoria](../specs/acesso-e-auditoria.md), por isso não foi feito sem a sua decisão.
- **Opções:** (a) aceitar a proposta; (b) manter como está; (c) outra, por exemplo bloqueio progressivo.

### D3. A baixa pede reautenticação para quem entra por Google ou Microsoft? (Q20)

- **Hoje:** na confirmação de comprovantes, quem tem autenticador digita o código; quem entra por SSO sem autenticador confirma sem etapa extra. A baixa manual em Contas a pagar só exige a sessão.
- **Proposta:** pedir sempre a reautenticação antes de "Confirmar baixa" (é a ação que move dinheiro). Precisa decidir como o SSO se reautentica.
- **Destrava:** fechar a regra de MFA da confirmação antes de produção.

### D4. Onde guardar arquivos e se o PDF do comprovante fica guardado (Q18, Q19)

- **Q18:** o MinIO foi arquivado no GitHub e as imagens oficiais saíram do ar. **Hoje** o ambiente local usa o build da Chainguard fixo por digest ([ADR 0010](../architecture/adr/0010-minio-pelo-build-da-chainguard.md)), provisório. É preciso escolher o substituto antes de produção. **Desde 06/11/2026 o primeiro upload existe** (anexos das contas, via `boto3`, cifrado arquivo a arquivo; [ADR 0012](../architecture/adr/0012-anexos-das-contas-cifrados-por-arquivo.md)): trocar de produto é trocar variáveis, mas faltam o usuário do bucket restrito ao bucket, o antivírus e o backup da `FILES_MASTER_KEY` (perdê-la perde todos os arquivos).
- **Q19:** o kickoff de 03/11 pede o PDF anexado ao lançamento, mas as regras do projeto dizem que ele é lido e descartado. **Hoje** não guarda. **Proposta:** manter descartado até o DPO responder; se guardar, definir cofre e prazo (depende da Q18).
- **Já feito:** anexos no Contas a pagar. **Destrava:** anexos no Contas a receber (nota fiscal do título) e o prazo de guarda dos arquivos (Q5, F6, com o DPO).

### D5. Cancelar baixa e segregação de funções (Q4, Q8)

- **Q4:** cancelar baixa (estorno do banco, baixa errada) passa a existir para entrevistas? Com dupla aprovação? **Hoje** não existe. **Proposta:** manter fora até haver uso real; se vier, com dupla aprovação.
- **Q8:** quem envia o lote não confirma a baixa dele acima de qual valor? **Hoje** sem segregação. Precisa de um valor.
- **Destrava:** entrega 8 do Connect.

### D6. Chave Pix do respondente e CPF de fornecedor pessoa física (Q22, Q23)

- **Hoje:** a planilha de incentivos lê nome, valor, datas e, desde 12/11/2026 (provisório, pedido do Bruno), a chave Pix **só mascarada** (a completa não é guardada); fornecedor só com CNPJ.
- **Proposta:** manter assim até o DPO responder, sem guardar a chave completa.
- **Destrava:** importar planilha já com a chave, e cadastrar fornecedor pessoa física.

### D7. Plano de contas completo e linhas do DRE (F3)

- O sistema antigo tem o filtro **Linha do DRE**. Aqui o plano de contas ainda não tem essa ligação, e o Bruno decidiu deixar para o módulo de Relatórios (PF-76).
- **Precisa:** a **lista oficial das contas** (a proposta inicial tem cerca de 8 a 10 categorias de custo), a lista ordenada das **linhas do DRE** e a ligação de cada conta com uma linha. É a Vivi e a direção que definem, e o João decide quando levar.
- O plano de contas do sistema antigo é uma lista simples; a spec prevê contas **sintéticas** (que agrupam outras). Dizer se isso é necessário no começo.

### D8. Onde se marca tipo de projeto, "tem incentivo" e prazo (F23, F25)

- **Hoje:** o projeto vem do Connect, mas tipo, incentivo e prazo em dias úteis são marcados **no Financeiro**, na tela Projetos. Importar planilha cria **um lançamento por projeto, classificação e data de pagamento**.
- **Pergunta:** isso deve ser marcado no Connect (pelo coordenador) ou continuar no Financeiro? O pagamento de entrevistadores é **um lançamento por projeto × data** ou **um por ciclo com vários projetos**?

## Ajuda

### A1. Teste do login Microsoft e verificação em duas etapas (PF-50, PF-51)

- O login pelo Google funciona. O da Microsoft está configurado, mas falta **testar com a conta da empresa e o autenticador do João**.
- Os apps do Google e da Microsoft precisam ser **refeitos nas contas da empresa** (PF-50).
- Pedir que as contas da empresa **exijam verificação em duas etapas**, porque no login por SSO o segundo fator é o do provedor.

### A2. Conta de serviço do Connect

- A leitura de projetos, itens a pagar e entrevistadores já está feita e testada contra o formato do Connect. Falta **ligar numa conta de serviço real**: o time do Connect cria a conta e entrega `CONNECT_BASE_URL`, `CONNECT_CLIENT_ID` e `CONNECT_CLIENT_SECRET` por um canal seguro (nunca por e-mail ou chat em texto). O segredo fica só no `backend/.env`.
- A `PIX_SECRET_KEY` (que protege a busca por chave Pix) é **permanente**: trocar invalida todos os hashes. Ela precisa de **backup próprio, separado do banco**.

### A3. Revisão do `.github/` e PR `homolog` → `main`

- Mudanças nos workflows que precisam da sua revisão antes de qualquer merge: `tests.yml` (chave de teste do Pix e um passo novo de teste em Postgres para pedidos simultâneos de login) e `security.yml` (o `pip-audit` agora roda **sem nenhuma exceção**).
- O trabalho está todo na `homolog`, com a verificação completa verde (backend com 96% de cobertura, front, E2E). **Merge na `main` só com a sua autorização.** Antes do push, ainda precisa rodar a simulação de CI em Linux com Python 3.11 e a auditoria de segredos.

### A4. Tirar o Claude da lista de contribuidores do GitHub

- O Claude aparece como contribuidor porque os primeiros commits tinham a linha de coautoria. Tirar exige **reescrever o histórico e forçar o envio da `main`**: todo mundo que já clonou precisa refazer o clone, e PRs abertos quebram. Só vale a pena com o seu OK e num momento combinado. Opção: deixar como está.

### A5. Versão nova do FastAPI

- O Financeiro subiu para **FastAPI 0.162.0 e Starlette 1.10.0** ([ADR 0011](../architecture/adr/0011-fastapi-e-starlette-novos-fora-da-versao-do-connect.md)) para fechar um alerta de segurança num endpoint sem login. O Connect segue na 0.118.3 e ainda ignora 6 avisos. **Avisar o time do Connect**, e conferir o código copiado de lá.

### A6. Migração do SGE4B

- A reunião para levantar as **11 bases e os relatórios usados** e o **pedido formal da exportação completa** ao fornecedor (11 bases, CSV ou XLSX, prazo de resposta) ficaram para quando a migração começar. Falta o João dizer **quando**, e quem fala com o fornecedor.

## Para levar ao DPO, à Vivi e à contabilidade

### P1. Prazo de guarda dos registros de login (Q26), com o DPO

- **Hoje** nada apaga as tentativas de login nem as sessões. A **rotina de limpeza já está escrita** (`scripts/purge_login_data.py`), desligada, e só apaga com prazo configurado.
- **Proposta:** **6 meses** para tentativas de login (Marco Civil, art. 15) e **30 dias depois de expirar** para sessões. Aprovados, é só configurar e ligar.
- O inventário de dados e o ROPA do login já estão escritos e esperam o DPO conferir.

### P2. Notas e RPA, com o DPO e a contabilidade

- **Q15:** CPF inteiro e PIS/NIT para o RPA: guardar cifrado ou a contabilidade coletar fora? **Q17:** o prazo de 6 meses vale também para notas de fornecedores (hoje 5 anos no cofre)? **N3:** teto do INSS, outras retenções e regime tributário do PJ.

### P3. Itaú e notas (pesquisa técnica)

- **N1:** pagar pelo Itaú: API Pix em lote ou arquivo de remessa? Como volta o retorno por pagamento, e quanto custa? **N2:** captura automática de notas (prefeitura e Emissor Nacional): qual serviço usar? Até lá, importa-se o arquivo exportado dos portais.

### Com a Vivi

- **Q21:** provisão conta em "Hoje" e "Vencidos"? **Q24:** as datas do lançamento precisam seguir emissão ≤ competência ≤ vencimento? **Q25:** fornecedor com nome parecido só avisa ou bloqueia? **Q28:** aviso de inadimplência ao comercial depois de quantos dias?
- **Faixas de atraso:** a inadimplência mostra 1 a 30, 31 a 60, 61 a 90 e mais de 90 dias (faixas-padrão). Confirmar os limites.
- **Acréscimos, descontos e impostos (Q29):** valem na conta comum, a pagar e a receber. Contas com pessoas (folha, incentivo) não aceitam, e o parcelado recusa na criação. Confirmar se o imposto lançado é retenção (reduz o líquido), como está hoje.

## O que o Bruno já decidiu nesta semana (pede só ciência)

Estas decisões foram tomadas no trabalho, dentro do que o projeto permite, e estão registradas nos specs. Se o João discordar de alguma, é só dizer.

- **Filtros com mais de uma opção** em todas as listas de Contas a pagar e de Contas a receber; o filtro "Categoria" passou a se chamar **Plano de contas**.
- **Importar planilha:** projeto, empresa, unidade, centro de custo, categoria e forma de pagamento podem vir em **colunas opcionais**, e a tela aceita marcar vários de cada um. Sai um lançamento por combinação e data de pagamento. O tipo (incentivos ou folha) continua um só.
- **Faixas de atraso** na inadimplência, com os limites-padrão acima.
- **Acréscimos, descontos e impostos** em Contas a pagar e a receber, como listas de lançamentos. A lista mostra o **valor líquido**, e o antigo campo de abatimentos do Contas a receber virou a lista de impostos.
- **Subida do FastAPI e do pypdf** (o `pypdf` tinha 7 avisos de segurança e lê os PDFs de comprovante).
- **Quadro do Jira:** as subtarefas de preparação foram fechadas; as que não foram executadas (rodar o protótipo Manus; reunião e pedido do SGE4B) ficaram com comentário dizendo isso.

## Como fechar o PF-58

Pronto quando cada entrega do Connect tem data e responsável (D1), e cada decisão acima tem resposta ou uma nova data para responder. A resposta entra no spec dono, vira transcrição em `docs/transcricoes/` e sai de [perguntas-abertas](perguntas-abertas.md).
