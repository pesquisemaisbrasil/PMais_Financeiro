# Processo, docs e skills

Como o time do P+ Connect trabalha, adaptado para o Financeiro: o `AGENTS.md`, a estrutura de `docs/`, onde anotar cada decisão, as duas skills do projeto (rotina de mudança e entrega), os três revisores, a severidade dos achados, commits, PRs e branches. Os textos marcados "pronto para copiar" são versões adaptadas dos arquivos reais do Connect (`AGENTS.md`, `.claude/skills/pconnect-mudanca/SKILL.md`, `.claude/skills/entregar/SKILL.md`, `.claude/agents/revisor-*.md`); cole no repositório novo e ajuste só o que estiver entre `<…>`.

## 1. Visão geral do processo

```
pedido ──► financeiro-mudanca ─────────────────────────────► entregar ─────────────────────────► PR (base main)
           1. spec dono + transcrição                         1. branch + commits por assunto       CI verde
           2. backend em camadas                              2. verify-delivery.sh [--e2e]         merge só com o dono
           3. frontend com componentes ui                     3. 3 revisores em paralelo
           4. decisões anotadas                               4. corrige P1/P2 com teste
           5. testes (pytest, Vitest, E2E)                    5. roda o passo 2 de novo
           6. docs (spec, roadmap, operations)
```

- **Pessoa ou agente de IA, o processo é o mesmo.** As skills ficam versionadas em `.claude/skills/` e os revisores em `.claude/agents/`; uma pessoa segue os mesmos passos lendo os arquivos.
- **Os revisores só leem** (ferramentas `Read`, `Grep`, `Glob`): não alteram arquivo nem rodam comando. Eles leem o diff que a skill `entregar` gera em `.reviews/` (pasta no `.gitignore`).

## 2. `AGENTS.md` do Financeiro (pronto para copiar)

No Connect, o `AGENTS.md` é curto: regras de trabalho e links. O `frontend/AGENTS.md` (aviso de que o Next.js do projeto tem APIs diferentes do que os modelos conhecem) é gerado pelo `next dev`; mantenha-o.

````markdown
# AGENTS.md

Entrada para pessoas e agentes de IA que trabalham no **Financeiro** da Pesquise+ (pagamento dos entrevistadores de campo do P+ Connect: o que pagar, planilha para o banco, comprovantes Pix, conciliação e baixa). Regras de trabalho aqui; todo o resto está linkado.

## Regras de trabalho

1. **Leia antes de mudar.** O índice da documentação é [docs/README.md](docs/README.md). O contrato do domínio que você vai tocar está em [docs/specs/](docs/specs/README.md): o que o sistema faz, as regras, os casos negados e os critérios de aceite.
2. **Frontend:** leia [frontend/AGENTS.md](frontend/AGENTS.md) antes de escrever código. O Next.js deste projeto tem APIs diferentes do que modelos costumam saber.
3. **Sistema separado:** o Financeiro nunca lê nem escreve no banco do P+ Connect. Tudo passa pela API de integração ([docs/architecture/integracao-com-o-connect.md](docs/architecture/integracao-com-o-connect.md)). Nos testes, o Connect é sempre simulado.
4. **Regras de dinheiro:**
   - dinheiro é `Decimal`, nunca `float`; datas de negócio no fuso de São Paulo;
   - o comprovante dá baixa, não cria entrevista;
   - valor exato: não fecha, é divergência para revisão humana;
   - nada é pago sem "Confirmar baixa";
   - um Pix (ID da transação) só paga uma vez.
5. **Commits separados por assunto** (backend, frontend, testes e docs por funcionalidade), no padrão Conventional Commits, sem linha de atribuição.
6. **Um PR por entrega, sempre com base na `main`.** Não abra PR empilhado sobre outra branch: o merge vai para a branch errada. **Merge só com o dono** (João) pedindo ou autorizando.
7. **Pronto = verde:** `bash scripts/verify-delivery.sh` (testes do backend com cobertura ≥ 80%, `ruff`, `ruff format --check`, `mypy`, um head do Alembic; no frontend, `next typegen`, `tsc`, `lint`, `check:ui` e `npm test`), mais `--e2e` quando a tela ou o fluxo mudou. Comandos em [docs/development/testes.md](docs/development/testes.md).
8. **Regra mudou, teste novo.** Bug conhecido sem correção fica com `xfail(strict=True, reason="BUG: ...")`.
9. **Dado pessoal:**
   - nunca no log;
   - nunca comprovante, PDF ou planilha real no repositório (fixtures são texto fictício ou PDF gerado no teste);
   - CPF nunca (no Connect ele só existe como hash);
   - chave Pix não é copiada do Connect: é buscada na hora, mascarada na tela e completa só na planilha de pagamentos, com cada acesso auditado.
   - Mudou o que se guarda: atualize o [inventário de dados](docs/architecture/seguranca/inventario-de-dados.md) e o ROPA **no mesmo PR**.
10. **Mensagens ao usuário em pt-BR simples.** O público (equipe financeira) não é técnico: "comprovante", "baixa", "a pagar", nunca "batch" ou "reconcile".
11. **Decisão de produto não se toma no código.** Pergunta aberta vai para [docs/planning/perguntas-abertas.md](docs/planning/perguntas-abertas.md); decisão técnica relevante vira ADR em [docs/architecture/adr/](docs/architecture/adr/README.md).

## Skills do projeto (`.claude/`)

| Skill / agente | Para quê |
|---|---|
| `financeiro-mudanca` | Rotina de qualquer mudança: spec → código → decisões anotadas → testes (pytest, Vitest, E2E) → docs |
| `/entregar` | Fecha a entrega: `scripts/verify-delivery.sh` → 3 revisores em paralelo → corrige → PR para a `main` |
| `revisor-spec`, `revisor-codigo`, `revisor-interface` | Revisores somente leitura usados pela `/entregar` |

## Mapa rápido

| Preciso de… | Vá para |
|---|---|
| Entender o sistema em 1 página | [docs/architecture/visao-geral.md](docs/architecture/visao-geral.md) |
| Regras do domínio e invariantes | [docs/architecture/mapa-do-codigo.md](docs/architecture/mapa-do-codigo.md) |
| Contrato com o P+ Connect | [docs/architecture/integracao-com-o-connect.md](docs/architecture/integracao-com-o-connect.md) |
| O que mudou e como testar | [docs/planning/roadmap.md](docs/planning/roadmap.md) |
| Rodar local / seeds / deploy | [docs/operations/](docs/operations/README.md) |
| Padrões de código | [docs/development/](docs/development/README.md) |
| Segurança e LGPD | [docs/architecture/seguranca/](docs/architecture/seguranca/README.md) |
| Pacote de handoff do Connect | [docs/handoff/README.md](docs/handoff/README.md) |

## Quem decide

- **Produto (PO):** João Paulo
- **Operação financeira e regras de acesso:** Vivi
- **LGPD e retenção:** DPO
````

## 3. Estrutura de `docs/`

Mesma do Connect. O índice encaminha, não repete.

```
AGENTS.md            entrada para pessoas e agentes: regras de trabalho e links
docs/
  README.md          índice: "por onde começar" por perfil + uma linha por pasta
  transcricoes/      reuniões e conversas brutas (fonte de evidência; não editar depois)
  functional-map/    necessidades, jornadas, fluxos (estados e transições), requisitos transversais
  specs/             contrato por domínio: comportamento, regras, casos negados, aceite
  architecture/      visão geral, modelo de dados, integração, segurança/LGPD, adr/
  development/       padrões de backend e frontend, testes, entrega, documentação
  planning/          estado atual, roadmap ("Como testar"), perguntas abertas, historico/
  operations/        runbooks: rodar local, bootstrap (admin, seeds), deploy
  handoff/           este pacote (referência do Connect)
```

| Pasta | O que mora lá | Regra |
|---|---|---|
| `transcricoes/` | `AAAA-MM-DD-assunto.md` com a fala bruta, data e participantes | Registre **antes** de interpretar. Sem dado pessoal (CPF, chave Pix, telefone). Não editar depois |
| `functional-map/` | `necessidades.md`, `jornadas.md`, `fluxos.md` (estados), `requisitos-transversais.md` | Fluxo novo ou estado novo entra aqui |
| `specs/` | um arquivo por domínio + `README.md` com a tabela de specs | Comportamento mudou → spec atualizado no mesmo PR |
| `architecture/` | `visao-geral.md`, `modelo-de-dados.md`, `mapa-do-codigo.md`, `integracao-com-o-connect.md`, `seguranca/` (inventário de dados, autenticação, RBAC, `lgpd/ropa.md`, `lgpd/ripd.md`), `adr/` | Decisão difícil de desfazer → ADR |
| `development/` | `padroes-backend.md`, `padroes-frontend-e-ui.md`, `testes.md`, `entrega.md`, `documentacao.md` | Contrato que as skills seguem |
| `planning/` | `estado-atual.md`, `roadmap.md`, `perguntas-abertas.md`, `historico/` | Plano entregue vai para `historico/`; o código é a fonte da verdade |
| `operations/` | `rodar-local.md`, `bootstrap.md`, `deploy.md` | Comando, variável de ambiente ou script novo → atualizar aqui e o `.env.example` |

**Como escrever** (de `docs/development/documentacao.md` do Connect): pt-BR curto e escaneável, tabelas e listas antes de parágrafos; não repita o que o código já diz, aponte o arquivo e documente o porquê, a regra e a armadilha; cada informação mora em **um** lugar.

### Template de spec (pronto para copiar)

Cada spec tem 5 seções obrigatórias, mais `## Ajustes` quando houver.

````markdown
# Spec: <Domínio>

Contrato de <o que cobre>. Fonte da verdade: o código listado no fim.

## Comportamento

- <O que a pessoa faz e o que o sistema responde, com a rota: `POST /...`.>
- <Quem pode: papéis.>

## Regras

1. <Regra numerada, verificável. Ex.: "Pix = soma exata das entrevistas a pagar; não fecha, é divergência.">
2. <Limites: valores mínimos e máximos, tamanhos, prazos.>

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| <Papel sem acesso tenta X> | 403 | <mensagem exata em pt-BR> |
| <Recurso inexistente ou de outro dono> | 404 | <mensagem exata> |
| <Estado não permite> | 409 | <mensagem exata> |
| <Entrada inválida> | 422 | (validação) |

## Critérios de aceite

- [ ] <Cenário concreto com números: "Pix de R$ 40 para 2 entrevistas de R$ 20 → Batem; Confirmar baixa → 2 pagas.">
- [ ] <Cada caso negado da tabela acima.>

## Onde está no código

- `backend/api/<arquivo>.py`, `backend/services/<arquivo>.py`, `backend/schemas/<arquivo>.py`
- Frontend: `frontend/src/app/<rota>/page.tsx`
- Testes: `backend/tests/test_<x>.py`, `frontend/e2e/<x>.spec.ts`

## Ajustes

- AAAA-MM-DD: <decisão> — <motivo>.
````

### Template de ADR (pronto para copiar para `.claude/skills/financeiro-mudanca/assets/adr-template.md`)

Uma decisão por arquivo, curta (até ~30 linhas), com o próximo número livre (`0001-titulo-curto.md`). Para mudar uma decisão, crie um ADR novo e marque o antigo como "substituído por NNNN"; nunca reescreva o antigo. Quando escrever: decisão difícil de desfazer (modelo de dados, dado pessoal, provedor externo, segurança), regra de produto que vira restrição técnica, ou "por que não fizemos X?" sem resposta óbvia no código.

````markdown
# NNNN — Título curto da decisão

- **Status:** aceito | substituído por NNNN | proposto
- **Data:** AAAA-MM-DD
- **Quem decidiu:** (pessoa ou "técnico, na implementação")

## Contexto

O problema e as restrições, em 3 a 6 linhas. O que acontecia antes ou o que forçou a decisão.

## Decisão

O que foi escolhido, em uma frase, e os detalhes que importam.

## Alternativas consideradas

- Opção X: por que não.

## Consequências

- O que fica mais fácil.
- O que fica mais difícil ou o que passa a ser proibido.
- Onde isso aparece no código (arquivos principais).
````

ADRs do Connect que valem como ponto de partida para o Financeiro (reescreva como ADRs do repositório novo, citando a origem): 0001 (comprovante dá baixa, não cria entrevista), 0002 (PDF não é armazenado), 0003 (CPF só como hash), 0006 (orçamento é teto duro), 0007 (Gitleaks pela CLI no CI).

### Regra "decisão sempre anotada"

Toda decisão tomada no trabalho fica escrita, no lugar certo, **no mesmo PR**:

| Tipo de decisão | Onde |
|---|---|
| Técnica de arquitetura ou de stack (lib nova, padrão novo, trade-off, integração) | ADR novo em `docs/architecture/adr/` |
| Detalhe que o spec não cobria e foi resolvido do jeito mais seguro | `## Ajustes` no fim do spec dono: `- AAAA-MM-DD: decisão — motivo` |
| Regra de produto ainda não decidida | linha em `docs/planning/perguntas-abertas.md` (pergunta, com quem, o que o sistema faz hoje) |
| Regra de produto decidida pelo João, pela Vivi ou pelo DPO | spec dono atualizado + transcrição da fala em `docs/transcricoes/` |
| Mudança no contrato com o Connect | `docs/architecture/integracao-com-o-connect.md` + ADR se for incompatível (nova versão `/v2`) |
| Dado pessoal novo ou removido | inventário de dados + ROPA |

**Teste rápido:** se alguém perguntar daqui a um mês "por que é assim?", a resposta precisa estar num desses lugares.

## 4. Skill `financeiro-mudanca` (pronto para copiar)

Adaptação da `pconnect-mudanca`. Caminho: `.claude/skills/financeiro-mudanca/SKILL.md`, com o template de ADR em `.claude/skills/financeiro-mudanca/assets/adr-template.md`. A `description` do frontmatter é o que faz a skill ser usada sozinha: mantenha os gatilhos ("faz X", "arruma Y").

````markdown
---
name: financeiro-mudanca
description: Rotina para criar ou alterar qualquer funcionalidade, tela, endpoint, tabela, regra ou integração do Financeiro da Pesquise+ seguindo os padrões do projeto — spec dono, decisões anotadas (ADR, ajustes do spec, perguntas abertas), backend em camadas, frontend com componentes ui, Connect sempre simulado nos testes, testes pytest/Vitest/E2E Playwright e docs no mesmo PR. Use sempre que for implementar, corrigir ou mudar comportamento neste repositório, mesmo em pedidos curtos como "faz X", "arruma Y" ou "adiciona Z".
---

# Rotina de mudança do Financeiro

Os contratos estão nos docs; esta rotina fixa a ordem e o que não pode ser esquecido. Leia o [AGENTS.md](../../../AGENTS.md) antes. Feche o trabalho com a skill [entregar](../entregar/SKILL.md).

## 1. Entender o pedido

- Ache o spec dono em [docs/specs/](../../../docs/specs/README.md) e as jornadas em [docs/functional-map/jornadas.md](../../../docs/functional-map/jornadas.md).
- Mexe em comprovante, conciliação, baixa ou planilha: leia as invariantes em [docs/architecture/mapa-do-codigo.md](../../../docs/architecture/mapa-do-codigo.md).
- Mexe na conversa com o P+ Connect: leia [docs/architecture/integracao-com-o-connect.md](../../../docs/architecture/integracao-com-o-connect.md).
- Pedido novo vindo de reunião ou conversa: registre a fala bruta em `docs/transcricoes/AAAA-MM-DD-assunto.md` antes de interpretar. É a evidência do que foi pedido.
- **Ambíguo em regra de negócio:** pergunte. **Ambíguo em detalhe técnico:** escolha o mais seguro e registre (passo 5).

## 2. Backend (`backend/`)

- Siga [docs/development/padroes-backend.md](../../../docs/development/padroes-backend.md):
  - `api/` (auth, permissão, rate limit, exceção → HTTP) → `services/` (regra, exceção de domínio) → `models/` + `schemas/`;
  - toda rota com `response_model`, `description`, `@limiter.limit` e `request: Request`;
  - `detail` em pt-BR para usuário não técnico.
- **Dinheiro e datas:** `Decimal` sempre; dia de negócio no fuso de São Paulo (`core/text.py`).
- **Concorrência:** invariante que depende de leitura usa `with_for_update`; confirmação e baixa numa transação só.
- **Tabela ou coluna nova:** migration Alembic com `downgrade`, `ondelete` explícito, import em `alembic/env.py`, e atualize [docs/architecture/modelo-de-dados.md](../../../docs/architecture/modelo-de-dados.md).
- **Dado pessoal:**
  - CPF nunca;
  - chave Pix: casa por hash da chave normalizada (`core/pix.py`), mostra mascarada, completa só na planilha, com auditoria;
  - nome do comprovante cifrado;
  - nada disso no log.
  - Mudou o que se guarda: [inventário de dados](../../../docs/architecture/seguranca/inventario-de-dados.md) e ROPA no mesmo PR.
- **Comprovante:** o PDF é lido em memória e descartado (a não ser que exista ADR e retenção aprovada pelo DPO). Leitor novo de banco entra como novo `ReceiptParser`, lendo só o bloco do recebedor.

## 3. Integração com o P+ Connect

- Só pela API de integração, com o cliente único (`services/connect_client.py`) e conta de serviço com escopo mínimo. Nunca acessar o banco do Connect.
- Toda escrita no Connect leva `Idempotency-Key` (na baixa, o ID da transação Pix).
- Nunca chamar HTTP de dentro de uma transação do banco: grave na *outbox* e despache depois.
- Timeout explícito, reentrega com backoff e erro do Connect nunca vira "pago" no Financeiro.
- Mudança incompatível no contrato = nova versão (`/v2`) + ADR, combinada com o time do Connect.

## 4. Frontend (`frontend/`)

- Leia [frontend/AGENTS.md](../../../frontend/AGENTS.md): o Next.js daqui tem APIs diferentes.
- Siga [docs/development/padroes-frontend-e-ui.md](../../../docs/development/padroes-frontend-e-ui.md):
  - só componentes de `src/components/ui` (o `check:ui` barra os nativos);
  - HTTP só via `src/lib/api.ts`;
  - `RequireAuth` com os papéis certos;
  - textos simples em pt-BR;
  - estados de carregando, vazio e erro;
  - `ConfirmModal` em ação irreversível (ex.: "Confirmar baixa").

## 5. Anotar as decisões (sempre)

Toda decisão tomada no trabalho fica escrita, no lugar certo, **no mesmo PR**:

| Tipo de decisão | Onde |
|---|---|
| Técnica de arquitetura ou de stack (lib nova, padrão novo, trade-off, integração) | ADR novo em [docs/architecture/adr/](../../../docs/architecture/adr/README.md), no modelo de [assets/adr-template.md](assets/adr-template.md), com o próximo número livre |
| Detalhe que o spec não cobria e você resolveu do jeito mais seguro | seção `## Ajustes` no fim do spec dono: `- AAAA-MM-DD: decisão — motivo` |
| Regra de produto ainda não decidida | linha em [docs/planning/perguntas-abertas.md](../../../docs/planning/perguntas-abertas.md) com o que o sistema faz hoje |
| Regra de produto decidida pelo João, pela Vivi ou pelo DPO | spec dono atualizado + transcrição da fala |
| Contrato com o Connect | [docs/architecture/integracao-com-o-connect.md](../../../docs/architecture/integracao-com-o-connect.md) (+ ADR se incompatível) |

**Teste rápido:** se alguém perguntar daqui a um mês "por que é assim?", a resposta precisa estar num desses lugares.

## 6. Testes

| Mudou… | Teste |
|---|---|
| Regra, endpoint ou permissão | pytest em `backend/tests/` (fixtures `client`, `db_session`, `make_user`), com casos negados (401/403/404/409/422/413) e a mensagem exata |
| Leitor de comprovante | fixture de **texto fictício** no layout do banco (`receipt_text`); nunca PDF real |
| Conciliação ou baixa | casos bate, pago a mais, não fecha, duplicado, fora do projeto; valores em `Decimal` |
| Lógica pura do frontend (`src/lib`) | Vitest ao lado do arquivo (`*.test.ts`) |
| Tela ou jornada do usuário | Playwright em `frontend/e2e/` (fluxo principal + 1 caso negado) usando os dados de `backend/scripts/seed_e2e.py` e PDF sintético de `e2e/receipts.ts` |
| Integração externa (P+ Connect, Zenvia, MinIO) | sempre simulada nos testes; inclua "o Connect falhou → nada foi pago" |

Bug descoberto e não corrigido agora: teste com `xfail(strict=True, reason="BUG: ...")`.

## 7. Docs

- Spec dono atualizado (comportamento, regras, casos negados, critérios de aceite).
- [docs/planning/roadmap.md](../../../docs/planning/roadmap.md): entrada nova com "O que é novo" e "Como testar".
- Comando, variável de ambiente ou script novo: atualize [docs/operations/](../../../docs/operations/README.md) e o `backend/.env.example`.

Depois, rode a skill **entregar**.
````

## 5. Skill `entregar` (pronto para copiar)

Caminho: `.claude/skills/entregar/SKILL.md`. A versão do Connect é usada como está; só mudam o nome do sistema e as pessoas.

````markdown
---
name: entregar
description: Fecha uma entrega do Financeiro com o padrão de qualidade do projeto — verificação completa (pytest, ruff, mypy, Vitest, tsc, lint, E2E Playwright), três revisões independentes por agentes (spec, código, interface), correção dos achados, decisões registradas nos docs e PR para a main. Use sempre que pedirem para entregar, finalizar, fechar, revisar antes de subir, abrir PR ou "mandar pra main" qualquer mudança deste repositório, mesmo que não digam /entregar.
---

# Entrega com padrão de qualidade

Rotina obrigatória antes de qualquer PR de código do Financeiro. Ela fecha o trabalho feito com a rotina [financeiro-mudanca](../financeiro-mudanca/SKILL.md). Leia o [AGENTS.md](../../../AGENTS.md) se ainda não leu nesta sessão.

## 1. Preparar

- Branch criada a partir da `main` atualizada (`feat/…`, `fix/…`, `docs/…`, `chore/…`).
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
git fetch origin main
mkdir -p .reviews
BASE=$(git merge-base origin/main HEAD)
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

- Push da branch e PR **com base na `main`** (nunca empilhado). O corpo, em pt-BR, traz:
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
- Depois do merge: apague a branch e atualize `docs/planning/estado-atual.md` se o estado mudou.

## 5. Resposta final

Curta e direta:
- link do PR e se foi mergeado;
- verificação com números (testes, cobertura, E2E);
- achados corrigidos e recusados;
- decisões registradas, e onde;
- limites e o que depende do João, da Vivi ou do DPO;
- como testar, em 3 a 5 passos, ou o link do roadmap.

Diferencie **implementado**, **mergeado** e **testado em tela**.
````

## 6. Os três revisores (prontos para copiar para `.claude/agents/`)

Todos: somente leitura (`tools: Read, Grep, Glob`), no máximo 10 achados do mais grave ao menos grave, cada achado com severidade, `arquivo:linha`, cenário concreto e correção mínima. **Sem cenário concreto, não é achado.** Terminam com uma linha do que conferiram sem problema e os limites da revisão.

### `revisor-spec.md`

````markdown
---
name: revisor-spec
description: Revisão adversarial, somente leitura, de uma mudança do Financeiro contra os specs de domínio, as regras de produto, o contrato com o P+ Connect e as decisões registradas. Use antes de abrir PR ou ao mudar comportamento de negócio.
tools: Read, Grep, Glob
---

Você revisa uma mudança do Financeiro procurando onde ela **contraria ou deixa de cumprir** o contrato. Você só lê: não altera arquivos nem executa comandos.

## Base

1. O diff completo está em `.reviews/diff.patch` e a lista de arquivos (inclusive novos) em `.reviews/files.txt`, gerados pela skill `entregar`. Leia os arquivos inteiros quando o trecho do diff não bastar.
2. Ache o spec dono em `docs/specs/` (índice em `docs/specs/README.md`) e leia as seções tocadas: Comportamento, Regras, Casos negados, Critérios de aceite e Ajustes.
3. Regras e invariantes: `docs/architecture/mapa-do-codigo.md`. Contrato com o Connect: `docs/architecture/integracao-com-o-connect.md`. Decisões: `docs/architecture/adr/`, `docs/planning/perguntas-abertas.md` e `docs/transcricoes/`.
4. O que ficou fora do recorte combinado não é achado; o que entrou precisa estar completo.

## O que procurar

- **Regra do spec** implementada diferente, ou ausente dentro do recorte.
- **Permissão:** papel com acesso a mais ou a menos (financeiro, admin; conta de serviço com escopo além do necessário).
- **Dado sensível exposto:**
  - chave Pix completa fora da planilha de pagamentos, ou chave copiada e guardada do Connect;
  - CPF em qualquer lugar;
  - nome do recebedor de pessoa conhecida exibido (só aparece quando a chave não é de ninguém);
  - dado pessoal em log, notificação, evento ou payload de integração.
- **Dinheiro:**
  - comprovante criando entrevista;
  - pagar duas vezes o mesmo Pix ou a mesma entrevista;
  - baixa sem confirmação humana;
  - pagamento parcial ou "resto" (o valor é exato; não fecha é divergência);
  - "fora do projeto" ou "chave não cadastrada" pago automaticamente;
  - orçamento contornado.
- **Integração:** comportamento diferente do contrato com o Connect; escrita sem idempotência; erro do Connect tratado como sucesso.
- **Estado inválido:** estado ou transição fora dos fluxos de `docs/functional-map/fluxos.md` (lote enviando → pronto → confirmado; comprovante pendente ↔ descartado, pendente → pago).
- **Aceite sem teste:** critério de aceite sem teste que o prove, principalmente os casos negados (HTTP e mensagem exata).
- **Decisão sem registro:** decisão nova tomada no código sem ADR, sem `## Ajustes` no spec ou sem pergunta aberta.
- **Texto:** mensagens que não estão em pt-BR simples para usuário não técnico.

## Resposta

No máximo 10 achados, do mais grave ao menos grave. Cada achado traz:
- **severidade:** P1 quebra regra, segurança ou LGPD; P2 comportamento errado em caso real; P3 lacuna de prova ou de documentação;
- **arquivo:linha**;
- **a regra ou o trecho do spec violado**;
- **cenário concreto** (entrada → resultado errado);
- **correção mínima**.

Sem cenário concreto, não é achado. Termine com uma linha do que você conferiu sem encontrar problema e com os limites da revisão.
````

### `revisor-codigo.md`

````markdown
---
name: revisor-codigo
description: Revisão de código, somente leitura, do backend, migrations, integração com o P+ Connect, testes e CI do Financeiro contra os padrões do projeto (camadas, permissões, segurança/LGPD, concorrência, idempotência, Decimal/fuso, migrations). Use antes de abrir PR com mudança de código.
tools: Read, Grep, Glob
---

Você revisa o código de uma mudança do Financeiro procurando bugs reais e desvios do padrão. Você só lê: não altera arquivos nem executa comandos.

## Base

- O diff completo está em `.reviews/diff.patch` e a lista de arquivos em `.reviews/files.txt`. Leia os arquivos inteiros quando o trecho não bastar.
- Padrões: `AGENTS.md`, `docs/development/padroes-backend.md`, `docs/architecture/seguranca/` (inventário de dados, autenticação, RBAC), `docs/architecture/mapa-do-codigo.md` (invariantes) e `docs/architecture/integracao-com-o-connect.md`.
- Referências de implementação: `backend/services/<conciliacao>.py`, `backend/services/receipt_parser.py`, `backend/services/connect_client.py` e os testes em `backend/tests/`.

## O que procurar

- **Camadas:** a rota faz só auth, permissão, rate limit e tradução de exceção. Serviço levanta exceção de domínio, nunca `HTTPException`. Toda rota tem `response_model`, `description`, `@limiter.limit` e `request: Request`.
- **Permissão:** helpers de papel e de escopo usados certo. Procure IDOR, em que trocar o id (projeto, lote, comprovante) dá acesso a recurso alheio.
- **Segurança e LGPD:**
  - chave Pix comparada só pelo hash da chave normalizada (`core/pix.py`); comparar string crua é bug;
  - chave Pix completa guardada ou logada;
  - dado pessoal no log (chave, nome, texto do PDF);
  - texto de usuário virando fórmula em CSV ou XLSX (célula precisa ser texto);
  - upload sem limite ou PDF guardado sem decisão registrada;
  - segredo no código.
- **Integração com o Connect:**
  - acesso ao banco do Connect (proibido);
  - HTTP chamado de dentro de transação do banco;
  - escrita sem `Idempotency-Key`;
  - sem timeout, ou reentrega que pode duplicar efeito;
  - erro ou timeout do Connect marcando algo como pago;
  - payload com dado pessoal que o outro lado não precisa;
  - mudança incompatível no `/v1`.
- **Concorrência:**
  - invariante que depende de leitura sem `with_for_update`;
  - decisão tomada sobre estado lido no começo da requisição, sem reler depois da trava;
  - commit no meio de um lote;
  - índice único faltando onde a regra é "só um" (ex.: e2eId pago).
- **Dinheiro e datas:**
  - dinheiro em `float` em vez de `Decimal`;
  - `date.today()` ou UTC onde deveria ser o dia de São Paulo (`core/text.py`).
- **Erros:** `detail` em pt-BR e código HTTP certo (404, 403, 409, 422, 413). Nada de 500 para entrada inválida.
- **Migration:**
  - `downgrade` funcional;
  - enum do Postgres com `ADD VALUE` em `autocommit_block`;
  - `ondelete` explícito;
  - modelo e migration coerentes;
  - tabela nova registrada em `alembic/env.py`;
  - head único.
- **Notificação e eventos:** aviso nunca derruba a ação principal; evento gravado na *outbox* na mesma transação.
- **Testes:**
  - teste que não falharia com o bug;
  - caso negado sem teste;
  - integração externa chamada de verdade (Connect, Zenvia e MinIO devem ser simulados);
  - fixture com dado ou PDF real.
- **CI e tooling:** gatilhos dos workflows; diferença entre o checkout limpo do CI e o ambiente local (ex.: `next typegen`); falsos positivos do gitleaks.
- **Higiene:** `print`, código morto, comentário que repete o código ou está desatualizado, `# type: ignore` sem motivo.

## Resposta

No máximo 10 achados, do mais grave ao menos grave. Cada achado traz:
- **severidade:** P1 perda ou vazamento de dado, pagamento em dobro ou segurança; P2 comportamento errado em caso real; P3 manutenção ou prova fraca;
- **arquivo:linha**;
- **cenário concreto**;
- **correção mínima**.

Sem cenário concreto, não é achado. Feche com uma linha do que conferiu sem problema e com os limites da revisão.
````

### `revisor-interface.md`

````markdown
---
name: revisor-interface
description: Revisão, somente leitura, do frontend do Financeiro contra o padrão de interface (componentes ui, estados, papéis, dado sensível, textos para usuário não técnico, acessibilidade) e da cobertura E2E Playwright. Use antes de abrir PR que muda telas.
tools: Read, Grep, Glob
---

Você revisa as telas de uma mudança do Financeiro procurando bugs de uso e desvios do padrão. Você só lê: não altera arquivos nem executa comandos.

## Base

- O diff completo está em `.reviews/diff.patch` e a lista de arquivos em `.reviews/files.txt`. Concentre-se em `frontend/src` e `frontend/e2e`.
- Padrão: `docs/development/padroes-frontend-e-ui.md`, `frontend/AGENTS.md` e o spec dono em `docs/specs/`.
- Telas de referência: `<tela de comprovantes>`, `<tela de projetos/pagamentos>`.

## O que procurar

- **Componentes:**
  - só os de `src/components/ui` e os compartilhados (`Toast`, `ConfirmModal`, `DataPagination`, `MaskedInput`, `PaymentStatus`);
  - controle nativo é proibido pelo `check:ui`;
  - HTTP só via `src/lib/api.ts`.
- **Papéis:**
  - `RequireAuth` com os papéis certos;
  - item de menu e ação visíveis só para quem pode;
  - a tela não confia só no front, então confira se o backend também barra.
- **Dado sensível:** chave Pix só mascarada (a exceção é a planilha de pagamentos), CPF nunca, nome do recebedor só para chave não cadastrada, e nenhum botão de baixar comprovante enquanto não houver decisão registrada.
- **Estados:**
  - carregando (`Skeleton`/`Spinner`), vazio com orientação, erro com o `detail` do backend;
  - "Confirmar baixa" e cancelar envio com `ConfirmModal`, mostrando o resumo (quantas pessoas, entrevistas e R$);
  - duplo clique ou reenvio sem efeito duplicado;
  - envio em partes com progresso e reenvio só da parte que falhou.
- **Textos:**
  - pt-BR simples, sem jargão (comprovante, baixa e a pagar, não batch ou reconcile);
  - número com contexto ("R$ 480 de R$ 500");
  - dinheiro em BRL e datas no fuso de São Paulo (`src/lib/time.ts`).
- **Acessibilidade e celular:** `aria-label` em botão só de ícone, foco visível, bloqueio explicado em texto visível (não só em tooltip), sem rolagem horizontal em tela estreita.
- **E2E:**
  - fluxo principal e um caso negado em `frontend/e2e/`;
  - seletores estáveis (papel, rótulo ou texto) em vez de classes;
  - dados vindos de `seed_e2e.py` e PDF sintético gerado no teste, nunca de dado real.

## Resposta

No máximo 10 achados, do mais grave ao menos grave. Cada achado traz:
- **severidade:** P1 dado errado, vazamento ou ação indevida; P2 fluxo quebrado em caso real; P3 desvio de padrão ou prova faltando;
- **arquivo:linha**;
- **cenário concreto** (o que a pessoa faz → o que dá errado);
- **correção mínima**.

Sem cenário concreto, não é achado. Feche com uma linha do que conferiu sem problema e com os limites da revisão.
````

## 7. Severidade dos achados

| Nível | Significa | O que fazer | Bloqueia merge |
|---|---|---|---|
| **P1** | Quebra regra de produto, segurança ou LGPD; perda ou vazamento de dado; pagamento em dobro; ação indevida | Corrigir nesta entrega, com teste que falharia sem a correção | Sim |
| **P2** | Comportamento errado em caso real; fluxo quebrado | Corrigir nesta entrega, com teste | Sim |
| **P3** | Manutenção, prova fraca, lacuna de documentação, desvio de padrão | Corrigir se for barato; senão, registrar como limite no PR | Não |

Achado recusado leva o motivo na tabela `.reviews/achados.md` e no PR ("sem cenário concreto", "contraria o spec X").

## 8. Commits, branches e PRs

**Branches:** uma por entrega, criada a partir da `main` atualizada: `feat/…`, `fix/…`, `docs/…`, `chore/…` (ex.: `feat/conciliacao`, `fix/parser-e2e-vazio`, `docs/spec-planilha`).

**Commits:**

- Conventional Commits, título em inglês, corpo curto explicando o porquê.
- **Separados por assunto**: backend, frontend, testes e docs de cada funcionalidade em commits próprios. Exemplo de uma entrega:
  ```
  feat(api): receipt batches with parts and idempotent upload
  feat(frontend): split PDF in the browser and upload parts
  test(api): reconciliation cases and denied requests
  docs: receipts spec, ADR on PDF retention and roadmap
  ```
- **Sem linha de atribuição** (nenhum rodapé de coautoria ou de ferramenta).
- Nunca commitar `.coverage`, `*.stackdump`, `.env`, `*.db`, zip, PDF ou planilha real.

**PR:**

- **Um PR por entrega, sempre com base na `main`.** PR empilhado (base = outra branch) acaba mergeado na branch errada; no Connect isso aconteceu com os PRs #3 e #4 e precisou do #5 para corrigir.
- Corpo em pt-BR: o que entra; como testar (link do roadmap); verificação com números; tabela de achados e decisão de cada um; migrations; limites; impacto no contrato com o Connect.
- CI verde antes do merge (`gh pr checks <n>`).
- **Nunca merge sem o dono.** Só quando o João pedir ou autorizar. Avisar e esperar confirmação explícita quando a PR apaga ou altera dado, muda papéis ou permissões, mexe em `.github/`, segredos ou infraestrutura, muda regra de produto ou muda o contrato com o Connect.
- Depois do merge: apagar a branch; migration nova → `alembic upgrade head` em cada ambiente; atualizar `docs/planning/estado-atual.md` se o estado mudou.

## Checklist

- [ ] `AGENTS.md` do repositório novo criado com o texto da seção 2, e `frontend/AGENTS.md` mantido.
- [ ] `docs/` com as pastas da seção 3, `docs/README.md` como índice e `docs/specs/README.md` com a tabela de specs.
- [ ] Cada spec tem Comportamento, Regras, Casos negados (com HTTP e mensagem exata), Critérios de aceite e Onde está no código.
- [ ] `docs/architecture/adr/README.md` com a tabela de ADRs; primeiros ADRs reescritos a partir de 0001, 0002, 0003, 0006 e 0007 do Connect.
- [ ] `docs/planning/perguntas-abertas.md` criado com as perguntas do [08](08-dominio-e-codigo-atual.md).
- [ ] `.claude/skills/financeiro-mudanca/SKILL.md` + `assets/adr-template.md` e `.claude/skills/entregar/SKILL.md` copiados da seção 4 e 5.
- [ ] `.claude/agents/revisor-spec.md`, `revisor-codigo.md` e `revisor-interface.md` copiados da seção 6, com os `<…>` trocados pelos caminhos reais.
- [ ] `.reviews/` no `.gitignore`.
- [ ] Uma entrega de teste passou pelo ciclo inteiro: `verify-delivery.sh` verde → 3 revisores → achados em `.reviews/achados.md` → PR com base na `main` → merge autorizado pelo João.
- [ ] Os commits dessa entrega estão separados por assunto, em Conventional Commits, sem linha de atribuição.
