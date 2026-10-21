# 2026-10-21: reunião com o financeiro e escopo em módulos

Depois do alinhamento com o handoff, que deixava só o pagamento de entrevistadores no escopo, a reunião com o financeiro ([registro](../../transcricoes/2026-10-21-processo-de-reconciliacao-e-lancamento.md)) mudou o rumo:

- o SGE4B foi descrito como "só um controle, tipo um caixa";
- o PO falou em dividir o sistema em módulos e validar cada um com o financeiro, até chegar ao fluxo de caixa.

## O que mudou nos docs

| Antes | Agora |
|---|---|
| Escopo = Módulo 1 (handoff); o resto em `specs/futuro/` | 7 módulos em `specs/`; só telefonia, atribuição, calculadora e evidências ficam em `futuro/` |
| NF/RPA fora do escopo (handoff/01) | Novo spec [documentos-fiscais](../../specs/documentos-fiscais.md): modelo fiscal no cadastro do Connect, "sem NF não recebe", guarda de 5 anos, conferência de notas |
| Orçamento por rubrica editado no Financeiro | Orçamento **por categoria montado no Connect**, que chega sozinho, vira **provisão** e é substituído pelo real; estouro só com autorização de admin |
| Pagar pelo banco fora do escopo | Etapa 2 do Módulo 5 (envio ao Itaú com retorno de erros por pessoa), dependendo da pesquisa N1 |
| Contas a pagar no modelo do SGE4B | + rateio por colagem, lançamento agrupado com itens, ações em lote, legenda nos ícones, prazo de 3 dias para documentação |
| Baixa simples | + baixa em lote, **voltas** (Pix devolvido), recorrência estimada |
| Conciliação genérica | Conciliação **pelo extrato, linha a linha**, com classificação (incentivo, NF número/data, RPA...), voltas, diferença extrato × despesas e exportação para a contabilidade |
| Folha por ciclo quinzenal | Folha por **data de pagamento da área** (consumo, Health, CATI), folha proporcional, NF obrigatória |
| Relatórios por competência/vencimento | Relatório de pagos e fluxo de caixa pela **data de baixa**; fluxo de caixa com provisões |
| Q11 aberta (contradição no handoff) | Decidida: o Financeiro não altera o orçamento |

## O que não mudou

- Tudo do handoff que é técnico: stack, padrões, segurança, separação de bancos, integração só por API, idempotência.
- As regras de produto do Módulo 1.

## Pendências novas

- N1 a N5 e o novo texto de F3, F4, F5 e F6, em [perguntas-abertas](../perguntas-abertas.md).
- O contrato com o Connect precisa crescer (N4) antes dos Módulos 4 e 5.
