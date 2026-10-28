# Plano de implementação

Ordem sugerida para construir o Financeiro do zero até substituir o que hoje roda dentro do Connect. Cada fase termina com testes verdes, docs atualizados e um PR para a `main` (processo em [10-processo-docs-e-skills.md](10-processo-docs-e-skills.md)).

As fases 0 a 2 não dependem do Connect. A fase 3 exige que o Connect já tenha a API de integração, cuja lista de tarefas está em [07-integracao-com-o-connect.md](07-integracao-com-o-connect.md).

## Fase 0: fundação do repositório (1 a 2 dias)

- [ ] Repositório novo com `backend/` e `frontend/`, nas mesmas versões do Connect ([02](02-arquitetura-e-stack.md), [05](05-padroes-frontend-e-ui.md)).
- [ ] `AGENTS.md`, `docs/` na mesma estrutura, skills `.claude/skills/` (`financeiro-mudanca`, `entregar`) e os 3 revisores (textos prontos em [10](10-processo-docs-e-skills.md)).
- [ ] `docker-compose.yml` com Postgres (database próprio) e MinIO (bucket próprio).
- [ ] Backend:
  - `core/` copiado e adaptado do Connect (`config`, `security`, `crypto`, `limiter`, `logging_config`, `permissions`, `pagination`, `text`);
  - `/health`;
  - Alembic com a primeira migration.
- [ ] Frontend:
  - Next.js com `src/components/ui` copiado;
  - tokens de marca e `check:ui`;
  - `src/lib/api.ts`;
  - `Sidebar` e `RequireAuth`.
- [ ] CI: os workflows de testes, lint, frontend, segurança (gitleaks, pip-audit, npm audit) e e2e ([09](09-testes-qualidade-e-ci.md)). Adapte também o `scripts/verify-delivery.sh`.
- [ ] Headers HTTP de segurança desde o primeiro dia ([06](06-seguranca-e-lgpd.md)).

**Pronto quando:** CI verde num PR vazio, a tela de login abre e o `check:ui` barra componente nativo.

## Fase 1: contas e acesso (2 dias)

- [ ] Usuários com papéis `financeiro` e `admin`. Login, refresh rotativo, logout, troca de senha com senha atual e conta desativada bloqueada.
- [ ] **MFA obrigatório** para admin e financeiro (o Connect ainda não tem; o Financeiro nasce com ele).
- [ ] Auditoria: tabela de eventos e tela "Auditoria" para o admin.
- [ ] Testes de cada caso negado (401, 403, 422, 429).

## Fase 2: domínio sem integração (3 a 4 dias)

Porte do código atual do Connect ([08](08-dominio-e-codigo-atual.md)), ainda alimentado por dados de teste:

- [ ] Parser de comprovante Itaú/Sispag, atrás de uma interface `ReceiptParser`. As fixtures são texto fictício.
- [ ] Normalização e hash da chave Pix (cópia de `core/pix.py`).
- [ ] Lotes, partes e comprovantes, mais a conciliação FIFO por soma exata, com os mesmos grupos: batem, divergentes, fora do projeto, chave não cadastrada, duplicados e erros.
- [ ] O PDF é dividido no navegador e enviado em partes. O PDF não é guardado.
- [ ] Tela "Comprovantes" igual à do Connect, com "Confirmar baixa" (em `ConfirmModal`).
- [ ] Planilha de pagamentos (xlsx, células texto, export auditado).

**Pronto quando:** os mesmos casos de `backend/tests/test_receipts*.py` e `test_verif_financeiro.py` do Connect passam no Financeiro.

## Fase 3: integração com o Connect (3 a 4 dias)

Depende das tarefas do Connect listadas em [07](07-integracao-com-o-connect.md).

- [ ] **No Connect:**
  - contas de serviço com `client_credentials` e escopos;
  - rotas `/integrations/v1`:
    - itens a pagar;
    - projeto e orçamento;
    - chave Pix sob demanda;
    - baixa idempotente;
  - outbox e webhooks assinados.
- [ ] **No Financeiro:**
  - cliente da API do Connect, com token em cache e nova tentativa;
  - recebedor de webhook com conferência do HMAC e deduplicação por `X-Event-Id`;
  - espelho mínimo dos itens a pagar;
  - sincronização periódica por cursor, que é a rede de segurança se um evento se perder.
- [ ] A baixa confirmada no Financeiro chama o Connect com `Idempotency-Key`, e o status pago aparece no Connect.
- [ ] Testes de integração com o Connect simulado. Depois, teste de ponta a ponta com os dois sistemas no `docker compose`.

## Fase 4: troca (1 a 2 dias)

- [ ] Rodar em paralelo: o Financeiro novo concilia, e a equipe confere com o fluxo antigo por 1 ciclo de pagamento (cerca de 15 dias).
- [ ] Desligar no Connect a tela de comprovantes e a planilha, e manter só o recebimento da baixa. O supervisor continua vendo pagamentos e exportando pelo Connect.
- [ ] Atualizar o ROPA e o RIPD (nova operação, operador, finalidade) e o inventário de dados dos dois sistemas.

## Fase 5: depois

- [ ] Arquivo do comprovante no cofre cifrado, se o DPO aprovar a retenção.
- [ ] Relatórios por projeto e período (pago × a pagar × orçamento).
- [ ] Login único (Connect como provedor OIDC).
- [ ] Outros bancos (novo `ReceiptParser`).

## Riscos

| Risco | Como evitar |
|---|---|
| Evento perdido entre os sistemas, com baixa que não chega | Outbox + nova tentativa + sincronização periódica por cursor + relatório de "confirmado no Financeiro e não pago no Connect" |
| Baixa duplicada | `Idempotency-Key` = id do lote + e2eId. O Connect recusa entrevista já paga. |
| Vazamento da chave Pix | Não copiar; escopo próprio; auditoria por busca; mascarar na tela |
| Divergência de regra entre os sistemas | Regras de dinheiro só no dono (orçamento no Connect, conciliação no Financeiro), com contrato de API versionado |
| Time novo sem o contexto | Este handoff + specs + "decisão sempre anotada" |

## Checklist

- [ ] Cada fase tem PR próprio, com base na `main`, CI verde e docs no mesmo PR.
- [ ] A fase 3 só começa com as rotas do Connect publicadas e testadas.
- [ ] A troca (fase 4) só acontece depois de 1 ciclo em paralelo sem divergência.
