# 0003 — PDF de comprovante não é armazenado

- **Status:** proposto. O kickoff de 03/11 (K2) pede os comprovantes no lançamento, o que reabre esta decisão (Q19)
- **Data:** 2026-11-03 (registro; a regra vem do ADR 0002 do Connect)
- **Quem decidiu:** PO, na decisão 10 do [handoff/01](../../handoff/01-visao-escopo-e-decisoes.md)

## Contexto

O PDF do banco traz dados de terceiros: nome, chave Pix e, às vezes, CPF do recebedor. Guardar o arquivo aumenta o dado pessoal sob custódia e cria mais um ponto de vazamento.

## Decisão

- O PDF é lido em memória e descartado. Não vai para o armazenamento de arquivos nem para o banco.
- De cada comprovante ficam só os campos mínimos: chave em hash e mascarada, valor, data e `e2eId`.

Vale até a Q19 ser respondida pelo João e pelo DPO: nenhum PDF de comprovante é guardado.

## Alternativas consideradas

- Guardar o PDF no cofre cifrado: só depois de o DPO definir a retenção, como diz a decisão 10.

## Consequências

- Não dá para abrir o comprovante original pelo sistema: quem precisa recorre ao banco.
- Reprocessar exige enviar o PDF de novo.
- Nenhum PDF real entra no repositório, nem em teste.
- Ainda sem código: entra com o pagamento de entrevistadores.
