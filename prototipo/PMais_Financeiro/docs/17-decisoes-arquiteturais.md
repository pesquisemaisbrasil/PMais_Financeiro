# 17 — Decisões arquiteturais


> **CONFIRMADO NO CÓDIGO:** ADRs 001–004 e decisões do mockup são compatíveis com os mounts e modelos ativos; decisões futuras permanecem qualificadas.
> **RECOMENDAÇÃO — não implementado atualmente:** registrar novas decisões como ADR aprovado antes de alterar a barreira demo-only ou a fonte de dados.

Este registro separa decisões observáveis do código e contexto histórico de propostas futuras. “Decisão” não significa aprovação de evolução financeira.

## ADR-001 — Modo informativo/read-only

- **Problema:** entregar uma superfície navegável sem operar autenticação/financeiro real.
- **Decisão confirmada:** Express monta health/status/configuração/acesso demo; `readOnlyGuard` bloqueia prefixes protegidos e toda escrita `/api`; routers auth/admin/finance retornam `SERVICE_UNAVAILABLE`.
- **Motivo:** evitar que starter/helpers ou UI pareçam operação financeira.
- **Consequências:** status técnico é público, negócio não tem API; consumers veem 503 simples ou envelope tRPC conforme path/método.
- **Alternativas:** habilitar domínio real; **não implementado** e condicionado a gates independentes.
- **Fontes:** [`readOnlyGuard.ts`](../server/security/readOnlyGuard.ts#L3-L21), [`routers.ts`](../server/routers.ts#L6-L35), [`deployment.ts`](../server/services/deployment.ts#L45-L68).

## ADR-002 — Mockup interativo com estado local

- **Problema:** demonstrar interdependências sem banco financeiro/chaves.
- **Decisão confirmada:** `DemoStore` reducer + seed + Zod + `localStorage` `pmaisfinanceiro:demo:v1`; sete módulos consomem o mesmo estado.
- **Motivo:** reconstrução local/offline com dados sintéticos.
- **Consequências:** não compartilha entre computadores, não audita, pode falhar quota e não substitui persistência.
- **Alternativa:** MySQL/Drizzle financeiro; **RECOMENDAÇÃO — não implementado atualmente**, requer schema/migrations/ownership/backup.
- **Fontes:** [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L10-L36), [`demoModel.ts`](../client/src/lib/demoModel.ts#L143-L195).

## ADR-003 — Gate demo separado da identidade financeira

- **Problema:** proteger Preview com acesso compartilhado sem criar autenticação financeira falsa.
- **Decisão confirmada:** usuário literal `adm`, senha server-side, sessão opaca em memória, CSRF e `scope:demo_only`; `ctx.user` continua nulo.
- **Motivo:** permitir avaliação do mockup sem liberar admin/finance.
- **Consequências:** restart perde sessão; sem MFA/RBAC/recuperação; cookie depende do ambiente.
- **Alternativa futura:** identidade individual, MFA, sessão distribuída e autorização; **não implementado**.
- **Fontes:** [`demoAccess.ts`](../server/security/demoAccess.ts#L19-L35), [`context.ts`](../server/_core/context.ts#L4-L13).

## ADR-004 — Stack efetiva adaptada

- **Problema:** material histórico prescreve Next/FastAPI/PostgreSQL/MinIO, mas o repositório executável é React/Vite/Express/tRPC/Drizzle/MySQL.
- **Decisão confirmada:** manter a stack efetiva para o mockup; tratar handoff histórico como alvo documental, não implementação.
- **Motivo:** executar a demonstração no starter atual sem inventar equivalência de segurança.
- **Consequências:** não há backend Python/PostgreSQL/MinIO; equivalentes MySQL e arquitetura real futura precisam de decisão.
- **Alternativa:** migrar literalmente para stack alvo; **A CONFIRMAR** por arquitetura/PO.
- **Fontes:** [`package.json`](../package.json#L1-L16), [`drizzle.config.ts`](../drizzle.config.ts#L1-L15), auditoria histórica.

## ADR-005 — Connect como dono de dados futuros

- **Problema:** contrato histórico coloca pessoas, projetos, orçamento, entrevistas e chaves no Connect.
- **Decisão documentada/histórica:** integração futura exclusivamente por API, dados mínimos, sem acesso direto ao DB/MinIO do Connect; baixa idempotente no dono do dado.
- **Motivo:** minimização e fronteira de ownership.
- **Consequências atuais:** nenhum Connect é chamado; M1 usa entities DEMO.
- **Alternativa:** integração direta; não suportada pela evidência e não deve ser implementada por inferência.
- **Status:** **A CONFIRMAR** contrato, escopos, sandbox, webhooks, erros e eventos.

## ADR-006 — Precisão local por centavos e datas São Paulo

- **Problema:** evitar floats e deslocamentos de data na demonstração.
- **Decisão confirmada no demo:** moeda em inteiros de centavos; quantidade em centésimos; datas civis relativas a `America/Sao_Paulo`; settlement não excede saldo; lotes/folhas fecham soma exata.
- **Motivo:** determinismo de UI/reducer.
- **Consequências:** não prova contabilidade/fiscal; regras reais podem exigir Decimal/string e decisões externas.
- **Alternativa futura:** contrato contábil aprovado; **A CONFIRMAR**.
- **Fontes:** [`demoModel.ts`](../client/src/lib/demoModel.ts#L62-L132), [`demoValidation.ts`](../client/src/lib/demoValidation.ts#L4-L35).

## ADR-007 — Logo oficial intacta e fallback local

- **Problema:** marca deve ser usada sem recriação/recolor.
- **Decisão confirmada:** AppShell tenta `/manus-storage/...` e cai em `client/public/brand/Logo2025_branco.png`; asset rastreado é PNG RGBA 356×129.
- **Motivo:** preservar asset oficial e permitir fallback.
- **Consequências:** storage remoto/licença/origem do asset colorido não são garantidos.
- **Alternativa:** gerar/recolorir logo; não permitido pela orientação histórica.
- **Status:** licença e disponibilidade remota **A CONFIRMAR**; não criar asset por IA.
- **Fontes:** [`AppShell.tsx`](../client/src/components/AppShell.tsx#L119-L135), [`client/public/brand/`](../client/public/brand/Logo2025_branco.png).

## Decisões que ainda não podem ser escolhidas silenciosamente

- `/fundacao` órfã na navegação e `/404` fora do manifesto.
- Motivo de reabertura e histórico de cancelamento de folha.
- Ordem das datas de título, política fiscal/contábil e semântica de `em_aberto`.
- Arquitetura MySQL versus stack histórica, sessão distribuída, backup/RPO/RTO.
- Contrato Connect/Bank API, migração SGE4B, DPO e publicação.

Ver [20 — Pendências](20-pendencias.md).
