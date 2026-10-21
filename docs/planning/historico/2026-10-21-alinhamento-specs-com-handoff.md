# 2026-10-21: alinhamento dos specs com o handoff

Os specs de 20/10, montados a partir do levantamento do SGE4B, do relatório SWOT e das entrevistas com a gestão operacional, foram enviados aos superiores. Eles responderam com o handoff técnico (`docs/handoff/`). Este registro diz o que mudou e por quê. **Vale o handoff**: as decisões dele são do PO.

## O que mudou

| Tema | Specs de 20/10 | Agora (handoff) |
|---|---|---|
| **Escopo** | Substituir o SGE4B + folha + orçamento por rubrica + telefonia etc. | Escopo atual = pagar entrevistadores e provar o pagamento. O resto foi para `specs/futuro/` (pergunta F1) |
| **Conciliação Pix** | Ficava no Connect para as entrevistas, com "dois Pix por pessoa" | Toda no Financeiro; o Connect só recebe a baixa pela API ([comprovantes-e-baixa](../../specs/comprovantes-e-baixa.md)) |
| **Orçamento de entrevistas** | O Financeiro era dono e enviava ao Connect | **O Connect é dono e controla o teto**; o Financeiro só lê. O handoff se contradiz neste ponto (07 × 08 §9): pergunta Q11 |
| **Pessoas** | Espelho da pessoa de campo (nome + chave mascarada) | Não copia pessoas; espelho mínimo só de itens a pagar (`payable_items`) |
| **Papéis** | 7 papéis | Só `financeiro` e `admin`; os outros foram para `futuro/papeis-e-escopo-ampliados.md` (F11) |
| **Valor por entrevista** | Pendência P2 | Do Connect (resolvido) |
| **Casamento da chave** | Não previsto | O Connect casa (`pix-key-matches`); nenhum segredo de hash compartilhado |
| **Login** | E-mail | E-mail, como o handoff/06; o handoff/04 diz CPF: pergunta Q10 |
| **MFA** | Para todos | Para todos (`admin` e `financeiro`), igual |
| **Formato do spec** | Última seção "Origem" | Template do handoff, com "Onde está no código" (destino planejado) e "Ajustes". Os specs futuros mantêm "Origem" |
| **Estrutura** | `specs/` solto | `docs/` como manda o handoff/10: `handoff/`, `specs/`, `planning/` |

## O que se manteve

- **O que o handoff não cobre:** os specs futuros documentam necessidades reais que ele deixa "por enquanto" fora do escopo: o SGE4B, a folha de 25 arquivos por quinzena, estouros só vistos no fechamento e a atribuição online × recrutador.
- **Regras iguais nos dois:** valor exato, nada pago sem confirmação humana, chave mascarada, CPF só em hash, auditoria append-only, IA que só sugere.

## Pendências registradas

- Q10, Q11, Q2 e as F1–F12 entraram em [perguntas-abertas](../perguntas-abertas.md).
- As perguntas do handoff (01, 06, 07 e 08) foram consolidadas ali.
