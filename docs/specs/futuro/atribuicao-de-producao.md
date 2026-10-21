# Spec: Atribuição de produção

> **Escopo futuro: não implementar sem decisão do PO** (pergunta [F1](../../planning/perguntas-abertas.md#escopo-futuro)). Ajustado às decisões do [handoff](../../handoff/README.md); ver o [README desta pasta](README.md).

**Onda C, começa em shadow mode.** Contrato de como cada entrevista é ligada a quem a gerou (disparo online da empresa, recrutador, entrevistador, supervisor) para pagar com prova e medir o retorno do online.

## Contexto

Hoje a empresa dispara convites (e-mail, WhatsApp, SMS, RCS) para a base inteira. Depois de alguns dias, a lista é dividida entre recrutadores, e tudo o que entra a partir daí é contado como deles, mesmo quando a resposta veio do disparo. O banco do STG não tem o nome do recrutador. Já houve fraude com recibos sem comprovação, e há casos de entrevistador alegando produção derrubada sem prova [S1 33:49–46:01].

## Comportamento

- **Eventos de contato** por respondente e projeto, cada um com data/hora, canal, origem (empresa ou pessoa) e ID:
  - `disparo` (canal, campanha);
  - `entrega`;
  - `clique`;
  - `lista_atribuida` (registro → recrutador, por quem e quando);
  - `contato_humano` (recrutador/entrevistador, canal);
  - `inicio_entrevista`;
  - `completa` (STG/Connect).
- **Token por link:** cada convite (online ou enviado por recrutador) carrega um token que identifica a origem. A completa no STG leva o token [SWOT §6.2].
- **Regra de atribuição** (versionada, definida pela operação + financeiro, pendência F7): por exemplo, o último contato humano registrado em até N dias antes da completa recebe o crédito; sem contato humano, o crédito é do online. Pode haver crédito dividido (a validar).
- **Pergunta de autodeclaração** ("por onde você respondeu?") como sinal auxiliar, nunca como prova única [S1 39:08].
- **Conflitos:** completa reivindicada por duas origens, recrutador sem evento de contato, lista repassada depois da completa. Vão para a fila **antes** da folha ser aprovada.
- **Contestação:** a pessoa de campo (pelo Connect) ou o supervisor contesta uma atribuição, anexando evidência. A gestora decide e a decisão fica registrada.
- **Painel:** % de completas atribuídas, por canal e por pessoa; custo do online por completa atribuída × custo humano.

## Regras

1. **Shadow mode:** enquanto o gate não for atingido, a atribuição só é **mostrada** ao lado da folha, como sugestão, e não muda o valor.
2. Depois de ativada: o recrutamento só é pago por completa atribuída à pessoa pela regra vigente. Declaração isolada não paga [SWOT §7].
3. Toda atribuição guarda a versão da regra e os eventos usados (explicável).
4. A gestora pode sobrescrever (override) com motivo. Todo override é auditado e entra na métrica.
5. Lista repassada: o evento `lista_atribuida` é obrigatório para que uma completa possa ser creditada ao recrutador.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Aprovar folha com conflito de atribuição aberto (modo ativo) | 409 | Há N conflitos de atribuição sem decisão nesta folha |
| Override sem motivo | 422 | Informe o motivo da mudança de atribuição |
| Contestação fora do prazo do ciclo (a validar) | 409 | O prazo de contestação deste ciclo terminou |

## Critérios de aceite

- [ ] Uma completa com disparo + clique e sem contato humano é atribuída ao online.
- [ ] Uma completa com `lista_atribuida` ao recrutador e `contato_humano` 2 dias antes é atribuída ao recrutador.
- [ ] Uma completa reivindicada por dois recrutadores aparece na fila de conflitos antes da aprovação.
- [ ] No shadow mode, a folha mostra a atribuição sugerida ao lado do declarado, sem mudar valores.
- [ ] Gate para ativar: ≥95% das completas atribuídas, concordância ≥90% numa revisão cega por amostra e conflitos resolvidos [SWOT §4.5].

## Origem

- [S1 32:13–46:01]; [SWOT P05, D3, S06, S07, PT3, RF06, R02]. Pendência F7.
