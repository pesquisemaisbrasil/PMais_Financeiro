# Manual técnico do P+ Financeiro

## Propósito

Este conjunto documenta a aplicação real na raiz deste repositório, na base auditada `81bc243` (com evidência de revisão também identificada como `81bc2439fb10`), com coleta em **26/10/2026**. O objetivo é permitir que outra pessoa compreenda, reconstrua e mantenha o **mockup interativo demo-only** sem transformar a demonstração em uma alegada plataforma financeira operacional.

> **CONFIRMADO NO CÓDIGO:** a entrega atual é `MOCKUP • DADOS SINTÉTICOS • NENHUMA OPERAÇÃO REAL`. Os sete módulos compartilham estado local no navegador; APIs financeiras, administrativas e de integração permanecem bloqueadas/read-only. Ver [`README.md`](../README.md#L5-L19), [`App.tsx`](../client/src/App.tsx#L26-L60), [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L26-L36) e [`readOnlyGuard.ts`](../server/security/readOnlyGuard.ts#L3-L21).

Este manual não cria contrato de produção, não aprova novas funcionalidades e não substitui decisões de PO, Financeiro, Contabilidade, DPO, Connect ou infraestrutura. Tudo que não puder ser demonstrado pela base auditada é marcado como **A CONFIRMAR**; proposta futura recebe **RECOMENDAÇÃO — não implementado atualmente**.

## Arquitetura em uma frase

React 19/TypeScript/Vite monta Wouter, TanStack Query, provider tRPC, `DemoAccessProvider` e as páginas; o domínio dos sete módulos é reducer + `localStorage`; Express serve o cliente e monta health, status, configuração pública, acesso demo e tRPC; MySQL/Drizzle contém somente `users` e a tabela técnica de migrations, enquanto o probe ativo faz apenas `SELECT 1`.

## Como começar sem expor segredos

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Depois, para verificação local:

```bash
pnpm check
pnpm test
pnpm build
pnpm start
# com o servidor ativo, em ambiente autorizado e sem registrar segredos:
python3 scripts/check-readonly-http.py
# check-demo-access.py lê uma senha do ambiente e não foi executado na auditoria;
# só o use com fixture/segredo isolado e autorização explícita.
```

A variável `PMAIS_DEMO_LOGIN_PASSWORD` é lida somente no servidor e seu valor não pertence a este manual. O exemplo seguro está em [`../.env.example`](../.env.example); ele não contém valores reais.

## Índice e ordem recomendada de leitura

1. [01 — Visão geral](01-visao-geral.md)
2. [02 — Arquitetura](02-arquitetura.md)
3. [03 — Estrutura do projeto](03-estrutura-projeto.md)
4. [04 — Banco de dados](04-banco-de-dados.md)
5. [05 — Autenticação e autorização](05-autenticacao-autorizacao.md)
6. [06 — Segurança](06-seguranca.md)
7. [07 — API](07-api.md)
8. [08 — Cadastros e campos](08-cadastros-e-campos.md)
9. [09 — Regras de negócio](09-regras-de-negocio.md)
10. [10 — Fluxos](10-fluxos.md)
11. [11 — MVP](11-mvp.md)
12. [12 — Fases de implantação](12-fases-implantacao.md)
13. [13 — Testes](13-testes.md)
14. [14 — Deploy e infraestrutura](14-deploy-infra.md)
15. [15 — Observabilidade](15-observabilidade.md)
16. [16 — Performance](16-performance.md)
17. [17 — Decisões arquiteturais](17-decisoes-arquiteturais.md)
18. [18 — Checklist de reconstrução](18-checklist-reconstrucao.md)
19. [19 — Onboarding do desenvolvedor](19-onboarding-desenvolvedor.md)
20. [20 — Pendências](20-pendencias.md)

**Anexo visual:** [Assets e imagens](ANEXO-assets-e-imagens.md). Fontes Mermaid: [`arquitetura-real.mmd`](diagramas/arquitetura-real.mmd), [`acesso-demo.mmd`](diagramas/acesso-demo.mmd), [`fluxo-modulos.mmd`](diagramas/fluxo-modulos.mmd) e [`er-users.mmd`](diagramas/er-users.mmd). Os PNGs correspondentes estão em [`imagens/`](imagens/).

## Status, fonte e limites

| Item | Estado documentado |
|---|---|
| Base | Commit declarada `81bc243`; auditorias coletadas em 26/10/2026. |
| Fonte de verdade desta documentação | Código/configuração/metadata e outputs de auditoria. Textos históricos são identificados como contexto, não como feature ativa. |
| Testes observados | `pnpm check`, `pnpm test` e `pnpm build` foram executados uma vez; status 0. O build teve dois avisos não bloqueantes. |
| Banco | Metadata read-only confirmou `users` e `__drizzle_migrations`; nenhuma linha de aplicação foi lida. |
| Domínio | Sete módulos locais; chave `pmaisfinanceiro:demo:v1`, versão literal 1, seed sintético relativo a São Paulo. |
| Produção financeira | **Não existe nesta base.** MFA, refresh JWT, login OAuth ativo, banco financeiro, Bank API, Connect, Pix, auditoria financeira e persistência de negócio não devem ser afirmados como uso atual. |

### Convenções usadas em todos os documentos

- **CONFIRMADO NO CÓDIGO** — comportamento observado nos arquivos e linhas indicados.
- **A CONFIRMAR** — depende de runtime, provedor, contrato externo ou decisão que não aparece na evidência.
- **RECOMENDAÇÃO — não implementado atualmente** — melhoria ou etapa futura; não confundir com funcionalidade entregue.
- **Não identificado no código** — a busca/auditoria não encontrou a capacidade no caminho ativo.

## Fronteiras que não podem ser ultrapassadas

- “Pagar”, “conciliar”, “fechar”, “exportar” e “relatório” são ações locais sobre dados sintéticos no estado do navegador.
- `users` é tabela de suporte legado/identidade potencial; não é tabela de títulos, movimentos, folha, Connect ou auditoria.
- Helpers de OAuth, storage, LLM, imagem, voz, mapa e notification existem no repositório, mas não provam rotas montadas; ver [07 — API](07-api.md).
- O acesso `adm` é um gate compartilhado `demo_only`; não cria identidade financeira, papel, MFA ou usuário no banco.
- Nenhuma decisão futura de segurança, fiscal, contábil, LGPD, migração ou integração é aprovada por este manual.
