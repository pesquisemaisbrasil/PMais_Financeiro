# 18 — Checklist para reconstrução


> **CONFIRMADO NO CÓDIGO:** os itens de reconstrução referenciam arquivos, rotas, entidades, scripts e guards observados.
> **RECOMENDAÇÃO — não implementado atualmente:** executar os gates financeiros somente depois de decisões externas; este checklist não cria users/MFA nem habilita operações.

## Regras antes de começar

- [ ] Confirmar que o alvo é o **mockup demo-only**, não um Financeiro operacional.
- [ ] Fixar a base `81bc243`/data da reconstrução e não copiar `.env`, `.manus-logs`, cookies ou segredos.
- [ ] Não criar users/MFA/refresh JWT/Bank API/Connect por inferência; esses itens pertencem a gates futuros.

## Ambiente e build

- [ ] Node compatível com `node:22-bookworm-slim` disponível.
- [ ] Corepack habilitado.
- [ ] pnpm `10.18.0` ativado.
- [ ] `pnpm install --frozen-lockfile` concluído.
- [ ] `PORT` default 3000 documentada; `NODE_ENV` separado para dev/prod.
- [ ] `PMAIS_DEMO_LOGIN_PASSWORD` configurada somente no servidor autorizado, sem valor em arquivos/client/logs.
- [ ] `PMAIS_DEMO_LOCAL_HTTP=1` usado somente em loopback HTTP local.
- [ ] `pnpm check` executado e output preservado.
- [ ] `pnpm test` executado e contagem comparada com 8 suites/81 testes, sem assumir resultado futuro.
- [ ] `pnpm build` executado; warnings de `type=module` e chunk 540,34 kB avaliados.

## Frontend fiel

- [ ] `main.tsx` monta providers na ordem tRPC → Query → DemoAccess → App.
- [ ] `App.tsx` possui `/login`, dashboard, sete `/demo/*`, seis rotas informativas, `/404` e catch-all conforme decisão.
- [ ] `ShellRoute` aguarda `loading` e redireciona não autenticado.
- [ ] `DemoProvider` só é montado autenticado.
- [ ] AppShell tem sidebar desktop, Sheet móvel, breadcrumb, logout, marca DEMO e foco/ARIA existentes.
- [ ] `DemoPageShell` exibe “dados sintéticos”/“nenhuma operação real”/localStorage.
- [ ] `/fundacao` tem destino documental decidido, pois hoje é rota sem link interno.
- [ ] Tabs de relatórios e tabelas são testadas em browser antes de qualquer afirmação de acessibilidade.

## Modelo local

- [ ] Copiar aliases/enums exatos de [`demoModel.ts`](../client/src/lib/demoModel.ts#L3-L9).
- [ ] Criar `DemoState.version=1` com arrays e `closedPeriods` completos.
- [ ] Usar chave exata `pmaisfinanceiro:demo:v1`.
- [ ] Implementar seed relativo a `todayInSaoPaulo()` sem transformar fixtures em dados reais.
- [ ] Implementar datas civis, fuso São Paulo, centavos e `parseBrlToCents`.
- [ ] Implementar limite de IDs/labels/códigos/centavos/linhas e validação Zod no reload.
- [ ] Validar settlement ↔ transaction, soma de settlements, project/category/party, folhas e fórmula de campo.
- [ ] Implementar fallback para seed, aviso de persistência e evento `storage` validado.
- [ ] Implementar reset após confirmação de UI.

## Ações e telas

- [ ] M2: party, categoria, centro, projeto, inativação e preservação de histórico.
- [ ] M3: título pagar/receber, compatibilidade, centro, documento demo, baixa parcial/total e histórico.
- [ ] M4: provisão prevista, conversão sem dupla contagem, cancelamento com motivo e métricas.
- [ ] M1: lote de entrevistadores por projeto, soma exata e pagamento integral.
- [ ] M5: item quantidade/unidade, folha que agrega pendentes, aprovação, cancelamento e pagamento.
- [ ] M6: classificação, exceção, estados, fechamento e reabertura local.
- [ ] M7: seis vistas, filtros, datas semânticas, aging, CSV com proteção e print.
- [ ] Não adicionar upload/OFX/PDF/NF/Connect/Pix por semelhança de nomes.

## Backend e API

- [ ] Express aplica headers/CSP, `no-store` e monta demo-access antes do readOnlyGuard.
- [ ] `/api/health` retorna read-only.
- [ ] `/api/deployment/status` mantém `accessEnabled:false`, `connect.validated:false`, `businessDataEnabled:false`.
- [ ] `/api/platform/config.js` serializa somente allowlist e escapa `<`.
- [ ] Demo-access preserva JSON 2 KiB, CSRF cookie+header, rate limit, cookies e revogação.
- [ ] `createContext` continua `user:null` no mockup.
- [ ] As 14 procedures tRPC estão documentadas; apenas `deployment.status` pode concluir.
- [ ] Escritas e prefixes protegidos retornam 503, sem bypass via cookie demo.
- [ ] Helpers OAuth/storage/LLM/map/voice/image/notification permanecem não montados até decisão explícita.

## Banco/infraestrutura

- [ ] Reconhecer SQL `users` como única tabela de aplicação.
- [ ] Reconhecer `__drizzle_migrations` como técnica; não inventar linhas/estado.
- [ ] Não criar tabelas financeiras sem modelo aprovado, migration e ownership.
- [ ] Se `DATABASE_URL` estiver presente, validar somente probe/contrato autorizado; não ler registros.
- [ ] Confirmar TLS, least privilege, rede, pool e shutdown do pool.
- [ ] Manter Dockerfile com build e start corretos.
- [ ] Confirmar healthcheck do hosting, pois imagem não possui `HEALTHCHECK`.
- [ ] Não declarar Compose/CI/CD/domínio/backup/restore sem evidência externa.
- [ ] Manter fallback de logo e confirmar licença/origem antes de redistribuir assets.

## Segurança e testes de release

- [ ] Não expor `PMAIS_DEMO_LOGIN_PASSWORD`, `DATABASE_URL`, `MANUS_API_KEY`, JWT/CSRF/cookies.
- [ ] Confirmar `Secure`, `SameSite=None`, `Partitioned` no Preview e ausência de flag HTTP local.
- [ ] Confirmar trust proxy e semântica de `req.ip`.
- [ ] Remover stack do usuário em release ou registrar decisão explícita.
- [ ] Desabilitar/debug-redact do coletor fora de loopback.
- [ ] Triar 96 advisories; não declarar explorabilidade sem análise de reachability.
- [ ] Rodar testes estáticos, HTTP fixture e browser separado; não chamar SSR de E2E.
- [ ] Registrar o que continua A CONFIRMAR: navegador, carga, múltiplas instâncias, banco real, backups e integrações.

## Gates para evolução financeira (não implementar como parte desta reconstrução)

- [ ] Aprovar identidade individual, MFA, recovery, RBAC, tenant e auditoria.
- [ ] Aprovar schema financeiro/migrations/constraints/append-only.
- [ ] Aprovar Connect/Bank API, sandbox, idempotência, webhooks e rollback.
- [ ] Aprovar DPO/Contabilidade para dados pessoais, fiscal, retenção e expurgo.
- [ ] Aprovar migração SGE4B, 11 bases, saldos de corte e operação paralela.
- [ ] Aprovar backup/restore/RPO/RTO, TLS, least privilege e observabilidade.
- [ ] Somente após todos os gates, decidir se e como remover bloqueios 503.
