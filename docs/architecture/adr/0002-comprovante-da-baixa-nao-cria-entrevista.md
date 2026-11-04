# 0002 — Comprovante dá baixa, não cria entrevista

- **Status:** aceito
- **Data:** 2026-11-03 (registro; a regra vem da reunião de 09/10/2026)
- **Quem decidiu:** PO, no [ADR 0001 do Connect](../../handoff/01-visao-escopo-e-decisoes.md) e nas decisões 6, 7, 9 e 11 do handoff/01

## Contexto

O Financeiro recebe PDFs de comprovantes Pix. Daria para gerar a produção a partir do que foi pago, mas aí o pagamento definiria o trabalho, e um Pix errado viraria entrevista "real".

## Decisão

- Quem lança a produção é o supervisor, no Connect. O comprovante só informa o que já foi pago.
- O valor tem de ser exato: o Pix é igual à soma das entrevistas ainda sem baixa. Se não fecha, vira divergência para revisão humana.
- Nada é pago sem "Confirmar baixa".
- Quem recebeu sem estar no projeto gera alerta, nunca baixa automática.

## Alternativas consideradas

- Criar entrevista a partir do comprovante: inverte a origem da produção e esconde erro de pagamento.

## Consequências

- O status "pago" continua no Connect: o Financeiro pede a baixa pela API, com chave de idempotência ([handoff/07](../../handoff/07-integracao-com-o-connect.md)).
- Pagamento parcial ou "por conta" não é aceito: ajusta-se a produção ou o comprovante fica como divergente.
- Ainda sem código: entra com o pagamento de entrevistadores ([handoff/08](../../handoff/08-dominio-e-codigo-atual.md)).
