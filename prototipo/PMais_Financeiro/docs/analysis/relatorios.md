# Análise — Relatórios e fluxo de caixa (P+ Financeiro)

## Escopo e interpretação
Esta análise cobre exclusivamente Relatórios e fluxo de caixa, com contexto do roadmap, visão geral e perguntas abertas. A especificação descreve um módulo funcional (Módulo 7), não apenas telas demonstrativas. O protótipo rápido previsto no roadmap é uma etapa de validação de telas/regras com o financeiro, seguida de atualização das specs, construção e uso paralelo com SGE4B até conferência. Isso é distinto tanto do antigo prompt de protótipo visual quanto da solicitação atual de software funcional. Números fictícios ou exemplos de protótipo não são dados reais nem base para relatórios ou migração.

A implementação é incremental: a entrega inicial proposta é fundação, design, login/MFA, contas/permissões e auditoria. Relatórios e fluxo de caixa são posteriores; não devem ser tratados como parte funcional da primeira entrega. A stack pode seguir a adaptação autorizada para React/Vite/Express/tRPC/Drizzle/MySQL. Preservar login por e-mail/senha, MFA obrigatório e apenas os papéis `financeiro` e `admin`; não inferir autorização para novos papéis, migração de dados reais, decisões adicionais de produto ou integração simulada.

## Requisitos e conteúdo
A especificação agrupa consultas operacionais e análises gerenciais. Entre os relatórios prioritários (ordem 1) estão lançamentos a pagar/receber; resultado por projeto e causas de resultado negativo; folha/pagamentos de campo; wallet consolidada; fluxo de caixa; e extrato × despesas. DRE, fluxo mensal, recebimentos de projetos × ano e previsto × realizado aparecem na ordem 2.

No fluxo de caixa, apresentar visões diária, semanal e mensal, previsto versus realizado, saldo projetado por conta e consolidado. Previsto reúne provisões do orçamento e títulos em aberto classificados pela data de vencimento; realizado utiliza baixas pela data efetiva da saída/entrada, de modo a reconciliar com o extrato. O previsto deve permitir listar títulos em aberto para o período.

Relatórios devem suportar filtros combináveis, seleção de colunas, ordenação, agrupamento, totais/subtotais, indicadores clicáveis e favoritos que preservem filtros e colunas. Exportar XLSX, CSV e PDF; impressão deve mostrar filtros, data/hora e usuário. Exportações devem incluir filtros usados, totais e IDs dos títulos para auditoria/migração. Para relatórios com nome de pessoa de campo, registrar `export_log`; não exibir CPF nem chave Pix completa. Texto exportado deve ser tratado como texto, evitando injeção de fórmulas. Relatório pesado acima de limite síncrono (>50 mil linhas, limiar ainda a validar) deve rodar em segundo plano e notificar quando pronto.

## Campos e dimensões explicitados
- Pagar/receber: programação, pagamento, fornecedor ou cliente, plano de contas, valor líquido, pago, pendente, projeto, unidade, centro de custo, empresa, conta, situação e descrição; filtros incluem programação, empresa, contraparte, projeto, centro de custo e intervalo de datas.
- Resultado por projeto: receita, custo por rubrica (planejado × realizado), margem, resultado e causa; filtros por área, gestora, cliente, mês de venda/execução, status e resultado.
- Folha/campo: ciclo, projeto, pessoa, quantidades, valores, exceções, pago e devolvido.
- Fluxo: período diário/semanal/mensal, conta, saldo previsto/realizado, provisões, títulos em aberto/vencimento e baixas/data de baixa; visão por conta e consolidada.
- DRE e previsto × realizado incluem dimensões como empresa, unidade, projeto, centro de custo, linha do DRE/plano de contas e período, conforme relatório.

## Estados, transições e regras críticas
O fluxo distingue provisão orçamentária e título em aberto no previsto de baixa confirmada no realizado. O título em aberto entra por vencimento; após baixa passa a compor realizado pela data de baixa, não pela data do lançamento. Períodos fechados ficam congelados e não aceitam lançamento novo. São estados operacionais visíveis em outros relatórios: pago, pendente, situação, pago/devolvido e diferenças de conciliação (voltas, pendências, não conciliado); a especificação não define aqui um workflow completo de transição desses estados.

Regras essenciais:
1. Totais devem equivaler à soma exata das linhas exibidas sob a mesma interseção de filtros; itens fora do escopo do usuário não podem contaminar linhas nem totais.
2. DRE e resultado por projeto usam competência. Fluxo de caixa realizado e contas pagas usam data da baixa; previsto usa vencimento.
3. Resultado de projeto fechado deve bater com seu fechamento financeiro; DRE mensal deve bater com contas analíticas vinculadas à linha.
4. Usuário fora do papel/escopo financeiro recebe 403; período inicial posterior ao final recebe 422. Exportação acima do limite síncrono retorna 202 e processamento assíncrono.
5. Não exportar CPF ou chave Pix completa em relatórios. Escopo de papéis permanece financeiro/admin; a visão geral diz que supervisor não acessa o Financeiro e F11 mantém outros papéis em aberto.

## Dependências e bloqueios
O roadmap posiciona o Módulo 7 após os módulos 3 (contas a pagar/receber), 4 (projetos, orçamento e provisionamento) e 6 (conciliação bancária). A confiabilidade de lançamentos, dimensões, provisões, baixas e extrato é pré-condição para os números gerenciais e a comparação com banco. O módulo consta como “specs prontos”, não construído. A integração Connect exige contrato ampliado N4 para dados orçamentários/projeto relevantes; API do Connect não foi fornecida/validada e a baixa real deve permanecer bloqueada até validação. Não simular integração nem tomar dados de protótipo como fonte real.

## Decisões abertas, ressalvas e possíveis contradições
- F3: categorias oficiais do plano de contas e vínculo com linhas do DRE e categorias de orçamento ainda dependem de Financeiro/direção. É bloqueio para DRE e análises por categoria.
- F8: empresas/CNPJs, unidades e segregação de acesso ainda não definidos, embora os relatórios filtrem por empresa/unidade.
- Limite de 50 mil linhas para exportação assíncrona é explicitamente provisório (“a validar”); também faltam política de retenção/notificação e prazo de disponibilidade do arquivo.
- Contrato Connect N4 ainda pendente; a spec pressupõe provisões derivadas de orçamento do Connect, mas os dados e contrato necessários não estão validados.
- Roadmap descreve protótipo-validar-spec-construir-uso paralelo; o escopo de entrega atual antecipa apenas fundação/autenticação/permissões/auditoria. Não é conflito funcional, mas exige não antecipar relatórios ou usar visual de protótipo como aceite do módulo.
- “Todos os relatórios” e a lista de ordem 1/2 abrangem conjunto amplo; deve-se preservar prioridade e sequência, sem assumir que ordem 1 significa primeira entrega do produto.
- Relatório menciona exportação para auditoria e migração, mas isso não autoriza migração de dados reais nesta etapa. Acessos, bancos e serviços devem respeitar os papéis existentes e a validação da integração.

## Recomendação de fase
Fase inicial: somente fundação, design, autenticação por e-mail/senha com MFA obrigatório, contas/permissões para `financeiro` e `admin`, e trilha de auditoria, sem relatórios funcionais nem carga/migração real. Em fase posterior, após módulos 3/4/6 e resolução das dimensões/contrato necessários, prototipar e validar consultas com o Financeiro; então construir primeiro os relatórios priorizados e fluxo de caixa, testar invariantes de filtros/totais/data de baixa e conciliação, executar em paralelo ao SGE4B e só promover após bater. Manter baixa real bloqueada até a API do Connect ser fornecida e validada.

## Fontes locais consultadas
`docs/specs/relatorios-e-analises.md`, `docs/planning/roadmap.md`, `docs/specs/visao-geral.md` e `docs/planning/perguntas-abertas.md` do repositório fornecido. Nenhuma fonte externa foi utilizada.
