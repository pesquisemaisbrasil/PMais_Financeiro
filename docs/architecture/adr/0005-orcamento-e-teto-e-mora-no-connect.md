# 0005 — Orçamento é teto, e quem o altera é o Connect

- **Status:** aceito
- **Data:** 2026-11-03 (registro; a regra vem do ADR 0006 do Connect e da Q11)
- **Quem decidiu:** PO, na decisão 8 do [handoff/01](../../handoff/01-visao-escopo-e-decisoes.md), e reunião de 21/10/2026 (33:26)

## Contexto

Os projetos têm verba fechada com o cliente. Um aviso que pode ser ignorado não protege a margem, e dois sistemas alterando o mesmo orçamento perderiam a fonte da verdade.

## Decisão

- O orçamento é montado e alterado só no Connect. O Financeiro lê e aplica.
- **Entrevistas:** o teto duro fica no Connect, que nem deixa lançar acima dele.
- **Demais categorias:** no Financeiro, o lançamento que passa do orçado fica `pendente_autorizacao` até um administrador autorizar, com log ([spec, regra 2](../../specs/orcamento-e-saude-financeira.md)).

## Alternativas consideradas

- Editar o orçamento pelo Financeiro via API: descartado na Q11.

## Consequências

- Estourou uma entrevista: alguém aumenta o orçamento no Connect antes de lançar, porque não existe "forçar".
- O texto de quem altera o orçamento ainda está sendo corrigido nos specs (PF-37 e PF-39).
- Ainda sem código: entra com o módulo de orçamento.
