# Spec: Projetos financeiros

> **Módulo 4 — Projetos, orçamento e provisionamento.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato da ficha financeira do projeto, do seu ciclo de vida e dos eventos de abertura e fechamento. Substitui a planilha de controle de projetos e o "cronograma" mantidos à mão, e o cadastro de projetos do SGE4B.

## Comportamento

- **Ficha do projeto** (visível para todas as áreas no escopo, que era o "cronograma para todo mundo ver" pedido [S1 02:23]):
  - identificação: código do job* (a nossa referência), nome*, referência do cliente, cliente*, empresa*, unidade*, centro de custo*, ID no Connect*. **O projeto nasce no Connect e chega aqui sozinho** com código, nome, datas e orçamento; o financeiro completa só o que é dele [Reunião 21/10 3:00, 33:26];
  - operação: área (Health, CATI, Campo...), metodologia (quanti/quali, CATI, presencial, online, NPS...), gestora responsável*, supervisores, amostra prevista, duração do questionário (min);
  - datas: mês de **venda** e mês de **execução** (são diferentes: vende num ano e executa no outro [S1 08:25]), início e término de campo previstos e reais;
  - regras financeiras: **fonte do incentivo** (`caixa_proprio` | `link_cliente` — no link do cliente o dinheiro não sai do nosso caixa [S1 03:50]), **origem da lista** (`propria` | `cliente` | `mista`, com cotas por origem quando houver), modelo de pagamento do campo (por entrevista, por hora, por diária ou misto), ciclo de folha;
  - valores: valor vendido (receita), orçamento por rubrica (ver [orcamento-e-saude-financeira](orcamento-e-saude-financeira.md)) e reserva de contingência.
- **Fim do projeto:** o encerramento no Connect marca a data que conta para a folha final (15 dias corridos no consumo, 10 no CATI; ver [folha-de-campo](folha-de-campo.md)) e transforma em data certa a provisão da folha final.
- **Ciclo de vida:** `proposta` → `aprovado` → `em_campo` → `campo_encerrado` → `em_fechamento` → `fechado`; pode ir para `cancelado` a partir de qualquer estado antes de `fechado`.
- **Abertura** (ao passar para `em_campo`): gera um **checklist de abertura** com tarefas por área (processamento, verificação, delivery/online, financeiro). Cada tarefa tem responsável, prazo e aceite, e o checklist inclui itens como "checagem de consistência" que hoje são esquecidos no copia-e-cola de e-mail [S2 11:01–15:20]. Gera também uma comunicação curta com o link da ficha, em vez do e-mail longo.
- **Fechamento** em dois passos:
  1. **Encerrar campo**, pelo supervisor ou pela gestora: avisa na hora o processamento e as demais áreas [S2 16:27].
  2. **Fechamento financeiro**, pela gestora: só depois da última folha paga e sem divergência aberta. Mostra planejado × realizado por rubrica, resultado (receita − custos) e margem, e exige a **classificação do resultado**.
- **Resultado:** `positivo` | `negativo` | `neutro`. Se negativo, ou se alguma rubrica estourou, exige **causa** (lista + texto livre). Causas iniciais: duração maior que a prevista, lista improdutiva, cotas rígidas, custo de delivery/online, verificação, telefonia, aumento de incentivo, aumento de equipe/diárias e outro [S1 09:37–11:20; S2 01:15–02:25].
- A lista de projetos mostra cartões com totais, filtros por status, área, cliente, gestora, resultado e mês de venda/execução, e as cores positivo/negativo da planilha atual [S1 09:37].

## Regras

1. Código único por empresa. O ID do Connect é único quando informado.
2. Não passa para `em_campo` sem cliente, centro de custo, gestora, modelo de pagamento e orçamento aprovado.
3. Orçamento aprovado na abertura é a **linha de base** (baseline) e não se edita. Mudanças depois disso são ajustes registrados no ledger.
4. `fechado` é imutável: nenhum lançamento novo entra. Ajuste depois do fechamento exige **reabrir** (só administrador, com motivo) ou lançar em projeto de ajuste.
5. Fechamento financeiro bloqueado se houver folha não paga, lote com devolução não resolvida, divergência do Connect aberta ou título a pagar do projeto em aberto. Pela ordem: primeiro trate, depois feche.
6. Projeto `cancelado` com custos lançados também passa por fechamento financeiro, com resultado e causa.
7. As tarefas de abertura e de fechamento são configuráveis por área e por metodologia (modelos de checklist), sem código.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Iniciar campo sem orçamento aprovado | 409 | Aprove o orçamento antes de iniciar o campo |
| Iniciar campo sem gestora ou modelo de pagamento | 422 | (validação por campo) |
| Fechar financeiro com folha ou lote pendente | 409 | Ainda há pagamentos pendentes neste projeto: N folhas / M lotes |
| Fechar negativo sem causa | 422 | Informe a causa do resultado negativo |
| Lançar em projeto fechado | 409 | Projeto fechado — peça a reabertura a um administrador |
| Reabrir sem ser administrador | 403 | Só um administrador pode reabrir um projeto fechado |
| Código de projeto já usado na empresa | 409 | Já existe um projeto com esse código |

## Critérios de aceite

- [ ] A gestora cria a ficha, aprova o orçamento e inicia o campo; as tarefas de abertura aparecem para processamento, verificação e financeiro, com prazo.
- [ ] Um projeto vendido em dez/2025 e executado em mar/2026 aparece nos dois filtros (venda e execução).
- [ ] Incentivo marcado como "link do cliente" não gera título a pagar, mas aparece como informativo no planejado × realizado.
- [ ] Ao encerrar o campo, o processamento recebe a tarefa na hora, sem depender de e-mail.
- [ ] Fechar com folha pendente é recusado com a contagem certa.
- [ ] Fechar negativo pede a causa; o relatório de resultados agrupa os projetos por causa.
- [ ] Um projeto fechado não aceita lançamento; um administrador reabre com motivo e isso aparece na auditoria.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md).

Origem do requisito:

- [Reunião 21/10 3:00–3:15, 25:52–33:26]: projeto cadastrado à mão hoje, fim do projeto e datas de pagamento, orçamento na abertura.


- [S1 00:00–11:20]: planilha de controle, campos, cores positivo/negativo e causas.
- [S2 11:01–18:05]: abertura e fechamento por e-mail, aviso ao processamento.
- [SGE4B §5.8]: campos do cadastro de projeto.
- [SWOT §2, D6, S14, RF09].
