# Spec: Visão geral do Financeiro

Ponto de entrada para quem (pessoa ou agente) vai construir o **Financeiro**. Leia inteiro, junto com [handoff/01](../handoff/01-visao-escopo-e-decisoes.md) (decisões técnicas e a fronteira com o Connect) e o [registro da reunião de 21/10](../transcricoes/2026-10-21-processo-de-reconciliacao-e-lancamento.md) (escopo).

## O que é

O **Financeiro** é o sistema financeiro da Pesquise+. É **separado** do P+ Connect, com repositório, deploy, banco e MinIO próprios, e **substitui o SGE4B**. Na reunião de 21/10, o SGE4B foi descrito como "só um controle, tipo um caixa", sem integração com o banco [Reunião 21/10 4:27–4:49].

É construído **em módulos**, cada um validado com a equipe do financeiro antes de entrar em uso [Reunião 21/10 45:23–46:21, 48:29–48:46]:

| Módulo | O que entrega |
|---|---|
| 1. Pagamento de entrevistadores | Tira do Connect a planilha, o comprovante Pix, a conciliação e a baixa ([plano do handoff](../handoff/11-plano-de-implementacao.md)) |
| 2. Cadastros, papéis e migração | Fornecedores, clientes, categorias, centros de custo; importação das 11 bases do SGE4B |
| 3. Contas a pagar e a receber | Lançamento, rateio, lançamento agrupado com itens, ações em lote, baixas, recorrência, NF/RPA |
| 4. Projetos, orçamento e provisionamento | Projeto e orçamento por categoria vindos do Connect; provisão que vira real; teto com autorização |
| 5. Folha de campo e pagamento em lote | Folha por data de pagamento, lote Pix; etapa 2: envio direto ao Itaú |
| 6. Conciliação bancária | Extrato linha a linha, classificação, voltas, fechamento para a contabilidade |
| 7. Relatórios e fluxo de caixa | Fluxo de caixa com provisões, por data de baixa, DRE, resultado por projeto |

Antes de cada módulo, um **protótipo rápido** valida as telas e as regras com o financeiro. Só depois o módulo é construído na arquitetura do [handoff](../handoff/README.md) [Reunião 21/10 45:39–46:21]. A ordem e o estado estão em [planning/roadmap](../planning/roadmap.md).

## Quem usa

| Papel | No Financeiro |
|---|---|
| `financeiro` | Contas a pagar (lançamentos, folhas, incentivos, baixas), contas a receber, conciliação, fechamento, planilha e comprovantes |
| `admin` | Tudo, mais usuários, contas de serviço, auditoria e **autorização de gasto acima do orçamento** |
| Supervisor | **Não entra** (Q1). Lança entrevistas no Connect e sobe NF lá |
| Entrevistador | **Não entra.** No Connect: escolhe NF ou RPA, sobe a NF e vê "Pago em dd/mm" |

Outros papéis (direção, gestora de projeto, comercial, auditor): [papeis-e-escopo-ampliados](papeis-e-escopo-ampliados.md), pendência F11.

## Fronteira com o Connect

| Dado | Dono | O Financeiro… |
|---|---|---|
| Pessoas, CPF (hash), chave Pix (cifrada), **modelo fiscal (NF/RPA) e NF enviada** | Connect | **não copia**. Lê pela API; a chave completa só ao gerar a planilha, com auditoria nos dois lados |
| Projetos, valor por entrevista, prazo, **orçamento por categoria** | Connect | lê pela API, guarda espelho mínimo e cria as provisões |
| Entrevistas lançadas | Connect | guarda o espelho mínimo por id (`payable_items`) |
| Status "pago" da entrevista | Connect | **pede** a baixa (`POST /payments`, idempotente) |
| Lotes, comprovantes, conciliação, contas a pagar/receber, extrato, documentos fiscais de fornecedores, relatórios | **Financeiro** | — |

**Regra de ouro:** o Financeiro nunca lê nem escreve no banco ou no MinIO do Connect. Tudo passa pela API ([integracao-com-o-connect](integracao-com-o-connect.md)). O que a reunião de 21/10 pôs no Connect (categorias do orçamento, modelo fiscal, envio de NF) exige ampliar o contrato `v1` (pendência N4).

## Regras de produto que valem para tudo

As de 1 a 10 são decisões do [handoff/01](../handoff/01-visao-escopo-e-decisoes.md); as de 11 a 13 vêm da reunião de 21/10. Não reabrir sem nova decisão do PO.

1. **O comprovante dá baixa, não cria entrevista.**
2. **Valor exato:** Pix = soma dos itens pagos. Não existe resto; se não fecha, é divergência e vai para revisão humana.
3. **Orçamento é teto, e quem controla é o Connect.** Para entrevistas, é teto duro no lançamento. Nas outras categorias, o lançamento acima fica aguardando a autorização de um administrador.
4. **Nada é pago sem confirmação humana.**
5. **O PDF do comprovante Pix do entrevistador não é guardado.** Notas fiscais são guardadas por 5 anos no cofre cifrado ([documentos-fiscais](documentos-fiscais.md)).
6. **Quem recebeu sem estar no projeto** gera alerta e nunca é pago automaticamente.
7. **Chave Pix mascarada** em toda tela; completa só na planilha e no lote, que são auditados.
8. **CPF nunca aparece:** só existe como hash, no Connect.
9. **Dinheiro é `Decimal`** e trafega como string `"40.00"`; datas de negócio no fuso de São Paulo.
10. **Casamento da chave Pix é feito pelo Connect** (`pix-key-matches`).
11. **Todo pagamento tem documento fiscal ou "sem documento" com motivo.** Quem recebe por NF só é pago com a NF enviada.
12. **Data de baixa é a data em que o dinheiro saiu.** Relatório de pagos e fluxo de caixa usam a data de baixa, para bater com o extrato.
13. **Nada é digitado duas vezes:** projeto, orçamento e entrevistas vêm do Connect; planilha de folha ou incentivo é importada, não redigitada.

## Fora do escopo agora

- Telefonia e consumo digital, atribuição de produção, calculadora de orçamento e evidências/OCR: em [futuro/](futuro/README.md).
- App mobile.
- Emissão de NF pela Pesquise+ e obrigações fiscais (SPED, impostos). O RPA é emitido pela contabilidade.

## Ajustes

- 2026-10-20: primeira versão dos specs, a partir do levantamento do SGE4B, do relatório SWOT e das entrevistas com a gestão operacional.
- 2026-10-21: alinhado ao handoff; escopo amplo movido para `futuro/` ([histórico](../planning/historico/2026-10-21-alinhamento-specs-com-handoff.md)).
- 2026-10-21: reunião com o financeiro. O escopo amplo volta, organizado em módulos, e entram NF/RPA, provisionamento, rateio, ações em lote, voltas e integração com o Itaú (etapa 2) ([histórico](../planning/historico/2026-10-21-reuniao-financeiro-escopo-em-modulos.md)).
