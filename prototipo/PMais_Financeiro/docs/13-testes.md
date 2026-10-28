# 13 — Testes


> **CONFIRMADO NO CÓDIGO:** os resultados de check/test/build e a composição das oito suites vêm dos outputs preservados em `docs/evidencias/`.

## Resultado observado

A auditoria executou uma vez cada:

| Comando | Status observado | Evidência |
|---|---:|---|
| `pnpm check` | 0 | `docs/evidencias/check.txt:2-7`; `tsc --noEmit`. |
| `pnpm test` | 0 | `docs/evidencias/testes.txt:6-31`; 8 suites, 81 testes. |
| `pnpm build` | 0 | `docs/evidencias/build.txt:2-40`; aprovado com dois avisos. |

Avisos de build: script `/api/platform/config.js` sem `type="module"` para empacotamento e chunk inicial de 540,34 kB acima do limiar de 500 kB. Não são falhas, mas devem permanecer no registro.

## Suites e cobertura real

| Suite | Quantidade/escopo | Tipo de prova | Limite |
|---|---|---|---|
| `auth.logout.test.ts` | 14 | Caller/contexto; auth/admin/finance indisponíveis mesmo com contexto artificial | Não é login HTTP real. |
| `deployment.test.ts` | 25 | Status, guard read-only, catálogo | Não prova servidor empacotado/proxy. |
| `demo.test.ts` | 14 | Seed, centavos, títulos, lotes, folha, documento, conciliação, períodos | Não prova DB/API/autorização. |
| `access-queue.test.ts` | 3 | Serialização da fila e recuperação após falha | Não é carga, browser ou múltiplas instâncias. |
| `contentPolicy.test.ts` | 3 | Função pura de CSP | Não é header live no proxy. |
| `platform.test.ts` | 5 | Config pública, mocks de plataforma/storage/cookie | Não é integração externa live. |
| `demo-access.test.ts` | 9 | Express/fetch em fixture local, cookies, CSRF, expiração, rate limit, logout | Não é Preview/produção/browsers reais. |
| `demo-render.test.tsx` | 8 | `renderToStaticMarkup` das oito telas demo, h1/avisos/IDs | Não é E2E, hidratação, CSS, foco ou interação. |

## Scripts de verificação

- `scripts/verify-delivery.sh` roda check/test/build e compara rotas literais de `App.tsx` com o manifesto, excluindo `/404`. Não valida login, cookies, CSRF, status 503 ou todas as interações.
- `scripts/check-readonly-http.py` consulta uma origem local (default `127.0.0.1:3000`) e verifica health/CSP/embedding/manifesto/status/prefixos/404/logo. Não cobre `/login` nem `/api/demo-access/*`. Não foi executado.
- `scripts/check-demo-access.py` conhece login, cookies, scope, bloqueios e logout, mas lê a senha configurada do ambiente e fixa origem local. Não foi executado na coleta; não usar com segredo real sem fixture isolada.

## Matriz de testes dos fluxos principais

| Cenário | Implementação existente | Resultado/evidência | Lacuna |
|---|---|---|---|
| Reidratar seed inválido | `demoValidation` + `DemoStore` | Coberto em `demo.test.ts` | Não testa quota/Storage real do browser. |
| Centavos/parse BRL | `demoModel`/`DemoStore` | Coberto em `demo.test.ts` | Não é regra contábil oficial. |
| Criar título compatível | reducer local | Coberto em `demo.test.ts` | Sem API/role/tenant. |
| Liquidação parcial | reducer local | Coberto em `demo.test.ts` | Sem transação SQL/concorrência. |
| Lote/folha soma exata | reducer local | Coberto em `demo.test.ts` | Sem banco/Bank API. |
| Documento pendente | `resolveDemoDocument` | Coberto em `demo.test.ts` | Não há arquivo/NF. |
| Conciliação/fechamento | reducer local | Coberto em `demo.test.ts` | Motivo de reabertura não persistido. |
| Login demo/CSRF/rate limit | fixture Express | 9 testes aprovados | Browser/proxy/restart/multi-instância a confirmar. |
| Logout/revogação | fixture/context | Coberto, auth real permanece 503 | Não valida produção. |
| Render das oito telas | SSR estático | 8 testes aprovados | Sem click/foco/teclado/CSS. |
| `/api/health` e status | funções/handlers | Cobertos em deployment tests | Scripts live não executados. |
| API financeira | `readOnlyGuard`/stubs | Indisponível por desenho | Não existe contrato de negócio para testar. |
| Acessibilidade | atributos em fonte | Intenção codificada | **A CONFIRMAR**: browser, leitor, contraste, zoom, tabs. |
| Performance/carga | fila local apenas | Não medido | Latência, throughput, réplicas e rate limit real. |
| Backup/restore | Não identificado | Sem evidência | A CONFIRMAR com infraestrutura. |

## O que não foi certificado

Não houve browser, Playwright, múltiplos dispositivos, acessibilidade operacional, banco com dados, Connect, Itaú, API externa, carga, concorrência entre processos, sessão distribuída, backup/restore, pentest de rede/DB ou execução live dos scripts Python. Não declarar E2E, produção, WCAG, MFA, autorização financeira ou capacidade de carga com base nos 81 testes.

## Recomendações de teste

> **RECOMENDAÇÃO — não implementado atualmente:** adicionar uma camada E2E com fixtures sintéticas, uma matriz HTTP do servidor empacotado, testes de restart/múltiplas instâncias e uma suíte de acessibilidade. Para qualquer futuro domínio real, criar negativos 401/403/404/409/422/429, idempotência, autorização por registro, auditoria, migração e backup/restore.

## Fontes

[`vitest.config.ts`](../vitest.config.ts#L1-L20), [`package.json`](../package.json#L6-L16), outputs em [`docs/evidencias/`](evidencias/), suites em [`server/`](../server/).
