# P+ Financeiro — plano de reconstrução incremental

**Situação:** plano aprovado em 25/10/2026; execução atual ajustada pela instrução posterior de pular áreas que precisam de chaves.
**Autorização recebida em 25/10/2026:** reconstruir no Manus WebDev, aceitando arquitetura adaptada e entrega em fases.
**Projeto:** `/home/ubuntu/pmaisfin`, servidor e banco gerenciados habilitados; em 26/10 a preferência atual do Dashboard informa publicação automática ativa. Essa preferência não foi alterada pelo agente. Mockup e acesso compartilhado demo são separados de administração, MFA e operações financeiras de produção, que permanecem adiados.

## Entrega técnica solicitada — 26/10/2026, documentação integral

O novo briefing solicita documentar a aplicação real, não implementar regras presumidas ou converter o mockup em Financeiro operacional. Auditar primeiro os domínios de código, infraestrutura, schema/migrations, rotas, autenticação, regras, componentes usados/legado e testes. Produzir os vinte arquivos nomeados `docs/01-visao-geral.md` até `docs/20-pendencias.md`, com `docs/README.md` como índice; seguir os nomes exatos do anexo. Todo fato terá referência ao código quando possível e marcação CONFIRMADO NO CÓDIGO, RECOMENDAÇÃO — não implementado atualmente ou A CONFIRMAR. Separar banco real do modelo sintético local, arquivos presentes de caminhos ativos e existência de teste de evidência de execução. Não expor valores de ambiente, segredos, cookies, logs brutos, linhas de pessoas ou credenciais reais.

Entregar pacote completo reproduzível de código frontend/backend, lockfile, configurações, scripts, testes, schema/migrations, documentos e imagens existentes. Imagens novas serão somente diagramas determinísticos corretos (Mermaid + PNG) e captura da tela de entrada sem senha, se disponível; nada de arte que simule telas ou funcionalidades inexistentes. Incluir exemplo de ambiente sem valores protegidos, guia de assets e manifestações de integridade. A leitura de metadata de schema é permitida, mas nenhuma consulta a registros de usuário/negócio, migration, pagamento ou integração real será feita. Não modificar endpoints ou comportamento financeiro para documentá-los.

## Ajuste de execução — 25/10/2026, 03:43

O usuário pediu construir e pular os trechos que precisam de chaves. Isso adia login, sessões, MFA, administração de usuários e consulta de auditoria; não autoriza substituí-los por autenticação fraca nem expor informações financeiras. Nesta entrega, a aplicação será **somente leitura, em modo de implantação**, com navegação responsiva, estado técnico consultado no servidor, catálogo de módulos e dependências, guias de fluxo, checklist informativo, busca e filtros de documentação. Não haverá gravação de dados de usuário ou de negócio, contas fictícias, papéis selecionáveis, receitas/despesas inventadas ou ações falsas.

Todas as áreas financeiras e administrativas ficarão bloqueadas também no servidor, com erro explícito de indisponibilidade. A autenticação OAuth do starter não cria acesso alternativo. O status público contém apenas configuração operacional mínima e nunca mostra segredos, nomes, registros, usuários ou dados financeiros. Quando o estado não puder ser consultado, a interface exibirá erro/retry, não um resultado inventado. A checagem do banco é somente `SELECT 1`, sem leitura de tabelas de usuários/finanças. Os critérios de autenticação e das fases posteriores abaixo permanecem no backlog e não serão marcados concluídos nesta entrega.

Os documentos internos completos continuam fora da aplicação; o guia informativo utiliza somente os conceitos mínimos de produto, sem transcrições, nomes internos, detalhes de dados pessoais ou credenciais. Nenhuma publicação externa automática será ativada. A entrega será disponibilizada no Preview e descrita como base informativa, não como Financeiro operacional.

## Ajuste de escopo — 25/10/2026, 04:03: mockup de sete módulos

O usuário solicitou um mockup de todos os módulos funcionando e com interatividade entre eles. Isso substitui a entrega estritamente somente leitura **para a camada de demonstração local**, sem revogar o pedido anterior de adiar funções que exigem chaves. A demonstração usa registros evidentemente sintéticos, um aviso permanente “MOCKUP • DADOS SINTÉTICOS • NENHUMA OPERAÇÃO REAL”, e armazenamento de demonstração somente no browser. Valores são inteiros em centavos; datas e formatação seguem pt-BR/America/Sao_Paulo. Haverá reset de demonstração e indicação de que nenhum valor, fornecedor, cliente, entrevista, saldo ou comprovante representa dado real.

O modelo comum de demonstração interliga: (1) pagamentos de entrevistadores simulados; (2) cadastros de fornecedor/cliente/categoria/centro/projeto sintéticos; (3) títulos a pagar/receber, parciais e liquidados apenas em estado local; (4) orçamento e provisões relacionados a projetos e títulos; (5) regras/folhas/lotes demonstrativos; (6) linhas de extrato geradas apenas das próprias ações simuladas, conciliáveis localmente; e (7) relatórios calculados do mesmo estado. Criar ou inativar dimensão afeta seletores seguintes; pagar título ou lote simulado cria linha de extrato demonstrativa; conciliação altera a vista; dashboard/relatórios são recalculados desses mesmos registros.

## Ajuste de escopo — 26/10/2026: tela de acesso à demonstração

O usuário solicitou uma tela de acesso com o identificador `adm` e forneceu uma senha; depois confirmou seu armazenamento no formulário protegido do WebDev. Implementar uma **porta de entrada exclusiva para o mockup**, validando a senha somente no servidor, por `PMAIS_DEMO_LOGIN_PASSWORD`; não incluir seu valor ou hash no frontend, nos fontes, documentação, comandos ou logs. Mostrar erro genérico e limitar tentativas. A tela/aviso devem dizer claramente que o login serve somente à navegação do mockup com dados sintéticos, não é autenticação do Financeiro nem protege informações reais.

Usar sessão opaca de curta duração em memória do servidor e cookie próprio `pmais_demo_session` (nunca o nome reservado OAuth `webdev_app_session`), `HttpOnly`, `Path=/`, `Secure; SameSite=None` para HTTPS Preview incorporado; ramo separado de cookie local HTTP. A sessão expira e é invalidada no reinício; logout limpa o cookie. Não gravar tokens/senhas em `localStorage`/`sessionStorage`. Não abrir cadastro público, login OAuth alternativo, admin real ou MFA falso. Toda escrita do mockup permanece estritamente no estado sintético local; APIs financeiras permanecem bloqueadas. Login/MFA, papéis, persistência corporativa e auditoria de produção continuam abertos e não podem ser chamados de concluídos.

Uploads, parser de PDF real, importação de OFX/CSV real, Connect, Itaú, e-mail, banco/DB, câmbio, alteração financeira persistente ou qualquer endpoint financeiro de escrita continuam fora. “Pagar”, “receber”, “importar”, “dar baixa”, “conciliar” e “fechar período” só podem alterar o estado local de demonstração com confirmação na UI; todo resultado permanece identificado como simulado.

Usar estado versionado `pmaisfinanceiro:demo:v1`, validado ao carregar, com fixtures chamadas “DEMO”, e reset confirmado para as fixtures originais. Aviso visível em cada módulo e exportação. A persistência local permite continuidade do mockup; ela não constitui retenção ou banco real e não deve receber informação pessoal/financeira verdadeira. A checagem de infraestrutura continua sendo real e isolada (`GET /api/deployment/status`, `SELECT 1`), mas valores de negócio demonstrativos nunca vão a API/DB. Offline, a interação local continua claramente em modo demonstração; estado da infraestrutura mostra a falha real separadamente.

## 1. Direção e preservação

A aplicação será construída a partir das especificações fornecidas. O ZIP não contém código executável: a preservação nesta etapa consiste em manter os documentos, regras de negócio, fronteiras com o Connect e decisões registradas. O prompt antigo de protótipo não autoriza MFA fictício, seletor de papéis, dados financeiros inventados ou persistência somente em localStorage.

O escopo final permanece: pagamentos de entrevistadores; cadastros e migração; contas a pagar/receber; projetos e orçamento/provisões; folha e lotes; conciliação bancária; relatórios e fluxo de caixa. A primeira entrega será menor e funcional, com sua fronteira explícita, sem ser apresentada como o Financeiro completo ou pronto para operar recursos reais.

## 2. Primeira entrega proposta: fundação, acesso e auditoria

### Funcionalidades reais desta entrega

1. **Identidade Pesquise+ e interface responsiva:** estrutura de navegação, telas de acesso, área interna e componentes reutilizáveis conforme o guia de marca.
2. **Login por e-mail e senha:** contas próprias do Financeiro, sem substituir silenciosamente pelo login do Manus e sem login único com o Connect. Senhas com hash bcrypt; validação de força e mensagens genéricas de erro.
3. **MFA TOTP obrigatório:** cadastro no primeiro acesso para ambos os papéis; somente senha não abre áreas internas. Códigos de recuperação de uso único, guardados como hash. Segredo TOTP cifrado com AES-256-GCM, chave fora do banco/repositório. Proteção contra reuso de código e limitação de tentativas.
4. **Sessões e segurança da conta:** access token curto (15 minutos) apenas em memória; refresh token rotativo (até 7 dias) em cookie HttpOnly, detecção de reuso e revogação. Logout, alteração de senha com senha atual/MFA, encerramento de sessões e bloqueio imediato de contas desativadas. Nenhum token em localStorage.
5. **Usuários e permissões:** somente `admin` e `financeiro`. Admin cadastra/edita contas, altera papel/permissões e desativa/reativa. Não haverá exclusão física de usuário com histórico. Impedir rebaixar/desativar o último admin ativo. Operações administrativas sensíveis exigem confirmação e reautenticação MFA.
6. **Auditoria administrativa persistida:** eventos de acesso e alterações de conta/papel/permissão, com data, ator e referência do objeto; filtros e paginação. Somente admin consulta. Não haverá endpoint de edição/exclusão da trilha.
7. **Visão geral de implantação:** situação da primeira fase e dependências futuras, sem receitas/despesas/saldos inventados. Recursos não implementados não aparecem como botões operacionais; a integração com o Connect será identificada como não configurada/não validada.
8. **Documentação e fontes:** organização da aplicação, migrations, instruções de configuração/execução/publicação, resumo das evidências de validação e pendências. A implementação será revisada de modo independente antes da entrega.

### Limites explícitos desta entrega

Não inclui títulos, lançamentos monetários, baixas financeiras, Pix, envio ao banco, importação SGE4B, parser de comprovantes, cofre de notas/anexos, integração ativa com o Connect, edição de orçamento, folha de campo ou relatórios financeiros. Esses itens continuam no roadmap, não serão substituídos por mocks.

Não haverá cadastro público nem credencial padrão. Recuperação por e-mail/avisos transacionais por e-mail dependem de um serviço SMTP ainda não configurado; nesta fase, o fluxo disponível será recuperação MFA por código de uso único e suporte administrativo seguro, com mensagens internas de segurança. A ausência de entrega de e-mail será documentada, sem botão simulando envio.

## 3. Arquitetura adaptada e responsabilidades

| Camada | Nova implementação | Relação com o handoff |
|---|---|---|
| Interface | React + TypeScript + Vite, Tailwind e componentes Radix do starter | Substitui Next.js preservando fluxos e identidade. |
| API | Express + tRPC, serviços separados e validação Zod | Substitui FastAPI/Pydantic; autorização e regras permanecem no servidor. |
| Persistência | MySQL gerenciado + Drizzle, migrations versionadas | Substitui PostgreSQL/Alembic; não há conexão com o banco do Connect. |
| Autenticação | Identidade própria por e-mail/senha + TOTP | Não utilizar autenticação OAuth do starter para contornar senha/MFA ou atribuir papel financeiro. |
| Arquivos | Sem uploads nesta primeira fase | MinIO/cofre não será simulado nem substituído por URLs públicas para anexos sensíveis. |
| Publicação | Container do projeto, front compilado e API na mesma origem | Preservar Dockerfile/health check do starter, adaptados conforme o código efetivo. |

O banco gerenciado é durável, mas desenvolvimento e aplicação publicada usam **o mesmo banco**. Não haverá seed de lançamentos ou registros fictícios. Migrations iniciais serão aditivas. Testes automatizados devem isolar suas fixtures; não apagar nem sobrescrever registros de usuários reais para testar.

### Estrutura do projeto

- `client/src/pages/`: acesso, cadastro de MFA, visão geral, minha conta, usuários, auditoria e estado da implantação.
- `client/src/components/`: navegação, formulários, tabelas, confirmações, feedbacks e estados reutilizáveis.
- `client/src/lib/`: cliente tipado, sessão apenas em memória, formatos pt-BR e utilitários de acessibilidade.
- `server/_core/`: entrada Express, contexto autenticado, configuração de ambiente e integração com runtime do Manus.
- `server/routers/`: contratos tRPC de acesso, contas, administração e auditoria.
- `server/services/`: autenticação, MFA, autorização, gestão de contas e transações de auditoria.
- `server/security/`: criptografia, hash de credenciais, limitação persistente e proteções de requisição.
- `drizzle/`: schema e migrations versionadas.
- `shared/`: tipos, capacidades e validações compartilhadas sem segredos.
- `scripts/`: provisionamento idempotente do primeiro admin e rotinas explícitas de verificação/exportação técnica.
- `docs/source/`: material original preservado; `docs/analysis/`: diagnóstico; `docs/architecture/`, `docs/development/`, `docs/operations/`: decisões da reconstrução e execução.

## 4. Modelo de acesso e segurança

Serão criadas tabelas próprias para contas do Financeiro, concessões de permissão, famílias de refresh tokens, desafios MFA, códigos de recuperação, tentativas/bloqueios e eventos de auditoria. A tabela OAuth genérica do starter não atribuirá acesso ao domínio financeiro.

O primeiro admin será provisionado uma única vez por rotina explícita, lendo e-mail/senha iniciais do fluxo protegido de configuração; nunca por formulário público “primeiro visitante vira admin”. Reexecução não sobrescreverá senha, papel, MFA ou contas existentes. O primeiro login desse admin também exigirá configurar e confirmar MFA. Segredos da aplicação serão fornecidos pelo formulário protegido do WebDev, não pelo chat.

A autorização consulta o estado atual da conta e as permissões no banco a cada requisição. Login/MFA têm limites persistidos para não perder proteção a cada reinício; respostas e logs não expõem e-mails, senhas, tokens, chaves, códigos ou corpos de request. O esquema de limites baseado no MySQL substitui o Redis prescrito no handoff e será registrado como adaptação de infraestrutura.

**Cookies e CSRF:** para HTTPS público e Preview incorporado, refresh usa `HttpOnly; Secure; SameSite=None`, diferente do `Strict` proposto nos documentos. Essa alteração é necessária para o iframe do Manus e não pode se basear no `NODE_ENV` ou no protocolo interno do proxy. Compensar com verificação de origem e token anti-CSRF vinculado à sessão nos fluxos dependentes de cookie. As demais chamadas protegidas usam access token em memória. Navegadores ainda podem restringir cookies de terceiros; o erro deve ser explicado, não contornado com login fictício.

**Auditoria:** imutabilidade no nível da aplicação e registros transacionais; tentar aplicar e validar controles de banco compatíveis que neguem UPDATE/DELETE na trilha. A infraestrutura gerenciada não deve ser apresentada como equivalente a privilégios PostgreSQL sem evidência. Se privilégios/triggers específicos não forem permitidos, essa limitação será documentada como pendência de endurecimento, sem falsa garantia de append-only no banco.

**Cabeçalhos:** aplicar `nosniff`, política de referrer, cache `no-store` em respostas autenticadas e CSP compatível com o runtime. Não bloquear o Preview com `X-Frame-Options: DENY/SAMEORIGIN` ou `frame-ancestors 'none'/'self'`. Produção e Preview terão configurações explicitamente compatíveis, sem reduzir autenticação.

Backups gerenciados/PITR não serão presumidos: documentar exportação técnica e procedimentos de recuperação suportados. Rotinas automáticas de backup/expurgo e provas de restauração são itens posteriores de operação, especialmente antes de uso com dados financeiros reais. Não configurar serviços ou tarefas recorrentes nesta fase sem esse plano operacional.

## 5. Arquitetura de informação, telas e fluxo

**Fluxo principal:** e-mail/senha → cadastro MFA obrigatório ou desafio MFA → visão geral → minha conta; admin pode acessar usuários e auditoria. Logout revoga sessão e retorna ao acesso. Conta inativa, token inválido/expirado e papel insuficiente impedem acesso no servidor.

| Tela | Comportamento |
|---|---|
| Acesso | E-mail/senha, desafio TOTP/recuperação e erros genéricos de validação. |
| Configurar MFA | QR/configuração manual, confirmação por código e apresentação única de recuperação. |
| Visão geral | Estado real da fundação e próximos módulos; sem KPIs financeiros fictícios. |
| Minha conta | Informações de acesso, trocar senha, sessões e medidas de segurança. |
| Usuários | Admin: busca/filtros, criação/edição, estado, papel/permissões e confirmação de alteração. |
| Auditoria | Admin: eventos reais persistidos, filtros e paginação; vazio com orientação. |
| Estado da implantação | Roadmap, limites e dependências, incluindo Connect não configurado/validado. |

Estados comuns: carregando, vazio, validação inválida, erro de rede, offline, sucesso, desafio expirado, bloqueio por tentativas, sem permissão e sessão encerrada. Os campos terão rótulos persistentes, mensagens próximas e foco dirigido de forma previsível.

## 6. Design e componentes

A referência é o guia oficial fornecido, não um estilo alternativo. A estética será SaaS empresarial minimalista: estrutura clara, leitura eficiente e uso sóbrio dos acentos. Navegação lateral em cinza escuro no desktop, cabeçalho consistente e conteúdo claro; em mobile, menu acessível recolhível e uma coluna. Login com área institucional escura e formulário de leitura confortável, sem imagens decorativas desnecessárias.

**Tokens:** Open Sans Regular/SemiBold/Bold; texto `#3C3C3C`, fundos branco/cinza suave, bordas `#E8E8E8`, ação principal `#4063EE`, foco `#009CEF`, estados positivos `#00C977` com texto escuro, acentos pontuais `#6B36F7` e `#6EC3E4`; alertas/erros com cores funcionais acessíveis. Raios 8/12/16 px e espaçamento 4/8/12/16/24/32/48 px.

**Logotipo:** reutilizar `Logo2025_branco.png` intacto em superfície escura, com proporção e área de segurança. Não redesenhar, separar elementos ou recolorir. A tagline adicional será `predict the future`, em minúsculas; a assinatura raster oficial permanece intacta mesmo contendo sua grafia original.

**Componentes:** shell de navegação, formulário/field, senha visível opcional, entrada TOTP, avisos, badges acompanhados de texto, tabela responsiva, busca/filtros, paginação, confirmação acessível, skeleton e estado vazio.

**Interações e acessibilidade:** uma ação primária por tela; modais com foco controlado; navegação por teclado e foco visível; 44 × 44 px de toque; contraste AA e estados não comunicados só por cor. Respeitar `prefers-reduced-motion` e evitar animações ornamentais. O tom será claro e orientado à ação: “Configure seu acesso seguro.” / “A integração com o Connect ainda não foi validada.”

## 7. Sequência posterior, sem antecipar decisões

Depois desta entrega, pagamento de entrevistadores será detalhado como módulo específico, condicionado ao código/contrato/API de teste do Connect. Cadastros podem avançar em paralelo após validar campos e categorias, sem migrar o SGE4B automaticamente. Em seguida: contas a pagar/receber; projetos/orçamento/provisões; folha/lotes; conciliação; relatórios e fluxo de caixa.

Em cada fase será delimitada a funcionalidade realmente entregue. Solicitações ao Connect nunca acessam seu banco/MinIO, não copiam chaves Pix e só consideram entrevistas pagas após confirmação idempotente real do Connect. Não ampliar papéis ou decidir alçadas/retensão/CPF/RPA/autoridade de projeto no código. Nenhuma migração, corte do legado, envio bancário ou baixa real será executada nesta primeira entrega.

## 8. Forma de entrega

Após aprovação deste plano: implementar a primeira fase, executar verificações e revisão independente, corrigir os problemas confirmados e salvar uma versão do projeto. Disponibilizar o app em Preview para validação e fornecer código-fonte/documentação solicitados. Publicação e uso com dados financeiros reais são etapas distintas; não declarar sucesso de produção ou integração a partir de Preview ou build.
