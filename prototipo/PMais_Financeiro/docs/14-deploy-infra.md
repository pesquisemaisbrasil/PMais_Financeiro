# 14 — Deploy e infraestrutura


> **CONFIRMADO NO CÓDIGO:** Dockerfile, scripts, porta, health e variáveis por nome são os caminhos executáveis descritos neste capítulo.
> **RECOMENDAÇÃO — não implementado atualmente:** formalizar healthcheck, pipeline, operação e recuperação somente após confirmação do hosting e sem inserir segredos.

## Runtime confirmado

O caminho de produção é servidor Express/tRPC, não static-only: Vite cria `dist/public`, esbuild cria `dist/index.js`, Express serve ambos e mantém `/api`. O Dockerfile usa `node:22-bookworm-slim`, Corepack, pnpm 10.18.0, `pnpm install --frozen-lockfile`, `pnpm build`, `NODE_ENV=production`, `PORT=3000`, `EXPOSE 3000` e `node dist/index.js`.

```text
Dockerfile → install frozen → pnpm build → dist/index.js + dist/public → Express :3000
```

Não há `HEALTHCHECK` Docker declarado; o endpoint HTTP existe em `/api/health`. Se o hosting exige instrução nativa, isso precisa ser confirmado antes de adicionar configuração duplicada.

## Execução local

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Scripts relevantes:

```bash
pnpm check       # tsc --noEmit
pnpm test        # vitest run
pnpm build       # vite build + esbuild servidor
pnpm start       # NODE_ENV=production node dist/index.js
pnpm db:push     # drizzle generate + migrate (não executado)
pnpm db:migrate  # drizzle migrate (não executado)
```

`pnpm install --frozen-lockfile --offline --ignore-scripts` foi executado pela auditoria de dependências com status 0, sem alterar manifest/lockfile. Os comandos de banco requerem `DATABASE_URL`; não foram executados.

## Variáveis de ambiente por nome

Nenhum valor real está neste manual. O arquivo [`../.env.example`](../.env.example) contém apenas comentários e exemplos sem segredos; o ambiente Manus continua sendo a fonte dos valores protegidos.

| Nome | Uso confirmado | Público? |
|---|---|---|
| `NODE_ENV` | Seleciona dev/prod, Vite/static, CSP e debug collector. | Não. |
| `PORT` | Porta; default 3000; validada 1–65535. | Não. |
| `DATABASE_URL` | Drizzle CLI/helper e probe `SELECT 1`. | Segredo/DSN. |
| `PMAIS_DEMO_LOGIN_PASSWORD` | Verificador server-side do usuário demo `adm`. | Segredo. |
| `PMAIS_DEMO_LOCAL_HTTP` | Cookies HTTP local (`Secure=false`, `Lax`). | Não usar fora de loopback. |
| `PMAIS_SESSION_SIGNING_SECRET` | Apenas flag `signingConfigured` no status atual. | Segredo; não habilita signing por si. |
| `PMAIS_MFA_ENCRYPTION_KEY` | Apenas flag `mfaConfigured` no status atual. | Segredo; não implementa MFA. |
| `MANUS_PROJECT_ID` | Config pública/SDK legado. | Whitelisted como identificador. |
| `MANUS_JWT_SECRET` | SDK OAuth legado. | Segredo. |
| `MANUS_OAUTH_API_URL` | SDK/callback OAuth legado. | Server-side. |
| `OWNER_OPEN_ID` | Fallback de role no helper `upsertUser`. | Server-side. |
| `MANUS_API_URL` | Helpers externos e `apiUrl` público. | URL; confirmar contrato. |
| `MANUS_API_KEY` | Bearer server-side de helpers externos. | Segredo. |
| `MANUS_OAUTH_PORTAL_URL` | Campo público de config; OAuth não montado. | Público por desenho. |
| `MANUS_API_BROWSER_KEY` | Campo público para Maps legado. | Público por desenho; quota/origem a confirmar. |

Nomes históricos/testes como SMTP, `NEXT_PUBLIC_API_URL`, analytics e portas E2E não são leitores ativos confirmados.

## Banco e storage

O app não migra banco no Docker build/start. `server/services/deployment.ts` pode sondar MySQL com pool de 2 conexões, timeout 4 s, `SELECT 1`, cache 10 s. Schema/migration rastreado tem apenas `users`; ver [04](04-banco-de-dados.md).

Storage gerenciado e presign existem como helpers; proxy não é registrado no entrypoint. Logo usa tentativa `/manus-storage/...` e fallback `/brand/Logo2025_branco.png`. Uploads financeiros não estão ativos.

## Reverse proxy, HTTPS, domínio e publicação

Express escuta `0.0.0.0`; porta e TLS terminam no hosting/proxy externo. O código escolhe cookies seguros para Preview normal e modo local explicitamente separado. HTTPS fim a fim, `Secure`, `SameSite=None`, `Partitioned`, trust proxy, domínio, framing e CORS são **A CONFIRMAR** no ambiente.

Não foram encontrados Compose, workflows CI/CD, Jenkinsfile, CircleCI, domínio, SSH, backup ou restore no repositório. No snapshot do control-plane de 26/10/2026, o runtime informou deployment `success` e `auto_publish=true`; a preferência pode mudar no Dashboard e deve ser consultada antes de novo push. Preview e deployment são estágios distintos; nenhum deles certifica prontidão financeira.

## Dependências e build

`pnpm audit --prod --json` foi executado uma vez e retornou código 1: 598 dependências de produção e 96 advisories (2 críticas, 26 altas, 55 moderadas, 13 baixas). Nenhum upgrade foi feito. Impacto/reachability precisam de triagem; não afirmar exploração.

O build observado foi aprovado com o aviso do `config.js` sem `type=module` e chunk inicial 540,34 kB. O Dockerfile é single-stage, mantém dependências de desenvolvimento na imagem final e não declara política de runtime mínimo além do comando.

## Health e operação

- Health público: `GET /api/health` → status `ok`, `mode:read_only`.
- Status técnico: `GET /api/deployment/status` → banco `available|unavailable|not_configured`, gates fixos false.
- Processo: bind failure/init error registra mensagem genérica e encerra.
- Restart: perde sessões/challenges/rate limit demo em memória.

> **A CONFIRMAR:** política de restart, número de réplicas, afinidade, healthcheck do provedor, logs, métricas, alertas, backup/restore, RPO/RTO, quotas e isolamento dev/produção.

## Checklist de release atual

- [ ] Confirmar ambiente sem `PMAIS_DEMO_LOCAL_HTTP=1` fora de HTTP local.
- [ ] Confirmar cookies e HTTPS através do ingress.
- [ ] Confirmar que `/api/health` é o healthcheck do hosting.
- [ ] Confirmar política Preview/publicação e analytics externa.
- [ ] Triar advisories antes de um release operacional.
- [ ] Não liberar prefixes protegidos nem inserir dados reais.
