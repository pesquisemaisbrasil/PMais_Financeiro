# 20 — Pendências e débitos técnicos


> **CONFIRMADO NO CÓDIGO:** cada pendência técnica ou contradição abaixo está ancorada nas auditorias e fontes relativas indicadas.
> **RECOMENDAÇÃO — não implementado atualmente:** fechar uma pendência exige nova evidência ou decisão; este documento não afirma implementação.

## Legenda

**Crítico/Alto/Médio/Baixo** indica prioridade de decisão/risco, não exploração confirmada. “A CONFIRMAR” permanece aberto; “RECOMENDAÇÃO — não implementado atualmente” não é entrega.

## Pendências técnicas e contradições

| Prioridade | Problema | Impacto | Local/evidência | Solução sugerida/status |
|---|---|---|---|---|
| Alto | Demo compartilhado sem identidade individual, MFA, RBAC ou auditoria financeira | Bloqueia produção real; senha compartilhada não atribui autoria | `server/security/demoAccess.ts`, `context.ts`, `routers.ts` | **RECOMENDAÇÃO — não implementado atualmente:** desenhar identidade/MFA/RBAC/sessão/auditoria; não reutilizar gate. |
| Alto | Não existe persistência financeira | Não há fonte contábil, retenção, ownership ou backup | `drizzle/schema.ts`; `DemoStore.tsx` | Aprovar modelo/migrations/constraints/tenant/backup antes de domínio real. |
| Alto | Connect/Bank API/Pix/baixa real não montados | Não é possível operar pagamentos reais com segurança | guard/router e helpers não montados | Confirmar contratos, sandbox, idempotência, escopos e eventos. |
| Alto | 96 advisories de produção em auditoria única | Necessita triagem antes de release | `docs/evidencias/dependencias-audit.json` | Corrigir/justificar por reachability; nenhum upgrade foi feito. |
| Médio | Sessão/CSRF/rate limit em memória por processo | Restart/repllicas invalidam ou divergem | `demoAccess.ts` | Store compartilhado TTL ou instância única documentada; confirmar operação. |
| Médio | CSP aceita `unsafe-inline`/HTTPS amplo e framing deliberado | Defesa reduzida em release futuro | `contentPolicy.ts`, `index.ts` | Nonce/hosts exatos/framing allowlist após decisão de embedding. |
| Médio | `PMAIS_DEMO_LOCAL_HTTP` pode enfraquecer cookie se escapar | Secure/SameSite inadequados em Preview | `index.ts`, `demoAccess.ts` | Falhar/ignorar em produção e confirmar ingress. |
| Médio | Rate limit depende de `req.ip` sem trust proxy explícito | Proteção pode agrupar/burlar clientes atrás de ingress | `demoAccess.ts`, `index.ts` | Confirmar cadeia e configurar proxy confiável. |
| Médio | Debug collector captura corpo/headers sem mascarar CSRF explicitamente | Exposição local/consumo de memória em dev exposto | `vite.config.ts`, collector | Limite, redaction csrf, origem/autorização e somente loopback. |
| Médio | ErrorBoundary mostra `error.stack` | Revela caminhos/chunks/detalhes ao usuário | `ErrorBoundary.tsx` | Mensagem segura/correlation ID em release. |
| Médio | Storage proxy legado aceitaria chave sem autorização se ativado | Possível BOLA/cross-object futuro | `storageProxy.ts`, `storage.ts` | Auth/tenant/allowlist/traversal/URL assinada autorizada antes de mount. |
| Médio | `upsertUser` aceita `role` de chamador interno | Risco de escalada se futura entrada externa repassar role | `db.ts`, `sdk.ts` | Papel decidido apenas por serviço autorizado e auditado. |
| Médio | Sem healthcheck Docker declarado | Health depende de contrato externo | `Dockerfile`, `/api/health` | Confirmar hosting ou declarar política explicitamente. |
| Médio | Bundle inicial 540,34 kB e warning config.js | Custo/performance e build noisy | `docs/evidencias/build.txt` | Medir/code split e resolver/aceitar warning com decisão. |
| Médio | Sem CI/CD no repo | Check/test/build/audit manuais | ausência de workflows; `verify-delivery.sh` | Criar pipeline se aprovado, com secrets fora do repo. |
| Médio | Publicação/analytics variam entre fonte e control-plane | Push ao `main` pode acionar novo deployment quando auto_publish estiver ativo | README histórico e snapshot `GET config`/`infra/overview` de 26/10/2026 | Snapshot: `auto_publish=true`, deployment `success`; reconfirmar no Dashboard porque a configuração é mutável. Analytics declarada true/effective null permanece A CONFIRMAR. |
| Médio | `/fundacao` implementada mas sem descoberta no sidebar | Rota órfã/UX inconsistente | `App.tsx`, `AppShell.tsx`, manifesto | Decidir link, redirect ou documentação. |
| Baixo | `/404`/catch-all no App não aparecem no manifesto | Contrato de rotas divergente | `App.tsx`, `manus-routes.json` | Alinhar manifesto ou documentar exceção técnica. |
| Médio | Tabs de relatórios não têm semântica tab completa | Leitor de tela/foco não certificados | `DemoReportsPage.tsx` | Testar e adotar `tablist/tab/tabpanel` se desejado. |
| Médio | Scripts Python não foram executados; check-readonly não cobre login | Evidência live incompleta | `scripts/*.py`, auditoria de testes | Rodar apenas com fixture/segredo isolado e origem parametrizada. |
| Médio | Não há browser/E2E/acessibilidade operacional | Cookies, foco, contraste, print e reflow desconhecidos | suite SSR/Node | Adicionar E2E e matriz de acessibilidade. |
| Médio | `reopenPeriod` descarta motivo embora UI diga registrado | Auditoria de período inconsistente | `DemoStore.tsx`, M6 | Persistir evento/motivo ou corrigir texto; decisão externa. |
| Médio | Cancelamento de folha remove entidade sem motivo/histórico | Trilha de decisão perdida | `DemoStore.tsx` M5 | Decidir retenção e implementar somente se aprovado. |
| Baixo | `titleStatus` declara `em_aberto` mas não retorna | UI/tipo/regra divergentes | `demoModel.ts`, M3 | Remover opção ou implementar emissão, com teste. |
| Baixo | `setProjectBudget` não verifica ativo apesar da mensagem | Regra e mensagem divergem | `DemoStore.tsx` | Decidir e alinhar reducer/UI/teste. |
| Baixo | Classificação UI tem quatro valores, store aceita qualquer string | Chamador direto pode ignorar vocabulário | M6/store/validation | Centralizar enum se for contrato desejado. |
| Médio | Validação de reload não cobre atividade, datas, status/source e IDs globais | Estado importado pode ser semanticamente incoerente | `demoValidation.ts` | Adicionar invariantes somente após definir contrato. |
| Baixo | Assimetria de datas: data aceita ano 2100, período 2000–2099 | Caso-limite inconsistente | `demoValidation.ts`, `DemoStore.tsx` | Decidir intervalo oficial e cobrir teste. |
| Baixo | `centerId` nulo vira primeiro centro ativo na criação | Input nullable não significa preservação de null | `DemoStore.tsx` | Documentar ou alinhar semântica. |
| Médio | Não há migração de `DemoState` versionado | Mudança de schema pode resetar fixtures | `DemoStore.tsx`, `demoValidation.ts` | Definir migrações antes de trocar versão/chave. |
| Médio | Tabela `__drizzle_migrations` detectada sem leitura de linhas | Estado aplicado desconhecido | `schema-metadata.json` | Confirmar por procedimento autorizado, sem expor registros. |
| Baixo | Nome da PK `users_id` vs `PRIMARY` | Consumidor literal pode depender do nome | SQL/snapshot vs metadata | Confirmar requisito externo; estruturalmente corresponde. |
| Médio | TLS/least privilege/pool shutdown do DB não confirmados | Segurança/operabilidade externas ao código | `db.ts`, `deployment.ts` | Validar DSN/driver/hosting e shutdown. |
| Médio | Logo gerenciada/proxy/licença não confirmados | Asset pode falhar ou não poder ser redistribuído | `AppShell`, storage helpers | Confirmar ACL/origem/licença; manter fallback. |
| Baixo | Open Sans referenciada sem fonte versionada | Runtime/licença/carga dependem de externo | `index.css`, `client/index.html` | Confirmar origem/licença ou política de fallback. |
| Médio | Sem backup/restore/RPO/RTO/domínio/SSH/quotas confirmados | Recuperação e operação não reconstruíveis | ausência no repo | Confirmar com infraestrutura e registrar contrato. |
| Médio | Helpers legados confundíveis com features | Desenvolvedor pode montar OAuth/storage/LLM sem gates | `server/_core/*` | Marcar mounts, testar segurança e manter documentação separada. |
| Baixo | `vite.config.ts.bak` versionado | Confusão sobre config ativa | `vite.config.ts.bak` | Marcar/remover em mudança separada, sem alterar nesta tarefa. |

## Contradições de domínio que exigem decisão

1. `em_aberto` é union/UI, mas `titleStatus` nunca retorna o valor.
2. UI diz que motivo de reabertura foi registrado, mas reducer o descarta.
3. `setProjectBudget` informa que projeto deve ser ativo, mas guarda apenas existência.
4. UI limita classificação a quatro valores, store aceita string não vazia.
5. `isDemoDate` aceita 2100, períodos fechados aceitam somente 2000–2099.
6. Input `centerId` nullable pode ser substituído por primeiro centro ativo.
7. Documentação histórica menciona 15 rotas; manifesto/App atuais têm 16 por causa de `/login`.
8. README histórico afirmava publicação automática desativada; snapshot do control-plane em 26/10/2026 confirmou `auto_publish=true` e deployment success. Reconfirmar estado atual antes de novo push, pois pode ser alterado no Dashboard.
9. Stack histórica Next/FastAPI/PostgreSQL/MinIO não corresponde à stack React/Vite/Express/tRPC/Drizzle/MySQL efetiva.

## Itens explicitamente fora de escopo até confirmação

- MFA, refresh JWT, login OAuth, cadastro/recuperação de senha.
- FinDB/banco financeiro, Connect, Pix, Itaú, Bank API, importação OFX/PDF, NF/RPA e storage de documentos.
- SGE4B/migração das 11 bases, saldos de corte e operação paralela.
- Regras fiscais, retenções, DPO, contabilidade, alçadas, feriados, segregação e roles ampliados.
- Backup, restore, RPO/RTO, domínio, CI/CD, analytics e publicação de produção.

## Fonte e responsabilidade

As pendências foram consolidadas das auditorias de frontend, domínio, API, banco, infraestrutura, testes, segurança e histórico. Resolver uma pendência exige nova evidência/decisão; este documento não afirma que qualquer recomendação foi implementada.
