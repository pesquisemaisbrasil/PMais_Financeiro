# Para o João: decisões e ajuda que o Financeiro precisa

**Posição em 25/11/2026** (a primeira versão é de 06/11). Este documento junta, num lugar só, tudo o que está parado esperando uma decisão ou uma ajuda sua. Cada item diz o que o sistema faz hoje (vale se ninguém responder), a nossa proposta e o que a resposta destrava. Para responder, basta dizer o número e "aceito", "outra" ou "depois", por exemplo: "D1 aceito, D2 outra: ..., A3 faço segunda". As perguntas completas estão em [perguntas-abertas](perguntas-abertas.md).

Para conduzir a conversa tarefa por tarefa do Jira, veja o [roteiro com o João](roteiro-com-o-joao.md). O que foi construído até aqui e como testar está em [roadmap](roadmap.md) e [proximos-passos](proximos-passos.md).

## Resumo

| # | O que | Tipo | Destrava |
|---|---|---|---|
| D1 | Datas e responsáveis das entregas do Connect | Decisão do Connect | Pagar de verdade (baixa e planilha de pagamento) |
| ~~D2~~ | ~~Regra do bloqueio de login (PF-53)~~ | Feito em 23/11 com a proposta | — |
| D3 | Reautenticar a baixa de quem entra por SSO (Q20) | Decisão de regra | MFA da confirmação |
| D4 | Substituto do MinIO e guarda de arquivos (Q18, Q19) | Decisão técnica e LGPD | Anexos nos lançamentos |
| D5 | Cancelar baixa (Q4) e segregação de funções (Q8) | Decisão de regra | Estorno de baixa de entrevistador |
| D6 | Chave Pix do respondente e CPF de fornecedor (Q22, Q23) | Decisão LGPD | Importar planilha com chave, fornecedor pessoa física |
| D7 | Plano de contas e linhas do DRE (F3) | Em parte decidido em 25/11 | O DRE completo |
| D9 | Como o Financeiro registra o adiantamento (Q63) | Decisão com a Vivi | Mostrar o adiantamento na tela de pagamento |
| D10 | Repositório e demonstração públicos? (Q47) | Decisão sua | Fechar ou manter o repositório |
| D8 | Onde se marca tipo de projeto, incentivo e prazo (F23, F25) | Decisão de produto | Importar planilha sem depender do Financeiro |
| A1 | Verificação em duas etapas nas contas da empresa, se o SSO voltar (PF-51) | Ajuda com acesso | Login por Google e Microsoft |
| A2 | Conta de serviço `financeiro-dev` do Connect (PF-77) | Ajuda com acesso | Ver projetos e itens a pagar reais |
| A3 | Revisar as mudanças em `.github/` e autorizar o merge na `main` | Ajuda com revisão | Subir a versão validada |
| A4 | Tirar o Claude da lista de contribuidores do GitHub | Ajuda com o repositório | Histórico do repositório |
| A5 | Avisar o time do Connect da versão nova do FastAPI | Ajuda com o Connect | Evitar surpresa ao copiar código |
| ~~A6~~ | ~~Migração do SGE4B~~ | Feito pelo Bruno com os arquivos exportados (24/11) | — |
| A7 | Instalar o servidor local com o pacote do banco | Ajuda com o servidor | A equipe usar o Financeiro |
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

### D2. Regra do bloqueio de login (PF-53) · feito em 23/11

**Feito com a proposta abaixo:** as falhas contam por e-mail e rede juntos, e quem é de fora não trava mais a conta de outra pessoa ([acesso-e-auditoria](../specs/acesso-e-auditoria.md)). Fica aqui só para registro.

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

- **Em 25/11** o Bruno decidiu que **cada grupo do plano de contas importado do SGE4B é uma linha do DRE**, e a tela Relatórios → DRE já funciona assim ([registro](../transcricoes/2026-11-25-decisoes-dos-relatorios.md)). O que segue abaixo continua valendo para o DRE completo (linhas de dedução, contas sintéticas e o vínculo com as categorias do orçamento).
- O sistema antigo tem o filtro **Linha do DRE**. Aqui o plano de contas ainda não tem essa ligação, e o Bruno decidiu deixar para o módulo de Relatórios (PF-76).
- **Precisa:** a **lista oficial das contas** (a proposta inicial tem cerca de 8 a 10 categorias de custo), a lista ordenada das **linhas do DRE** e a ligação de cada conta com uma linha. É a Vivi e a direção que definem, e o João decide quando levar.
- O plano de contas do sistema antigo é uma lista simples; a spec prevê contas **sintéticas** (que agrupam outras). Dizer se isso é necessário no começo.

### D8. Onde se marca tipo de projeto, "tem incentivo" e prazo (F23, F25)

- **Hoje:** o projeto vem do Connect, mas tipo, incentivo e prazo em dias úteis são marcados **no Financeiro**, na tela Projetos. Importar planilha cria **um lançamento por projeto, classificação e data de pagamento**.
- **Pergunta:** isso deve ser marcado no Connect (pelo coordenador) ou continuar no Financeiro? O pagamento de entrevistadores é **um lançamento por projeto × data** ou **um por ciclo com vários projetos**?

### D9. Como o Financeiro registra o adiantamento (Q63, PF-102)

- **Hoje** o Financeiro só lê o `advancedValue` do Connect e paga só o que falta (opção C do relatório do Connect).
- **Opções:** (A) lançar o adiantamento no Financeiro, conferido pelo Connect; (B) rota nova no Connect para o Financeiro registrar; (C) continuar só lendo. Também decidir onde o adiantamento e o saldo negativo aparecem na tela de pagamento (PF-101).

### D10. Repositório e demonstração públicos? (Q47, PF-78)

- O repositório `pesquisemaisbrasil/PMais_Financeiro` é público, e a demonstração leva o código do backend a quem abrir o site. Se não for para ficar público, o repositório vira privado e a demonstração fica fechada com senha.

## Ajuda

### A1. Verificação em duas etapas nas contas da empresa (PF-51)

- Desde 17/11 a tela de login oferece **só e-mail e senha**: o Google e a Microsoft ficam desligados até as contas da empresa existirem.
- Os apps do Google e da Microsoft precisam ser **refeitos nas contas da empresa** (PF-50).
- Pedir que as contas da empresa **exijam verificação em duas etapas**, porque no login por SSO o segundo fator é o do provedor.

### A2. Conta de serviço do Connect

- A leitura de projetos, itens a pagar e entrevistadores já está feita e testada contra o formato do Connect. Falta **ligar numa conta de serviço real**: o time do Connect cria a conta e entrega `CONNECT_BASE_URL`, `CONNECT_CLIENT_ID` e `CONNECT_CLIENT_SECRET` por um canal seguro (nunca por e-mail ou chat em texto). O segredo fica só no `backend/.env`.
- A `PIX_SECRET_KEY` (que protege a busca por chave Pix) é **permanente**: trocar invalida todos os hashes. Ela precisa de **backup próprio, separado do banco**.

### A3. Revisão do `.github/` e PR `homolog` → `main`

- Mudanças nos workflows que precisam da sua revisão antes de qualquer merge: `tests.yml` (chave de teste do Pix e um passo novo de teste em Postgres para pedidos simultâneos de login) e `security.yml` (o `pip-audit` agora roda **sem nenhuma exceção**). E `e2e.yml` (13/11/2026): dois passos novos que **geram a demonstração** (Pyodide e pacotes de Python baixados com hash conferido) e rodam o teste de tela dela, e o limite do job passou de 30 para 45 minutos.
- **O repositório do GitHub é público** (Q47): confirmar que isso é intencional antes de enviar a `homolog`; ela leva 76 commits novos, com docs internos (roteiro com o João, guia do Connect dev sem segredo) e o código do backend. O `netlify.toml` na raiz, quando o site do Netlify for ligado ao repositório, gera e publica a demonstração em `/teste` no primeiro deploy.
- O trabalho está todo na `homolog`, com a verificação completa verde (backend com 96% de cobertura, front, E2E). **Merge na `main` só com a sua autorização.** Antes do push, ainda precisa rodar a simulação de CI em Linux com Python 3.11 e a auditoria de segredos.

### A4. Tirar o Claude da lista de contribuidores do GitHub

- O Claude aparece como contribuidor porque os primeiros commits tinham a linha de coautoria. Tirar exige **reescrever o histórico e forçar o envio da `main`**: todo mundo que já clonou precisa refazer o clone, e PRs abertos quebram. Só vale a pena com o seu OK e num momento combinado. Opção: deixar como está.

### A5. Versão nova do FastAPI

- O Financeiro subiu para **FastAPI 0.162.0 e Starlette 1.10.0** ([ADR 0011](../architecture/adr/0011-fastapi-e-starlette-novos-fora-da-versao-do-connect.md)) para fechar um alerta de segurança num endpoint sem login. O Connect segue na 0.118.3 e ainda ignora 6 avisos. **Avisar o time do Connect**, e conferir o código copiado de lá.

### A6. Migração do SGE4B · feito em 24/11

- O Bruno exportou do SGE4B os cadastros (.csv) e os relatórios de lançamentos a pagar e a receber, e os scripts do Financeiro importaram tudo no banco local dele (1.389 contas a pagar, R$ 3.661.640,46). Os arquivos reais não vão para o repositório.

### A7. Instalar o servidor local

- O Bruno entrega por um canal seguro o pacote do banco local (`backups/local-<data>-banco.dump`, `-arquivos.tgz` e `-chaves.env`). No servidor: `git clone`, `git checkout development`, os três arquivos em `backups/` e `make subir-projeto HOST=<IP do servidor> CONFIRMAR=sim` ([DEPLOY.md](../../DEPLOY.md)). Daí em diante, o servidor se atualiza sozinho às 22h com a `development`.
- As 5 contas da equipe já estão no pacote, com a senha inicial de primeiro acesso: cada pessoa troca pela dela no primeiro login.

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

## O que o Bruno já decidiu (pede só ciência)

Estas decisões foram tomadas no trabalho, dentro do que o projeto permite, e estão registradas nos specs. Se o João discordar de alguma, é só dizer.

**De 17 a 25/11:**

- **Servidor local** pelo Makefile, com HTTPS, backup e voltar versão; ele recebe o banco local pelo pacote e se atualiza às 22h ([ADR 0026](../architecture/adr/0026-banco-local-no-servidor-e-atualizacao-as-22h.md)).
- **Computador liberado:** a conta só entra pelos computadores que um administrador liberou. O super admin fica fora disso até o fim do desenvolvimento.
- **Três níveis de acesso** (super admin, admin e usuário), telas bloqueáveis por pessoa e Abrir demanda.
- **Senha inicial de primeiro acesso** para as contas da equipe, trocada antes do autenticador.
- **Cadastros iguais aos do SGE4B** e Conferência bancária e Divergências "Em breve" no menu.
- **Fluxo de caixa e DRE** em Relatórios; o DRE usa os grupos do plano de contas, e o Resultado por projeto espera o Connect.

**Até 06/11:**

- **Filtros com mais de uma opção** em todas as listas de Contas a pagar e de Contas a receber; o filtro "Categoria" passou a se chamar **Plano de contas**.
- **Importar planilha:** projeto, empresa, unidade, centro de custo, categoria e forma de pagamento podem vir em **colunas opcionais**, e a tela aceita marcar vários de cada um. Sai um lançamento por combinação e data de pagamento. O tipo (incentivos ou folha) continua um só.
- **Faixas de atraso** na inadimplência, com os limites-padrão acima.
- **Acréscimos, descontos e impostos** em Contas a pagar e a receber, como listas de lançamentos. A lista mostra o **valor líquido**, e o antigo campo de abatimentos do Contas a receber virou a lista de impostos.
- **Subida do FastAPI e do pypdf** (o `pypdf` tinha 7 avisos de segurança e lê os PDFs de comprovante).
- **Quadro do Jira:** as subtarefas de preparação foram fechadas; as que não foram executadas (rodar o protótipo Manus; reunião e pedido do SGE4B) ficaram com comentário dizendo isso.

## Como fechar o PF-58

Pronto quando cada entrega do Connect tem data e responsável (D1), e cada decisão acima tem resposta ou uma nova data para responder. A resposta entra no spec dono, vira transcrição em `docs/transcricoes/` e sai de [perguntas-abertas](perguntas-abertas.md).
