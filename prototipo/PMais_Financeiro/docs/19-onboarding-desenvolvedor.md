# 19 — Onboarding do desenvolvedor


> **CONFIRMADO NO CÓDIGO:** os caminhos, comandos e limites do onboarding apontam para a composição atual do projeto.
> **A CONFIRMAR:** valores de ambiente, comportamento live do Preview, disponibilidade de banco e política de deploy precisam ser obtidos do operador.
> **RECOMENDAÇÃO — não implementado atualmente:** separar toda nova capacidade financeira do fluxo local até os gates de [20](20-pendencias.md).

## 1. O que é o sistema?

É um mockup interativo de sete módulos financeiros com dados sintéticos locais. Não é um Financeiro real, não grava títulos no MySQL e não chama Connect/Pix/Bank API. Comece por [01](01-visao-geral.md), [02](02-arquitetura.md) e pelo aviso do [`README.md`](../README.md#L5-L19).

## 2. Como executar localmente?

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Servidor: `0.0.0.0`, porta `PORT` ou 3000. Para verificar:

```bash
pnpm check
pnpm test
pnpm build
```

Não procure uma senha no frontend; `PMAIS_DEMO_LOGIN_PASSWORD` é server-side. Não leia/registre `.env*` ou `.manus-logs` sem autorização.

## 3. Onde está o frontend?

- Entrada: [`client/src/main.tsx`](../client/src/main.tsx#L1-L35).
- Rotas/composição: [`client/src/App.tsx`](../client/src/App.tsx#L26-L61).
- Shell: [`client/src/components/AppShell.tsx`](../client/src/components/AppShell.tsx#L26-L227).
- Módulos: [`client/src/pages/demo/`](../client/src/pages/demo/).
- Estado: [`client/src/contexts/DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L181-L224).
- Modelo/validação: [`client/src/lib/demoModel.ts`](../client/src/lib/demoModel.ts#L3-L195), [`demoValidation.ts`](../client/src/lib/demoValidation.ts#L4-L78).

## 4. Onde está o backend?

- Bootstrap: [`server/_core/index.ts`](../server/_core/index.ts#L14-L57).
- Access demo: [`server/security/demoAccess.ts`](../server/security/demoAccess.ts#L63-L133).
- Guard: [`server/security/readOnlyGuard.ts`](../server/security/readOnlyGuard.ts#L3-L21).
- tRPC/context: [`server/routers.ts`](../server/routers.ts#L12-L35), [`server/_core/context.ts`](../server/_core/context.ts#L4-L13).
- Status: [`server/services/deployment.ts`](../server/services/deployment.ts#L18-L68).

## 5. Onde está o banco?

O schema Drizzle está em [`drizzle/schema.ts`](../drizzle/schema.ts#L1-L28), migration em [`drizzle/0000_initial_users.sql`](../drizzle/0000_initial_users.sql#L1-L14). A única tabela de aplicação é `users`; a confirmação de metadata está em [`schema-metadata.json`](evidencias/schema-metadata.json#L25-L285). Os sete módulos ficam em localStorage, não no banco.

## 6. Como funciona autenticação?

Leia [05](05-autenticacao-autorizacao.md). O fluxo é `GET session` → login `adm` + senha server-side → cookie opaco/CSRF → `scope:demo_only`; logout revoga Map. Não há OAuth ativo, JWT/refresh, MFA, cadastro ou recuperação.

## 7. Onde estão as regras de negócio?

Para o demo, em `DemoStore.tsx`, `demoModel.ts`, `demoValidation.ts`, `demoConfirm.ts` e nas sete páginas. Leia [08](08-cadastros-e-campos.md) e [09](09-regras-de-negocio.md). Títulos, settlements e movimentos são relações locais; não são contabilidade.

## 8. Como criar uma funcionalidade?

Primeiro classifique:

1. É tela/derivação local? Atualize página, store/model/validation, seed e testes.
2. É acesso demo? Atualize `DemoAccess`/`demoAccess`, preservando CSRF/queue/scope.
3. É status técnico? Atualize serviço, endpoint e cliente; não misture com DemoState.
4. É negócio real? Pare e abra gate de arquitetura, identidade, banco, integração, DPO/Contabilidade e segurança; não implemente como mutação local.

Preserve rótulo DEMO, centavos, data São Paulo, limites e confirmação UI. Atualize manifesto se houver rota e avalie `/fundacao`/`/404`.

## 9. Como criar endpoint?

Para o mockup, só endpoints técnicos/demo estão autorizados. Adicione mount em `server/_core/index.ts`, defina contrato/validação, respeite `readOnlyGuard`, escreva teste HTTP e documente códigos/envelopes em [07](07-api.md). Não use helpers OAuth/storage/LLM como prova de mount.

## 10. Como alterar banco?

Não altere `users` para acomodar uma entidade financeira. Para mudança real: decisão de modelo, migration Drizzle, snapshot/journal, constraints, índices, ownership, least privilege, backup/restore e testes. `db:push`/`db:migrate` dependem de `DATABASE_URL` e não foram executados nesta coleta.

## 11. Como executar testes?

`pnpm check`, `pnpm test`, `pnpm build`. O estado observado foi 8 suites/81 testes e build com dois avisos; isso não é garantia futura. Os scripts Python não foram executados na auditoria; `check-demo-access.py` exige uma senha de ambiente e só deve rodar com fixture autorizada.

## 12. Como fazer deploy?

Dockerfile constrói Vite/esbuild e inicia `dist/index.js` em 3000. Confirme `PORT`, `NODE_ENV`, HTTPS/cookies, `/api/health`, status, número de instâncias e política Preview/publicação com o hosting. Não há CI/CD/Compose/backup/domínio no repositório. Leia [14](14-deploy-infra.md).

## 13. Principais riscos

Identidade demo compartilhada, localStorage persistente, Maps de sessão por processo, CSP ampla, `localHttp` escapável, debug collector, ErrorBoundary com stack, dependências com advisories e ausência de persistência/auditoria financeira. Leia [06](06-seguranca.md) e [20](20-pendencias.md).

## 14. Partes que exigem mais cuidado

- `server/_core/index.ts`: ordem dos middlewares pode liberar/bloquear superfícies.
- `demoAccess.ts`: cookies, CSRF, rate limit e restart.
- `DemoStore.tsx`: invariantes, soma, períodos e persistência.
- `demoValidation.ts`: reload pode descartar estado inteiro.
- `routers.ts/context.ts`: não converter stubs em auth/finance por acidente.
- `schema.ts`: não confundir users com domínio financeiro.
- `DemoReportsPage.tsx`: CSV é demo/local e tabs não foram certificadas.
- Docker/ambiente externo: não declarar health, TLS, publicação ou backup sem confirmar.
