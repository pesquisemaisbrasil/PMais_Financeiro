# Spec: Projetos financeiros

> **Módulo 4 — Projetos, orçamento e provisionamento.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato da **visão financeira** do projeto: receita, custo, provisão, margem e relatório. O projeto em si nasce e vive no **Connect** (E1, E5), com o coordenador. Aqui ele é um espelho mínimo, e o Contas a pagar é quem o alimenta (K1).

## Comportamento

- **O projeto chega sozinho do Connect**, com código, nome, datas, orçamento por itens e situação. O Financeiro não cria projeto, não muda a situação e não altera o orçamento [Reunião 21/10 3:00, 33:26; E5].
- **O que o financeiro completa aqui:**
  - valor vendido (receita);
  - mês de **venda** e mês de **execução**, que são diferentes: vende num ano e executa no outro [S1 08:25];
  - **fonte do incentivo** (`caixa_proprio` | `link_cliente`): no link do cliente, o dinheiro não sai do nosso caixa [S1 03:50].
- **Relatório do projeto** [Kickoff 03/11 12:41–13:23]: a tela por projeto mostra orçamento, lançado, pago, a pagar, provisões, saldo, margem e **os anexos de todos os lançamentos** de Contas a pagar do projeto, com link para cada lançamento. Responde "quanto foi gasto no projeto X" e serve para fechar relatório. **Não é onde se paga.**
- **Fim do projeto:** o encerramento no Connect marca a data que conta para a folha final ([folha-de-campo](folha-de-campo.md)) e transforma em data certa a provisão da folha final.
- **Tipo do projeto** (Health, CATI, consumo...), **tem incentivo** e **prazo do incentivo em dias úteis**: onde são configurados é a pergunta F23 [Kickoff 03/11 16:31–17:10].
- **Resultado:** receita − custos, com a classificação `positivo` | `negativo` | `neutro`. Se negativo, ou se alguma categoria estourou, pede a **causa** (lista + texto livre) [S1].
- A lista de projetos mostra cartões com totais, filtros por situação, cliente, resultado e mês de venda ou execução, e as cores positivo/negativo da planilha atual [S1 09:37].

## Regras

1. O código do projeto vem do Connect e é único. O ID do Connect é guardado como `connect_project_id`, sem FK.
2. Projeto encerrado no Connect não aceita lançamento novo nem mudança de valor. Quem reabre é um administrador, no Connect.
3. O resultado é **calculado** a partir dos lançamentos: custo vem de Contas a pagar, nunca é digitado na tela do projeto.
4. O relatório nunca altera lançamentos nem o orçamento.

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Lançar em projeto fechado | 409 | Projeto fechado — peça a reabertura a um administrador |
| Fechar resultado negativo sem causa | 422 | Informe a causa do resultado negativo |

## Critérios de aceite

- [ ] Um projeto criado no Connect aparece aqui sem digitação, e o financeiro só completa receita e meses.
- [ ] O relatório do projeto lista orçamento, lançado, pago, a pagar, saldo e os anexos de todos os seus lançamentos de Contas a pagar, e cada lançamento abre ao ser clicado.
- [ ] Um projeto vendido em dez/2025 e executado em mar/2026 aparece nos dois filtros (venda e execução).
- [ ] Incentivo marcado como "link do cliente" não gera título a pagar, mas aparece como informativo no planejado × realizado.
- [ ] Resultado negativo pede a causa; o relatório de resultados agrupa os projetos por causa.
- [ ] Um projeto encerrado no Connect não aceita lançamento em Contas a pagar.

## Onde está no código

- O espelho mínimo está em `backend/models/reference.py`. O restante será criado na implementação do módulo.

Origem do requisito:

- [Kickoff 03/11 12:41–13:23, 16:31–17:10]: relatório do projeto; tipo, incentivo e prazo.
- [Reunião 21/10 3:00–3:15, 25:52–33:26]: projeto cadastrado à mão hoje, fim do projeto e datas de pagamento, orçamento na abertura.


- [S1 00:00–11:20]: planilha de controle, campos, cores positivo/negativo e causas.
- [S2 11:01–18:05]: abertura e fechamento por e-mail, aviso ao processamento.
- [SGE4B §5.8]: campos do cadastro de projeto.
- [SWOT §2, D6, S14, RF09].

## Ajustes

- 2026-10-21: o projeto **fica no Connect** e o supervisor administra tudo lá ([decisões do PO após a reunião de 21/10](../transcricoes/2026-10-21-decisoes-pos-reuniao.md), D4). O ciclo de vida e a aprovação do orçamento descritos aqui precisam ser revistos (pergunta Q16, resolvida em 23/10: ver o ajuste abaixo).
- 2026-10-23: **resolvida a Q16.** O ciclo de vida do projeto, o orçamento por itens e o gasto ficam no **Connect**, com o papel de **coordenador** (cria o projeto, atribui o supervisor, muda orçamento e preço com histórico e lança o gasto dos itens que não são entrevista); o supervisor só lança entrevistas nos projetos atribuídos ([decisões do PO](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), E1 a E5). Este spec deve ser reduzido à **visão financeira** do projeto (receita, custo, provisão, margem), sem ciclo de vida próprio.
- 2026-11-03: a tela por projeto vira **relatório do projeto** (orçamento, lançado, pago, a pagar, saldo e anexos), e o pagamento fica em Contas a pagar; o tipo do projeto, "tem incentivo" e o prazo do incentivo entram na ficha ([kickoff com o financeiro](../transcricoes/2026-11-03-kickoff-com-o-financeiro.md), K4, K7).
- 2026-11-04: spec reduzida à visão financeira, como pedem a E1 e a E5. Saíram o ciclo de vida próprio, a gestora, o checklist de abertura e o fechamento em dois passos, que ficam no Connect ou deixam de existir. A classificação do resultado e as causas ficam até o financeiro validar o relatório do projeto.
- 2026-11-11 (**projeto do Connect vira projeto do Financeiro**): em **Cadastros → Projetos**, **Atualizar do Connect** traz os projetos de lá (`POST /finance/connect/sync`): cada um vira projeto de Contas a pagar e do relatório, com o **código igual ao ID do Connect** (PRJ-1820) e o título do Connect, e entra como "em andamento". Quem já existe só tem o **título** atualizado: o tipo, o incentivo e a situação que o financeiro marcou não mudam. A situação **encerrado** e o **orçamento** ainda não chegam do Connect (Q40). Foi o que faltava para o piloto: antes, o projeto do Connect só alimentava a tela de comprovantes. O relatório do projeto está em [relatorios-e-analises](relatorios-e-analises.md).
