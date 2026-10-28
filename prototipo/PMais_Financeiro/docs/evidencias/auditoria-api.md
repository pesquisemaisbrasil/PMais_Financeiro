# EVIDÊNCIA DE AUDITORIA — Backend e contratos HTTP/tRPC

**Domínio:** Backend, acesso demo e contratos HTTP/tRPC
**Repositório auditado:** `<raiz-do-repositorio>`
**Base informada:** `81bc243`
**Status deste artefato:** evidência de auditoria; não é documentação final nem autorização para habilitar operações.

## Escopo, método e convenções

A leitura foi concentrada em fontes `.ts/.tsx/json/config/md` do bootstrap Express, contexto/tRPC, segurança, serviço de deployment, cliente de acesso e helpers legados citados. Não foram lidos arquivos `.env*` nem `.manus-logs`; nenhum valor de senha, hash, token, cookie, DSN ou segredo é reproduzido. As marcações significam:

- **CONFIRMADO NO CÓDIGO:** fato observável na revisão da fonte atual.
- **A CONFIRMAR:** depende de configuração/ambiente/runtime ou de decisão externa; não foi inferido.
- **RECOMENDAÇÃO — NÃO IMPLEMENTADO ATUALMENTE:** endurecimento ou evolução sugerida, não uma feature existente.

Textos históricos e exemplos de implementação não foram tratados como feature montada. Em particular, a existência de helpers OAuth/LLM/storage ou de exemplos tRPC não prova que exista endpoint correspondente.

## 1. Montagem efetiva e ordem de middleware

**CONFIRMADO NO CÓDIGO.** O servidor é criado em `server/_core/index.ts:14-16`, desabilita `x-powered-by` (`:17`) e instala primeiro cabeçalhos de segurança globais (`:18-25`): `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` e CSP de `contentPolicy(...)`. Não há `X-Frame-Options`; o comentário da própria fonte mantém a possibilidade de embedding do Preview (`:22`).

Em seguida, todo `/api` recebe `Cache-Control: no-store` (`index.ts:26`). O acesso demo é montado **antes** do guard somente-leitura (`:27-32`): `express.json({ limit: "2kb" })` e o router retornado por `createDemoAccess(...)`. O handler de erro imediatamente posterior transforma erros do parser/router demo em HTTP 400 genérico (`:29-32`).

Depois vem `readOnlyGuard` (`index.ts:33`), somente então o parser JSON geral de 16 KiB (`:34`), as rotas de health/deployment/config (`:35-42`), o adaptador tRPC (`:44`) e o fallback de `/api` 404 (`:45`). O guard de páginas demo (`demoAccess.requirePage`) só é montado depois das rotas API (`:47`), antes do Vite ou dos arquivos estáticos (`:48-49`). Portanto, o mount do demo não substitui o bloqueio de APIs administrativas/financeiras; ele apenas antecede o guard para que seus três POST/GET próprios possam funcionar.

A porta é obtida de `PORT` ou de um default interno, validada como inteiro entre 1 e 65535, e o servidor escuta em `0.0.0.0` (`index.ts:51-54`). O tratamento de erro de bind e o `catch` de inicialização apenas emitem mensagens genéricas e encerram o processo (`:53,57`). **A CONFIRMAR:** valores de ambiente e porta efetivos do runtime não foram inferidos nem lidos de `.env`.

### CSP atual

**CONFIRMADO NO CÓDIGO.** `server/security/contentPolicy.ts:3-15` produz `default-src 'self'`, `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`, `script-src 'self' 'unsafe-inline' https:`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com`, `img-src 'self' data: https:`, `connect-src 'self' https:` e, em desenvolvimento, também `ws: wss:`, além de `manifest-src 'self'`. A própria fonte qualifica a política como release read-only, não como allowlist/nonce estrita final (`:1-2`).

## 2. Endpoints HTTP efetivamente montados

### 2.1 Acesso demo — `/api/demo-access`

**CONFIRMADO NO CÓDIGO.** O router efetivo é montado em `server/_core/index.ts:27-32`; os paths relativos estão em `server/security/demoAccess.ts:68-124`. A sessão é uma sessão de demonstração por processo, não uma identidade financeira ou autorização de papel (`demoAccess.ts:24-27`).

#### `GET /api/demo-access/session`

- **Entrada:** sem body obrigatório; lê os cookies de sessão e CSRF via `Cookie` (`demoAccess.ts:15-17,43-50,68-80`). Não usa query. O cliente chama com `credentials: "include"` e `cache: "no-store"` (`client/src/contexts/DemoAccess.tsx:23-26`).
- **Configuração:** sem verificador configurado, responde **503** `{ ok:false, code:"demo_access_not_configured", message:"Acesso à demonstração ainda não configurado." }` (`demoAccess.ts:68-70`). O fato de a configuração existir no ambiente é **A CONFIRMAR**.
- **Cookie de sessão:** o nome é `pmais_demo_session` (`:5`). O valor recebido só é aceito se tiver 64 caracteres hexadecimais minúsculos; o servidor calcula um digest e procura a entrada na `Map` em memória, removendo-a se expirada (`:43-50`). O valor em si não é documentado aqui.
- **Cookie/desafio CSRF:** o nome é `pmais_demo_csrf` (`:6`). Se não houver desafio válido, ou se ele não estiver ligado ao hash de sessão atual, cria um novo valor aleatório, armazena somente o digest com expiração de 20 minutos e o envia por `Set-Cookie` (`:71-78`). Se já houver cookie de sessão, mas ele não corresponder a sessão viva, o cookie de sessão é limpo (`:79`). A partir de 2.000 desafios em memória, responde **429** `{ok:false, code:"demo_access_busy", message:"Tente novamente em alguns minutos."}` (`:73-75`).
- **Resposta normal:** HTTP **200** com `{ authenticated: boolean, login: "adm" | null, scope: "demo_only", csrf: string, expiresAt: number | null }` (`:80`). O campo `csrf` é entregue ao cliente para uso no header seguinte; nenhum valor é reproduzido nesta auditoria. `expiresAt` é o vencimento da sessão quando autenticado.
- **Validação de CSRF subsequente:** `demoAccess.csrf(...)` exige simultaneamente cookie CSRF em formato hex, header `X-Pmais-CSRF` exatamente igual ao cookie e desafio ainda válido ligado ao hash da sessão (`:51-56`).

#### `POST /api/demo-access/login`

- **Entrada:** body JSON com `username` e `password`, ambos strings; `username` máximo de 32 caracteres e `password` máximo de 256 (`demoAccess.ts:82-89`). Não há mínimo explícito no código. O parser específico do mount limita o body a 2 KiB (`index.ts:28`); erro de parse/limite cai no handler genérico 400 (`index.ts:29-32`).
- **Headers/CSRF:** exige `Content-Type` compatível com JSON, rejeita `Sec-Fetch-Site: cross-site` e exige o desafio CSRF válido para o hash de sessão atual (`demoAccess.ts:84-86`). Ausência/divergência responde **403** `{ok:false, code:"invalid_challenge", message:"Recarregue a tela antes de tentar entrar."}`.
- **Credencial:** o servidor deriva/verifica a senha com salt aleatório de processo e comparação resistente a timing (`:1,11-13,22-23,98-101`); o identificador aceito é exatamente `adm` (`:101`). Nenhuma identidade financeira, papel admin ou registro de usuário é criado por esse fluxo.
- **Dados inválidos:** tipos incorretos ou limites excedidos respondem **400** `{ok:false, code:"invalid_credentials", message:"Login ou senha inválidos."}` (`:87-89`). Senha inválida e identificador diferente usam a mesma resposta genérica e **401** (`:99-101`).
- **Rate limit/limites de memória:** por chave derivada de IP há no máximo 10 tentativas na janela de 5 minutos; globalmente, 30; também são rejeitados estados com 2.000 chaves de tentativa ou 1.000 sessões (`:9,90-97`). A rejeição é **429**, header `Retry-After: 300`, body `{ok:false, code:"too_many_attempts", message:"Muitas tentativas. Aguarde alguns minutos."}` (`:93-95`). A chave, não o IP bruto, fica na memória.
- **Sucesso:** invalida a sessão anterior capturada, cria nova sessão opaca em memória com expiração de 30 minutos, remove o desafio usado, envia cookie de sessão e retorna HTTP **200** `{ok:true}` (`:102-109`). O retorno não contém `scope`; o scope é confirmado pela leitura de sessão posterior.
- **Falha operacional:** erro durante derivação/verificação responde **503** `{ok:false, code:"demo_access_unavailable", message:"Não foi possível verificar o acesso. Tente novamente."}` (`:98-110`).

#### `POST /api/demo-access/logout`

- **Entrada:** body JSON (o cliente envia `{}`), `Cookie` e `X-Pmais-CSRF`. Rejeita `Sec-Fetch-Site: cross-site`; exige o mesmo triplo cookie/header/desafio (`demoAccess.ts:112-116`). Não usa query.
- **Falha CSRF:** **403** `{ok:false, code:"invalid_challenge", message:"Atualize a sessão antes de sair."}` (`:114-115`).
- **Sucesso:** remove a sessão em memória, remove o desafio, limpa os cookies de sessão e CSRF e retorna HTTP **200** `{ok:true}` (`:117-122`). A remoção do mapa revoga o token capturado no servidor, não apenas o cookie do navegador.
- **Observação:** não é `auth.logout` tRPC e não retorna `{success:true}`; são contratos distintos. O procedimento tRPC é inacessível/indisponível, conforme a seção 3.

#### Fallback e cookies do demo

`router.use` final responde **404** `{ok:false, code:"not_found", message:"Endpoint de acesso não disponível."}` para paths não montados sob o prefixo (`demoAccess.ts:124`). Erros encaminhados pelo parser/rotas ao handler de `/api/demo-access` retornam **400** `{ok:false, code:"invalid_request", message:"Não foi possível processar o acesso. Confira os campos."}` (`index.ts:29-32`). Todas as respostas sob `/api` e o router demo recebem `Cache-Control: no-store` (`index.ts:26`, `demoAccess.ts:63-66`).

Cookie attributes são construídos em `demoAccess.ts:29-35`: `HttpOnly`, `Path=/`; no modo normal, `Secure`, `SameSite=None`, `Partitioned`; no ramo explícito `localHttp`, `Secure=false`, `SameSite=Lax` e sem particionamento. A sessão tem max-age de 30 minutos e o desafio de 20 minutos (`:7-8,76-78,108,120-121`). **A CONFIRMAR:** se o ambiente de execução usa `PMAIS_DEMO_LOCAL_HTTP=1`; isso não deve ser presumido para Preview/produção.

#### Reinício, expiração e gate de páginas

**CONFIRMADO NO CÓDIGO.** `sessions`, `challenges`, `attempts`, o salt e o verificador são criados dentro de `createDemoAccess` (`demoAccess.ts:19-28`). Não há persistência distribuída nem endpoint de refresh do demo. Reiniciar/substituir o processo recria os mapas e invalida sessões/desafios antigos; o próximo `/session` reconhece o cookie como não autenticado e pode limpá-lo (`:38-50,79`). A sessão também expira independentemente de o cookie permanecer no navegador (`:48`).

`requirePage` protege somente `GET`/`HEAD` de `/`, `/demo`, `/fundacao`, `/modulos`, `/implantacao`, `/seguranca`, `/acesso` e `/documentacao`; sem sessão responde **302** para `/login`, com `Cache-Control: no-store` (`demoAccess.ts:10,126-131`). `/login` não está no regex e permanece acessível. O gate não se aplica a métodos diferentes de GET/HEAD (`:127`), e não é uma autorização de API.

### 2.2 Health

`GET /api/health` é montado em `server/_core/index.ts:35`. Não exige body, query, cookie ou header de autenticação e responde HTTP **200** com exatamente `{ status: "ok", mode: "read_only" }`. Qualquer método de escrita sob `/api` é interceptado pelo `readOnlyGuard` antes de chegar à rota (`index.ts:33-35`, `readOnlyGuard.ts:9-21`).

### 2.3 Estado de deployment

`GET /api/deployment/status` é montado em `server/_core/index.ts:36-39`. Não exige body/query/autorização. Em sucesso responde HTTP **200** com o objeto de `DeploymentStatus`:

```json
{
  "mode": "read_only",
  "application": "P+ Financeiro",
  "checkedAt": "<ISO-8601>",
  "database": { "state": "available|unavailable|not_configured" },
  "security": {
    "signingConfigured": true,
    "mfaConfigured": true,
    "accessEnabled": false
  },
  "connect": { "validated": false },
  "businessDataEnabled": false
}
```

O formato e os booleanos fixos são definidos em `server/services/deployment.ts:3-12,46-68`; o exemplo acima não contém valor de ambiente. O probe só verifica a existência de `DATABASE_URL` (`:19-21`) e, quando presente, executa `SELECT 1` com pool de no máximo 2 conexões e timeout de 4 segundos (`:27-31`). O resultado é cacheado por 10 segundos e chamadas concorrentes compartilham a mesma promessa (`:23-27,37-42`). Erro de conexão vira `database.state = "unavailable"` sem expor DSN/driver/credenciais (`:31-35`).

`signingConfigured` e `mfaConfigured` indicam apenas presença de variáveis de configuração nomeadas; não habilitam acesso (`:56-60`). `connect.validated`, `accessEnabled` e `businessDataEnabled` permanecem falsos (`:61-63`). Se `getDeploymentStatus()` lançar, o endpoint responde **503** `{code:"status_unavailable", detail:"Não foi possível verificar o ambiente. Tente novamente."}` (`index.ts:36-39`). **A CONFIRMAR:** o estado do banco e a presença dos gates no ambiente real.

### 2.4 Configuração pública do browser

`GET /api/platform/config.js` é montado em `server/_core/index.ts:40-42`, sem body/query/autorização. Responde `application/javascript` com `window.__MANUS_CONFIG__=<JSON>;`. O JSON contém somente `projectId`, `oauthPortalUrl`, `apiUrl` e `apiBrowserKey`, lidos por `publicPlatformConfig` (`server/_core/publicConfig.ts:1-8`); strings vazias são usadas quando ausentes. `<` é escapado como `\\u003c` antes do envio (`:11-14`). O arquivo não serializa `process.env` inteiro nem os segredos de servidor. O `Cache-Control: no-store` vem do mount `/api` (`index.ts:26`).

### 2.5 Fallback API e estáticos

`app.use("/api", ...)` em `server/_core/index.ts:45` responde **404** `{code:"not_found", detail:"Endpoint não disponível nesta etapa."}` para GET/HEAD/OPTIONS de API não atendida pelo que veio antes. Escritas de API não chegam a esse fallback: o guard as responde **503**.

Em desenvolvimento, `setupVite` monta middleware Vite e um fallback `app.use("*")` que responde HTML 200, ou 404 para `/404` (`server/_core/vite.ts:9-49`). Em produção, `serveStatic` monta `express.static`, uma rota explícita `GET /404` com status 404 e fallback HTML para os demais paths (`:51-73`). Esses mounts servem a aplicação web; não são endpoints de domínio financeiro. `registerStorageProxy` não é chamado, logo `/manus-storage/*` não é um endpoint efetivo desta montagem.

## 3. tRPC: paths, métodos, inputs e envelopes

### 3.1 Mount e contexto

**CONFIRMADO NO CÓDIGO.** O único mount tRPC é `app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }))` em `server/_core/index.ts:44`. O router efetivo está em `server/routers.ts:12-35`; não há merge de `systemRouter`. `createContext` retorna sempre `req`, `res` e `user: null` (`server/_core/context.ts:4-13`), sem leitura de cookie, Authorization ou sessão demo. Portanto, a sessão demo nunca se transforma em `ctx.user`.

O cliente configura `httpBatchLink` para `/api/trpc`, `superjson` e `credentials: "omit"` (`client/src/main.tsx:14-25`), mas a aplicação atual não possui chamada operacional tRPC: o status de deployment usa REST (`client/src/components/DeploymentStatus.tsx:71-91`) e as referências tRPC em showcase/helpers são exemplos. O provider, por si só, não cria endpoint adicional.

Não há `.input(...)` em nenhum procedimento de `appRouter` (`routers.ts:12-32`). Assim, não existe schema de body/query de domínio, nem validação de campos de login/admin/financeiro neste router; os resolvers não recebem nem utilizam input. O protocolo tRPC instalado parseia JSON e, quando usado, lê `input` na query para GET ou JSON no body para POST; isso é comportamento do adaptador, não validação de negócio (`node_modules/@trpc/server/src/unstable-core-do-not-import/http/contentType.ts:65-111`).

### 3.2 Inventário dos 14 procedimentos

Todos abaixo estão sob `/api/trpc/<path>` e são montados pelo adaptador, mas o sucesso só existe para `deployment.status`:

| Path tRPC | Tipo e método HTTP aceito pelo adaptador | Body/query e resultado no código atual |
|---|---|---|
| `deployment.status` | query; **GET** | Sem input; executa `getDeploymentStatus()` e responde 200 com status técnico. |
| `auth.me` | query; **GET** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `auth.login` | mutation; **POST** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `auth.refresh` | mutation; **POST** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `auth.logout` | mutation; **POST** | Sem input; anotação de retorno `{success:true}`, mas lança antes de retornar. |
| `auth.mfa` | mutation; **POST** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `admin.users` | query; **GET** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `admin.audit` | query; **GET** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `admin.createUser` | mutation; **POST** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `admin.updateUser` | mutation; **POST** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `finance.summary` | query; **GET** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `finance.list` | query; **GET** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `finance.create` | mutation; **POST** | Sem input; lança `SERVICE_UNAVAILABLE`. |
| `finance.confirm` | mutation; **POST** | Sem input; lança `SERVICE_UNAVAILABLE`. |

A definição exata dos resolvers e da mensagem está em `server/routers.ts:6-32`: `unavailable()` lança `TRPCError({ code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE_MESSAGE })`, e todas essas procedures são `publicProcedure`. Os exports `protectedProcedure` e `adminProcedure` existem em `server/_core/trpc.ts:13-45`, mas não são usados por esses paths; mesmo um contexto artificial de admin não bypassa o `unavailable`.

### 3.3 Métodos efetivos versus bloqueio global

O adaptador tRPC aceita query apenas em GET e mutation apenas em POST (`node_modules/@trpc/server/src/unstable-core-do-not-import/http/resolveResponse.ts:41-45`). A política da aplicação altera o alcance:

- **GET `/api/trpc/deployment.status`:** passa pelo guard e funciona.
- **GET das demais queries:** passa pelo guard, chega ao tRPC e retorna erro 503 no envelope tRPC.
- **POST de qualquer `/api/trpc/*`:** é recusado antes do tRPC pelo `apiWrite` do `readOnlyGuard` (`server/security/readOnlyGuard.ts:9-18`), com HTTP 503 e JSON simples de read-only, não envelope tRPC. Isso inclui todas as mutations e também uma tentativa POST de query.
- **GET de uma mutation:** passa pelo guard por ser GET, mas o adaptador retorna **405** `METHOD_NOT_SUPPORTED` em envelope tRPC; não executa a mutation.
- **HEAD `/api/trpc/*`:** o resolvedor instalado responde **204** sem corpo antes da resolução do procedimento (`resolveResponse.ts:213-217`).
- **PUT/PATCH/DELETE de `/api/trpc/*`:** o guard responde **503** simples por serem escritas de API. OPTIONS passa pelo guard, mas não há middleware CORS; o resultado depende do content-type/método recebido pelo adaptador ou do fallback, não constitui contrato CORS implementado.
- **Namespaces REST aparentes:** `/api/auth`, `/api/admin`, `/api/finance`, `/api/users`, `/api/payments`, `/api/audit`, `/api/contas`, `/api/connect`, `/api/uploads`, `/api/receipts`, `/api/token`, `/api/logout` não são mounts tRPC/Express dos routers; são prefixos bloqueados pelo guard se acessados diretamente.

### 3.4 Envelope real de sucesso/erro

O router é criado com `transformer: superjson` (`server/_core/trpc.ts:6-8`). Para uma chamada tRPC não batch de sucesso, o formato serializado é:

```json
{"result":{"data":{"json":<resultado>}}}
```

Por exemplo, o resultado de `deployment.status` é um objeto dentro de `result.data.json`; não é o JSON REST puro do endpoint `/api/deployment/status`.

Para `SERVICE_UNAVAILABLE`, o adaptador mapeia o código para HTTP 503 (`node_modules/@trpc/server/src/unstable-core-do-not-import/http/getHTTPStatusCode.ts:27-31`) e o shape contém código JSON-RPC `-32603`, chave textual, status e path (`getErrorShape.ts:19-35`). A forma efetiva esperada, sem stack de desenvolvimento e sem qualquer valor sensível, é:

```json
{
  "error": {
    "json": {
      "message": "Área protegida indisponível. A autenticação, o MFA e as operações financeiras estão adiados nesta etapa.",
      "code": -32603,
      "data": {
        "code": "SERVICE_UNAVAILABLE",
        "httpStatus": 503,
        "path": "auth.login"
      }
    }
  }
}
```

O `path` varia conforme a procedure. Em modo de desenvolvimento o shape pode incluir `data.stack`, porque o formatter instalado inclui stack quando `config.isDev` (`getErrorShape.ts:29-30`); essa stack não é evidência funcional nem foi reproduzida. `NOT_FOUND` segue a mesma estrutura com HTTP 404 e a mensagem de procedimento inexistente; `METHOD_NOT_SUPPORTED` usa HTTP 405 (`resolveResponse.ts:324-335`, `getHTTPStatusCode.ts:11-18`). Em batch, o protocolo retorna array de itens; status mistos podem resultar em 207 conforme o adaptador (`getHTTPStatusCode.ts:71-93`). O `httpBatchLink` está configurado, mas não há hook atual que o utilize para uma operação de negócio.

## 4. Bloqueios de namespace e método (`readOnlyGuard`)

**CONFIRMADO NO CÓDIGO.** `server/security/readOnlyGuard.ts:3-7` define os prefixes bloqueados, comparados em lowercase por igualdade ou subpath (`:9-12`): `/api/auth`, `/api/oauth`, `/api/admin`, `/api/users`, `/api/finance`, `/api/payments`, `/api/audit`, `/api/uploads`, `/api/receipts`, `/api/connect`, `/api/contas`, `/api/token`, `/api/logout`, `/integrations`, `/oauth`, `/token`, `/logout`.

Independentemente de cookie, sessão demo ou Authorization, qualquer prefixo acima retorna **503** `{code:"protected_area_unavailable", detail:"Área protegida indisponível. Configure e valide autenticação e MFA antes de habilitar operações."}` com `Cache-Control: no-store` e sem `next()` (`:13-20`). Além disso, qualquer método diferente de GET/HEAD/OPTIONS em qualquer path `/api/` é `apiWrite` e recebe o mesmo **503** (`:12-18`). Por isso o método POST exigido pelas mutations tRPC é inatingível pela montagem atual.

O guard não bloqueia por prefixo `/api/trpc`, o que permite queries GET chegarem ao tRPC; ele também não interpreta nem valida a sessão demo. **Conclusão confirmada:** `scope: demo_only` é gate de navegação/endpoint demo, não escopo de identidade no contexto tRPC nem autorização financeira.

## 5. Fluxo client-side de login/logout/refresh e fila

### Provider e refresh

`DemoAccessProvider` mantém `status` (`loading`, `authenticated`, `anonymous`, `error`, `unconfigured`), `expired`, o CSRF em `useRef`, o estado anterior de autenticação e uma fila por provider (`client/src/contexts/DemoAccess.tsx:4-20`). `readSession` faz `GET /api/demo-access/session` com cookies, sem cache, valida HTTP, `csrf` string e `authenticated` boolean, atualiza estado e marca `expired` somente quando uma sessão anteriormente autenticada passa a não autenticada (`:22-43`). `refresh` enfileira `readSession` (`:44`). Na montagem executa refresh; depois executa a cada 60 segundos e em `window.focus` (`:45-52`). Erro de configuração vira `unconfigured`; outros erros viram `error` e limpam o CSRF (`:27-41`).

`createAccessQueue` é uma fila de promessa simples: a operação seguinte aguarda a anterior terminar, seja sucesso ou falha, e uma falha não bloqueia a cauda (`client/src/lib/accessQueue.ts:1-7`). Isso serializa refreshes e os ciclos de login/logout dentro do mesmo provider.

### Login

`Login.tsx:22-29` consome `useDemoAccess`, começa com o identificador visual `adm` e guarda a senha somente no estado do formulário. Ao submeter chama `login(username,password)` (`:42-59`). O provider enfileira: (1) `readSession`; (2) verifica montagem/CSRF; (3) POST `/api/demo-access/login` com `credentials: include`, `Content-Type: application/json`, `X-Pmais-CSRF` e JSON com identificador aparado e senha (`DemoAccess.tsx:54-60,82-86`); (4) após `{ok:true}`, faz nova leitura de sessão e só confirma sucesso se o servidor declarar `authenticated` (`:87-89`).

Se recebe `invalid_challenge`, `action` faz uma única leitura de sessão e repete o POST, pois esse 403 não realizou mutação; não repete falha de rede nem credencial inválida (`DemoAccess.tsx:66-77`). Respostas não-OK ou `ok:false` são convertidas em `{ok:false, code, message}` (`:61-64`). Sessão autenticada redireciona `/login` para `/` (`Login.tsx:31-33`), e `ShellRoute` mantém páginas protegidas atrás do status (`client/src/App.tsx:27-31,35-53`).

### Logout

O botão do `AppShell` chama `logout()` (`client/src/components/AppShell.tsx:157-162,210-223`). O provider enfileira: (1) `readSession`; (2) exige CSRF; (3) POST `/api/demo-access/logout` via a mesma rotina; (4) em sucesso limpa refs/estado para anônimo, executa nova leitura de sessão e permite que `ShellRoute` redirecione para `/login` (`DemoAccess.tsx:90-100`). Falha exibe mensagem inline e não inventa logout (`AppShell.tsx:215-222`). Não existe chamada ao tRPC `auth.logout` nesse fluxo.

### Cliente tRPC e hook legado

O provider tRPC em `client/src/main.tsx:29-35` existe, mas seu fetch envia `credentials: "omit"` (`:18-23`); portanto não carrega os cookies do demo. `useAuth` é uma superfície de compatibilidade não operacional: devolve sempre `user: null`, `isAuthenticated: false`, `loading: false`, um erro de indisponibilidade e funções `refresh/logout` que lançam erro sem rede, OAuth, storage ou consulta de identidade (`client/src/_core/hooks/useAuth.ts:14-37`).

## 6. Helpers e routers legados não montados

**CONFIRMADO NO CÓDIGO.** A ausência abaixo foi verificada comparando os exports com os imports/mounts de `server/_core/index.ts` e `server/routers.ts`; não se deve converter seus comentários ou exemplos em endpoints:

- `server/_core/oauth.ts:13-65` exporta `registerOAuthRoutes(app)` e descreve `GET /api/oauth/callback`, com query `code/state`, cookie nonce e integração SDK. **Não é chamado no bootstrap.** Além disso, `/api/oauth` está no prefixo bloqueado por `readOnlyGuard` (`readOnlyGuard.ts:3-7`), portanto não há login OAuth funcional nesta base; mesmo um futuro mount exigiria revisar a ordem/gate.
- `server/_core/sdk.ts:31-356` contém cliente OAuth, troca de code/token, leitura de usuário, JWT/sessão e `authenticateRequest`. `context.ts` não o invoca e fixa `user: null` (`context.ts:10-13`). O cookie legado `webdev_app_session` em `shared/const.ts:1` não autentica o contexto atual.
- `server/_core/systemRouter.ts:5-29` exporta `systemRouter` com `health` tRPC que exigiria `timestamp` e `notifyOwner` protegido por `adminProcedure`. Ele não é importado/mesclado em `appRouter`; não confundir `systemRouter.health` com o endpoint REST `/api/health`.
- `server/_core/llm.ts:343-452` exporta `invokeLLM` e `listLLMModels`, fazendo chamadas de saída para serviço externo mediante configuração server-only. Não há procedure/rota em `appRouter` nem mount Express.
- `server/_core/notification.ts:66-114` exporta `notifyOwner`, usado apenas pelo `systemRouter` não montado; suas validações/limites não constituem endpoint público.
- `server/_core/storageProxy.ts:4-48` exporta `registerStorageProxy(app)` para um possível `GET /manus-storage/*`, mas `index.ts` não o chama. `server/storage.ts:31-97` contém helpers de presign/upload/download; não há endpoint de upload/download montado.
- `server/_core/dataApi.ts:16-64`, `imageGeneration.ts:43-167`, `voiceTranscription.ts:73-242`, `map.ts:54-89` e `heartbeat.ts` são helpers de integração/serviço. Exemplos que mencionam `trpc.voice.transcribe` ou `trpc.ai.chat` são comentários/UI de showcase, não paths presentes no `AppRouter`; nenhuma dessas funções está montada pelo bootstrap atual.

## 7. Conclusões, riscos e pendências

### CONFIRMADO NO CÓDIGO

1. O runtime é read-only para APIs: somente health, deployment status, configuração pública, acesso demo e queries tRPC chegam a seus handlers; escrita API é 503.
2. O único login funcional é o gate demo `adm`, condicionado à configuração de senha no servidor, com sessão opaca em memória, CSRF vinculado, rate limit e scope declarado `demo_only`.
3. A sessão demo não cria `User`, não preenche `ctx.user`, não habilita admin/finance e não bypassa prefixos bloqueados.
4. `deployment.status` é o único procedimento tRPC que pode produzir sucesso; as outras 13 procedures são adiadas e todas as mutations ficam barradas antes do adaptador por método.
5. OAuth, MFA, logout/refresh tRPC, auditoria, usuários, finance, Connect, LLM, notificações e storage de backend não constituem features HTTP montadas nesta base.
6. Não há contrato CORS nem autenticação por `Authorization` no fluxo atualmente montado; o contexto tRPC ignora cookies/headers de identidade.

### A CONFIRMAR

- Presença/ausência efetiva da configuração de senha demo, modo HTTP local, `NODE_ENV`, `PORT`, disponibilidade do banco e booleans de configuração de assinatura/MFA no ambiente alvo.
- Comportamento de cookies `SameSite=None; Secure; Partitioned` nas políticas do navegador/iframe do ambiente de Preview.
- Contratos, provedor, MFA, papéis, persistência, auditoria, Connect e requisitos de produção antes de qualquer habilitação; nada disso deve ser deduzido dos helpers legados.
- Se um consumidor externo pretende chamar tRPC diretamente, deve-se confirmar o protocolo de batching, `input`, CORS e política de credenciais; a aplicação atual não oferece isso como contrato de negócio.

### RECOMENDAÇÃO — NÃO IMPLEMENTADO ATUALMENTE

- Manter explícita a separação entre gate demo e autenticação financeira; não reutilizar `pmais_demo_session`, `scope: demo_only` ou `ctx.user: null` para autorização real.
- Antes de liberar áreas protegidas, desenhar autenticação/MFA, sessão distribuída e revogável, autorização por escopo, auditoria e schemas de input tRPC, com testes de envelope/status e sem depender de helpers starter.
- Substituir a CSP ampla de release read-only por nonce/allowlist estrita e revisar CORS/preflight conforme os consumidores reais.
- Se a demonstração continuar multi-instância, documentar que as sessões em memória não são compartilhadas; para produção, adotar armazenamento de sessão e mecanismos de rotação/revogação apropriados.
- Não registrar, expor ou testar valores reais de senha, token, cookie, DSN ou chave; manter a política atual de respostas genéricas e de não emissão de configuração server-only.
