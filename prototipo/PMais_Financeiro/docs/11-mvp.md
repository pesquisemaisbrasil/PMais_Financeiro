# 11 — MVP


> **CONFIRMADO NO CÓDIGO:** o baseline P0 descreve capacidades já observadas no mockup e seus critérios de reconstrução; não descreve produto financeiro real.
> **A CONFIRMAR:** prioridade, orçamento, responsáveis e critérios do Financeiro real dependem de decisões externas.
> **RECOMENDAÇÃO — não implementado atualmente:** tratar P1/P2 como backlog/gates, sem remover bloqueios 503 por semelhança visual.

## Definição utilizada

Há dois MVPs diferentes e eles não devem ser confundidos:

- **MVP de reconstrução do mockup:** reproduzir fielmente a demonstração local, com barreira demo-only.
- **MVP de Financeiro real:** ainda não implementado; é uma sequência de gates, não uma aprovação deste manual.

As prioridades abaixo são recomendações de planejamento. Nada nesta seção altera o código atual.

## Obrigatório para reconstruir o mockup (P0)

| Item | Dependências | Complexidade | Critério de aceite | Risco |
|---|---|---:|---|---|
| Bootstrap React/Express e providers na ordem atual | Node/pnpm, Vite, aliases | M | `/login`, ShellRoute, lazy routes e ErrorBoundary renderizam; `pnpm check` passa. | Misturar starter legado com caminho ativo. |
| Gate demo com sessão/CSRF separado | Cookie HTTPS/local explícito, senha server-side | M | session/login/logout/redirect funcionam em fixture; nunca preenchem `ctx.user`. | Tratar `adm` como identidade real. |
| DemoState v1, seed e localStorage | Modelo, Zod, datas São Paulo | M | Chave exata, fallback, validação, aviso de persistência e sync entre abas. | Perder estado ou aceitar snapshot inválido. |
| Sete módulos com vínculos M2→M3/M4/M5→M6/M7 | Reducer e entidades completas | G | Cenários de lote, título, provisão, folha, conciliação e relatório reproduzem as transições documentadas. | Inventar regra contábil/fiscal. |
| Rotas/manifestações e shell | Wouter, manifesto 16 entradas | P | Rotas declaradas funcionam; `/404`/catch-all e `/fundacao` têm decisão explícita. | Divergência de navegação. |
| Read-only server e status técnico | Express, guard, deployment | M | Health/status/config funcionam; escritas e prefixes protegidos retornam 503. | Liberar escrita por engano. |
| Testes atuais e build | Vitest, TypeScript, Vite/esbuild | P | `check`, `test`, `build` reproduzem status observado; avisos são registrados. | Confundir testes in-process com E2E. |

## Importante pós-MVP do mockup (P1)

| Item | Dependências | Complexidade | Critério de aceite | Risco |
|---|---|---:|---|---|
| E2E browser com fixture não real | Ambiente browser isolado | M | Login/logout, foco, teclado, viewport, download/print e cookie são observados em navegador. | Registrar senha/cookie real. |
| Certificação de acessibilidade | E2E + leitor/teclado/contraste | M | Tabs, Sheet, AlertDialog, tabelas e foco possuem evidência; corrigir role tab se necessário. | Declarar WCAG sem certificação. |
| Alinhar manifesto/rotas legadas | Decisão sobre `/fundacao`, `/404` | P | Contrato de navegação e fallback documentado/testado. | Retirar rota usada sem decisão. |
| Limites uniformes do store | Schema centralizado | P | Códigos/labels não invalidam estado no reload; testes negativos cobrem fronteiras. | Corrupção e reset inesperado. |
| Hardening de erro/debug | Política de release | P | Stack não aparece em release; coletor dev não captura CSRF nem fica acessível a terceiros. | Vazamento local de diagnóstico. |
| Triagem de dependências | Rebuild controlado | M | Advisories diretos/críticos/altos têm correção ou exceção registrada; check/test/build repetidos. | Upgrade quebrar o mockup. |

## Futuro: gates para Financeiro real (P2, não implementado)

| Item | Dependências | Complexidade | Critério de aceite | Risco |
|---|---|---:|---|---|
| Identidade individual, MFA e RBAC | Decisão PO/DPO/segurança, sessão distribuída | G | Usuários individuais, papéis/escopos, MFA, recuperação, revogação e auditoria testados no servidor. | Credencial compartilhada em dados reais. |
| Persistência financeira durável | Modelo aprovado, migrations MySQL ou stack confirmada | G | Schema, ownership, constraints, transações, append-only/auditoria, backup/restore e RPO/RTO validados. | Usar `users`/localStorage como contábil. |
| Contrato Connect | API/sandbox, escopos, webhooks, idempotência | G | Feed/baixa bilateral, erros, replay e reconciliação aceitos pelo dono do dado. | Baixa duplicada ou dado fora de fonte. |
| Bank API/arquivo bancário | Contrato com banco, parser, sandbox, segredos | G | Upload/importação, idempotência, matching, devolução e autorização auditados. | Operação monetária incorreta. |
| Fiscal/contábil/DPO | Decisões externas | G | NF/RPA, retenções, CPF/PIS-NIT, plano de contas, retenção e expurgo aprovados e testados. | Codificar regra aberta como verdade. |
| Relatórios oficiais | Dados reconciliados, escopo, exportação | G | Totais reconciliam com fonte, filtros/competência/baixa são aceitos e download auditado. | CSV demo confundido com oficial. |

## Regra de aceite do MVP

O MVP de reconstrução só está completo quando os itens P0 funcionarem mantendo os avisos `DEMO`, `readOnlyGuard` e `businessDataEnabled:false`. Qualquer item P2 exige decisão e evidência próprias; não deve remover guard apenas por parecer visualmente pronto.
