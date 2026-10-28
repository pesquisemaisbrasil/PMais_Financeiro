# 01 — Visão geral


> **A CONFIRMAR:** disponibilidade efetiva do ambiente, contratos externos, roles reais, publicação e políticas de retenção não são demonstrados pela base auditada.
> **RECOMENDAÇÃO — não implementado atualmente:** manter a barreira demo-only e exigir gates separados antes de qualquer evolução financeira.

## Resumo executivo para quem acabou de entrar

O P+ Financeiro encontrado nesta base é uma **demonstração navegável**, não um ERP financeiro em produção. O frontend React apresenta um shell administrativo e sete módulos interligados. As entidades são criadas e alteradas por um reducer no browser, validadas com Zod e persistidas em `localStorage`; o servidor oferece somente o acesso demo, status técnico, health, configuração pública e uma fronteira tRPC em que apenas `deployment.status` pode ter sucesso. O MySQL, quando configurado, é sondado com `SELECT 1`; o schema rastreado declara apenas `users`.

A reconstrução fiel deve preservar a barreira: dados com rótulo DEMO, moeda inteira em centavos, datas civis no fuso `America/Sao_Paulo`, títulos como origem comum de liquidações, uma transação bancária sintética por settlement e bloqueio HTTP 503 para as áreas protegidas. Não se deve interpretar o visual ou nomes de ações como pagamento real, baixa bancária, conciliação externa ou autorização contábil.

> **CONFIRMADO NO CÓDIGO:** entrada em [`main.tsx`](../client/src/main.tsx#L1-L35), composição em [`App.tsx`](../client/src/App.tsx#L1-L61), sete módulos no catálogo [`shared/catalog.ts`](../shared/catalog.ts#L19-L76), estado em [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L26-L36) e bloqueio no servidor em [`readOnlyGuard.ts`](../server/security/readOnlyGuard.ts#L3-L21).

## O que a aplicação resolve hoje

Ela demonstra, com fixtures sintéticas, como cadastros alimentam títulos, como provisões podem virar títulos, como itens de entrevistadores e de campo formam lotes/folhas, como uma liquidação gera movimento e como conciliação e relatórios derivam leituras do mesmo estado. O valor atual é de prototipação de sequência, vocabulário, interdependência e UX; não é de escrituração, tesouraria ou operação bancária.

## Usuários e casos de uso observados

| Perfil/ator | O que efetivamente existe |
|---|---|
| Visitante não autenticado | Pode acessar `/login`; páginas protegidas redirecionam para login. Não há cadastro público. |
| Usuário compartilhado do demo | Identificador literal `adm`, condicionado a senha server-side; recebe apenas sessão `demo_only` e acesso às telas sintéticas. Não é usuário financeiro individual. |
| Desenvolvedor/avaliador | Usa as telas, reset da demonstração, filtros, confirmações, impressão e CSV local para validar o mockup. |
| Sistema/servidor | Responde health/status/configuração, mantém sessão demo por processo e recusa escritas protegidas. |
| Admin, financeiro, contador ou supervisor reais | **Não identificado no código como perfil operacional ativo.** O schema tem enum genérico `user|admin`, mas o contexto tRPC é `user:null` e os routers de auth/admin/finance retornam indisponibilidade. |

Casos de uso atuais: entrar/sair da demonstração; consultar dashboard; criar/inativar/renomear parties, categorias, centros e projetos DEMO; criar títulos pagar/receber; liquidar títulos manuais; criar e pagar lote de entrevistadores; criar provisão, converter ou cancelar; lançar itens e ciclo de folha; classificar/concluir exceção e fechar/reabrir período; consultar seis vistas de relatório; exportar CSV sintético ou imprimir.

## Rotas e funcionalidades

O manifesto atual tem 16 rotas em [`manus-routes.json`](../client/public/manus-routes.json#L1-L20): `/login`, `/`, sete `/demo/*`, `/fundacao`, `/modulos`, `/modulos/:id`, `/implantacao`, `/seguranca`, `/acesso` e `/documentacao`. `App.tsx` ainda contém `/404` e catch-all técnico fora do manifesto. `/fundacao` está implementada, mas não aparece na navegação interna observada.

### Módulos demo

| Módulo | Implementação real |
|---|---|
| M1 Pagamentos de campo/entrevistadores | Seleção de itens do mesmo projeto, lote de soma exata, liquidação simulada e transação local. |
| M2 Cadastros | Parties, categorias, centros e projetos; inativação preserva histórico. |
| M3 Contas | Títulos pagar/receber, filtros, baixa parcial/total para manual/provisão e resolução de pendência documental fictícia. |
| M4 Orçamento | Baseline, previsto, comprometido, realizado, saldo, consumo, provisões e alertas visuais. |
| M5 Folha/lotes | Itens quantidade × unitário, folha aberta/aprovada/paga, título fonte `field` e pagamento simulado. |
| M6 Conciliação | Apenas movimentos nascidos de settlements; classificação, exceção, fechamento e reabertura locais. |
| M7 Relatórios | Pagar/receber, realizado, previsto, resultado por projeto, aging e conciliação pendente; CSV Blob local e impressão. |

As áreas Fundação, Módulos, Implantação, Segurança, Acesso e Documentação são informativas/read-only. `Home`, `ComponentShowcase`, `Map`, `AIChatBox`, `ThemeContext`, `DashboardLayout` e `useAuth` não estão no caminho de import ativo a partir de `main.tsx`/`App.tsx`.

## Tecnologias efetivas

- Node 22 no caminho observado; pnpm 10.18.0; TypeScript 5.9.3.
- React 19, `react-dom`, Vite 7, Wouter, TanStack React Query, tRPC 11, superjson, Zod 4.
- Express 4 no servidor, esbuild para bundle, Vitest 2, Drizzle ORM 0.44.6, mysql2 3.15.1.
- Tailwind v4, Radix UI, Lucide, CSS autoral; Open Sans é referenciada no CSS/HTML, sem fonte versionada no repositório.
- Dockerfile `node:22-bookworm-slim`, porta 3000, `dist/index.js`.

## Dependências e superfícies externas

O caminho ativo usa o navegador, o próprio Express, o endpoint demo, o endpoint de status e, quando `DATABASE_URL` existe, um probe MySQL. O HTML faz preconnect/carregamento de Open Sans; a configuração pública pode expor apenas os quatro valores allowlisted de plataforma. Existem helpers para OAuth, storage, Data API, Maps, LLM, imagem, voz e notification, porém seus mounts não foram encontrados no entrypoint atual. A lista de dependências de produção foi auditada uma vez e retornou 96 advisories (2 críticas, 26 altas, 55 moderadas, 13 baixas); isso exige triagem, não prova de exploração.

## Limitações e atenção imediata

1. Persistência local não é banco financeiro, backup, auditoria, retenção nem compartilhamento entre computadores.
2. A sessão demo é compartilhada, transitória e em memória; restart ou outra instância invalida a sessão.
3. Não há autenticação financeira, MFA, refresh token, RBAC operacional ou autorização por recurso.
4. A CSP permite `unsafe-inline` e HTTPS amplo; o embedding foi mantido por decisão de Preview. O `ErrorBoundary` exibe `error.stack`.
5. Tabs de relatório têm `role=group`/`aria-pressed`, não o padrão completo `tablist`/`tab`/`tabpanel`; acessibilidade e cookies não foram certificados em browser.
6. `reopenPeriod` valida motivo mas o reducer não o persiste; cancelamento de folha remove a entidade sem histórico; `titleStatus` declara `em_aberto` mas não o retorna; `setProjectBudget` não testa projeto ativo apesar da mensagem.
7. Não há Docker `HEALTHCHECK`, Compose, CI/CD, domínio, backup/restore, RPO/RTO ou política de publicação confirmados no repositório.

## Referências principais

- [`README.md`](../README.md#L5-L83)
- [`App.tsx`](../client/src/App.tsx#L26-L61) e [`manus-routes.json`](../client/public/manus-routes.json#L1-L20)
- [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L181-L224)
- [`demoModel.ts`](../client/src/lib/demoModel.ts#L3-L195) e [`demoValidation.ts`](../client/src/lib/demoValidation.ts#L4-L78)
- [`index.ts` do servidor](../server/_core/index.ts#L14-L57), [`routers.ts`](../server/routers.ts#L6-L35) e [`deployment.ts`](../server/services/deployment.ts#L18-L68)
