# 15 — Observabilidade

## O que existe hoje

### Health e status

| Endpoint | Evidência atual |
|---|---|
| `GET /api/health` | Retorna `{status:"ok", mode:"read_only"}` sem autenticação. |
- `GET /api/deployment/status` | informa modo, estado do banco via `SELECT 1`, flags de segurança e Connect/business false. |
- O cliente consulta status com TanStack Query sem retry automático; o probe possui cache de 10 s e compartilha promessa concorrente.

### Logs e erros

O servidor imprime mensagens genéricas em bind/init; helpers legados podem registrar detalhes upstream/driver. `ErrorBoundary` renderiza `error.stack` na UI. Em desenvolvimento, o plugin Manus/coletor pode capturar headers/corpos e respostas em `.manus-logs`; ele não é injetado em produção, mas não mascara explicitamente todos os campos CSRF.

**CONFIRMADO NO CÓDIGO:** não existe contrato de logging estruturado, correlation ID, redaction central, retenção ou acesso operacional. Não foram lidos `.manus-logs`.

### Auditoria de domínio

Não há auditoria append-only. Ações demo alteram o estado local; `reopenPeriod` valida motivo mas o descarta; cancelar folha remove entidade sem evento. O banco não tem tabela de auditoria.

### Métricas, tracing e alertas

Métricas Prometheus/OpenTelemetry, tracing distribuído, dashboards, alertas de erro/latência/rate limit, monitoramento de localStorage e alertas de backup: **Não identificado no código**.

## Eventos importantes que deveriam ser observáveis

> **RECOMENDAÇÃO — não implementado atualmente:** sem mudar a semântica demo, registrar apenas metadados seguros para:

- início/fim de processo, bind e versão/revisão;
- health/status e resultado sanitizado do probe (`available`, `unavailable`, `not_configured`);
- login demo sucesso/falha genérica, logout, expiração, bloqueio de rate limit e erro CSRF, sem senha/cookie/token/CSRF;
- falha de persistência local e reset demo, sem serializar o estado inteiro;
- falhas de build/deploy e tamanho de bundle;
- para futuro financeiro: auditoria append-only de identidade, autorização, aprovação, baixa, conciliação e exportação, com correlation ID e retenção aprovada.

## Alertas recomendados

> **RECOMENDAÇÃO — não implementado atualmente:** alertar quando health falhar, status ficar `unavailable`, login/rate limit disparar de forma anormal, reinícios invalidarem sessões, erro de persistência local crescer, dependências críticas/altas permanecerem sem triagem, ou publicação divergir de Preview. Os thresholds, destinatários, retenção e ferramenta são **A CONFIRMAR**.

## Fontes

[`index.ts`](../server/_core/index.ts#L14-L57), [`deployment.ts`](../server/services/deployment.ts#L18-L74), [`DeploymentStatus.tsx`](../client/src/components/DeploymentStatus.tsx#L30-L110), [`ErrorBoundary.tsx`](../client/src/components/ErrorBoundary.tsx#L14-L52), [`vite.config.ts`](../vite.config.ts#L81-L147), [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L408-L430).
