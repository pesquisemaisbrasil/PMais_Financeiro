# EVIDÊNCIA DE AUDITORIA — Segurança

**Projeto:** `pmaisfin`
**Base informada:** `81bc243`
**Data da leitura:** 2026-10-26
**Escopo:** domínio “Riscos concretos da aplicação e proteção atual” no mockup P+ Financeiro.
**Status do artefato:** evidência de auditoria; não é documentação final nem plano implementado.

## 1. Limites, método e convenções

A leitura foi feita sobre o código-fonte ativo permitido (`client/`, `server/`, `shared/`, `drizzle/`, configurações e scripts de verificação). Não foram lidos `.env*`, `.manus-logs/`, senhas, hashes de senha, valores de sessão/token/cookie, DSNs ou logs brutos. Não foi executado pentest de rede/DB. A auditoria de dependências pertence a outro domínio e não é repetida aqui.

As fontes abaixo são relativas à raiz do repositório e usam linha inicial/final. “**CONFIRMADO NO CÓDIGO**” significa comportamento diretamente verificável. “**A CONFIRMAR**” significa dependência de infraestrutura, proxy, navegador, provedor ou ambiente que não pode ser certificada somente pelo repositório. “**RECOMENDAÇÃO — não implementado atualmente**” não deve ser lida como controle já existente.

A aplicação é um mockup de sete módulos com dados sintéticos locais e um acesso compartilhado de demonstração. MFA individual, banco corporativo, identidade financeira, autorização por papéis e trilha financeira real estão deliberadamente fora desta etapa. A ausência desses itens é bloqueio para produção, mas não deve ser classificada como vulnerabilidade explorável de dados financeiros inexistentes no release atual.

## 2. Resumo executivo do comportamento ativo

### 2.1 Superfície efetivamente exposta

- O servidor Express aplica `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` para câmera/microfone/geolocalização e CSP a todas as respostas (`server/_core/index.ts:17-24`). A aplicação desabilita `X-Powered-By` (`server/_core/index.ts:15-17`).
- O acesso atual é uma sessão separada, chamada `pmais_demo_session`, para o usuário fixo `adm`; a senha é lida somente de `PMAIS_DEMO_LOGIN_PASSWORD` no servidor (`server/security/demoAccess.ts:5-23,82-110`). A sessão opaca dura 30 minutos e vive em `Map` de processo (`server/security/demoAccess.ts:7-8,24-28,104-108`).
- O cliente só renderiza o shell e os módulos demo quando `status === "authenticated"`; caso contrário redireciona para `/login` (`client/src/App.tsx:27-31,35-60`). O guard HTTP das páginas exige sessão para os caminhos de demonstração (`server/security/demoAccess.ts:10,126-131`).
- Antes das rotas gerais, `/api/demo-access` aceita sessão, login e logout; o restante do servidor passa por `readOnlyGuard` (`server/_core/index.ts:26-45`). APIs de escrita e prefixos protegidos respondem HTTP 503, sem tentar executar negócio (`server/security/readOnlyGuard.ts:3-21`).
- Os routers de autenticação/admin/financeiro são stubs indisponíveis: embora usem `publicProcedure` nesta etapa, cada operação chama `unavailable()` e retorna `SERVICE_UNAVAILABLE` (`server/routers.ts:6-32`). O contexto tRPC mantém `user: null` (`server/_core/context.ts:4-13`).
- O estado dos sete módulos é criado no navegador, armazenado em `localStorage` sob `pmaisfinanceiro:demo:v1`, validado ao carregar e sincronizado entre abas por evento `storage` (`client/src/contexts/DemoStore.tsx:10,26-37,408-430`). Não há chamada do DemoStore para banco, pagamento, Pix, Connect ou storage gerenciado.

### 2.2 Controles confirmados

- O desafio CSRF é entregue pelo endpoint de sessão como valor JSON e cookie HttpOnly, vinculado a hash de sessão, expira em 20 minutos e é exigido simultaneamente no cookie e no header `X-Pmais-CSRF` (`server/security/demoAccess.ts:6-8,51-56,68-80`; `client/src/contexts/DemoAccess.tsx:23-37,54-60`). Login/logout recusam requisições `cross-site` explícitas via `Sec-Fetch-Site` (`server/security/demoAccess.ts:82-85,112-115`).
- Login/logout são serializados por uma fila local; a fila deixa a cauda sempre resolvida mesmo se uma operação falhar (`client/src/lib/accessQueue.ts:1-8`). O cliente só repete um POST quando recebeu rejeição explícita `invalid_challenge`, nunca em erro de rede ou senha inválida (`client/src/contexts/DemoAccess.tsx:66-77`).
- O login valida método JSON, tipo e limites de username/senha, aplica 10 tentativas por chave e 30 tentativas globais por janela de cinco minutos, limita número de desafios a 2.000 e sessões a 1.000 (`server/_core/index.ts:27-28`; `server/security/demoAccess.ts:82-110`). O corpo JSON do endpoint tem limite de 2 KB (`server/_core/index.ts:27-28`).
- Cookies demo de Preview usam `HttpOnly`, `Path=/`, `Secure`, `SameSite=None` e `Partitioned`; modo HTTP local é uma opção explícita (`server/security/demoAccess.ts:29-35`). O cookie legado de OAuth, quando o legado fosse usado, também declara `HttpOnly`, `Secure` e `SameSite=None` (`server/_core/cookies.ts:3-6`).
- O cliente React exibe valores de entrada com JSX normal, sem `dangerouslySetInnerHTML` para os dados demo (`client/src/pages/demo/DemoRegistryPage.tsx:393-421,448-463,495-502`; `client/src/pages/demo/DemoReportsPage.tsx:529-539,552-559,572-580`). O único `dangerouslySetInnerHTML` encontrado monta CSS de gráfico a partir de configuração de cor/tema (`client/src/components/ui/chart.tsx:70-99`); não há evidência de que texto de usuário alimente essa configuração no mockup.
- Exportação CSV usa aspas duplicadas, separador `;`, prefixo `'` para textos que começam com `=`, `+`, `-` ou `@`, e revoga o `ObjectURL` logo após o download (`client/src/pages/demo/DemoReportsPage.tsx:145-157,377-420`). Portanto, não foi encontrado risco atual de fórmula CSV nos campos sintéticos exibidos.
- O estado carregado do `localStorage` passa por schema Zod, limites de linhas, IDs únicos e vínculos entre títulos, liquidações, transações, projetos e categorias (`client/src/lib/demoValidation.ts:10-35,37-78`). Valores monetários e cálculos de folha usam inteiros/`BigInt` e limites seguros em várias entradas (`client/src/contexts/DemoStore.tsx:42-53,277-340`; `client/src/lib/demoModel.ts:85-115`).
- Intervalo de refresh, listener de foco, listener de `storage` e estado de montagem são limpos no unmount (`client/src/contexts/DemoAccess.tsx:45-51`; `client/src/contexts/DemoStore.tsx:419-430`). O URL temporário do CSV também é revogado (`client/src/pages/demo/DemoReportsPage.tsx:413-419`).

## 3. Riscos classificados

### R-01 — ALTO — Identidade compartilhada e ausência de MFA/roles para produção

**CONFIRMADO NO CÓDIGO:** `createDemoAccess` aceita uma senha única de processo e só autoriza o identificador literal `adm` (`server/security/demoAccess.ts:19-24,82-110`). A sessão demo informa explicitamente `scope: "demo_only"` (`server/security/demoAccess.ts:68-80`). OAuth não é registrado no servidor atual (`server/_core/index.ts:43-44`), o contexto tRPC fixa `user: null` (`server/_core/context.ts:10-13`) e as rotas de auth/admin/financeiro permanecem indisponíveis (`server/routers.ts:14-32`). O schema de banco contém apenas `users`, com `role` `user|admin`, e não tem tabelas financeiras, de organização, MFA ou auditoria (`drizzle/schema.ts:8-28`).

**Condição/exposição atual:** qualquer pessoa que possua a senha compartilhada pode entrar no mesmo mockup local do usuário `adm`; isso não concede identidade financeira, papel administrativo real, acesso a banco financeiro ou mutação HTTP de negócio, pois o servidor continua read-only/503. Portanto, não é uma escalada atual sobre dados reais. É, contudo, um bloqueio ALTO para produção: reutilizar esse login em ambiente com registros reais transformaria uma credencial compartilhada em acesso sem identidade individual, sem MFA e sem segregação de funções.

**RECOMENDAÇÃO — não implementado atualmente:** substituir o acesso demo por identidade individual no servidor, MFA, recuperação/rotação de credenciais, papéis e escopos organizacionais verificados em cada procedimento; manter a credencial demo estritamente isolada e não reutilizá-la para dados financeiros.

### R-02 — MÉDIO (bloqueio de produção) — CSP ampla e ausência deliberada de proteção contra framing

**CONFIRMADO NO CÓDIGO:** a política permite `script-src 'self' 'unsafe-inline' https:`, `style-src 'unsafe-inline'`, `img-src https:` e `connect-src https:` (`server/security/contentPolicy.ts:3-15`). O middleware também comenta que não define `frame-ancestors`/`X-Frame-Options` para preservar embedding no Preview (`server/_core/index.ts:18-24`). O HTML carrega fonte externa e script de configuração público (`client/index.html:8-16`).

**Condição/exposição atual:** o release atual não possui injeção de HTML de usuário identificada; React escapa os dados e o login não expõe operação financeira. A CSP, entretanto, aceita qualquer origem HTTPS para scripts/conexões e código inline, e a página pode ser enquadrada. Se existir XSS futuro, dependência externa comprometida ou framing de login, a política oferece defesa limitada. O embedding é decisão explícita do Preview, não uma exploração comprovada no mockup.

**RECOMENDAÇÃO — não implementado atualmente:** para uma versão autenticada, adotar nonce/hash por resposta, hosts exatos em `script-src`/`connect-src`/`img-src`, remover `unsafe-inline` quando viável e definir `frame-ancestors`/proteção de framing compatível com a origem oficial do Preview. A lista de origens permitidas e o modelo de embedding precisam ser confirmados com a infraestrutura.

### R-03 — MÉDIO — Estado demo persiste após logout e não é adequado para registros reais

**CONFIRMADO NO CÓDIGO:** o `DemoProvider` grava o estado completo no `localStorage` após cada alteração (`client/src/contexts/DemoStore.tsx:10,408-418`), e a inicialização o lê novamente (`client/src/contexts/DemoStore.tsx:26-37`). O logout só revoga a sessão demo, limpa CSRF e altera o status em memória; não remove `pmaisfinanceiro:demo:v1` (`client/src/contexts/DemoAccess.tsx:90-99`). O próprio modelo contém títulos, liquidações, projetos, orçamento e movimentos demonstrativos (`client/src/lib/demoModel.ts:143-195`).

**Condição/exposição atual:** o conteúdo atual é sintético, e não há token/credencial no `localStorage`; o impacto corrente é outro usuário do mesmo perfil do navegador poder reabrir alterações demo anteriores após um logout. Se o store for reaproveitado com dados financeiros reais, qualquer script com acesso à origem, perfil compartilhado ou cópia do perfil poderá ler/modificar a base local sem controle corporativo, expiração, auditoria ou isolamento por usuário.

**RECOMENDAÇÃO — não implementado atualmente:** manter dados financeiros reais exclusivamente no servidor com autorização por registro; para o mockup, decidir e implementar limpeza no logout/expiração ou declarar explicitamente a retenção demo. Não usar `localStorage` como persistência corporativa, mesmo com validação de schema.

### R-04 — MÉDIO — Sessões, CSRF e rate limit são apenas memória do processo

**CONFIRMADO NO CÓDIGO:** sessões, desafios CSRF e tentativas vivem em `Map` locais, e a janela global é uma variável do processo (`server/security/demoAccess.ts:24-28`). A limpeza só ocorre quando uma requisição passa pelo router demo (`server/security/demoAccess.ts:38-42,63-67`). Não há Redis, tabela de sessão, armazenamento compartilhado ou tratamento de restauração após restart. O README confirma que reiniciar/substituir a instância exige entrar novamente (`README.md:17-19`).

**Condição/exposição atual:** restart invalida todas as sessões e desafios; duas réplicas podem não reconhecer a mesma sessão e podem aplicar rate limit de forma diferente. O comportamento é aceitável para uma demonstração de processo único e não há dados financeiros persistidos por essa sessão. Em produção, causa indisponibilidade, logout inesperado e proteção de abuso inconsistente.

**RECOMENDAÇÃO — não implementado atualmente:** usar armazenamento compartilhado com TTL para sessão/desafio e um rate limiter distribuído, ou impor explicitamente uma única instância/afinidade e monitorar essa restrição; documentar rotação/revogação e comportamento de restart.

### R-05 — MÉDIO — Chave de rate limit depende do IP observado pelo proxy

**CONFIRMADO NO CÓDIGO:** a chave por cliente é `digest(req.ip || req.socket.remoteAddress || "unknown")`; os limites por chave e global são aplicados em seguida (`server/security/demoAccess.ts:90-97`). O bootstrap Express não define `app.set("trust proxy", ...)` nem outro resolvedor de IP confiável (`server/_core/index.ts:14-27`).

**A CONFIRMAR:** qual endereço o ingress/Preview entrega a `req.ip`, se o proxy reescreve `X-Forwarded-For`, e se há balanceamento entre instâncias. Sem essa confirmação, não se deve afirmar que a chave representa o IP real do usuário.

**Condição/exposição atual:** atrás de um proxy que apresente um IP compartilhado, usuários legítimos podem consumir juntos o limite de dez tentativas, ou a proteção pode não distinguir clientes da forma esperada. A janela global de trinta tentativas por processo ainda limita o volume, mas não é distribuída. Não é bypass comprovado no ambiente sem teste de rede.

**RECOMENDAÇÃO — não implementado atualmente:** configurar explicitamente a cadeia de proxies confiáveis e extrair somente o endereço validado pelo ingress; preferir rate limit distribuído por identidade/IP normalizado, com observabilidade de bloqueios sem registrar senha ou tokens.

### R-06 — BAIXO — Defesa CSRF não usa validação explícita de Origin/Referer

**CONFIRMADO NO CÓDIGO:** login/logout recusam `Sec-Fetch-Site === "cross-site"` e exigem o desafio armazenado no servidor, cookie e header (`server/security/demoAccess.ts:51-56,82-85,112-115`). Não há checagem de `Origin` ou `Referer` no fluxo.

**Condição/exposição atual:** o double-submit vinculado ao hash de sessão e o cookie HttpOnly tornam o fluxo atual resistente ao CSRF cross-site comum; não foi identificada exploração atual. A ausência de uma segunda validação deixa dependência de navegadores/proxies que possam omitir ou alterar Fetch Metadata e torna o controle menos explícito para uma futura mutação.

**RECOMENDAÇÃO — não implementado atualmente:** validar `Origin` contra uma allowlist de origens oficiais quando presente, rejeitar origens inesperadas e tratar ausência de metadados conforme a política de deployment; preservar a rotação e vinculação de desafio atuais.

### R-07 — MÉDIO em desenvolvimento — Coletor de debug captura requisições/respostas e não mascara explicitamente CSRF

**CONFIRMADO NO CÓDIGO:** em desenvolvimento, o plugin injeta `debug-collector.js` (`vite.config.ts:81-97`) e aceita POST para `/__manus__/logs`, gravando buffers em arquivos locais sem autenticação ou limite de corpo no middleware mostrado (`vite.config.ts:99-147`). O coletor captura headers e corpo de requests (`client/public/__manus__/debug-collector.js:531-569`) e clona/captura corpos textuais de respostas (`client/public/__manus__/debug-collector.js:629-648`). A sanitização mascara chaves contendo `password`, `token`, `secret`, `key`, `authorization`, `cookie` ou `session` (`client/public/__manus__/debug-collector.js:97-106,149-160`), mas `csrf` e `x-pmais-csrf` não estão nessa lista (`client/src/contexts/DemoAccess.tsx:54-60`).

**Condição/exposição atual:** o plugin não é injetado quando `NODE_ENV === "production"` (`vite.config.ts:81-84`), e nenhum `.manus-logs` foi lido. Em desenvolvimento, o corpo da sessão pode conter o desafio CSRF e o header das ações o envia; esses valores podem ficar no buffer/log local. O coletor também pode registrar texto de respostas e aceitar payload grande no endpoint de debug, criando risco de confidencialidade local e consumo de memória se o ambiente de desenvolvimento for compartilhado ou exposto.

**RECOMENDAÇÃO — não implementado atualmente:** desabilitar o coletor em qualquer ambiente acessível a terceiros; mascarar `csrf`, `x-pmais-csrf` e todos os corpos de endpoints de autenticação por allowlist negativa; impor limite de bytes, rate limit e origem/autorização ao endpoint de debug; nunca persistir senha, token, cookie, CSRF ou resposta de identidade.

### R-08 — BAIXO/MÉDIO (produção) — Stack de erro é renderizada ao usuário e pode revelar detalhes internos

**CONFIRMADO NO CÓDIGO:** o `ErrorBoundary` salva o objeto `Error` e renderiza `this.state.error?.stack` diretamente em `<pre>` (`client/src/components/ErrorBoundary.tsx:14-21,24-39`). React faz escape textual, mas a stack pode revelar nomes de arquivos, chunks, caminhos de build, mensagens de integração e detalhes internos.

**Condição/exposição atual:** não há evidência de que essa tela contenha segredo por si só, e o texto não é inserido como HTML. Porém, qualquer erro não tratado torna detalhes de implementação visíveis no navegador; o coletor de debug também registra stack em eventos de erro (`client/public/__manus__/debug-collector.js:506-525`).

**RECOMENDAÇÃO — não implementado atualmente:** ocultar stack em produção e mostrar apenas mensagem genérica/correlation ID; enviar detalhes somente a telemetria aprovada, com redaction, retenção e acesso controlados.

### R-09 — BAIXO — Nem toda mutação local aplica os mesmos limites do schema de reidratação

**CONFIRMADO NO CÓDIGO:** o schema reidratado limita `code` a 50 caracteres e linhas a 2.500 (`client/src/lib/demoValidation.ts:10-15`), e estado incompatível é descartado (`client/src/lib/demoValidation.ts:37-43`). Porém, criação de categoria, centro e projeto constrói códigos a partir de entrada sem limite equivalente antes do `dispatch` (`client/src/contexts/DemoStore.tsx:234-252`); o nome é truncado por `withDemoLabel`, mas os códigos podem exceder o limite do schema.

**Condição/exposição atual:** um usuário pode criar uma entrada sintética de código excessivo; o estado pode funcionar na aba atual e ser rejeitado no próximo carregamento, retornando às fixtures. É perda/integridade de dados demo local, não injeção no servidor, pois não há endpoint que aceite esse estado.

**RECOMENDAÇÃO — não implementado atualmente:** aplicar o mesmo schema/limite na fronteira de cada mutação e apresentar erro antes de persistir; usar migração/backup de estado demo para não descartar todo o store após uma entrada inválida.

### R-10 — MÉDIO (misconfiguração) — `PMAIS_DEMO_LOCAL_HTTP=1` desativa Secure e muda SameSite

**CONFIRMADO NO CÓDIGO:** o bootstrap passa `localHttp: process.env.PMAIS_DEMO_LOCAL_HTTP === "1"` (`server/_core/index.ts:26-28`), e essa opção produz cookie sem `Secure` e com `SameSite=Lax`; sem a opção, usa `Secure`, `SameSite=None` e `Partitioned` (`server/security/demoAccess.ts:29-35`). O Dockerfile define `NODE_ENV=production`, mas não impede que uma variável de ambiente externa seja adicionada (`Dockerfile:8-12`).

**A CONFIRMAR:** configuração efetiva do ambiente Preview/produção e política do ingress para garantir que `PMAIS_DEMO_LOCAL_HTTP` nunca seja definido fora de loopback HTTP local.

**Condição/exposição atual:** em HTTP local explícito, a redução é intencional para permitir desenvolvimento. Se a mesma flag escapar para Preview/produção, o cookie de sessão deixa de ter `Secure` e a política muda; isso contradiz o uso HTTPS/iframe esperado e aumenta exposição em transporte inadequado. Não é fato que a flag esteja ligada no ambiente auditado.

**RECOMENDAÇÃO — não implementado atualmente:** falhar ao iniciar ou ignorar `localHttp` quando `NODE_ENV=production`/host não-localhost; separar configuração de teste local da configuração de release e testar os atributos efetivos no ingress.

### R-11 — MÉDIO condicionado à ativação futura — Proxy de storage não tem autorização nem allowlist de chave

**CONFIRMADO NO CÓDIGO:** `registerStorageProxy` atenderia qualquer `GET /manus-storage/*`, extrairia o wildcard e pediria URL assinada para a chave recebida, sem verificar sessão, organização, papel, prefixo permitido ou propriedade (`server/_core/storageProxy.ts:4-24,35-47`). Os helpers também normalizam somente barras iniciais e aceitam chave fornecida pelo chamador (`server/storage.ts:20-22,74-97`). Entretanto, essa função não é registrada em `server/_core/index.ts:1-57`; os únicos usos encontrados são definições/testes, e a marca usa essa URL com fallback local (`client/src/components/AppShell.tsx:119-132`).

**Condição/exposição atual:** o proxy de storage não é uma rota ativa no servidor atual; não há IDOR/BOLA explorável por ele neste release. O caminho mostrado no AppShell pode falhar e cair no fallback estático. Se o proxy for montado com objetos reais, uma chave arbitrária fornecida pelo cliente poderia transformar-se em leitura assinada de objeto de outro escopo, dependendo das permissões do backend Forge.

**RECOMENDAÇÃO — não implementado atualmente:** antes de ativar storage, exigir autenticação e autorização por objeto/tenant, validar uma allowlist de prefixos e caracteres, impedir traversal/escapes e emitir URL assinada somente para objeto já autorizado; registrar o proxy explicitamente apenas com esses controles. **A CONFIRMAR:** política de autorização do Forge para `presign/get`.

### R-12 — MÉDIO condicionado à ativação futura — Persistência de usuário aceita `role` do chamador interno

**CONFIRMADO NO CÓDIGO:** `upsertUser` copia `user.role` quando fornecido e só aplica `admin` automaticamente para `OWNER_OPEN_ID` quando o papel não foi fornecido (`server/db.ts:21-60`). A busca por usuário usa Drizzle/MySQL com igualdade parametrizada e `limit(1)` (`server/db.ts:79-88`). O caminho que chama DB está no SDK OAuth legado (`server/_core/sdk.ts:294-325`), mas OAuth não é registrado e o contexto ativo não autentica usuário (`server/_core/index.ts:43-44`; `server/_core/context.ts:10-13`).

**Condição/exposição atual:** não há endpoint atual em que um cliente possa fornecer `role`; admin/financeiro continuam 503. Não há escalada BOLA/role explorável no release. Se uma mutação futura passar entrada de usuário diretamente para `upsertUser`, o campo de papel será uma fronteira de escalada.

**RECOMENDAÇÃO — não implementado atualmente:** remover `role` de payloads externos, definir mudança de papel apenas em serviço administrativo autorizado, exigir auditoria e aplicar autorização server-side em cada query/mutação; nunca confiar em `ownerOpenId` como substituto de política corporativa.

### R-13 — BAIXO condicionado à ativação — Erros de DB/storage/integrações podem carregar detalhes em logs

**CONFIRMADO NO CÓDIGO:** o driver de banco registra o objeto de erro em conexão/upsert (`server/db.ts:9-18,70-75`); o proxy de storage registra status e corpo de erro upstream (`server/_core/storageProxy.ts:28-31,43-45`); helpers de storage propagam texto upstream em erros (`server/storage.ts:47-53,90-96`). As funções externas de LLM/imagem/notificação usam chave somente no servidor, mas também podem incluir detalhe de resposta em exceções/logs (`server/_core/llm.ts:405-419,441-452`; `server/_core/imageGeneration.ts:82-86`; `server/_core/notification.ts:99-112`).

**Condição/exposição atual:** essas superfícies não estão montadas em `appRouter`/bootstrap atual; o endpoint de status usa `SELECT 1`, timeout e resposta pública sem DSN/erro de driver (`server/services/deployment.ts:18-43,66-68`). Não foram lidos logs. O risco só se materializa se módulos legados forem ativados com logs acessíveis ou com upstream que devolva DSN/URL assinada/detalhes sensíveis.

**RECOMENDAÇÃO — não implementado atualmente:** aplicar redaction estruturada, códigos/correlation IDs públicos e logs privados com retenção/acesso controlados; nunca concatenar corpo upstream, DSN, URL assinada, parâmetros SQL ou credenciais em log sem filtragem.

## 4. IDOR/BOLA, escalada e operações financeiras

### 4.1 Situação atual

**CONFIRMADO NO CÓDIGO:** não há recursos financeiros reais, tenants, usuários financeiros autenticados ou endpoints CRUD de negócio ativos. `readOnlyGuard` bloqueia prefixos protegidos e toda requisição de escrita em `/api` com 503 (`server/security/readOnlyGuard.ts:3-20`). Os procedimentos `finance.*`, `admin.*` e `auth.*` chamam `unavailable()` (`server/routers.ts:12-32`). O status de deployment informa `mode: "read_only"`, `accessEnabled: false`, `businessDataEnabled: false` e `connect.validated: false` (`server/services/deployment.ts:4-12,45-63`).

Os IDs do DemoStore (`party-demo-*`, `title-demo-*`, `bank-demo-*`) são identificadores de objetos em um estado do próprio navegador (`client/src/lib/demoModel.ts:11-59,117-142`). As mutações recebem IDs, mas alteram somente a cópia local em memória, sem consulta a outro usuário, empresa, conta bancária ou documento (`client/src/contexts/DemoStore.tsx:100-179,214-404`). Um usuário demo pode alterar seus próprios dados sintéticos; isso não constitui BOLA entre recursos reais.

### 4.2 Conclusão de aplicabilidade

Não foi encontrada exploração atual de IDOR/BOLA ou escalada de privilégio porque o servidor não expõe recursos reais/roles nem executa operações financeiras. A ausência de autorização por recurso, tenant e papel é **bloqueio para produção**, não uma vulnerabilidade explorável neste mockup. Ao criar recursos reais, a autorização deverá ocorrer no servidor usando identidade, tenant e escopo do objeto em toda leitura, exportação, mutação e storage; não basta esconder controles na UI ou validar um ID recebido do cliente. **RECOMENDAÇÃO — não implementado atualmente.**

## 5. Inputs, XSS e exportação CSV

### 5.1 Entradas HTTP do acesso

**CONFIRMADO NO CÓDIGO:** o endpoint usa `express.json({ limit: "2kb" })` (`server/_core/index.ts:27-28`), verifica JSON, tipos, username de até 32 e senha de até 256 (`server/security/demoAccess.ts:82-89`). A senha não é colocada no estado/localStorage pelo cliente; o formulário mantém-na apenas em state React (`client/src/pages/Login.tsx:22-29,183-191`) e o POST usa credenciais de inclusão para o cookie (`client/src/contexts/DemoAccess.tsx:54-60`).

### 5.2 Estado demo e renderização

**CONFIRMADO NO CÓDIGO:** a store prefixa entradas textuais com `DEMO`, trunca nomes para 160 e valida datas/valores/relações antes de persistir/reidratar (`client/src/contexts/DemoStore.tsx:38-45,225-271`; `client/src/lib/demoValidation.ts:10-15,37-78`). Os valores são interpolados em JSX textual nas tabelas e mensagens; não há `innerHTML`/`outerHTML` para conteúdo de usuário no código ativo pesquisado. O uso de `dangerouslySetInnerHTML` do chart gera somente `<style>` a partir de `ChartConfig` (`client/src/components/ui/chart.tsx:70-99`), devendo permanecer separado de entrada externa.

### 5.3 CSV

**CONFIRMADO NO CÓDIGO:** `csvCell` transforma todo valor em texto, protege strings iniciadas por `=`, `+`, `-`, `@`, duplica aspas e envolve células em aspas (`client/src/pages/demo/DemoReportsPage.tsx:145-149`). O relatório contém apenas campos derivados do `DemoState`, prefixados por banner “MOCKUP DEMO” (`client/src/pages/demo/DemoReportsPage.tsx:48,151-156,383-412`), cria Blob local e revoga a URL (`client/src/pages/demo/DemoReportsPage.tsx:413-420`). Não foi identificado risco atual de fórmula CSV. **A CONFIRMAR:** se futuros campos exportáveis vierem de fontes reais, a mesma função deverá ser obrigatória para todas as colunas, inclusive cabeçalhos e fórmulas derivadas.

## 6. Persistência, memória, cleanup e restart

- **CONFIRMADO NO CÓDIGO:** `localStorage` é a única persistência do estado demo; em falha de quota/indisponibilidade o app continua em memória e mostra aviso (`client/src/contexts/DemoStore.tsx:408-418`). Isso não é banco nem backup. O estado é rejeitado se falhar a validação (`client/src/contexts/DemoStore.tsx:26-37`).
- **CONFIRMADO NO CÓDIGO:** o listener `storage` valida o novo valor antes de despachar `RESET` e é removido no unmount (`client/src/contexts/DemoStore.tsx:419-430`).
- **CONFIRMADO NO CÓDIGO:** `DemoAccessProvider` limpa intervalo/foco e usa `mounted` para não atualizar state após unmount (`client/src/contexts/DemoAccess.tsx:18-20,45-51`).
- **CONFIRMADO NO CÓDIGO:** mapas de sessão/desafio/tentativa são limpos por requisição e têm limites de login/sessões/desafios (`server/security/demoAccess.ts:38-42,74-80,90-97`). Porém, enquanto não chega nova requisição, entradas expiradas podem permanecer no heap; não há timer de expurgo nem armazenamento externo. Isso integra R-04.
- **CONFIRMADO NO CÓDIGO:** `Map.tsx` remove o `<script>` após `load`, mas não o remove no callback de erro (`client/src/components/Map.tsx:89-107`). O componente não tem uso encontrado fora da própria definição; é uma observação de higiene de memória futura, não uma exploração atual.
- **CONFIRMADO NO CÓDIGO:** o processo encerra em erro de bind/inicialização e não tenta continuar parcialmente (`server/_core/index.ts:51-57`); o restart, contudo, perde os Maps de sessão conforme R-04.

## 7. CSP, erros e configuração pública

### 7.1 Configuração pública

**CONFIRMADO NO CÓDIGO:** somente quatro valores nomeados são serializados (`MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_API_URL`, `MANUS_API_BROWSER_KEY`); o JSON escapa `<` antes de virar script (`server/_core/publicConfig.ts:1-13`). A rota é servida como JavaScript e fica atrás do cabeçalho `/api` `no-store` (`server/_core/index.ts:26,40-42`). O teste confirma que `MANUS_API_KEY`, `MANUS_JWT_SECRET` e `DATABASE_URL` não entram no script (`server/platform.test.ts:10-21`).

**A CONFIRMAR:** `MANUS_API_BROWSER_KEY` é deliberadamente público para browser/Maps; é necessário confirmar no provedor que está limitado por origem, API e quota. O código não pode impedir abuso de uma chave pública se o provedor estiver configurado sem restrições.

### 7.2 Segredos e ambiente

**CONFIRMADO NO CÓDIGO:** `server/_core/env.ts:2-12` mantém chaves de API, segredo JWT, DB, OAuth e owner ID como getters de `process.env`; `publicConfig` não serializa esse conjunto. O Docker instala/builda e inicia `dist/index.js` como `NODE_ENV=production` (`Dockerfile:1-12`). O arquivo `.env*` não foi aberto.

O legado OAuth/SDK contém JWT assinado HS256 e valida `appId`/secret, mas não é registrado na aplicação atual (`server/_core/sdk.ts:156-232,259-325`; `server/_core/index.ts:43-44`). Não tratar esse código legado como autenticação ativa.

## 8. Banco, queries e driver

**CONFIRMADO NO CÓDIGO:** Drizzle usa `drizzle-orm/mysql2` (`server/db.ts:1-4`), cria a instância apenas se `DATABASE_URL` existir e retorna `null` se não puder inicializar (`server/db.ts:6-18`). A única tabela do schema é `users` (`drizzle/schema.ts:8-28`). A busca usa `eq(users.openId, openId)` e `limit(1)`, sem SQL concatenado (`server/db.ts:79-88`).

O único probe ativo é `mysql2/promise` com pool de até duas conexões, timeout de conexão/query e `SELECT 1`; não lê schema nem dados (`server/services/deployment.ts:18-43`). O endpoint público traduz falha para `503 status_unavailable` sem retornar DSN/credenciais/erro do driver (`server/_core/index.ts:36-38`). Não existem queries de títulos, pagamentos, contas, auditoria ou organizações ativas.

**A CONFIRMAR:** credenciais, TLS, restrição de rede e usuário de banco pertencem à infraestrutura e não foram testados. Antes de ligar o banco corporativo, validar least privilege, TLS, pool/timeouts, migrações e autorização por tenant; nenhuma dessas garantias decorre do mockup atual.

## 9. Storage e módulos externos

**CONFIRMADO NO CÓDIGO:** existem helpers de presign/upload/download, LLM, imagem, voz, mapa e notificação no repositório, mas a busca de imports ativos mostra que são definições legadas/testes; não há montagem de `registerStorageProxy`, `registerOAuthRoutes`, `systemRouter`, `generateImage`, `invokeLLM`, `transcribeAudio` ou `MapView` no fluxo atual. O `appRouter` contém apenas deployment e stubs indisponíveis (`server/routers.ts:12-35`).

O logo usa primeiro `/manus-storage/...` e cai para `/brand/Logo2025_branco.png` em erro (`client/src/components/AppShell.tsx:119-132`); a cópia local está em `client/public/brand/Logo2025_branco.png`. Não foi tratado o helper de storage como proteção ativa. R-11 e R-13 registram as condições que devem ser resolvidas antes de ativação.

## 10. Fontes e fixtures públicas

**CONFIRMADO NO CÓDIGO:** as fixtures são explicitamente prefixadas `DEMO`, contêm fornecedores/clientes fictícios, projetos, títulos e movimentos `source: "simulado"` (`client/src/lib/demoModel.ts:143-195`). As telas repetem que são sintéticos e não há operação real (`client/src/pages/demo/DemoReportsPage.tsx:430-449,659-662`; `client/src/components/AppShell.tsx:210-227`). A documentação de execução também declara que não há banco financeiro, pagamento, Pix, Connect, identidade individual, MFA ou auditoria financeira (`README.md:5-19,35-39`).

O manifesto público de rotas contém somente rotas de interface; documentos internos não são montados como páginas pela aplicação (`README.md:31-33`; `server/_core/vite.ts:51-73`). Não foram encontrados CPF, chave Pix completa, comprovante real, senha, token ou DSN nos arquivos de fonte considerados neste escopo. `.env*` e `.manus-logs/` permaneceram fora da leitura conforme restrição.

## 11. A CONFIRMAR com infraestrutura/operadores

1. O ingress/Preview entrega HTTPS fim a fim e não define `PMAIS_DEMO_LOCAL_HTTP=1` em produção; confirmar atributos reais `Secure`, `SameSite=None`, `Partitioned` e comportamento de cookies de terceiros.
2. A cadeia de proxy e a resolução de `req.ip` são conhecidas; configurar `trust proxy` somente para saltos confiáveis e validar o rate limit sem confiar em cabeçalho forjado.
3. As origens de embedding permitidas no Preview são conhecidas; definir allowlist de framing e CSP de produção.
4. A `MANUS_API_BROWSER_KEY` pública está restrita por origem, APIs e quota no provedor; chaves server-only nunca são injetadas no bundle.
5. O banco, quando configurado, usa TLS, least privilege, rede restrita, pool/timeouts e credenciais fora do repositório; o probe atual só comprova conectividade de `SELECT 1`.
6. Se storage for ativado, o Forge aplica autorização por objeto/prefixo e não apenas assina qualquer `path`; testar traversal, cross-tenant e revogação de URL.
7. O coletor de debug não está disponível para usuários/terceiros em Preview/produção e o endpoint de desenvolvimento não fica exposto publicamente.
8. Há apenas uma instância ou existe sessão/rate limit compartilhado; sem isso, R-04 permanece bloqueio operacional.

## 12. Conclusão da barreira

**Estado atual:** o sistema está protegido como mockup de demonstração: páginas demo exigem sessão separada, operações financeiras/admin permanecem 503, tRPC não autentica usuário e o estado é sintético/local. Não foi identificada exploração atual de IDOR/BOLA, XSS via entradas demo ou fórmula CSV.

**Riscos que impedem produção:** identidade compartilhada sem MFA/roles, persistência local, CSP/frame permissivos, memória de processo para sessão/rate limit, configuração HTTP local escapável, debug collector em ambiente exposto e módulos de DB/storage legados sem autorização por objeto. Todos exigem implementação e validação; nenhum foi tratado como já entregue.
