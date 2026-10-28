# 06 — Segurança


> **CONFIRMADO NO CÓDIGO:** os controles e riscos estão vinculados aos paths ativos e condicionais listados na matriz; helpers não montados não são tratados como exploração atual.

## Postura atual

A aplicação foi deliberadamente endurecida como demo read-only: sessão separada, CSRF, rate limit, cookies, headers de segurança, validação local e bloqueio de escritas. Isso reduz exposição de um mockup sintético; não equivale a segurança de produção financeira. A ausência de identidade individual, MFA, autorização por recurso, persistência server-side e auditoria é um **bloqueio de habilitação**, não uma vulnerabilidade de dados financeiros existentes.

## Controles confirmados

- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` restritiva e CSP em todas as respostas.
- `readOnlyGuard` bloqueia `/api/auth`, `/api/oauth`, `/api/admin`, `/api/users`, `/api/finance`, `/api/payments`, `/api/audit`, `/api/uploads`, `/api/receipts`, `/api/connect`, `/api/contas`, `/api/token`, `/api/logout`, `/integrations`, `/oauth`, `/token`, `/logout`, além de qualquer escrita `/api`.
- Login demo usa body até 2 KiB, valida tipos/limites, 10 tentativas por chave e 30 globais na janela de 5 min, limites para sessões/challenges e mensagens genéricas.
- CSRF exige cookie + header + desafio associado à sessão; login/logout recusam `cross-site` explícito.
- React escapa texto; estado local é validado com Zod; CSV protege prefixos de fórmula, escapa aspas e revoga Object URL.
- Segredos server-side não são serializados na configuração pública; `<` é escapado no JavaScript público.

## Matriz de riscos concretos

| ID / risco | Local/evidência | Severidade | Situação atual | Recomendação |
|---|---|---:|---|---|
| R-01 Identidade compartilhada sem MFA/RBAC | [`demoAccess.ts`](../server/security/demoAccess.ts#L19-L24), [`context.ts`](../server/_core/context.ts#L10-L13), [`routers.ts`](../server/routers.ts#L14-L32) | Alto | Demo-only; não dá acesso financeiro atual, mas impede produção. | **RECOMENDAÇÃO — não implementado atualmente:** identidade individual, MFA, papéis, escopos e auditoria. |
| R-02 CSP ampla/framing | [`contentPolicy.ts`](../server/security/contentPolicy.ts#L3-L15), [`index.ts`](../server/_core/index.ts#L18-L24) | Médio | `unsafe-inline`, HTTPS amplo e ausência deliberada de `frame-ancestors`/X-Frame-Options para Preview. | Nonce/hash, hosts exatos e política de framing confirmada. |
| R-03 localStorage persiste após logout | [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L10), [`DemoAccess.tsx`](../client/src/contexts/DemoAccess.tsx#L90-L99) | Médio | Conteúdo é sintético, mas retenção no perfil do browser é real. | Não usar com dados reais; decidir limpeza/retensão demo e aplicar no logout se aprovado. |
| R-04 Sessões/CSRF/rate limit por processo | [`demoAccess.ts`](../server/security/demoAccess.ts#L24-L42) | Médio | Restart perde sessões; réplicas divergem. | Store compartilhado TTL ou impor/documentar instância única; rate limit distribuído. |
| R-05 `req.ip` sem trust proxy explícito | [`demoAccess.ts`](../server/security/demoAccess.ts#L90-L97), [`index.ts`](../server/_core/index.ts#L14-L27) | Médio | Representação do IP atrás de ingress não confirmada. | Confirmar cadeia de proxy e configurar somente saltos confiáveis. |
| R-06 Sem Origin/Referer explícito | [`demoAccess.ts`](../server/security/demoAccess.ts#L51-L56) | Baixo | Fetch Metadata + token reduzem risco atual; não é defesa completa futura. | Allowlist de Origin/Referer quando aplicável e política para ausência. |
| R-07 Coletor de debug captura CSRF/corpos | [`vite.config.ts`](../vite.config.ts#L81-L147), `client/public/__manus__/debug-collector.js` | Médio em dev | Fora de produção por condição, mas mascara termos de csrf não explicitamente e endpoint não mostra limite/autorização. | Desabilitar fora de loopback; redaction de `csrf`/header; limite e autorização. |
| R-08 Stack visível no ErrorBoundary | [`ErrorBoundary.tsx`](../client/src/components/ErrorBoundary.tsx#L14-L52) | Baixo/Médio | Stack é exibida diretamente, React faz escape, pode revelar caminhos/chunks. | Mensagem genérica + correlation ID; detalhes só em telemetria protegida. |
| R-09 Mutação local pode exceder limite do schema | [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L234-L252), [`demoValidation.ts`](../client/src/lib/demoValidation.ts#L10-L15) | Baixo | Código excessivo pode invalidar estado no reload e voltar ao seed. | Aplicar limites na fronteira de cada mutação e migração/backup do demo. |
| R-10 `PMAIS_DEMO_LOCAL_HTTP=1` em release | [`index.ts`](../server/_core/index.ts#L26-L28), [`demoAccess.ts`](../server/security/demoAccess.ts#L29-L35) | Médio condicionado | Remove Secure e usa Lax; flag efetiva em Preview/produção é A CONFIRMAR. | Falhar/ignorar flag em produção e testar atributos pelo ingress. |
| R-11 storage proxy sem allowlist/autorização se ativado | [`storageProxy.ts`](../server/_core/storageProxy.ts#L4-L47), [`storage.ts`](../server/storage.ts#L20-L22) | Médio condicionado | Proxy não montado, sem BOLA explorável nesta release. | Auth, tenant/objeto, prefixos permitidos, traversal e URLs assinadas autorizadas. |
| R-12 `upsertUser` aceita role de chamador interno | [`db.ts`](../server/db.ts#L21-L60), [`sdk.ts`](../server/_core/sdk.ts#L294-L325) | Médio condicionado | OAuth não montado; não há entrada externa atual para role. | Nunca aceitar role do cliente; serviço admin autorizado + auditoria. |
| R-13 Detalhes upstream em logs/exceções legadas | [`db.ts`](../server/db.ts#L9-L18), storage/LLM/image helpers | Baixo condicionado | Superfícies não montadas; status público sanitiza probe. | Redaction estruturada, correlation ID e retenção/acesso controlados. |
| Dependências com advisories | `docs/evidencias/dependencias-audit.json:1-2922`, `infra.md` | A confirmar | Auditoria única: 96 advisories, 2 críticas, 26 altas; exploração/reachability não demonstradas. | Triar por caminho, corrigir diretos/críticos/altos em mudança separada, reexecutar testes/audit. |

## Inputs, XSS, CSV e banco

O login usa `express.json({limit:"2kb"})`, strings limitadas e mensagens genéricas. As telas demo renderizam valores em JSX; não foi encontrado `dangerouslySetInnerHTML` alimentado por texto de domínio. A exceção observada gera CSS de chart a partir de configuração de apresentação. Queries Drizzle usam igualdade parametrizada em `openId`; não há queries financeiras ativas nem entradas de SQL de negócio.

Uploads de documentos, PDFs, OFX/CSV e anexos: **Não identificado no caminho ativo.** `/api/uploads` é bloqueado; helpers de storage não são montados. Validação de extensão/MIME/tamanho/antimalware para upload real é **A CONFIRMAR** e deve ser definida antes de ativação.

## Infraestrutura e segredos

`DATABASE_URL`, `PMAIS_DEMO_LOGIN_PASSWORD`, `MANUS_API_KEY`, `MANUS_JWT_SECRET` e flags server-side não são serializados ao browser. A whitelist pública contém somente quatro nomes planejados para browser. TLS efetivo do MySQL, least privilege, rede, rotação, backups, domínios, SSH e retenção de logs não foram confirmados.

## O que os testes realmente cobrem

`pnpm test` foi executado e aprovou 8 suites/81 testes, incluindo fixture HTTP local do acesso demo, reducer, content policy, deployment e renderização estática. Não houve browser, pentest, banco com dados, múltiplas instâncias, carga ou produção. Ver [13 — Testes](13-testes.md).

## Gating obrigatório para qualquer Financeiro real

> **RECOMENDAÇÃO — não implementado atualmente:** não remover guards 503 nem ligar persistência/integração com base nesta documentação. Exigir identidade individual/MFA, autorização server-side, storage/sessão distribuídos, auditoria append-only, contrato Connect/Bank API com idempotência, TLS/least privilege, política de DPO/Contabilidade, migrações, backup/restore, testes E2E e triagem de dependências.

## Fontes

[`security audit`](06-seguranca.md), [`demoAccess.ts`](../server/security/demoAccess.ts#L19-L133), [`readOnlyGuard.ts`](../server/security/readOnlyGuard.ts#L3-L21), [`contentPolicy.ts`](../server/security/contentPolicy.ts#L3-L15), [`publicConfig.ts`](../server/_core/publicConfig.ts#L1-L13), [`platform.test.ts`](../server/platform.test.ts#L10-L54).
