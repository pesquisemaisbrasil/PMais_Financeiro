# 16 — Performance e escalabilidade


> **CONFIRMADO NO CÓDIGO:** lazy imports, snapshot local, cache do probe, limites do estado e warning de bundle são observáveis na base.
> **A CONFIRMAR:** throughput, latência, carga, memória em browser, réplicas e comportamento de produção não foram medidos.

## Leitura correta

A base não executa consultas financeiras nem processamento concorrente de negócio. Portanto, os gargalos abaixo são do mockup/runtime observado e as melhorias de escala financeira são recomendações, não capacidades atuais.

## Problemas atuais identificados

| Observação | Evidência | Impacto provável |
|---|---|---|
| Bundle inicial de 540,34 kB minificado | Output [`build.txt`](evidencias/build.txt#L27-L32) | Acima do limiar Vite de 500 kB; custo inicial maior. |
| Estado completo serializado após alterações | [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L408-L418) | Custo cresce com arrays; localStorage bloqueia thread e pode falhar quota. |
| Derivações de M7/M4/Dashboard em memória | páginas demo e `useMemo` | Sem paginação/query incremental; custo proporcional ao estado. |
| Sincronização entre abas por snapshot completo | `storage` listener | Recarrega/valida todo estado; conflito de última gravação não é resolvido. |
| Sessão/rate limit em Maps | [`demoAccess.ts`](../server/security/demoAccess.ts#L24-L42) | Não escala entre réplicas; entradas expiradas dependem de requisições para limpeza. |
| Pool do probe limitado a 2 | [`deployment.ts`](../server/services/deployment.ts#L18-L43) | Adequado para `SELECT 1` de status, não para domínio financeiro. |
| Não há paginação, cache de negócio ou worker | inventário das auditorias | Crescimento real não tem mecanismo de proteção. |

Não foram observadas queries pesadas, N+1 ou índices de negócio porque não há domínio financeiro SQL ativo. O índice único de `users.openId` atende ao helper legado; não existe índice de e-mail ou tabelas financeiras.

## Capacidades confirmadas

- Páginas demo são lazy imports; chunks individuais são produzidos para módulos.
- `DeploymentStatus` usa TanStack Query e cache técnico do servidor por 10 s, sem retry automático.
- Validação limita cada coleção a 2.500 e centavos/quantidade a faixas seguras.
- CSV é local e síncrono; não há processamento assíncrono nem upload.
- `httpBatchLink` existe no client tRPC, mas não há hooks operacionais atuais que o usem para negócio.

## Melhorias recomendadas

> **RECOMENDAÇÃO — não implementado atualmente:**

1. Reduzir bundle por code splitting/manual chunks após medir o caminho `/login` e dashboard; revisar o warning `config.js`/`type=module`.
2. Para o mockup, centralizar validação antes do dispatch e limitar tamanho do snapshot; não transformar isso em promessa de escala financeira.
3. Para dados reais, retirar mutações do localStorage e usar API server-side com paginação, filtros indexados, limites de exportação e autorização por registro.
4. Modelar transações SQL/locks/idempotência antes de concorrência; separar leituras derivadas e jobs assíncronos para relatórios grandes.
5. Usar pool, timeouts, circuit breaker e rate limit distribuído para integrações externas somente após contratos aprovados.
6. Definir cache por escopo/tenant e invalidação; nunca cachear resposta financeira sem política de autorização.
7. Definir worker/fila para importação bancária, geração de PDF/XLSX e reconciliação em lotes; essas capacidades não existem hoje.
8. Testar p95/p99, throughput, cold start, memória do snapshot e comportamento de réplicas antes de declarar capacidade.

## Escalabilidade futura: gates

| Área | Dependência de decisão | Aceite futuro |
|---|---|---|
| Sessões/rate limit | Redis/store compartilhado ou single instance explícita | Reinício/réplica preserva política sem divergência. |
| Banco | Schema financeiro, índices, tenant e pool | Carga medida sem queries não indexadas. |
| Relatórios | Dados reconciliados e exportação assíncrona | Totais iguais à leitura transacional e limites documentados. |
| Integrações | Connect/Bank API, idempotência e retry | Replay não duplica baixa e falhas são observáveis. |
| Arquivos | Storage autorizado, quotas e antimalware | Upload/download limitado e auditável. |

## Fontes

[`build.txt`](evidencias/build.txt#L27-L32), [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L26-L36), [`DeploymentStatus.tsx`](../client/src/components/DeploymentStatus.tsx#L71-L110), [`deployment.ts`](../server/services/deployment.ts#L18-L43), [`schema-metadata.json`](evidencias/schema-metadata.json#L208-L277).
