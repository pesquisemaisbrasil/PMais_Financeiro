---
name: entregar
description: Fecha uma entrega do Financeiro com o padrão de qualidade do projeto — verificação completa (pytest, ruff, mypy, Vitest, tsc, lint, E2E Playwright), três revisões independentes por agentes (spec, código, interface), correção dos achados, decisões registradas nos docs e PR para a homolog. Use sempre que pedirem para entregar, finalizar, fechar, revisar antes de subir, abrir PR ou "mandar pra homolog" qualquer mudança deste repositório, mesmo que não digam /entregar.
---

# Entrega com padrão de qualidade

Rotina obrigatória antes de qualquer PR de código do Financeiro. Ela fecha o trabalho feito com a rotina [financeiro-mudanca](../financeiro-mudanca/SKILL.md). Leia o [AGENTS.md](../../../AGENTS.md) se ainda não leu nesta sessão.

## 1. Preparar

- Branch criada a partir da `homolog` atualizada (`feat/…`, `fix/…`, `docs/…`, `chore/…`).
- O spec dono em `docs/specs/` já reflete o comportamento novo, e as decisões tomadas estão registradas (passo 5 da rotina de mudança).
- Commits **separados por assunto** (backend, frontend, testes, docs), Conventional Commits, sem linha de atribuição. Nunca entram `.coverage`, `*.stackdump`, `.env`, `*.db`, zip, PDF ou planilha real.

## 2. Verificação determinística

```bash
bash scripts/verify-delivery.sh          # backend + frontend
bash scripts/verify-delivery.sh --e2e    # + Playwright (mudou tela ou fluxo)
```

O script para no primeiro erro e diz qual etapa falhou. **Corrija pela causa:** não apague teste, não afrouxe critério, não aumente timeout para ficar verde. Bug conhecido que não é desta entrega fica com `xfail(strict=True, reason="BUG: ...")` e vai para os limites do PR.

Tela nova ou alterada: rode o E2E da área e abra o relatório (`npx playwright show-report` em `frontend/`).

## 3. Revisão por agentes

Gere a base que os revisores leem (eles só leem, não executam comandos):

```bash
git fetch origin homolog
mkdir -p .reviews
BASE=$(git merge-base origin/homolog HEAD)
git diff "$BASE" > .reviews/diff.patch
{ git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u > .reviews/files.txt
```

Dispare **em paralelo, numa única mensagem**, os subagentes do projeto. Passe a cada um o resumo do recorte e o spec dono:

- `revisor-spec`: aderência aos specs, às regras de produto e às decisões registradas;
- `revisor-codigo`: backend, integração com o Connect, segurança/LGPD, migrations e testes;
- `revisor-interface`: só se a mudança tocar `frontend/`.

Consolide os achados numa tabela única em `.reviews/achados.md` (severidade, arquivo:linha, achado, decisão). A pasta é ignorada pelo git.

Para cada achado:

- **Corrija** P1 e P2 reais, com um teste que falharia sem a correção.
- **Recuse com motivo** o que não tem cenário concreto ou contraria o spec.
- **Decisão de negócio:**
  - spec omisso: adote o padrão mais seguro coerente com ele e registre na seção `## Ajustes` do spec, com data;
  - mudança de regra: vira pergunta em `docs/planning/perguntas-abertas.md` e você pergunta ao João antes.
- **P3:** corrija se for barato; senão, registre como limite no PR.

Depois das correções, rode de novo o passo 2. Se as correções foram grandes, gere outro `.reviews/diff.patch` e rode de novo o revisor afetado.

## 4. PR e merge

Siga só quando a pessoa pediu a entrega ou o PR. Um pedido apenas de revisão para no passo 3.

- Push da branch e PR **com base na `homolog`** (nunca empilhado). O corpo, em pt-BR, traz:
  - o que entra;
  - como testar (atualize `docs/planning/roadmap.md`);
  - a verificação, com números;
  - a tabela resumida dos achados e o que foi feito com cada um;
  - as migrations e os limites;
  - se muda o contrato com o Connect, o que o time do Connect precisa fazer.
- Espere o CI do PR ficar verde (`gh pr checks <n>`).
- **Merge** só quando o João pedir ou autorizar nesta conversa. Antes de mergear, avise e espere confirmação se a PR:
  - apaga ou altera dado existente (migration destrutiva);
  - muda papéis ou permissões;
  - mexe em `.github/`, em segredos ou na infraestrutura;
  - muda uma regra de produto do spec;
  - muda o contrato da integração com o Connect.
- Depois do merge: apague a branch e atualize `docs/planning/roadmap.md` se o estado mudou.

## 5. Resposta final

Curta e direta:
- link do PR e se foi mergeado;
- verificação com números (testes, cobertura, E2E);
- achados corrigidos e recusados;
- decisões registradas, e onde;
- limites e o que depende do João, da Vivi ou do DPO;
- como testar, em 3 a 5 passos, ou o link do roadmap.

Diferencie **implementado**, **mergeado** e **testado em tela**.
