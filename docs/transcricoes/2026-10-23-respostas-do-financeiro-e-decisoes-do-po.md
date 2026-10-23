# 2026-10-23: Respostas do financeiro e decisões do PO

- **Data:** 23/10/2026.
- **O que é:** (A) as respostas do financeiro às perguntas que ficaram abertas depois da reunião de 21/10, coladas pelo PO (João Paulo); (B) as decisões do PO tomadas na conversa de 22 e 23/10 sobre o plano de 3 meses, o papel de coordenador no Connect e o convite de cadastro. Os specs apontam para este registro.

## A. Respostas do financeiro (fala bruta, resumida por pergunta)

| # | Pergunta | Resposta |
|---|---|---|
| A1 | Uma empresa do Grupo paga ou repassa dinheiro para outra? | O Grupo tem 4 empresas (MC, PPlus, P Plus Log e Medtrek). A I-hea é uma **unidade de negócio com sistema próprio**. Não há repasses entre empresas hoje, **mas pode acontecer**. |
| A2 | Gastos no cartão de crédito? | Sim. São lançados **por fornecedor, projeto e categoria, rateados conforme o extrato**. |
| A3 | Boletos a pagar | A maioria chega por **e-mail**; alguns ficam para consulta no banco. Hoje **tudo é cadastrado à mão**. O **código de barras vai na observação**, e depois é copiado e colado no banco para pagar. |
| A4 | Adiantamentos e prestação de contas | Acontece em **ajuda de custo de viagem**: deposita-se um valor por diária e a pessoa **envia as notas** justificando os gastos. No fim da viagem manda **um e-mail com um Excel de relatório de despesas e as notas**. |
| A5 | Impostos e retenções | A **retenção** é lançada **junto da emissão da NF**, em contas a receber, na parte de **abatimentos**, para calcular o valor líquido. O sistema guarda **bruto e líquido**. Os **boletos de impostos vêm da contabilidade**, que faz as apurações. |
| A6 | Emissão de nota de venda e cobrança | O financeiro **emite a NF no site da prefeitura**. **Invoice internacional** é um documento preenchido e enviado em PDF por e-mail. A comunicação é **sempre por e-mail**; cliente raramente pede boleto, e mesmo com boleto há NF. **Não é necessário** ter a comunicação com o cliente no sistema agora; talvez no futuro. É "uma troca, não pode ficar tão mecânico". |

### O que isso muda nos specs

- **A1:** o modelo continua multiempresa (4 empresas). A I-hea fica **fora** do Financeiro por enquanto (pergunta F13). Transferência entre empresas não é usada hoje: o lançamento deve permitir marcar "transferência entre empresas" para o **consolidado não contar duas vezes**; a eliminação no consolidado entra com o DRE consolidado (futuro).
- **A2:** o rateio do lançamento (fornecedor, projeto, categoria) já está no contas a pagar. Importar a fatura do cartão fica como futuro.
- **A3:** o lançamento ganha o campo **código de barras / linha digitável**, separado da observação. Ler o boleto do e-mail fica como futuro.
- **A4:** **futuro** ([adiantamentos-e-prestacao-de-contas](../specs/futuro/adiantamentos-e-prestacao-de-contas.md)). Hoje o adiantamento é um lançamento comum, com anexos.
- **A5:** o título a receber tem **valor bruto, abatimentos (retenções) e valor líquido**. Os impostos apurados pela contabilidade não são calculados no sistema; os boletos deles entram como contas a pagar.
- **A6:** a emissão de NF e o envio ao cliente ficam **fora** do sistema. O título a receber guarda o **número e a data da NF emitida** e aceita o **PDF anexado**, inclusive o da invoice internacional (moeda: pergunta F14).

## B. Decisões do PO

| # | Assunto | Decisão |
|---|---|---|
| E1 | Papel **coordenador** (no Connect) | Cria o projeto e **atribui a um supervisor**. Pode mudar orçamento, **preço da entrevista** e o resto, sempre com **histórico registrado**. Monta o **orçamento por itens** e **lança o gasto** dos itens que não são entrevista. O **supervisor só lança entrevistas** nos projetos atribuídos a ele. |
| E2 | Escopo | Coordenador e supervisor só enxergam e operam **os projetos em que são responsáveis**. |
| E3 | Consumo do orçamento (muda a D5 de 21/10) | O gasto dos itens que não são entrevista é **lançado no Connect pelo coordenador**. O Financeiro **lê** o valor gasto por item, em vez de fornecê-lo ao Connect. O Connect bloqueia gasto acima do valor do item; a autorização de estouro por administrador (D3) segue como pergunta no Connect. |
| E4 | Quem altera o orçamento (muda a D1 e a Q11) | Administrador e o coordenador do projeto. O papel `financeiro` no Connect continua alterando por enquanto, até o Financeiro novo assumir a planilha e a baixa. O supervisor deixa de ter essa permissão. |
| E5 | Projeto fica no Connect | Confirma a D4. Resolve a Q16: **ciclo de vida do projeto, orçamento por itens e gasto ficam no Connect**; o Financeiro tem só a visão financeira. |
| E6 | Reaproveitar o que já roda no Connect | A **planilha de pagamentos, o envio do PDF de comprovantes e a baixa** já funcionam no Connect. A entrega 2 do plano é **levar isso para o Financeiro**, reaproveitando o código e as regras. |
| E7 | **Convite de cadastro** (no Connect) | Link único **com o nome da pessoa**, para entrevistadores, gerado em massa a partir de **CSV ou planilha**, devolvendo outro arquivo (nome, telefone, link) para **envio manual**. O **cadastro aberto continua**; o convite é um atalho. Gera os links: admin, coordenador e supervisor (cada um vê só os seus). Telefone que já tem conta é avisado e não gera link. Prazos: 30 dias (entrevistador) e 72 horas (equipe). |
| E8 | **Usuários de equipe** (no Connect) | Só o **administrador** cria supervisor, coordenador, admin e financeiro. A pessoa recebe um link para **definir a própria senha**. |
| E9 | Plano dos 3 primeiros meses | **Protótipo do Marco** antes de tudo; depois **6 entregas em 12 semanas**: (1) base e cadastros, com importação **de teste** do SGE4B; (2) pagamento de entrevistadores; (3) contas a pagar; (4) folha, incentivos, notas e provisões, com lançamento agrupado e comprovantes; (5) contas a receber e **dashboards**; (6) conferência do banco e caixa. A NF do entrevistador **sobe no Connect**. A importação definitiva fica perto da troca do sistema. |
| E10 | Fica para **depois** dos 3 meses | Captura automática de NF; conciliação com IA; autorização para passar do orçamento (pedido de aumento); folha de campo e pagamento em lote pelo Itaú; fechamento do mês; relatórios por projeto; DRE por empresa, unidade e Grupo; planejamento do Grupo × realizado ([spec](../specs/futuro/planejamento-orcamentario-do-grupo.md)); pipeline de propostas; integrações com bancos; novos perfis. |
| E11 | Acompanhamento | Reuniões semanais ou quinzenais de status, acompanhamento no Jira, e cada módulo começa com um protótipo aprovado pelo financeiro. |
| E12 | Pedido da direção (Fabiano) | Sistema financeiro completo do Grupo P+ substituindo a ferramenta atual: pagamentos, propostas, conciliação, comprovantes, contas a pagar e a receber, fluxo de caixa, DRE (empresa, unidade, consolidado), planejado × realizado, dashboards, bancos, governança, documentação e implantação, com etapas, responsáveis, prioridades e critérios de aceite nos 3 primeiros meses. Cobertura no plano de 3 meses e nas "próximas evoluções" (E10). |
