# 07 — API


> **CONFIRMADO NO CÓDIGO:** os métodos, envelopes, status e bloqueios abaixo correspondem aos mounts Express/tRPC observados.
> **RECOMENDAÇÃO — não implementado atualmente:** antes de qualquer API de negócio, definir schemas de input, autorização, CORS, idempotência, auditoria e testes HTTP.

## Convenção

Esta é a API montada pelo Express atual. O acesso demo usa JSON REST próprio; deployment/config/health também são REST; tRPC é montado, mas somente uma procedure pode retornar sucesso. Não existem endpoints financeiros operacionais.

## Endpoints REST ativos

### `GET /api/health`

| Item | Contrato |
|---|---|
| Autenticação/role | Nenhuma. |
| Query/body | Nenhum. |
| Resposta 200 | `{ "status": "ok", "mode": "read_only" }`. |
| Erros | Falha de bind/inicialização encerra processo; resposta de runtime adicional **A CONFIRMAR**. |
| Regra | Health técnico, não prova banco, negócio ou login. |

Fonte: [`server/_core/index.ts`](../server/_core/index.ts#L35-L35).

### `GET /api/deployment/status`

Público, sem body/query/cookie obrigatório. Em sucesso 200:

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

`signingConfigured`/`mfaConfigured` indicam presença de nomes de configuração; não habilitam MFA ou acesso. Se o probe lançar, retorna 503 `{code:"status_unavailable", detail:"Não foi possível verificar o ambiente. Tente novamente."}`. O probe usa `DATABASE_URL`, pool máximo 2, timeout 4 s, `SELECT 1`, cache 10 s e não expõe DSN/erro de driver.

Fonte: [`deployment.ts`](../server/services/deployment.ts#L18-L68), [`index.ts`](../server/_core/index.ts#L35-L39).

### `GET /api/platform/config.js`

Público, sem body/query/auth. Retorna `application/javascript` com `window.__MANUS_CONFIG__=<JSON>;`. Campos allowlisted: `projectId`, `oauthPortalUrl`, `apiUrl`, `apiBrowserKey`; ausentes viram strings vazias e `<` é escapado. Não serializa `DATABASE_URL`, `MANUS_API_KEY`, `MANUS_JWT_SECRET` ou senha demo.

Fonte: [`publicConfig.ts`](../server/_core/publicConfig.ts#L1-L13), [`index.ts`](../server/_core/index.ts#L40-L42).

## Acesso demo `/api/demo-access`

Todas as respostas `/api` recebem `Cache-Control: no-store`. A senha real não é reproduzida.

### `GET /api/demo-access/session`

- Entrada: cookies de sessão/CSRF; sem query/body.
- Sem senha configurada: 503 `{ok:false, code:"demo_access_not_configured", message:...}`.
- Normal: 200 `{authenticated, login:"adm"|null, scope:"demo_only", csrf, expiresAt}`.
- Pode criar desafio CSRF em cookie; acima do limite de desafios, 429 `demo_access_busy`.
- Cookie de sessão inválido/expirado pode ser limpo.

### `POST /api/demo-access/login`

- Entrada JSON obrigatório: `username` string até 32, `password` string até 256; parser do mount limitado a 2 KiB.
- Headers: `Content-Type` compatível, cookie de CSRF e `X-Pmais-CSRF`; `Sec-Fetch-Site: cross-site` é recusado.
- Falha de input: 400 `invalid_credentials`; credencial inválida: 401 com mensagem genérica; CSRF: 403 `invalid_challenge`; rate limit: 429 `too_many_attempts` e `Retry-After: 300`; verificador indisponível: 503 `demo_access_unavailable`.
- Sucesso: 200 `{ok:true}`, cookie de sessão opaco e expiração de 30 min. O cliente faz nova leitura para confirmar `authenticated`.
- Role: nenhum; escopo fixo `demo_only`.

### `POST /api/demo-access/logout`

- Entrada: `{}` (o cliente envia), cookie de sessão/CSRF e `X-Pmais-CSRF`.
- `Sec-Fetch-Site: cross-site` é recusado; CSRF inválido: 403 `invalid_challenge`.
- Sucesso: 200 `{ok:true}`, remove Maps server-side e limpa cookies.
- Não é `auth.logout` tRPC e não remove `localStorage` demo.

### Fallback `/api/demo-access/*`

Path não montado: 404 `{ok:false, code:"not_found", message:"Endpoint de acesso não disponível."}`. Erro de parser/router: 400 `invalid_request`.

## tRPC `/api/trpc`

Mount em [`index.ts`](../server/_core/index.ts#L43-L45), transformer superjson, `createContext` com `user:null`. Não há `.input(...)` nas procedures. O cliente configura `credentials:"omit"`; as páginas demo não usam mutações tRPC.

| Procedure | Tipo | Método aceito pelo adaptador | Resultado atual |
|---|---|---|---|
| `deployment.status` | query | GET | Única procedure que pode retornar status técnico 200. |
| `auth.me` | query | GET | 503 `SERVICE_UNAVAILABLE`. |
| `auth.login` | mutation | POST | 503 pelo `readOnlyGuard` antes do tRPC; GET dá 405 `METHOD_NOT_SUPPORTED`. |
| `auth.refresh` | mutation | POST | Mesmo comportamento; não é refresh token ativo. |
| `auth.logout` | mutation | POST | Stub 503; não participa do logout demo. |
| `auth.mfa` | mutation | POST | 503; MFA não implementado. |
| `admin.users` | query | GET | 503. |
| `admin.audit` | query | GET | 503. |
| `admin.createUser` | mutation | POST | 503 antes do handler. |
| `admin.updateUser` | mutation | POST | 503 antes do handler. |
| `finance.summary` | query | GET | 503. |
| `finance.list` | query | GET | 503. |
| `finance.create` | mutation | POST | 503 antes do handler. |
| `finance.confirm` | mutation | POST | 503 antes do handler. |

Queries tRPC não atendidas chegam ao router e retornam envelope de erro; mutations POST são bloqueadas primeiro pelo guard com JSON simples read-only. HEAD pode retornar 204 pelo adaptador; PUT/PATCH/DELETE sob `/api` recebem 503 do guard; não há CORS implementado. Um sucesso tRPC usa envelope `{"result":{"data":{"json":...}}}`.

## Fallbacks e static

`GET/HEAD/OPTIONS` de `/api` não atendidos caem em 404 JSON. Em produção, Express serve `dist/public`, `/404` retorna 404 e demais paths usam fallback `index.html`; páginas não são endpoints de domínio.

## Prefixos bloqueados

`/api/auth`, `/api/oauth`, `/api/admin`, `/api/users`, `/api/finance`, `/api/payments`, `/api/audit`, `/api/uploads`, `/api/receipts`, `/api/connect`, `/api/contas`, `/api/token`, `/api/logout`, `/integrations`, `/oauth`, `/token`, `/logout`. Qualquer escrita em `/api`, inclusive mutation tRPC, retorna 503 antes do handler.

## Helpers legados sem contrato HTTP atual

`registerOAuthRoutes`, `registerStorageProxy`, `systemRouter`, `invokeLLM`, `notifyOwner`, `storagePut`, geração de imagem, voz, mapa, Data API e heartbeat aparecem no repositório, mas não são mounts ativos demonstrados. Não documentar esses helpers como endpoints disponíveis.

## Fontes

[`index.ts`](../server/_core/index.ts#L14-L57), [`demoAccess.ts`](../server/security/demoAccess.ts#L63-L133), [`routers.ts`](../server/routers.ts#L6-L35), [`trpc.ts`](../server/_core/trpc.ts#L1-L45), [`readOnlyGuard.ts`](../server/security/readOnlyGuard.ts#L3-L21), [`DemoAccess.tsx`](../client/src/contexts/DemoAccess.tsx#L22-L100).
