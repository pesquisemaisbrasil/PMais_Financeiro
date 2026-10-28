# 03 — Estrutura do projeto


> **CONFIRMADO NO CÓDIGO:** a árvore e os pontos de entrada abaixo refletem os arquivos e imports alcançados pela auditoria.
> **RECOMENDAÇÃO — não implementado atualmente:** manter a separação entre caminho ativo e boilerplate/legado e automatizar a verificação da configuração carregada.

## Árvore representativa

```text
pmaisfin/
├── client/
│   ├── index.html
│   ├── public/
│   │   ├── brand/Logo2025_branco.png
│   │   ├── manus-routes.json
│   │   └── __manus__/debug-collector.js
│   └── src/
│       ├── main.tsx, App.tsx
│       ├── contexts/ (DemoAccess, DemoStore, ThemeContext)
│       ├── lib/ (demoModel, demoValidation, demoConfirm, accessQueue, trpc, utils)
│       ├── pages/ (Login, informativas, NotFound)
│       ├── pages/demo/ (dashboard + sete módulos)
│       ├── components/ (shell, demo, status, produto, ErrorBoundary)
│       ├── components/ui/ (Radix/UI; apenas parte alcançada)
│       ├── hooks/ e _core/hooks/
│       └── *.css
├── server/
│   ├── _core/index.ts, context.ts, trpc.ts, vite.ts, publicConfig.ts
│   ├── _core/{oauth,sdk,storageProxy,systemRouter,llm,...} (helpers legados)
│   ├── security/{demoAccess,readOnlyGuard,contentPolicy}.ts
│   ├── services/deployment.ts
│   ├── db.ts, storage.ts, routers.ts
│   └── *.test.ts / demo-render.test.tsx
├── shared/ (catalog, types, const, erros)
├── drizzle/ (schema, migration inicial, snapshot, journal, relations)
├── scripts/ (verify-delivery, checks HTTP)
├── docs/ (fontes históricas/evidências e este manual)
├── Dockerfile, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
├── tsconfig.json, vite.config.ts, vitest.config.ts
└── patches/wouter@3.7.1.patch
```

A lista completa de arquivos versionados da auditoria está em [`arquivos-versionados.txt`](evidencias/arquivos-versionados.txt) incluído no pacote de evidências; a árvore acima destaca o caminho executável e os arquivos que mudam o comportamento.

## Entradas e composição

| Responsabilidade | Arquivo | O que alterar com cuidado |
|---|---|---|
| Entrada browser | [`client/src/main.tsx`](../client/src/main.tsx#L1-L35) | Providers, client tRPC e CSS global. |
| Roteamento/composição | [`client/src/App.tsx`](../client/src/App.tsx#L26-L61) | Rotas, lazy imports, gate e montagem do DemoProvider. |
| Entrada servidor | [`server/_core/index.ts`](../server/_core/index.ts#L14-L57) | Ordem dos middlewares, guard, routes e static. |
| Bundle/runtime | [`package.json`](../package.json#L6-L16), Dockerfile | Scripts e comando de produção. |
| Vite | [`vite.config.ts`](../vite.config.ts#L1-L205), [`server/_core/vite.ts`](../server/_core/vite.ts#L9-L73) | Dev middleware, public config e static build. |

## Frontend por responsabilidade

- `pages/demo/`: comportamento de tela dos sete módulos; handlers chamam métodos do `useDemoStore`.
- `contexts/DemoStore.tsx`: contrato público do estado, reducer, persistência, ações e `persistenceError`.
- `lib/demoModel.ts`: aliases, seed, datas, BRL/centavos, status derivado e soma segura.
- `lib/demoValidation.ts`: schema Zod de reidratação, cardinalidades e vínculos.
- `contexts/DemoAccess.tsx`: sessão demo, CSRF em memória do cliente, fila e estados de acesso.
- `components/Demo*`: shell/aviso, confirmação, centro de custo e componentes de apresentação.
- `AppShell.tsx`: navegação, logout, breadcrumb, marca e estados móveis.
- `components/ui/`: primitives; `Sheet`, `AlertDialog` e `Button` são alcançados pelo caminho ativo. A maior parte pertence à vitrine legada.
- CSS: `index.css`, `demo.css`, `demo-enhancements.css`, `login.css`; incluem foco, responsive, reduced-motion e print, sem certificação operacional.

## Backend por responsabilidade

- `server/_core/index.ts`: composição Express, headers, body parser, routes e static.
- `server/security/demoAccess.ts`: endpoints e sessão demo em Maps de processo.
- `server/security/readOnlyGuard.ts`: bloqueios de prefixos e métodos.
- `server/security/contentPolicy.ts`: CSP e política de headers.
- `server/_core/context.ts`, `trpc.ts`, `routers.ts`: contrato tRPC atual e procedures indisponíveis.
- `server/services/deployment.ts`: `SELECT 1`, cache de 10 segundos e objeto de status.
- `server/db.ts`: helper Drizzle de `users`, associado a caminho OAuth legado; não é repositório financeiro ativo.
- `server/storage.ts`/`storageProxy.ts`: helpers de storage não montados como fluxo atual.
- `server/_core/oauth.ts`, `sdk.ts`, `systemRouter.ts`, `llm.ts`, `notification.ts`, `dataApi.ts`, `imageGeneration.ts`, `voiceTranscription.ts`, `map.ts`, `heartbeat.ts`: superfícies presentes no starter/legado ou helpers não montados. Não convertê-las em endpoints por inferência.

## Modelo e banco

O modelo local é TypeScript em [`demoModel.ts`](../client/src/lib/demoModel.ts#L3-L195) e [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L15-L24). O banco é MySQL via Drizzle com apenas [`users`](../drizzle/schema.ts#L1-L28). Não existem controllers, repositories, services ou migrations financeiras.

## Configurações e variáveis por nome

Os nomes foram catalogados sem leitura de valores:

- Runtime: `NODE_ENV`, `PORT`, `DATABASE_URL`, `PMAIS_DEMO_LOGIN_PASSWORD`, `PMAIS_DEMO_LOCAL_HTTP`.
- Flags/legado de servidor: `PMAIS_SESSION_SIGNING_SECRET`, `PMAIS_MFA_ENCRYPTION_KEY`, `MANUS_PROJECT_ID`, `MANUS_JWT_SECRET`, `MANUS_OAUTH_API_URL`, `OWNER_OPEN_ID`, `MANUS_API_URL`, `MANUS_API_KEY`.
- Whitelist pública: `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_API_URL`, `MANUS_API_BROWSER_KEY`.

Valores, presença efetiva, rotação, TLS, domínio e ambiente são **A CONFIRMAR**. Não existe `.env.example` rastreado; ver o link futuro [`../.env.example`](../.env.example).

## Scripts e o que alteram

| Script | Função confirmada |
|---|---|
| `pnpm dev` | `NODE_ENV=development tsx watch server/_core/index.ts`. |
| `pnpm build` | Vite + esbuild do servidor em `dist/`. |
| `pnpm start` | `NODE_ENV=production node dist/index.js`. |
| `pnpm check` | `tsc --noEmit`. |
| `pnpm test` | Vitest. |
| `pnpm format` | Prettier. |
| `pnpm db:push`, `pnpm db:migrate` | Drizzle; dependem de `DATABASE_URL`, não executados na auditoria. |
| `scripts/verify-delivery.sh` | check, test, build e comparação App/manifesto. |
| `scripts/check-readonly-http.py` | Health, CSP, manifesto, status, paths protegidos e 404; não foi executado. |
| `scripts/check-demo-access.py` | Fluxo demo; lê senha do ambiente, não foi executado. |

Não há jobs, workers, controllers REST de domínio, Compose ou pipeline CI/CD identificados.

## Onde alterar cada tipo de mudança

- Rota/página: `App.tsx`, página correspondente, manifesto e teste de contrato; verificar `/404`/catch-all.
- Estado demo/cálculo: `DemoStore.tsx`, `demoModel.ts`, `demoValidation.ts`, tela e `server/demo.test.ts`.
- Campo/entidade local: modelo + schema de reidratação + seed + reducer + telas + render test; ver [08](08-cadastros-e-campos.md).
- API ativa: `server/_core/index.ts`, router/serviço e testes HTTP; não usar helper legado sem mount explícito.
- Autenticação demo: `server/security/demoAccess.ts` e `DemoAccess.tsx`; preservar separação `demo_only`.
- Banco SQL: `drizzle/schema.ts`, migration/snapshot/journal; ver [04](04-banco-de-dados.md). Não tratar localStorage como tabela.
- Segurança: `readOnlyGuard`, `contentPolicy`, cookies, proxy e testes; revisão operacional é obrigatória.
- Deploy: Dockerfile, scripts, ambiente externo; não inserir segredo no repo.
