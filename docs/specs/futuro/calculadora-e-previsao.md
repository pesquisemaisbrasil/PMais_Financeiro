# Spec: Calculadora de orçamento e previsão

> **Escopo futuro: não implementar sem decisão do PO** (pergunta [F1](../../planning/perguntas-abertas.md#escopo-futuro)). Ajustado às decisões do [handoff](../../handoff/README.md); ver o [README desta pasta](README.md).

**Onda D, em shadow mode até passar no backtest.** Contrato da calculadora que sugere o valor de recrutamento e de incentivo de um projeto novo, da estimativa de telefonia e da previsão de custo final durante o campo.

## Comportamento

**Calculadora de orçamento** (usada pelo comercial e pela gestora na proposta):
- Entradas: metodologia, público (médico/paciente/consumidor), **especialidade**, **comorbidade**, centro de referência (sim/não), duração do questionário (min), amostra, prazo de campo, origem da lista e cotas [S2 25:20].
- Saídas:
  - **faixa** (mín–provável–máx) de **valor de recrutamento** e de **valor de incentivo** por completa;
  - estimativa de **telefonia** (amostra × duração × custo/minuto × fator da lista);
  - total por rubrica, pronto para virar o orçamento da ficha.
- Cada saída mostra os **drivers** que pesaram e os **projetos comparáveis** usados (projetos fechados parecidos, com o realizado deles).
- O usuário pode aceitar, ajustar (override com motivo) ou descartar. O orçamento aprovado guarda o que a calculadora sugeriu e o que foi escolhido.

**Estimativa de telefonia** (começa como tabela, depois modelo):
- Primeiro: tabela "amostra × duração → custo estimado", como a que a operação já usa [S2 05:48–06:57].
- Depois: modelo com o histórico de consumo ([consumo-telefonia-e-digital](consumo-telefonia-e-digital.md)) e a qualidade da lista.

**Previsão de custo final** (no campo):
- Projeta o custo final por rubrica a partir do ritmo (completas/dia), da produtividade, das diárias, do incentivo e da telefonia.
- Mostra a faixa de confiança e a data prevista de término. Alimenta o alerta de projeção de estouro da wallet e propõe cenários ("+2 entrevistadores → termina em X, custa Y").

## Regras

1. A IA **sugere**, nunca aprova: não muda orçamento, valor nem folha sozinha [SWOT §7].
2. Toda sugestão registra a versão do modelo, os dados usados, a confiança e o override.
3. Projeto fora do que o histórico cobre (especialidade rara, metodologia nova) mostra "sem base suficiente" em vez de um número [SWOT R03].
4. Só projetos **fechados** e com o catálogo revisado entram no histórico de treino ([evidencias-e-catalogo](evidencias-e-catalogo.md)).
5. Mudança de incentivo no meio do campo é registrada como evento e usada pelo modelo.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Calcular sem especialidade ou amostra | 422 | Informe a especialidade e a amostra |
| Sem projetos comparáveis | 200 | (resposta com `semBase: true`) Sem base histórica suficiente para estimar |
| Aplicar a sugestão em orçamento aprovado | 409 | O orçamento aprovado não pode ser editado — faça um ajuste |

## Critérios de aceite

- [ ] Para "cardiologia, Chagas, 30 min, n=100", a calculadora mostra a faixa, os drivers e ao menos 3 projetos comparáveis.
- [ ] Override do valor sugerido pede motivo e fica registrado no orçamento.
- [ ] Backtest com 30–50 projetos fechados separados para teste: erro médio ≤15% na faixa coberta antes de sair do shadow mode [SWOT §4.5].
- [ ] A previsão de custo final num projeto em campo atualiza todo dia e explica a variação.

## Origem

- [S2 22:14–33:44]: calculadora (especialidade, comorbidade, centro de referência, tempo, amostra → recrutamento e incentivo), dispersão diária, valor de incentivo médico.
- [S2 05:48–07:33]: telefonia previsível.
- [SWOT S08, S09, S10, S12, PT4, RF08, RF12].
