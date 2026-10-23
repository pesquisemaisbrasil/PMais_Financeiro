# Specs do escopo futuro

> **Não implementar sem decisão do PO.** A reunião de 21/10 trouxe para o escopo a substituição do SGE4B, organizada em módulos ([../README](../README.md)). Os temas desta pasta **não foram tratados** nela e continuam fora do escopo até o PO decidir (pergunta [F1](../../planning/perguntas-abertas.md#escopo-futuro)).

## Specs

| Spec | O que cobre |
|---|---|
| [consumo-telefonia-e-digital](consumo-telefonia-e-digital.md) | Custo de telefonia, listas, disparos e bot por projeto |
| [atribuicao-de-producao](atribuicao-de-producao.md) | Online × recrutador × entrevistador, em shadow mode |
| [calculadora-e-previsao](calculadora-e-previsao.md) | Calculadora de orçamento e previsão de custo, em shadow mode |
| [planejamento-orcamentario-do-grupo](planejamento-orcamentario-do-grupo.md) | Orçamento de todas as áreas do Grupo comparado com o realizado (pedido do Fabiano) |
| [adiantamentos-e-prestacao-de-contas](adiantamentos-e-prestacao-de-contas.md) | Ajuda de custo de viagem com saldo a comprovar e prestação de contas |
| [evidencias-e-catalogo](evidencias-e-catalogo.md) | Cofre de evidências com OCR/renomeação e catálogo Big Base |

Vêm das entrevistas com a gestão operacional e do relatório SWOT:
- o custo de telefonia não entra no planejamento;
- não dá para provar quem gerou cada entrevista;
- o orçamento é feito "por experiência";
- milhares de fotos são renomeadas à mão.

O que é IA só sugere e roda em shadow mode até passar no critério de cada spec.

## Como se encaixam

- Pessoas, projetos, entrevistas e orçamento continuam com o Connect; nada aqui copia pessoas ([../integracao-com-o-connect](../integracao-com-o-connect.md)).
- Os custos medidos (telefonia, disparos) entram como categorias do orçamento ([../orcamento-e-saude-financeira](../orcamento-e-saude-financeira.md)).
- Arquivos só no cofre cifrado de [handoff/06 §4](../../handoff/06-seguranca-e-lgpd.md).

## Formato e marcadores

As 5 seções de sempre, com **Origem** como última seção (não há código nem destino definido):

- `[S1 mm:ss]` / `[S2 mm:ss]`: entrevistas com a gestão operacional;
- `[SWOT]`: relatório SWOT/Design Thinking;
- `[Connect: …]`: specs do Connect.

`(a validar)` = regra proposta.
