---
name: financeiro-mudanca
description: Rotina para criar ou alterar qualquer funcionalidade, tela, endpoint, tabela, regra ou integração do Financeiro da Pesquise+ seguindo os padrões do projeto — spec dono, decisões anotadas (ADR, ajustes do spec, perguntas abertas), backend em camadas, frontend com componentes ui, Connect sempre simulado nos testes, testes pytest/Vitest/E2E Playwright e docs no mesmo PR. Use sempre que for implementar, corrigir ou mudar comportamento neste repositório, mesmo em pedidos curtos como "faz X", "arruma Y" ou "adiciona Z".
---

# Rotina de mudança do Financeiro

Os contratos estão nos docs; esta rotina fixa a ordem e o que não pode ser esquecido. Leia o [AGENTS.md](../../../AGENTS.md) antes. Feche o trabalho com a skill [entregar](../entregar/SKILL.md).

## 1. Entender o pedido

- Ache o spec dono em [docs/specs/](../../../docs/specs/README.md) e as jornadas em [docs/specs/README.md](../../../docs/specs/README.md).
- Mexe em comprovante, conciliação, baixa ou planilha: leia as invariantes em [docs/handoff/08-dominio-e-codigo-atual.md](../../../docs/handoff/08-dominio-e-codigo-atual.md).
- Mexe na conversa com o P+ Connect: leia [docs/specs/integracao-com-o-connect.md](../../../docs/specs/integracao-com-o-connect.md).
- Pedido novo vindo de reunião ou conversa: registre a fala bruta em `docs/transcricoes/AAAA-MM-DD-assunto.md` antes de interpretar. É a evidência do que foi pedido.
- **Ambíguo em regra de negócio:** pergunte. **Ambíguo em detalhe técnico:** escolha o mais seguro e registre (passo 5).

## 2. Backend (`backend/`)

- Siga [docs/handoff/03-padroes-backend.md](../../../docs/handoff/03-padroes-backend.md):
  - `api/` (auth, permissão, rate limit, exceção → HTTP) → `services/` (regra, exceção de domínio) → `models/` + `schemas/`;
  - toda rota com `response_model`, `description`, `@limiter.limit` e `request: Request`;
  - `detail` em pt-BR para usuário não técnico.
- **Dinheiro e datas:** `Decimal` sempre; dia de negócio no fuso de São Paulo (`core/text.py`).
- **Concorrência:** invariante que depende de leitura usa `with_for_update`; confirmação e baixa numa transação só.
- **Tabela ou coluna nova:** migration Alembic com `downgrade`, `ondelete` explícito, import em `alembic/env.py`, e atualize [docs/handoff/04-banco-de-dados.md](../../../docs/handoff/04-banco-de-dados.md).
- **Dado pessoal:**
  - CPF nunca;
  - chave Pix: casa por hash da chave normalizada (`core/pix.py`), mostra mascarada, completa só na planilha, com auditoria;
  - nome do comprovante cifrado;
  - nada disso no log.
  - Mudou o que se guarda: [inventário de dados](../../../docs/architecture/seguranca/README.md) e ROPA no mesmo PR.
- **Comprovante:** o PDF é lido em memória e descartado (a não ser que exista ADR e retenção aprovada pelo DPO). Leitor novo de banco entra como novo `ReceiptParser`, lendo só o bloco do recebedor.

## 3. Integração com o P+ Connect

- Só pela API de integração, com o cliente único (`services/connect_client.py`) e conta de serviço com escopo mínimo. Nunca acessar o banco do Connect.
- Toda escrita no Connect leva `Idempotency-Key` (na baixa, o ID da transação Pix).
- Nunca chamar HTTP de dentro de uma transação do banco: grave na *outbox* e despache depois.
- Timeout explícito, reentrega com backoff e erro do Connect nunca vira "pago" no Financeiro.
- Mudança incompatível no contrato = nova versão (`/v2`) + ADR, combinada com o time do Connect.

## 4. Frontend (`frontend/`)

- Leia [frontend/AGENTS.md](../../../frontend/AGENTS.md): o Next.js daqui tem APIs diferentes.
- Siga [docs/handoff/05-padroes-frontend-e-ui.md](../../../docs/handoff/05-padroes-frontend-e-ui.md):
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
| Contrato com o Connect | [docs/specs/integracao-com-o-connect.md](../../../docs/specs/integracao-com-o-connect.md) (+ ADR se incompatível) |

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
