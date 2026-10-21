# Spec: Consumo de telefonia e digital

> **Escopo futuro: não implementar sem decisão do PO** (pergunta [F1](../../planning/perguntas-abertas.md#escopo-futuro)). Ajustado às decisões do [handoff](../../handoff/README.md); ver o [README desta pasta](README.md).

**Onda C.** Contrato da medição do custo de telefonia, listas, disparos online (e-mail, WhatsApp, SMS, RCS) e bot/IA por projeto. Hoje esse custo "normalmente não vem nos planejamentos" e é o maior gargalo de verba no CATI [S2 05:48].

## Comportamento

- **Fontes de consumo** por projeto:
  - **telefonia:** minutos, tentativas, rota e custo (importação da fatura ou do relatório do provedor, por arquivo, ou API quando houver);
  - **disparos:** quantidade por canal, custo unitário e custo total (plataforma de delivery);
  - **bot/IA:** chamadas, minutos ou tokens e custo (piloto em monitoramento [S2 32:08]);
  - **listas:** compra de listagem como título a pagar ligado ao projeto (cada listagem custa milhares de reais [S2 05:48]).
- Cada importação vira lançamento `realizado` na rubrica correspondente do ledger, com a competência do consumo.
- **Indicadores por projeto:**
  - custo por entrevista completa (telefonia + disparos + bot);
  - minutos por completa;
  - tentativas por completa;
  - **produtividade da lista** (completas ÷ registros discados).
- **Rateio** quando a fatura é única para vários projetos: pela base disponível (ramal/rota/campanha), ou proporcional às completas, com regra configurada e auditada.
- **Preço adicional de bot:** relatório de custo médio por chamada por projeto, para o comercial precificar o bot como item à parte [S2 33:44].

## Regras

1. A importação é idempotente (período + provedor + identificador).
2. Consumo sem projeto identificado vai para a fila "consumo sem projeto" e não entra em nenhum ledger até ser atribuído.
3. A regra de rateio é versionada. Mudar a regra não recalcula períodos já fechados.
4. **Alerta de lista improdutiva:** produtividade abaixo de X% do esperado (a validar) depois de N tentativas avisa a gestora [S2 06:57].
5. Custo em moeda estrangeira (alguns serviços de IA cobram em dólar [S2 32:08]) é convertido pela cotação da data, guardando o valor original e a cotação.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Arquivo de consumo já importado | 409 | Esse período do provedor {X} já foi importado |
| Atribuir consumo a projeto fechado | 409 | Projeto fechado — peça a reabertura para a direção |
| Arquivo em formato desconhecido | 422 | Formato não reconhecido para o provedor {X} |

## Critérios de aceite

- [ ] Importar a fatura de telefonia do mês lança o custo nos projetos certos, e o que sobra sem projeto fica na fila.
- [ ] A wallet mostra a telefonia realizada, e o alerta de 80% dispara como nas outras rubricas.
- [ ] O projeto mostra custo de telefonia por completa e produtividade da lista.
- [ ] Um consumo de bot em USD aparece em R$, com a cotação e o valor original.

## Origem

- [S2 00:00–07:33, 28:01, 32:08–33:44]; [SWOT S12, S13, P10, R08].
