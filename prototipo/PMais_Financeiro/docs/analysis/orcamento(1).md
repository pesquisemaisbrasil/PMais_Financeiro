# Análise — Projetos e orçamento para o P+ Financeiro

## Síntese e escopo

Os documentos definem o Módulo 4 como espelho financeiro de projetos cujo cadastro e orçamento nascem no P+ Connect. O Financeiro deve receber itens orçamentários com valor e data estimada, criar provisões, associar lançamentos reais às provisões e expor consumo, saldo e alertas. Não deve editar o orçamento. A especificação de projetos também atribui ao Financeiro ficha, ciclo de vida, checklists e fechamento, mas essa atribuição está em revisão porque a decisão posterior do PO diz que o projeto fica no Connect e o supervisor o administra lá (D4/Q16).

O roadmap descreve um processo de protótipo visual/funcional genérico para validar cada módulo antes da construção; isso não equivale à solicitação atual de software funcional, nem autoriza tratar números fictícios de um prompt de protótipo como dados reais. A entrega incremental atualmente proposta é apenas fundação, design, login/MFA, contas/permissões e auditoria; Projetos e orçamento são módulo posterior, dependente de módulos prévios e de contrato Connect validado. Preservar login por e-mail/senha, MFA obrigatório e papéis `financeiro` e `admin`; não inferir novos papéis.

## Requisitos, campos e estados

**Projeto (campos documentados):** código do job, nome, referência do cliente, cliente, empresa, unidade, centro de custo, ID Connect; área, metodologia, gestora responsável, supervisores, amostra prevista e duração do questionário; mês de venda e mês de execução, início/fim de campo previstos e reais; fonte do incentivo (`caixa_proprio`/`link_cliente`), origem da lista (`propria`/`cliente`/`mista`, cotas quando aplicável), modelo de pagamento de campo e ciclo de folha; valor vendido, orçamento por categoria e reserva de contingência. A especificação propõe código único por empresa e ID Connect único quando presente. Conforme visão geral, o Financeiro guarda espelho mínimo e não copia dados pessoais do Connect.

**Orçamento:** cada item/linha de custo exige item, valor e data estimada de pagamento; categoria é o nível orçamentário (não fornecedor individual). O orçamento é montado e alterado no Connect por supervisor autorizado, mediante autorização de admin, com auditoria. Cada categoria deve mapear a conta do plano de contas. O Financeiro cria provisões por categoria/data. Estados/medidas da carteira: orçado, provisionado, comprometido, realizado, saldo e percentual consumido (valores calculados). A provisão é substituída por título real ou cancelada com motivo; nunca é paga.

**Ciclo de projeto proposto no spec:** `proposta → aprovado → em_campo → campo_encerrado → em_fechamento → fechado`; `cancelado` é permitido antes de `fechado`. A transição para `em_campo` exige cliente, centro de custo, gestora, modelo de pagamento e orçamento aprovado e gera checklist de abertura. Encerrar campo (supervisor/gestora) notifica processamento; fechamento financeiro (gestora) vem depois, compara planejado/realizado por rubrica e exige classificação `positivo`/`negativo`/`neutro`. Negativo ou rubrica excedida requer causa (opção e texto livre). Projeto cancelado que tenha custos também requer fechamento financeiro. `fechado` é imutável; eventual reabertura exige admin, motivo e auditoria.

## Regras críticas e alertas

- A baseline do orçamento aprovada na abertura não é editável no Financeiro; alterações posteriores devem vir do Connect e ser registradas.
- Entrevistas têm teto duro no Connect; não há autorização pendente. Outras categorias acima do orçamento ficam `pendente_autorizacao`; não podem ser programadas/pagas até autorização de admin, registrada com autor, data, valor e motivo.
- Fechamento financeiro bloqueia enquanto houver folha não paga, devolução de lote não resolvida, divergência Connect aberta ou título a pagar do projeto em aberto. Lançamentos em projeto fechado são recusados.
- Incentivo `link_cliente` não gera título a pagar, mas deve constar informativamente no planejado versus realizado.
- Carteira usa competência; fluxo de caixa usa data prevista da provisão e data de baixa do realizado.
- Alertas previstos: 80% e 100% de consumo por categoria e total; diferença relevante entre provisionado e real; provisão vencida sem real; e projeção inicial de estouro (`realizado / % campo concluído > orçado × 1,05`). Alertas informam, nunca alteram o orçamento.
- Checklists de abertura/fechamento devem ser configuráveis por área e metodologia, com responsável, prazo e aceite.
- Regras gerais do produto: valores monetários Decimal trafegam como string, datas de negócio em São Paulo; nenhuma baixa/pagamento sem confirmação humana.

## Decisões abertas, contradições e dependências

1. **Q16/D4:** contradição ainda não resolvida: projeto fica no Connect e supervisor o administra, mas spec de Projetos atribui ao Financeiro ciclo de vida, abertura/checklist e aprovação do orçamento. Não assumir qual sistema é autoridade para transições/checklists; orçamento, em qualquer caso, é dono Connect (Q11/D1/D2).
2. **N4 — bloqueio:** contrato Connect `v1` ainda não foi ampliado/validado para itens com datas, consumo do orçamento, prazo e fim do projeto, entre outros. A API do Connect não foi fornecida nem validada; portanto não implementar integração presumida nem habilitar baixa real dependente dela.
3. **F3 — aberto:** categorias oficiais, vínculo com plano de contas e DRE ainda dependem de Financeiro/direção; categorias da tabela são proposta inicial, não taxonomia aprovada.
4. **F4 — parcialmente aberto:** supervisor define prazo comum às equipes, mas falta definir formato (prazo após lançamento ou após fim do projeto).
5. Roadmap posiciona Módulo 4 depois dos módulos 1 e 3 e exige categorias no Connect (N4); carteiras, provisões e bloqueios também dependem de contas a pagar, folha/lotes e dados confiáveis dos módulos anteriores. A primeira entrega proposta (fundação, UI, autenticação/MFA, autorização e auditoria) não implementa este módulo.
6. O roadmap prevê protótipo antes da construção de cada módulo, enquanto a solicitação atual pede software funcional em fases. Isso é diferença de processo/entrega, não validação de regras por si só; não substituir a implementação incremental por protótipo nem inventar decisões.
7. Há ambiguidades operacionais a validar antes da implementação: significado de “orçamento aprovado” se o Financeiro não aprova nem edita; definição de “muito diferente” no alerta de provisão versus real; critério/fonte do percentual de campo concluído e frequência da projeção; tratamento de ajustes/reabertura versus projeto de ajuste; e granularidade/autoridade de fechamento e estados no Connect.

## Recomendação de fase

Na fase inicial, entregar somente a fundação e controles transversais propostos: estrutura e design, autenticação e MFA obrigatórios, papéis `financeiro`/`admin`, contas/permissões e auditoria. Não introduzir papéis novos, migração de dados reais, pagamento bancário ou integração simulada. Em fase posterior, avançar para Projetos/orçamento apenas após decisão documentada de Q16, fechamento/validação do contrato Connect N4, aprovação de categorias F3 e definição dos critérios operacionais acima; seguir dependências do roadmap e validar por módulo. Até então, bloquear baixa real que dependa de API não validada e usar apenas dados de teste explicitamente fictícios, nunca exemplos documentais como dados reais.