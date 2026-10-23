# Spec: Orçamento, provisionamento e saúde financeira

> **Módulo 4 — Projetos, orçamento e provisionamento.** Ordem e estado em [planning/roadmap](../planning/roadmap.md).

Contrato de como o orçamento do projeto chega ao Financeiro, vira **provisão** no fluxo de caixa, é **consumido** pelos lançamentos reais e avisa antes de estourar.

## Comportamento

- **Onde nasce:** o orçamento é montado **na abertura do projeto, no P+ Connect**, dividido por **categoria de custo** (entrevistadores, incentivo, fornecedores, supervisão, telefonia...). Cada categoria tem valor e **data prevista de pagamento** [Reunião 21/10 29:17–34:15].
  - Quem passa o orçamento informa, para cada item, **item, valor e data estimada de pagamento**, os três obrigatórios (decidido, D13).
  - Um **item** é uma linha de custo, como "pagamento a fornecedores" ou "incentivos" (decidido, D2). O orçamento do projeto é a soma dos itens.
  - O nível é a categoria, não cada fornecedor: "18 mil com fornecedor" basta [Reunião 21/10 32:28].
- **Chegada:** o orçamento chega ao Financeiro **sozinho**, pela integração. Ninguém digita de novo; hoje o financeiro recebe por e-mail e lança à mão [Reunião 21/10 33:26].
- **Provisão:** cada categoria × data prevista vira um título `provisao` em contas a pagar. Isso alimenta o fluxo de caixa ("vamos precisar de R$ X na data Y") para a direção [Reunião 21/10 29:38–30:44].
- **Provisão vira real:** quando chegam a folha, a nota ou o título de verdade, o lançamento real **substitui** a provisão:
  - o título real é vinculado à provisão;
  - a provisão é baixada pelo valor que o real consumiu;
  - o que sobra fica visível [Reunião 21/10 30:26, 32:00].
- **Consumo por categoria:** a carteira do projeto (wallet) mostra, por categoria:
  - orçado (do Connect);
  - provisionado;
  - comprometido (título real em aberto, folha aprovada);
  - realizado (baixado);
  - saldo e % consumido.
- **Saúde do projeto:** semáforo por categoria e geral, com a razão em texto ("Fornecedores em 92% com 60% do campo feito").
- **Categorias** (proposta inicial, a fechar com o financeiro, pendência F3). Cada uma aponta para uma conta do plano de contas:

| Categoria | Exemplos | De onde vem o realizado |
|---|---|---|
| Entrevistas de campo | valor por entrevista | Connect (`interviews.launched`) |
| Horas / diárias | por hora, por diária | Folha |
| Supervisão | | Folha ou título |
| Recrutamento | | Folha |
| Incentivo ao respondente | médico, paciente, consumidor | Lançamento agrupado de incentivo; informativo se o link for do cliente |
| Fornecedores | telefonia, listas, plataforma, bot | Títulos a pagar |
| Despesas e reembolsos | transporte, material, alimentação | Títulos a pagar (reembolso) |
| Reserva | | Só por remanejamento autorizado |

## Regras

1. **O dono do orçamento é o Connect.** Só **supervisor autorizado pelo administrador** altera os itens, e toda mudança aparece aqui (D1). O Financeiro **não edita** o orçamento: lê e aplica. Mudar exige autorização de um administrador, no Connect, auditada [Reunião 21/10 33:26; handoff/01 decisão 8].
2. **Teto por categoria:**
   - um lançamento real que leva comprometido + realizado acima do orçado da categoria entra como `pendente_autorizacao`;
   - só segue (programação, lote, baixa) depois da autorização de **algum administrador**, e **a autorização fica em log** (quem, quando, valor e motivo) (D3);
   - exemplo: R$ 20.000 de fornecedores divididos entre 45 fornecedores não podem passar de R$ 20.000 sem autorização [Reunião 21/10 34:02].
3. Para entrevistas, o **teto duro** continua no Connect, que nem deixa lançar acima. Não existe "pendente" para entrevistas.
4. Saldo, % e projeção são **calculados**, nunca digitados.
5. A provisão nunca é paga. Ela só é substituída (por real) ou cancelada (com motivo).
6. Provisão vencida sem lançamento real gera aviso ao financeiro ("Provisão de {categoria} em {projeto} venceu dia dd/mm sem folha/nota").
7. **Alertas** para o financeiro e os administradores:
   - 80% e 100% por categoria e do total (sem repetir na faixa, como no Connect);
   - total real de uma categoria muito diferente do provisionado na data ("tinha 18 mil, chegou 35 mil" [Reunião 21/10 32:28]);
   - **projeção de estouro:** o consumo proporcional ao campo feito passa do orçado (fórmula inicial `realizado / % campo concluído > orçado × 1,05`).
8. O alerta explica a causa e **nunca altera o orçamento**.
   - **Consumo no Connect (D5):** o supervisor vê no Connect quanto já foi gasto dos itens que não são entrevista. O Financeiro **fornece** o consumo por categoria do projeto (só valores, sem dado pessoal), pelo contrato (N4).
9. Competência × caixa: a carteira usa **competência**; o fluxo de caixa usa a **data prevista** (provisão) e a **data de baixa** (realizado).

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Lançamento passa do orçado da categoria | 202 | (aceito como `pendente_autorizacao`) Lançamento acima do orçamento de {categoria} — aguardando autorização de um administrador |
| Não-administrador autoriza estouro | 403 | Só um administrador pode autorizar gasto acima do orçamento |
| Tentar editar o orçamento no Financeiro | 405 | (rota inexistente — o orçamento é alterado no P+ Connect) |
| Pagar uma provisão | 409 | Provisão não é paga — substitua pelo lançamento real |
| Programar ou pagar título `pendente_autorizacao` | 409 | Esse lançamento está acima do orçamento e ainda não foi autorizado |

## Critérios de aceite

- [ ] Um projeto aberto no Connect com orçamento "Fornecedores R$ 18.000 em 30/10; Entrevistadores R$ 6.000 em 03/11" aparece no Financeiro com as duas provisões, sem digitação.
- [ ] O fluxo de caixa de outubro mostra R$ 18.000 previstos em 30/10.
- [ ] Ao lançar a nota real de R$ 17.500 vinculada à provisão, o previsto de 30/10 vira R$ 17.500 real, e a sobra de R$ 500 aparece.
- [ ] Lançar títulos de fornecedores somando R$ 20.001 numa categoria de R$ 20.000 deixa o último `pendente_autorizacao`; ele não aparece para baixa até um admin autorizar.
- [ ] Provisão vencida sem real gera o aviso.
- [ ] A carteira mostra, por categoria, orçado, provisionado, comprometido, realizado e saldo, batendo com os títulos.

## Onde está no código

- A criar na implementação do módulo, na estrutura de [handoff/02](../handoff/02-arquitetura-e-stack.md). No Connect, exige categorias e datas no orçamento e na API (`GET /projects/{id}/budget`, aditivo no `v1`; pergunta N4).

Origem do requisito:

- [Reunião 21/10 29:17–34:15]: provisionamento, orçamento por categoria vindo do Connect, autorização de administrador.
- [S1 11:20–13:41, 50:35–54:17]: alerta antes de estourar, reserva.
- [SWOT S02, S03, S11]; [Connect: projetos-cotas-e-orcamento] regras 6–10.

## Ajustes

- 2026-10-21: item de orçamento = linha de custo (fornecedores, incentivos); autorização de estouro por algum administrador, com log; o Connect passa a mostrar o consumo ao supervisor ([decisões do PO após a reunião de 21/10](../transcricoes/2026-10-21-decisoes-pos-reuniao.md)).

- 2026-10-21: o orçamento por rubrica editado no Financeiro (versão de 20/10) virou orçamento por categoria **montado no Connect** e só aplicado aqui, como o PO descreveu na reunião. O remanejamento entre rubricas saiu: passa a ser uma alteração de orçamento no Connect, com autorização.
- 2026-10-23: o **consumo** dos itens que não são entrevista é **lançado no Connect pelo coordenador** e o Financeiro o **lê** (`items[].spent`); não lança consumo próprio sem decisão do PO (F21). Quem altera o orçamento: administrador e coordenador do projeto; o `financeiro` mantém a permissão no Connect por enquanto ([decisões do PO](../transcricoes/2026-10-23-respostas-do-financeiro-e-decisoes-do-po.md), E3 e E4). A autorização de estouro (D3) segue em aberto (F20).
