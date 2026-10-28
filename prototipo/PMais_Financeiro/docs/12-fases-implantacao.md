# 12 — Fases de implantação


> **CONFIRMADO NO CÓDIGO:** a Fase 0–2 reproduz o runtime, build, gate demo, estado local e guard read-only observados.
> **RECOMENDAÇÃO — não implementado atualmente:** usar as fases posteriores como plano condicionado a decisões independentes, não como implantação já aprovada.

## Princípio

A implantação observada é de um serviço Express/tRPC em modo read-only e um mockup local. As fases futuras abaixo organizam reconstrução e evolução, mas não aprovam produção financeira.

## Fase 0 — Preparação técnica do mockup

**Prioridade P0; depende de repositório e Node/pnpm. Complexidade baixa.**

- Confirmar commit/base e não ler/copiar segredos.
- Instalar `pnpm@10.18.0` com `--frozen-lockfile`.
- Conferir `PORT`, `NODE_ENV` e, somente em ambiente autorizado, senha demo server-side.
- Executar `pnpm check`, `pnpm test`, `pnpm build` e registrar os avisos.
- Verificar que `dist/index.js`, `dist/public`, `/api/health` e porta 3000 existem.

**Aceite:** servidor sobe, health retorna read-only e nenhuma escrita financeira é liberada. **Risco:** interpretar build verde como produção pronta.

## Fase 1 — Fundação do runtime

**P0; depende da Fase 0. Complexidade média.**

- Reproduzir `main.tsx`, `App.tsx`, Wouter, providers, lazy imports e `ErrorBoundary`.
- Reproduzir `AppShell`/Sheet, login público e guard das páginas.
- Reproduzir `DemoAccess`/`demoAccess` com CSRF, rate limit, cookies e expiração.
- Manter `/api/trpc` com `user:null` e stubs indisponíveis.

**Aceite:** sessão demo funciona em fixture isolada; logout revoga; restart exige novo login; tRPC não vira autenticação financeira. **Risco:** usar cookie demo como identidade.

## Fase 2 — MVP demo interativo

**P0; depende das Fases 0–1. Complexidade alta.**

- Implementar `DemoState` v1, seed relativo a São Paulo, validação e localStorage.
- Implementar M2 e dependências; depois M3/M4/M5; então M6/M7.
- Preservar centavos, fórmula de quantidade, vínculos settlement/transação e períodos.
- Implementar aviso de mockup, reset, CSV local e print.
- Implementar as 16 rotas do manifesto, mais decisão documentada para `/404`/catch-all e `/fundacao`.

**Aceite:** matriz de fluxos de [10](10-fluxos.md) e testes do modelo reproduzem as transições; nenhuma chamada de negócio sai do browser. **Risco:** criar regra não suportada pela evidência.

## Fase 3 — Homologação do mockup

**P1; depende do MVP. Complexidade média.**

- Rodar testes estáticos atuais e validar warnings de build.
- Adicionar, como recomendação, E2E de browser com senha de fixture, sem credencial real.
- Testar keyboard/foco/Sheet/AlertDialog/tabs/tabelas/contraste/zoom/print/download em browsers suportados.
- Corrigir ou registrar `ErrorBoundary`, tabs ARIA, limites do store e scripts não executados.
- Triar dependências (a auditoria registrou 96 advisories) sem upgrade automático.

**Aceite:** matriz de testes distingue in-process, HTTP fixture e browser; nenhuma certificação é declarada sem evidência. **Risco:** falsa confiança histórica.

## Fase 4 — Operação do mockup

**P1; depende de infraestrutura externa. Complexidade média.**

- Confirmar hosting, modo `NODE_ENV`, `PORT`, HTTPS fim a fim, cookies e `PMAIS_DEMO_LOCAL_HTTP` ausente.
- Decidir healthcheck do provedor; Dockerfile não declara `HEALTHCHECK`.
- Confirmar política de publicação versus Preview, domínio, restart e número de instâncias.
- Definir observabilidade mínima sem registrar senha, cookie, CSRF ou stack pública.
- Confirmar disponibilidade/ACL da logo gerenciada; manter fallback local.

**Aceite:** contrato operacional externo está registrado e o demo continua read-only. **Risco:** divergência `auto_publish` observada externamente versus README.

## Fase 5 — Fundação para Financeiro real (gate, não entrega)

**P2; depende de decisão executiva e todas as fases anteriores. Complexidade muito alta.**

- Aprovar arquitetura alvo/adaptada e modelo de dados durável.
- Definir identidade individual, MFA, RBAC, escopos, auditoria e sessão distribuída.
- Definir contratos Connect/Bank API, sandbox, idempotência, webhooks e rollback.
- Definir DPO, Contabilidade, retenção, anexos, fiscal, plano de contas e migração SGE4B.
- Criar migrations aditivas, backups/restores, least privilege/TLS e ambiente separado.

**Aceite:** gates independentes assinados pelos responsáveis; teste de produção controlado; somente então avaliar remoção gradual dos 503. **Risco:** promover mockup por semelhança visual.

## Fase 6 — Evolução financeira

**P2; depende de Fase 5. Complexidade muito alta.**

Planejar M1–M7 reais em ordem de contratos e fonte da verdade, com dados reconciliados, autorização por registro e auditoria. Os critérios devem vir de specs aprovados, não deste mockup. A política de cutover SGE4B, operação paralela, retenção e rollback permanece **A CONFIRMAR**.
