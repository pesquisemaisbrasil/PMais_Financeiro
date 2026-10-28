# Specs

Contrato de comportamento de cada área do **Financeiro da Pesquise+**, sistema separado do P+ Connect que substitui o SGE4B. O código é a fonte da verdade; o spec diz o que ele deve fazer e como verificar. Comece por [visao-geral](visao-geral.md); a ordem dos módulos está em [planning/roadmap](../planning/roadmap.md).

## Por módulo

| Módulo | Spec | O que cobre |
|---|---|---|
| — | [visao-geral](visao-geral.md) | Ponto de entrada: o que é, fronteira com o Connect, regras de produto, módulos |
| **1. Pagamento de entrevistadores** ([plano do handoff](../handoff/11-plano-de-implementacao.md)) | [acesso-e-auditoria](acesso-e-auditoria.md) | Login, papéis `financeiro` e `admin`, MFA, permissões, trilha de auditoria |
| | [pagamentos-a-pagar](pagamentos-a-pagar.md) | Espelho dos itens a pagar, resumo, planilha de pagamentos, avisos |
| | [comprovantes-e-baixa](comprovantes-e-baixa.md) | PDF de comprovantes, leitura, conciliação por soma exata, "Confirmar baixa" |
| | [integracao-com-o-connect](integracao-com-o-connect.md) | Cliente da API, webhooks, sincronização, baixa, divergências |
| **2. Cadastros, papéis e migração** | [cadastros-e-dimensoes](cadastros-e-dimensoes.md) | Empresas, unidades, centros de custo, categorias/plano de contas, DRE, clientes, fornecedores; migração das 11 bases do SGE4B |
| | [papeis-e-escopo-ampliados](papeis-e-escopo-ampliados.md) | Novos papéis e escopo por empresa/projeto |
| **3. Contas a pagar e a receber** | [contas-a-pagar](contas-a-pagar.md) | Lançamento, rateio por colagem, lançamento agrupado com itens, ações em lote, provisão |
| | [contas-a-receber](contas-a-receber.md) | Títulos a receber, inadimplência |
| | [baixas-recorrencia-e-anexos](baixas-recorrencia-e-anexos.md) | Baixa (também em lote), voltas, estorno, recorrência, anexos |
| | [documentos-fiscais](documentos-fiscais.md) | NF e RPA do prestador, notas recebidas, guarda de 5 anos, exportação para a contabilidade |
| **4. Projetos, orçamento e provisionamento** | [projetos-financeiros](projetos-financeiros.md) | Ficha financeira (vinda do Connect), ciclo de vida, fechamento com causa |
| | [orcamento-e-saude-financeira](orcamento-e-saude-financeira.md) | Orçamento por categoria vindo do Connect, provisão → real, teto com autorização, alertas |
| **5. Folha de campo e pagamento em lote** | [regras-de-pagamento-de-campo](regras-de-pagamento-de-campo.md) | Valores de diária, hora, supervisão, incentivo, com vigência |
| | [folha-de-campo](folha-de-campo.md) | Folha por data de pagamento (regras por área), sem relançamento |
| | [lotes-de-pagamento-de-campo](lotes-de-pagamento-de-campo.md) | Lote Pix; etapa 2: envio ao Itaú com retorno de erros por pessoa |
| **6. Conciliação bancária** | [bancos-e-conciliacao](bancos-e-conciliacao.md) | Extrato, conciliação linha a linha com classificação, voltas, fechamento do mês para a contabilidade |
| **7. Relatórios e fluxo de caixa** | [relatorios-e-analises](relatorios-e-analises.md) | Fluxo de caixa com provisões, extrato × despesas, por data de baixa, DRE, resultado por projeto |

Ainda fora do escopo, em [futuro/](futuro/README.md): telefonia e consumo digital, atribuição de produção, calculadora de orçamento e evidências/OCR. A reunião de 21/10 não tratou desses temas.

## Formato

Cada spec tem 5 seções, mais `## Ajustes` quando houver (template em [handoff/10 §3](../handoff/10-processo-docs-e-skills.md)):

1. **Comportamento**
2. **Regras**
3. **Casos negados** (situação | HTTP | `detail` exato)
4. **Critérios de aceite**
5. **Onde está no código**

Como o código ainda não existe, "Onde está no código" traz o destino planejado e a **origem do requisito**. As origens possíveis:

- `[Reunião 21/10 mm:ss]`: [registro da reunião com o financeiro](../transcricoes/2026-10-21-processo-de-reconciliacao-e-lancamento.md);
- `[S1]` / `[S2]`: entrevistas com a gestão operacional;
- `[SGE4B §x]`: levantamento do sistema atual;
- `[SWOT]`: relatório SWOT/Design Thinking;
- `[handoff/NN]`: pacote técnico;
- `[Connect: …]`: specs do Connect.

`(a validar)` = regra proposta que quem opera precisa confirmar.

**Regra:** mudou o comportamento, atualize o spec no mesmo PR. Decisão de produto não se toma no código: vai para [perguntas-abertas](../planning/perguntas-abertas.md).
