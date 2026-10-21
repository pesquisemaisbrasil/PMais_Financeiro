# Roadmap

Ordem dos módulos do Financeiro e o estado de cada um. Cada módulo segue o mesmo caminho:

1. **Protótipo** rápido e genérico, validado com o financeiro (Bruna e Camila) até o "é isso" [Reunião 21/10 45:39–46:21].
2. **Specs** atualizados com o que o protótipo mostrou.
3. **Construção** na arquitetura e nos padrões do [handoff](../handoff/README.md) (02 a 10), com um PR por entrega.
4. **Uso em paralelo** com o SGE4B até bater, e depois troca.

## Ações antes de começar

- [ ] Login de consulta no SGE4B para o time de desenvolvimento (funcionalidades e relatórios).
- [ ] Reunião só para levantar as **11 bases** e os relatórios usados, e pedir ao fornecedor do SGE4B a **exportação completa**.
- [ ] Levantar com a Camila os dados de RPA e da ficha de fornecedor (N3).
- [ ] Pesquisas técnicas: integração Itaú (N1) e captura automática de NF (N2).

## Módulos

| # | Módulo | Specs | Depende de | Estado |
|---|---|---|---|---|
| 0 | Fundação do repositório | [handoff/11 fase 0](../handoff/11-plano-de-implementacao.md) | — | a fazer |
| 1 | Pagamento de entrevistadores | acesso-e-auditoria, pagamentos-a-pagar, comprovantes-e-baixa, integracao-com-o-connect | 0; API de integração no Connect | specs prontos |
| 2 | Cadastros, papéis e migração | cadastros-e-dimensoes, papeis-e-escopo-ampliados | 0; exportação do SGE4B | specs prontos; falta a exportação |
| 3 | Contas a pagar e a receber | contas-a-pagar, contas-a-receber, baixas-recorrencia-e-anexos, documentos-fiscais | 2 | specs prontos; protótipo a fazer |
| 4 | Projetos, orçamento e provisionamento | projetos-financeiros, orcamento-e-saude-financeira | 1, 3; categorias do orçamento no Connect (N4) | specs prontos |
| 5 | Folha de campo e pagamento em lote | regras-de-pagamento-de-campo, folha-de-campo, lotes-de-pagamento-de-campo | 1, 3, 4; etapa 2 depende de N1 | specs prontos |
| 6 | Conciliação bancária | bancos-e-conciliacao | 3 | specs prontos |
| 7 | Relatórios e fluxo de caixa | relatorios-e-analises | 3, 4, 6 | specs prontos |

**Por que essa ordem:**
- o Módulo 1 já está desenhado em detalhe pelo handoff e tira o risco da integração com o Connect;
- o 2 e o 3 substituem o uso diário do SGE4B;
- o 4 e o 5 eliminam a redigitação;
- o 6 e o 7 dependem de lançamentos e baixas confiáveis.

O 2 pode começar em paralelo ao 1, porque não depende do Connect.

## Como testar

Cada módulo, ao ser entregue, ganha aqui o roteiro manual de teste (como no roadmap do Connect).
