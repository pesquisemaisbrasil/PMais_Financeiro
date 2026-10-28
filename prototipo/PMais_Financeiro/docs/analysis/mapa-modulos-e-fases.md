# P+ Financeiro — relatório técnico e mapa incremental de módulos e fases

**Status do documento:** consolidação dos diagnósticos recebidos; não é especificação final de produto, autorização de produção ou comprovação de integração.

**Base utilizada:** somente as respostas fornecidas nesta solicitação. Não foi feita nova pesquisa, consulta externa, uso de MCP/browser nem releitura dos arquivos de origem.

## 1. Escopo, premissas e limites

O ZIP deve ser tratado como **documentação de referência**, não como software executável, base de dados, contrato de integração, evidência de produção ou autorização para copiar automaticamente decisões do protótipo. O prompt antigo de protótipo descreve uma SPA mockada, com dados locais, papéis e MFA fictícios; ele serve, no máximo, como insumo de validação visual e de hipóteses. Não substitui o software funcional solicitado nem autoriza dados reais, integração simulada, migração, movimentação de recursos ou novos papéis.

O usuário autorizou o uso do **WebDev adaptado em fases**, mantendo a adaptação técnica informada nos diagnósticos: React/Vite/Express/tRPC/Drizzle/MySQL. O handoff que menciona Next/FastAPI/Postgres/MinIO deve ser preservado como referência documental, mas requer registro e verificação dos equivalentes de segurança e operação na stack adaptada. Em particular, devem ser definidos e verificados os equivalentes MySQL para privilégios append-only, migrations, backups e segregação; não se deve assumir equivalência sem validação.

A solicitação atual é de construção incremental de **software funcional**, não de entrega de um protótipo visual isolado. A primeira entrega proposta é transversal e limitada à fundação, design, identidade e segurança: login por e-mail e senha, MFA TOTP obrigatório, papéis financeiro e admin, autorização efetiva, auditoria e controles de infraestrutura/testes. Os módulos financeiros operacionais dependem dessa base e de decisões/contratos ainda pendentes.

Nenhum módulo deste documento é declarado pronto para produção. Não há integração real validada, não há dados reais autorizados e não há permissão para afirmar que pagamentos, baixas bancárias, Connect, Itaú, migração ou relatórios operacionais estejam funcionais. Toda integração ainda não validada deve permanecer bloqueada; nenhum mock deve ser apresentado como funcionamento real.

## 2. Resultado executivo

A ordem segura é:

1. consolidar fundação técnica, documentação, identidade visual, testes/CI e controles de infraestrutura;
2. entregar identidade e acesso com e-mail/senha, MFA TOTP obrigatório para financeiro e admin inclusive no primeiro login, sessão segura, contas e permissões efetivas no servidor e auditoria;
3. fechar as decisões de governança, proteção de dados, dimensões, categorias, Connect, orçamento, prazo, segregação e bancos;
4. implementar cadastros e migração somente após validações e autorização explícita;
5. implementar contas a pagar/receber e regras de baixa sem ativar baixa real ou integração bancária não validada;
6. implementar projetos/orçamento conforme autoridade do Connect e contrato validado;
7. implementar folha/lotes de campo com regras versionadas, exceções, reconciliação e segregação;
8. implementar conciliação bancária com importação idempotente, confirmação humana e períodos fechados;
9. implementar relatórios e fluxo de caixa sobre fontes confiáveis e reconciliadas.

Essa sequência **não reduz o escopo final**: ela organiza o escopo em dependências e gates. Pagamentos, baixas, Connect, Itaú, migração, projetos, folha, conciliação e relatórios continuam previstos como módulos posteriores, mas não podem ser silenciosamente antecipados nem tratados como prontos na primeira fase.

## 3. Primeira entrega proposta — fundação, acesso, segurança e auditoria

### 3.1 Conteúdo proposto da primeira entrega, sujeito à aprovação do plano

A primeira entrega deve contemplar:

- fundação técnica e documental, identidade visual, testes/CI e controles de infraestrutura;
- login exclusivamente por e-mail e senha;
- MFA TOTP obrigatório para os papéis financeiro e admin, inclusive no primeiro login;
- access token somente em memória;
- refresh token em cookie `HttpOnly`, `Secure`, com rotação e detecção de reuso; o handoff prescreve `SameSite=Strict`, mas o Preview incorporado do WebDev requer `SameSite=None; Secure`. O plano registra essa adaptação e as proteções de origem/CSRF correspondentes;
- somente os papéis aprovados neste escopo: `financeiro` e `admin`;
- autorização efetiva no servidor a cada requisição;
- auditoria append-only, privilégios mínimos e ausência de dados pessoais/segredos em logs técnicos;
- testes de cenários negados, MFA e sessões, último admin, auditoria e ausência de dado sensível em claro;
- separação do Financeiro em relação ao Connect, sem acesso direto aos bancos ou MinIO do Connect.

A primeira entrega não inclui dados reais, migração, pagamentos bancários, integração ativa com Connect, baixa real, novos papéis, decisão de segregação de funções Q8, OIDC, projetos manuais, ou qualquer comportamento que dependa de contrato/API não fornecido e validado.

### 3.2 Controles de segurança não negociáveis

- Não usar CPF como login; o handoff que sugere login por CPF é contradito pela especificação de acesso e pela decisão mais recente de e-mail/senha.
- Não copiar o padrão legado de `localStorage` para access/refresh tokens. Access permanece em memória; refresh fica em cookie protegido conforme acima.
- Não armazenar CPF no Financeiro. Não exibir CPF completo, chave Pix completa ou outros dados pessoais sensíveis em telas/logs; a chave Pix completa deve ter acesso limitado e auditado e ser mascarada na tela.
- Não criar papéis adicionais a partir do protótipo ou de propostas documentais. Direção, gestor, supervisor, comercial, auditor e outros permanecem fora do escopo aprovado até decisão explícita. Supervisor é, na visão geral, não usuário do Financeiro.
- O financeiro é separado do Connect. Não há acesso direto a bancos/MinIO do Connect.
- Nenhum lançamento em período fechado; reaberturas, quando previstas, somente por admin, com motivo e auditoria.
- Segregação de funções Q8, eventual OIDC, novos papéis, empresas/unidades e alçadas permanecem decisões abertas, não devem ser inferidos pelo código.
- Nenhum segredo ou dado pessoal em claro nos logs técnicos.

### 3.3 Gate de aceite da fundação

A fundação somente pode ser considerada concluída quando os testes e evidências cobrirem sessão segura, MFA obrigatório no primeiro login, autorização por servidor, último admin, tentativas negadas, auditoria append-only, ausência de segredo/dado sensível em logs e controles de recuperação. Ainda assim, isso não equivale a prontidão de produção dos módulos financeiros.

## 4. Mapa incremental de módulos

### Fase 0 — preparação, documentação e governança

**Objetivo:** transformar a documentação recebida em base controlada para implementação sem converter hipóteses em decisões.

**Entregáveis:** inventário de requisitos e contradições; decisões abertas rastreadas; matriz de dependências; identidade visual; arquitetura adaptada WebDev; estratégia de testes/CI; controles de infraestrutura; definição dos equivalentes MySQL; gates para Connect, DPO, contabilidade e financeiro.

**Bloqueios e decisões:**

- Definir/verificar equivalentes MySQL para privilégios append-only, migrations, backups e segregação, pois o handoff descreve PostgreSQL.
- Confirmar provisionamento inicial do primeiro admin e recuperação segura de MFA/suporte.
- Validar política de retenção/auditoria e avaliações ROPA/RIPD com o DPO.
- Decidir segregação de funções Q8, eventual OIDC e papéis adicionais; todos ficam fora do escopo atual até aprovação.
- Não tratar o ZIP como código, contrato ou dado operacional.

**Critério de saída:** decisões registradas sem apagar as pendências; arquitetura e controles testáveis; nenhuma integração ou dado real ativado.

### Fase 1 — identidade, acesso e auditoria

**Objetivo:** entregar a primeira funcionalidade transversal do produto.

**Escopo:** fundação, login e-mail/senha, MFA TOTP obrigatório para financeiro/admin inclusive primeiro login, sessão segura, papéis financeiro/admin, autorização de servidor, auditoria append-only, identidade visual e testes/CI.

**Dependências:** Fase 0 e validação dos controles de infraestrutura/segurança.

**Fora desta fase:** cadastros operacionais, títulos, baixas, Connect, Itaú, projetos, folha, conciliação, relatórios funcionais, migração real, dados reais e papéis novos.

**Critério de saída:** controles da seção 3 comprovados; não declarar o produto ou os módulos financeiros como prontos para produção.

### Fase 2 — dimensões, cadastros e preparação de migração (Módulo 2)

**Objetivo:** estabelecer fornecedores, contas, categorias, projetos e dimensões necessárias aos lançamentos, somente após validação de campos e governança.

**Regras preservadas:**

- Cadastro que tenha lançamentos deve ser inativado, nunca excluído; inativos não entram em novos lançamentos, mas permanecem no histórico e relatórios.
- Somente conta analítica recebe lançamentos e deve estar vinculada a uma linha DRE; alterações de vínculo não modificam períodos encerrados.
- CPF/CNPJ exige dígito verificador. O tratamento do CPF de pessoa física depende de DPO, contabilidade e financeiro; não expor CPF completo nem chave Pix em telas.
- Importação em massa exige pré-visualização, erros por linha e confirmação explícita antes de gravar.
- Projetos novos não são cadastrados manualmente no Financeiro; projeto e pessoa de campo são originados do Connect por API validada.
- Migração real exige exportação completa do SGE4B, levantamento das 11 bases/relatórios, reconciliação, autorização explícita, operação paralela até o corte e saldo aberto conciliado a 100%.
- Baixa real continua bloqueada até validação da API Connect; não simular integração nem autorizar pagamento bancário.

**Bloqueios:** exportação integral do SGE4B e levantamento das 11 bases/relatórios; contrato/API Connect; ficha completa de fornecedor e tratamento de CPF/RPA; lista oficial de contas/categorias e vínculos DRE/orçamento (F3); multiempresa/unidades/segregação (F8); papéis (F11).

**Critério de saída:** campos, validações, estados, escopo e regras de migração aprovados por DPO/contabilidade/financeiro quando aplicável; nenhum dado real migrado sem autorização.

**Contradições a resolver sem decisão implícita:**

- Papéis ampliados (direção, gestor, supervisor, comercial, auditor) versus visão geral/F11, que os mantém não aprovados; supervisor é explicitamente não usuário do Financeiro.
- Contrato opcional no lançamento versus observação de que no SGE4B consta como obrigatório.
- CPF de fornecedor pessoa física como hash + quatro últimos dígitos sujeito a DPO versus CPF/PIS-NIT para RPA ainda não resolvido; visão geral determina que CPF permaneça no Connect.
- Escopo por empresa/unidade/projeto proposto versus F8 pendente.
- Projetos no roteiro de migração versus decisão de que projetos novos vêm do Connect.
- Unicidade de documento definida entre fornecedores ativos, sem regra para inativos, clientes ou duplicidade entre tipos.

### Fase 3 — contas a pagar e a receber (Módulo 3)

**Objetivo:** criar títulos, itens, parcelas, rateios, recorrência, autorizações e baixas controladas sobre cadastros confiáveis.

**Regras preservadas:**

- Situação e saldo pendente são derivados; valores usam `Decimal`; rateios, itens e parcelas devem fechar com o total.
- Baixa registrada é imutável: correção por estorno e nova baixa; título com baixa não pode ser excluído.
- Baixas em período fechado são bloqueadas; retroativas exigem observação.
- Títulos acima do orçamento aguardam autorização de admin.
- Projeto fechado não admite lançamento nem alteração de valor.
- Item fiscal NF exige número e data de emissão; prestador NF sem nota não entra na planilha; RPA tem desconto calculado, não digitado.
- Não criar papéis novos, não integrar pagamento bancário e não migrar dados reais sem autorização.

**Bloqueios:** API/contrato Connect; dependência dos cadastros/dimensões da Fase 2; decisões de produto e dados pendentes; pagamento bancário/Itaú depende de pesquisa/decisão N1.

**Contradições a resolver:**

- Regra de baixa diz soma menor ou igual ao devido, mas abre exceção para juros/multa sem validação clara de excedente.
- Exclusão com recebimento oferece “estorne ou cancele”, mas o fluxo/estado de cancelamento não está detalhado.
- Recorrência deixa em aberto vencimento no dia útil anterior ou próximo; a regra atual indica próximo dia útil, mas feriados exigem definição.
- Retenção varia: NF de entrevistador no Connect por seis meses e rede por cinco anos; notas de fornecedores no cofre por cinco anos, com extensão dos seis meses ainda aberta.

**Critério de saída:** regras e exceções decididas, dependências da Fase 2 resolvidas e testes de fechamento, estorno, autorização e fiscal aprovados. Baixa real via Connect permanece bloqueada se o contrato não estiver validado.

### Fase 4 — projetos, orçamento e provisões (Módulo 4)

**Objetivo:** acompanhar orçamento originado no Connect, itens por categoria/data, consumo, provisões, limites e fechamento.

**Regras preservadas:**

- O Connect é dono do orçamento; o Financeiro não o edita.
- Itens exigem descrição, valor e data estimada de pagamento; mudanças autorizadas por admin devem ser auditadas.
- Entrevistas têm teto duro no Connect; excesso nas demais categorias fica `pendente_autorizacao` e não pode ser programado/pago sem autorização auditada de admin.
- Provisões não são pagas: são substituídas por real ou canceladas com motivo; valores, saldos e projeções são calculados.
- Fechamento bloqueia com folha não paga, devolução de lote não resolvida, divergência Connect aberta ou título do projeto em aberto.
- Projeto fechado é imutável, salvo reabertura por admin com motivo e auditoria.
- Alertas de consumo/estouro informam, mas nunca alteram orçamento.
- Carteira usa competência e fluxo de caixa usa datas previstas/baixa.
- Não editar orçamento no Financeiro, não simular integração e não ativar baixa real.

**Bloqueios:** contrato Connect v1 ampliado/API N4 para orçamento com itens/datas, consumo, prazo e encerramento; Q16/D4 sobre autoridade do ciclo de vida, checklist e transições; F3 sobre categorias/plano de contas/DRE; F4 sobre formato do prazo; dependência das Fases 2 e 3.

**Contradições:**

- Spec atribui ciclo de vida, checklist e aprovação ao Financeiro, enquanto D4/Q16 atribui projeto ao Connect e gestão ao supervisor; não resolver sem decisão do PO.
- Roadmap fala em protótipo genérico validado antes de cada módulo, enquanto a solicitação corrente exige software funcional por fases; protótipo não deve ser confundido com aplicação funcional.
- “Orçamento aprovado” é pré-condição, mas Financeiro não aprova nem altera orçamento segundo Q11/D1/D2; autoridade e significado operacional aguardam Q16.

**Critério de saída:** decisão de autoridade aprovada, categorias e contrato N4 validados, integração testada em ambiente autorizado e regras de fechamento cobertas. Sem API validada, nenhuma automação de ingestão ou baixa real.

### Fase 5 — folha de campo e lotes de pagamento (Módulo 5)

**Objetivo:** aplicar regras versionadas a entrevistas e demais naturezas, tratar exceções e organizar lotes com reconciliação e confirmação humana.

**Regras preservadas:**

- Folha aprovada é imutável; ajustes posteriores são rastreáveis no ciclo seguinte e preservam a versão aplicada.
- Sem regra vigente, exceção pendente, autorização orçamentária/documentação fiscal obrigatória ou confirmação humana, não há pagamento.
- Pagamento/Pix deve corresponder exatamente à soma dos itens; divergência exige revisão humana.
- Aprovador da folha não pode gerar/baixar seu lote; deduplicar entrevistas e `e2eId`.
- Entrevistas pertencem ao Connect e só têm baixa após API/contrato validados; folhas são baixadas no Financeiro.
- Chave Pix completa é limitada e auditada; tela exibe apenas versão mascarada.
- Até decisão F2, entrevistas e outras naturezas ficam em pagamentos separados; não alterar nem simular o contrato Connect.

**Bloqueios:** Connect não fornecido/validado; Itaú não autorizado e depende de N1/pesquisa; dependência das Fases 2, 3 e 4 e do contrato N4; decisões sobre prazo, acesso/aprovação, limiar X%, alçadas, ciclo de folhas e parâmetros listados no diagnóstico.

**Contradições:**

- Folha pressupõe supervisor enviando e gestora aprovando, mas visão geral/Q1 diz que supervisor não acessa Financeiro e F11 mantém financeiro/admin; o processo precisa ser remapeado a papéis autorizados.
- Consolidação por pessoa pode sugerir um único pagamento, mas F2/Connect exige separar entrevistas e demais naturezas; manter separação até decisão.
- Itaú aparece como etapa 2, mas N1 está pendente e o escopo anterior o excluía; tratar como futuro.
- ReceiptParser e comportamentos são alvo futuro; não presumir componentes existentes.

**Critério de saída:** regras versionadas, exceções e alçadas decididas, lotes reconciliados e testes de deduplicação/segregação aprovados. Não enviar ao Itaú nem movimentar recursos nesta fase sem autorização e contrato válidos.

### Fase 6 — conciliação bancária (Módulo 6)

**Objetivo:** importar extratos, conciliar linhas a baixas/itens, classificar, tratar devoluções/diferenças e fechar períodos.

**Regras preservadas:**

- Transação importada é imutável e reimportação idempotente.
- Chave é conta + ID da transação; sem ID, data + valor + descrição, sujeita a colisão ambígua.
- Toda baixa tem conta bancária e data em que o dinheiro saiu.
- Saldo mensal usa saldo inicial, entradas e saídas.
- Conciliação agrupada é por item e nunca excede o total; restante é item não pago.
- Classificação por linha é obrigatória; tipo não pode ser inferido apenas pelo valor; NF registra número e data.
- Fechamento exige linhas conciliadas e classificadas; exceção registrada conta como conciliada, mas ainda precisa ser classificada.
- Desfazer conciliação exige motivo e auditoria; período fechado bloqueia baixa, estorno e lançamentos retroativos para todos; reabertura somente por admin, com motivo.
- Sugestões por valor, data ±3 dias, favorecido e ID são sugestões, não substituem confirmação humana.
- Pix devolvido casa com baixa original e gera devolução; itens de entrevistadores casam com comprovante conciliado.
- Valores usam Decimal/string e datas de negócio no fuso de São Paulo.

**Bloqueios:** depende da Fase 3 e de contratos de voltas/comprovantes; Connect não fornecido/validado; Itaú depende de N1; sem dados bancários reais; sem novos papéis; sem migração real.

**Contradições:**

- Regra 6 exige tudo conciliado, enquanto regra 7 aceita exceção como conciliada; tratar exceção como conciliada para fechamento somente com registro/classificação, submetendo o significado contábil à validação.
- Saldo menciona saldo inicial + baixas conciliadas, enquanto visões exigem entradas, saídas, tarifas e rendimentos; movimentos adicionais precisam ser definidos.
- Deduplicação por data + valor + descrição pode colidir com transações legítimas iguais; falta regra de resolução sem alterar a transação importada.

**Critério de saída:** formato, idempotência, exceções, devoluções e períodos decididos; testes com colisões e confirmação humana; nenhuma importação real ou baixa real sem autorização e integração validada.

### Fase 7 — relatórios e fluxo de caixa (Módulo 7)

**Objetivo:** fornecer DRE, resultado por projeto, fluxo de caixa, carteira, aging, indicadores e exportações sobre dados confiáveis dos módulos anteriores.

**Regras preservadas:**

- Totais são a soma exata das linhas sob a mesma interseção de filtros, excluindo dados fora do escopo do usuário.
- DRE e resultado por projeto usam competência.
- Realizado de fluxo/contas pagas usa data da baixa; previsto usa vencimento.
- Períodos fechados ficam congelados e não aceitam lançamentos novos.
- Relatórios não expõem CPF nem chave Pix completa.
- Exportação de nomes de pessoas de campo registra `export_log`; texto deve ser exportado como texto.
- Manter somente financeiro/admin e MFA/e-mail-senha.
- Baixa real permanece bloqueada até API Connect fornecida e validada; não simular integração.

**Bloqueios:** depende das Fases 3, 4 e 6; Connect N4/API; F3 sobre categorias e vínculos plano/DRE/orçamento; F8 sobre empresas/CNPJs, unidades e segregação; limite assíncrono de 50 mil linhas sujeito a validação; fontes confiáveis ainda não prontas.

**Riscos/contradições de processo:**

- Não há contradição funcional explícita, mas a ordem 1 do backlog do módulo não deve ser confundida com a primeira entrega fundacional do produto.
- Roadmap menciona protótipo, validação, especificação atualizada, construção e operação paralela; isso não autoriza confundir protótipo visual com software funcional.
- Dados de orçamento dependem do contrato N4 ainda pendente; isso não autoriza integração simulada.
- Exportação e auditoria/migração não autorizam migração real nesta etapa.

**Critério de saída:** módulos de origem reconciliados, filtros/totais/datas testados contra extrato, limites assíncronos validados, operação paralela ao SGE4B e promoção somente após reconciliação. Não é uma entrega inicial.

## 5. Dependências entre módulos e gates

```text
Fase 0 — governança, arquitetura, segurança e equivalentes MySQL
    ↓
Fase 1 — fundação + identidade + e-mail/senha + MFA obrigatório + financeiro/admin + auditoria
    ↓
Fase 2 — cadastros/dimensões e preparação de migração
    ├───────────────┐
    ↓               ↓
Fase 3 — contas     Fase 4 — projetos/orçamento/provisões
    │               │
    └───────┬───────┘
            ↓
Fase 5 — folha e lotes de pagamento
            ↓
Fase 6 — conciliação bancária
            ↓
Fase 7 — relatórios e fluxo de caixa
```

A ordem representa dependência de dados e controles, não uma autorização automática. O Módulo 5 requer as fontes e decisões dos Módulos 3 e 4; o Módulo 6 requer títulos, itens e baixas do Módulo 3, além de contratos de voltas/comprovantes; o Módulo 7 requer fontes confiáveis dos Módulos 3, 4 e 6. O Connect atravessa os Módulos 2, 4 e 5 e deve ser tratado como sistema separado, dono de projetos/orçamento e origem de projetos/pessoas de campo conforme as decisões recebidas.

### Gates obrigatórios

- **Gate de segurança:** e-mail/senha, MFA obrigatório, tokens/sessões, autorização de servidor, auditoria append-only, logs sem dados sensíveis, último admin e recuperação MFA testados.
- **Gate de dados e DPO:** campos de fornecedores/RPA, CPF, retenção, ROPA/RIPD, exportações e mascaramento aprovados.
- **Gate de Connect:** contrato, autenticação, escopos, sandbox, idempotência, eventos/erros, testes bilaterais e contrato ampliado N4 validados. Sem isso, não há ingestão automatizada, baixa real, entrevista baixada ou integração tratada como funcional.
- **Gate de governança:** papéis, alçadas, segregação Q8, empresas/unidades, F8, F11, Q16/D4, supervisor e aprovação definidos sem inferência.
- **Gate financeiro:** categorias F3, contas analíticas/DRE/orçamento, fiscal, prazos, feriados, retenções, regras de juros/multa e cancelamento aprovados.
- **Gate bancário:** decisão N1, Itaú, comprovantes, formato OFX/CSV, idempotência e política de dados autorizados; sem integração bancária ativa antes disso.
- **Gate de migração:** exportação SGE4B completa, 11 bases/relatórios, reconciliação, operação paralela, corte e saldo aberto 100% conciliado.
- **Gate de relatórios:** fontes reconciliadas, semântica competência/baixa/vencimento, filtros, escopo, exportação e limite de 50 mil linhas validados.

## 6. Registro consolidado de bloqueios

Os seguintes bloqueios permanecem ativos e devem ser visíveis no backlog, nos critérios de aceite e no produto quando aplicável:

1. API/contrato do Connect não foi fornecido nem validado; baixa real fica bloqueada até contrato, autenticação, idempotência, sandbox e testes bilaterais aprovados.
2. Contrato Connect v1 ampliado/N4 para orçamento, itens/datas, consumo, prazo e encerramento não está disponível/validado.
3. Não há autorização para integração bancária/Itaú; depende de N1 e pesquisa/decisão explícita.
4. Equivalentes MySQL para privilégios append-only, migrations, backups e segregação ainda precisam ser definidos e verificados contra o handoff PostgreSQL.
5. Provisionamento inicial do primeiro admin e recuperação segura de MFA/suporte precisam de confirmação.
6. Política de retenção/auditoria e ROPA/RIPD dependem do DPO.
7. Segregação de funções Q8, OIDC e novos papéis estão abertos e fora do escopo.
8. Exportação completa do SGE4B e levantamento das 11 bases/relatórios estão pendentes.
9. Campos completos de fornecedor, CPF/RPA/PIS-NIT e validações fiscais dependem de DPO, contabilidade e financeiro.
10. Categorias oficiais, plano de contas, vínculos DRE/orçamento (F3) estão pendentes.
11. Multiempresa, empresas/CNPJs, unidades e segregação de escopo (F8) estão pendentes.
12. Lista de papéis e permissões adicionais (F11) está pendente; apenas financeiro/admin estão autorizados agora.
13. Decisão Q16/D4 sobre autoridade de ciclo de vida, checklist e transições do projeto está pendente.
14. Formato do prazo (F4), feriados e regra de recorrência estão pendentes.
15. Regras de retenção conflitantes, juros/multa excedentes, cancelamento, devoluções, comprovantes e saldo bancário precisam de decisão.
16. Decisões de folha sobre prazo, aprovação, supervisor/gestora, limiar X%, alçadas e ciclos estão pendentes.
17. Limite assíncrono de 50 mil linhas para relatórios está sujeito a validação.
18. Migração real, dados bancários reais, pagamentos bancários e baixa real não são permitidos na primeira entrega.

## 7. Registro explícito de contradições e prevalência operacional

As contradições não devem ser “resolvidas” silenciosamente por implementação. Até decisão formal, aplica-se a regra mais restritiva e segura indicada abaixo, sem apagar a divergência:

- **Identidade:** e-mail/senha prevalece sobre login por CPF; MFA TOTP obrigatório prevalece sobre MFA fictício/opcional; access em memória e refresh em cookie protegido prevalecem sobre localStorage.
- **Papéis:** somente financeiro/admin prevalecem sobre os sete papéis do protótipo e propostas de papéis ampliados.
- **Produto:** software funcional incremental prevalece sobre SPA mockada; protótipo continua sendo apenas validação visual/hipótese.
- **Stack:** WebDev adaptado React/Vite/Express/tRPC/Drizzle/MySQL é a adaptação autorizada; equivalentes de segurança/operação do handoff devem ser verificados, não presumidos.
- **Connect:** documentação de integração futura não é autorização; sem API/contrato validado, não há baixa real nem integração simulada.
- **Orçamento/projetos:** Connect como dono do orçamento e origem de projetos é a restrição operacional até Q16/D4; Financeiro não edita orçamento.
- **Supervisor e folha:** como supervisor não é usuário do Financeiro no escopo atual, o fluxo de envio/aprovação não pode ser implementado com esse papel sem decisão; a separação de entrevistas e outras naturezas prevalece até F2.
- **Cadastros/migração:** não cadastrar projetos novos no Financeiro; não migrar dados reais; inativar em vez de excluir cadastros com histórico.
- **Baixas:** imutabilidade por estorno e nova baixa; período fechado bloqueia; exceções e excedentes não devem virar pagamento automático.
- **Conciliação:** transações importadas imutáveis, idempotência obrigatória e confirmação humana; exceção registrada não elimina a necessidade de classificação e governança contábil.
- **Relatórios:** competência para DRE/projeto, data de baixa para realizado e vencimento para previsto; filtros devem respeitar escopo e somar linhas exatas.

## 8. Falhas explícitas e não conformidades do estado atual

A consolidação recebida não reportou falhas de execução (`Falhas: []`), mas há **falhas de prontidão e lacunas impeditivas** que devem ser registradas como tais:

- não existe API/contrato Connect fornecido e validado;
- não existe integração bancária Itaú autorizada ou validada;
- não existe evidência de sandbox, idempotência ou testes bilaterais do Connect;
- não existe aprovação de migração, exportação SGE4B completa ou reconciliação das 11 bases/relatórios;
- não existe definição final para DPO/ROPA/RIPD, retenção, CPF/RPA e ficha de fornecedor;
- não existe definição final de categorias, DRE, plano de contas, empresas/unidades e segregação;
- não existe decisão final de papéis adicionais, segregação Q8, OIDC ou autoridade do ciclo de vida do projeto;
- não existe decisão final para prazo/feriados/recorrência, juros/multa excedentes, cancelamento, devoluções e colisões de deduplicação;
- não existe comprovação de que ReceiptParser ou componentes citados como alvo futuro já estejam implementados;
- não existe autorização para dados reais, pagamento, baixa bancária, migração ou promoção a produção;
- exemplos numéricos e dados do prompt antigo não são dados reais nem evidência de operação.

Essas falhas não significam que os diagnósticos falharam em sua consolidação; significam que o produto e seus módulos ainda não têm os contratos, decisões ou evidências necessários para serem declarados prontos. A ausência de falha de processamento não remove os bloqueios de produto, segurança, integração e governança.

## 9. Escopo preservado sem redução silenciosa

O mapa começa pela fundação, mas não substitui nem elimina os módulos financeiros. O escopo final continua abrangendo cadastros e migração autorizada, contas a pagar/receber, projetos/orçamento/provisões, folha/lotes de campo, conciliação bancária e relatórios/fluxo de caixa, além das integrações e controles necessários. O que muda é a ordem de implementação e a exigência de gates.

Não devem ser feitos atalhos que reduzam o escopo sem decisão, incluindo:

- trocar MFA real por MFA fictício;
- trocar e-mail/senha por CPF;
- criar papéis ausentes para fazer um fluxo parecer completo;
- usar localStorage para tokens;
- tratar mocks, dados locais ou protótipos como produção;
- simular Connect, Itaú, baixa, pagamento, migração ou dados bancários;
- cadastrar projetos manualmente no Financeiro contra a decisão de origem no Connect;
- remover auditoria, reconciliação, aprovação humana, imutabilidade, períodos fechados ou segregação;
- copiar dados reais do SGE4B ou do Connect antes dos gates;
- omitir contradições de escopo, segurança, governança ou contabilidade.

## 10. Declaração de estado e próximos passos

**Estado recomendado:** pronto para planejar e executar a Fase 0/Fase 1 em WebDev adaptado, com escopo explicitamente limitado à fundação, design, identidade, autenticação, autorização e auditoria. Não pronto para afirmar produção, pagamentos, baixa real, integração Connect/Itaú, migração, relatórios operacionais ou dados reais.

**Próximos passos condicionais:**

1. registrar este mapa como referência de escopo e gates;
2. implementar e testar a Fase 0/Fase 1 sem dados reais e sem integrações simuladas;
3. abrir decisões formais para todos os bloqueios e contradições listados;
4. validar Connect em contrato/sandbox, com autenticação, idempotência, erros, escopos e testes bilaterais;
5. obter aprovações DPO, contabilidade, financeiro e PO onde indicadas;
6. somente então detalhar e construir as fases financeiras na ordem de dependência;
7. manter operação paralela ao SGE4B quando a migração for autorizada, com reconciliação a 100% antes do corte;
8. documentar evidências de testes e gates antes de qualquer promoção.

Até a conclusão desses passos, qualquer entrega deve ser descrita como **fundação/implementação incremental em desenvolvimento**, e não como sistema financeiro pronto para produção.
