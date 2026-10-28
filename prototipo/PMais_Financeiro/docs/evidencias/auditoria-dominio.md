# Evidência de auditoria — domínio local Demo

**Repositório auditado:** `<raiz-do-repositorio>`
**Base declarada:** commit `81bc243`
**Escopo:** modelo local, validação, store/reducer, confirmação, fila de acesso e telas Demo que materializam as transições entre cadastros, títulos, orçamento, entrevistadores, folha, conciliação e relatórios.
**Artefatos produzidos:** este arquivo e `dominio-campos.json`.

## Convenções de evidência

- **CONFIRMADO NO CÓDIGO:** comportamento diretamente executado pelo código auditado, com referência relativa e linhas.
- **A CONFIRMAR:** intenção de negócio, contrato externo ou requisito que não pode ser deduzido com segurança do código. Não é tratado como feature implementada.
- **RECOMENDAÇÃO — não implementado atualmente:** melhoria/controle sugerido; não deve ser lida como comportamento existente.

Não foram lidos `.env`, `.manus-logs` nem valores de segredos. Não houve alteração no repositório de aplicação, schema, dependências, configuração ou Git.

## 1. Fronteira do domínio e persistência

### 1.1. O que é o domínio local

**CONFIRMADO NO CÓDIGO:** as oito telas Demo são rotas protegidas e o `DemoProvider` só é montado quando o acesso está autenticado: dashboard, pagamentos, cadastros, contas, orçamento, folha, conciliação e relatórios estão declarados em `App.tsx:17-24,35-50`; `ShellRoute` redireciona qualquer estado diferente de `authenticated` para `/login` em `client/src/App.tsx:27-31`; a composição `authenticated ? <DemoProvider>...<DemoConfirmationHost />...</DemoProvider>` está em `client/src/App.tsx:57-61`. O domínio de dados em si permanece no navegador; a autenticação é uma borda de acesso, não uma persistência de dados financeiros.

**CONFIRMADO NO CÓDIGO:** o aviso visual da shell identifica “MOCKUP • DADOS SINTÉTICOS • NENHUMA OPERAÇÃO REAL”, informa que o estado fica somente neste navegador e recomenda não inserir informações reais em `client/src/components/DemoComponents.tsx:19-32`.

### 1.2. Chave, versão e ciclo de persistência

**CONFIRMADO NO CÓDIGO:** a chave de storage é `pmaisfinanceiro:demo:v1` em `client/src/contexts/DemoStore.tsx:10`; a versão persistida é o literal `1` em `client/src/lib/demoModel.ts:47-60` e `client/src/lib/demoValidation.ts:16-18`.

**CONFIRMADO NO CÓDIGO:** no SSR/sem `window`, o estado inicial é o seed; no navegador, a leitura tenta `localStorage.getItem`, faz `JSON.parse`, passa por `validatedDemoState` e só aceita o valor validado; qualquer falha retorna o seed em `client/src/contexts/DemoStore.tsx:26-36`. Depois de cada alteração, o provider serializa o estado na mesma chave; se falhar, mantém o uso em memória e expõe `persistenceError` em `client/src/contexts/DemoStore.tsx:408-418`. O aviso de armazenamento é apresentado pela shell em `client/src/components/DemoComponents.tsx:19-32`.

**CONFIRMADO NO CÓDIGO:** outra aba só substitui o estado atual se o evento `storage` for da chave correta, tiver `newValue`, o JSON for válido e o estado passar pela validação; o listener é registrado/removido no ciclo do provider em `client/src/contexts/DemoStore.tsx:419-430`.

**A CONFIRMAR:** não há migração de versões, envelope de schema, histórico de alterações, auditoria de usuário ou armazenamento servidor implementados no domínio local. O único contrato seguro observado é `version: 1` + validação; qualquer evolução de schema precisa definir migração antes de trocar a chave/versão.

### 1.3. Confirmação e fila de acesso

**CONFIRMADO NO CÓDIGO:** `registerDemoConfirmation` instala uma única função global e devolve unregister que só remove o callback que ele próprio registrou; `confirmDemo` resolve `false` imediatamente sem handler e, com handler, delega a mensagem/resolver em `client/src/lib/demoConfirm.ts:1-12`. O host modal rejeita uma segunda confirmação enquanto uma está pendente, rejeita pendência no unmount e resolve `true/false` pelos botões ou fechamento em `client/src/components/DemoConfirmationHost.tsx:5-35`.

**CONFIRMADO NO CÓDIGO:** `createAccessQueue` serializa operações por uma cauda de `Promise`; cada operação começa após a anterior terminar, e a cauda é resetada para uma promessa resolvida mesmo quando a operação falha, sem engolir a rejeição retornada ao chamador em `client/src/lib/accessQueue.ts:1-8`. Os testes confirmam exclusão de execução paralela, ordem `read-before → login → read-after → refresh` e recuperação após rejeição em `server/access-queue.test.ts:4-30`.

**CONFIRMADO NO CÓDIGO:** o contexto de acesso enfileira refresh/login/logout, lê a sessão sem cache, atualiza status `loading|authenticated|anonymous|error|unconfigured`, renova periodicamente a cada 60.000 ms e só repete um POST após `invalid_challenge`; não repete falhas de rede nem senha inválida automaticamente em `client/src/contexts/DemoAccess.tsx:4-11,22-52,54-100`. Isso é controle de acesso à demonstração; não altera `DemoState`.

## 2. Dicionário do modelo e dos tipos TS

O dicionário máquina-legível completo está em [`dominio-campos.json`](./dominio-campos.json). Abaixo estão os contratos relevantes e os pontos que a tipagem não expressa sozinha.

### 2.1. Aliases e enums

**CONFIRMADO NO CÓDIGO:**

- `DemoPartyType = "fornecedor" | "cliente"`.
- `DemoDirection = "pagar" | "receber"`.
- `DemoFlow = "saida" | "entrada"`.
- `DemoProjectStatus = "ativo" | "fechado"`.
- `DemoProvisionStatus = "prevista" | "substituida" | "cancelada"`.
- `DemoBatchStatus = "pendente" | "em_lote" | "paga_simulada"`.
- `DemoTitleStatus = "em_aberto" | "parcial" | "vencido" | "vence_hoje" | "a_vencer" | "liquidado_simulado"`.

As uniões estão em `client/src/lib/demoModel.ts:3-9`. `DemoTitleStatus` é derivado e não é campo de `DemoTitle`.

**CONFIRMADO NO CÓDIGO:** `titleStatus` retorna `liquidado_simulado` quando o pendente é zero; depois `parcial` quando há alguma liquidação; depois `vencido`, `vence_hoje` ou `a_vencer` comparando `dueDate` com hoje em `client/src/lib/demoModel.ts:121-132`. Portanto `em_aberto` está declarado, aparece em opções de UI (`client/src/pages/demo/DemoAccountsPage.tsx:54-62`), mas não é retornado pela função atualmente. Isso é uma discrepância confirmada, não uma regra presumida.

### 2.2. Entidades persistidas

Todos os campos dos objetos persistidos são obrigatórios em TypeScript salvo indicação explícita de `?`; `nullable` significa `null` aceito pelo tipo e pelo schema. A declaração fonte está em `client/src/lib/demoModel.ts:11-60`; limites do schema estão em `client/src/lib/demoValidation.ts:10-35`.

- **`DemoParty`:** `id` string identificador; `name` string rotulado DEMO; `type` fornecedor/cliente; `active` booleano.
- **`DemoCategory`:** `id`, `name`, `type` despesa/receita, `code`, `active`.
- **`DemoCostCenter`:** `id`, `name`, `code`, `active`; é opcional no schema legado (`centers.default([])`), embora cada centro tenha todos os campos.
- **`DemoProject`:** `id`, `code`, `name`, `clientId`, `budgetCents`, `progressPercent`, `status`. `clientId` aponta para uma party do tipo cliente; orçamento é inteiro positivo em centavos; progresso aceita número entre 0 e 100, não necessariamente inteiro no schema.
- **`DemoSettlement`:** `id`, `date`, `amountCents`, `bankTransactionId`; o vínculo é bidirecional com uma transação bancária.
- **`DemoTitle`:** `id`, `direction`, `description`, `partyId`, `projectId: string | null`, `categoryId`, `centerId?: string | null`, as três datas, `amountCents`, `settlements`, `source`, `sourceId: string | null`, `fiscalDocument`. `centerId` é simultaneamente opcional e nullable; `projectId` e `sourceId` são obrigatórios porém nullable.
- **`DemoProvision`:** `id`, `projectId`, `categoryId`, `description`, `amountCents`, `dueDate`, `status`, `titleId: string | null`, `cancelReason: string | null`.
- **`DemoInterviewerItem`:** `id`, `label`, `projectId`, `amountCents`, `dueDate`, `status` em pendente/em lote/paga simulada, `batchTitleId: string | null`.
- **`DemoFieldItem`:** `id`, `projectId`, `description`, `categoryId`, `quantityHundredths`, `unitCents`, `amountCents`, `status` em pendente/em lote/paga simulada.
- **`DemoFieldSheet`:** `id`, `projectId`, `date`, `itemIds`, `amountCents`, `status` em aberta/aprovada_demo/paga_simulada, `titleId: string | null`.
- **`DemoBankTransaction`:** `id`, `date`, `description`, `flow`, `amountCents`, `originTitleId`, `originSettlementId`, `reconciled`, `classification: string | null`, `exceptionReason: string | null`, `source: "simulado"`.
- **`DemoState`:** `version: 1` e os arrays `parties`, `categories`, `centers`, `projects`, `titles`, `provisions`, `interviewerItems`, `fieldItems`, `fieldSheets`, `bankTransactions`, além de `closedPeriods: string[]`.

### 2.3. Inputs públicos do store

**CONFIRMADO NO CÓDIGO:** os inputs exportados estão em `client/src/contexts/DemoStore.tsx:15-24`.

- `PartyInput`: `name` obrigatório string; `type` obrigatório `DemoPartyType`.
- `CategoryInput`: `name`, `type` (`despesa|receita`) e `code` obrigatórios.
- `ProjectInput`: `code`, `name`, `clientId` obrigatórios string; `budgetCents` obrigatório number.
- `TitleInput`: `direction`, `description`, `partyId`, `categoryId`, `issueDate`, `competenceDate`, `dueDate`, `amountCents` obrigatórios; `projectId: string | null` obrigatório nullable; `centerId?: string | null`, `source?: DemoTitle["source"]` e `sourceId?: string | null` opcionais, sendo os dois últimos nullable quando presentes.
- `ProvisionInput`: `projectId`, `categoryId`, `description`, `amountCents`, `dueDate` obrigatórios.
- `FieldItemInput`: `projectId`, `categoryId`, `description`, `quantityHundredths`, `unitCents` obrigatórios.
- `Result`: `{ ok: true } | { ok: false; message: string }`; é retorno síncrono das mutações que validam entrada.

## 3. Validação de persistência e vínculos

### 3.1. Primitivas e limites concretos

**CONFIRMADO NO CÓDIGO:** em `client/src/lib/demoValidation.ts:4-15`:

- data: regex exata `YYYY-MM-DD`, ano de `2000` a `2100`, mês/dia reais verificados em UTC ao meio-dia;
- ID: no máximo `100` caracteres e regex `^[a-z]+-demo-[A-Za-z0-9-]+$`;
- label: mínimo `1`, máximo `180`, contendo `demo` em qualquer caixa;
- centavos: inteiro, mínimo `1`, máximo `900.000.000.000`;
- código: mínimo `1`, máximo `50`;
- cada array de linhas: máximo `2.500` itens;
- `closedPeriods`: regex `^20\d{2}-(0[1-9]|1[0-2])$`, máximo `1.200` períodos.

**CONFIRMADO NO CÓDIGO:** `isSafeCents` usa inteiro seguro, `> 0` e `<= 900_000_000_000` em `client/src/contexts/DemoStore.tsx:42`; `sumCents` rejeita cada valor e o acumulado quando deixam de ser inteiros seguros em `client/src/lib/demoModel.ts:108-115`. A validação de estado também exige a soma dos settlements não superior ao título em `client/src/lib/demoValidation.ts:50-60`.

### 3.2. Integridade referencial implementada

**CONFIRMADO NO CÓDIGO:** `validatedDemoState` rejeita IDs duplicados dentro de cada coleção (`client/src/lib/demoValidation.ts:37-43`); exige que projeto aponte para party cliente, título aponte para party compatível com a direção, categoria exista, projeto/centro referenciados existam quando presentes (`:44-53`).

**CONFIRMADO NO CÓDIGO:** settlement IDs e seus `bankTransactionId` são únicos entre títulos; cada settlement precisa ter transação correspondente com título, settlement, valor, data e fluxo exatamente iguais; cada transação bancária precisa ser encontrada por uma relação válida de título/settlement em `client/src/lib/demoValidation.ts:47-64`.

**CONFIRMADO NO CÓDIGO:** provisões precisam apontar para projeto/categoria existentes e, quando preenchido, para título existente; itens de entrevistador precisam apontar para projeto e título de lote quando preenchido; itens de campo precisam apontar para projeto/categoria e satisfazer a fórmula monetária; folhas precisam ter projeto, pelo menos um item, IDs de item únicos por folha, título existente quando preenchido, itens existentes do mesmo projeto e soma exata em `client/src/lib/demoValidation.ts:65-77`.

**CONFIRMADO NO CÓDIGO:** a validação de persistência não verifica que o centro esteja ativo, que o projeto esteja ativo, que as datas estejam em ordem, que uma provisão convertida tenha `sourceId` correspondente, que status dos itens coincidam com status da folha/lote, que `classification` seja um dos quatro valores da UI, nem que período fechado impeça dados já serializados. Esses controles existem apenas em algumas ações do store ou não existem.

**RECOMENDAÇÃO — não implementado atualmente:** se o estado local passar a ser usado como contrato de importação, adicionar validação de invariantes de status/source, unicidade global de todos os IDs, ordenação/data de competência e auditoria de motivo de reabertura; isso não é comportamento atual.

## 4. Moeda, precisão, datas e fuso

### 4.1. BRL em centavos

**CONFIRMADO NO CÓDIGO:** todo valor monetário persistido é `*Cents`; `formatBrl` trata inteiro seguro como centavos, divide por 100 e usa `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })` em `client/src/lib/demoModel.ts:81-83`. Valor não inteiro seguro é exibido como zero nessa função.

**CONFIRMADO NO CÓDIGO:** `parseBrlToCents` remove prefixo `R$` e espaços, aceita número inteiro em reais, decimal com ponto de uma/t duas casas, ou vírgula com uma/t duas casas; aceita agrupamento brasileiro com pontos quando acompanhado da forma suportada; rejeita fração com mais de duas casas, negativos, notação científica, separadores inválidos e zero. O inteiro final precisa ser seguro e positivo em `client/src/lib/demoModel.ts:85-106`. Exemplos cobertos por teste: `R$ 1.234,56 → 123456`, `0,01 → 1`; `-10`, `1,234`, `1.2.3,00`, `1e8`, vazio e `0,00` são rejeitados em `server/demo.test.ts:28-33`.

**CONFIRMADO NO CÓDIGO:** quantidade de campo usa centésimos inteiros; a tela aceita até duas casas e calcula `floor((quantityHundredths * unitCents + 50) / 100)`, equivalente a arredondamento determinístico para o centavo mais próximo com empate para cima, em `client/src/pages/demo/DemoPayrollPage.tsx:41-64,120-124`; o store repete a mesma fórmula com `BigInt` em `client/src/contexts/DemoStore.tsx:334-340`. O schema limita `quantityHundredths` a inteiro positivo máximo `1.000.000` em `client/src/lib/demoValidation.ts:31`.

**CONFIRMADO NO CÓDIGO:** `titleStatus` calcula liquidado como `pendingCents === 0`, parcial se `settledCents > 0`, e pendente como diferença não negativa entre total e settlements em `client/src/lib/demoModel.ts:121-132`. Títulos de fonte `field` e `interviewer` só aceitam liquidação exatamente igual ao saldo pendente; títulos manuais/provisão podem ser baixados parcial ou totalmente, nunca acima do saldo, em `client/src/contexts/DemoStore.tsx:277-284`.

### 4.2. Datas e fuso

**CONFIRMADO NO CÓDIGO:** datas de domínio são strings de data civil, não timestamps. `todayInSaoPaulo` extrai ano/mês/dia no fuso `America/Sao_Paulo`; `shiftDate` opera em UTC ao meio-dia; `formatDemoDate` constrói UTC ao meio-dia e exibe em `pt-BR` com o fuso de São Paulo em `client/src/lib/demoModel.ts:62-79`.

**CONFIRMADO NO CÓDIGO:** status e filtros comparam strings ISO lexicograficamente; `issueDate`, `competenceDate` e `dueDate` não têm regra de ordem. A criação de títulos exige datas válidas e não pertencentes a período fechado, mas não exige emissão ≤ competência ≤ vencimento em `client/src/contexts/DemoStore.tsx:259-271`.

**CONFIRMADO NO CÓDIGO:** `closePeriod` e o schema de períodos aceitam apenas anos `2000–2099`, enquanto `isDemoDate` aceita datas até `2100`; logo há uma assimetria concreta entre data válida e período fechável, observável em `client/src/contexts/DemoStore.tsx:391-402` e `client/src/lib/demoValidation.ts:34`.

## 5. Fixtures iniciais

**CONFIRMADO NO CÓDIGO:** `createSeedDemoState(today = todayInSaoPaulo())` cria dados sintéticos relativos ao dia recebido em `client/src/lib/demoModel.ts:143-195`; não são dados oficiais.

- Parties: `party-demo-provider-1` “DEMO — Serviços de Campo” fornecedor ativo; `party-demo-provider-2` “DEMO — Tecnologia de Pesquisa” fornecedor ativo; `party-demo-client-1` “DEMO — Cliente Horizonte” cliente ativo; `party-demo-client-2` “DEMO — Cliente Varejo” cliente ativo (`:144-149`).
- Categorias: `cat-demo-field` despesa `D-001` Equipe de campo; `cat-demo-tech` despesa `D-002` Tecnologia; `cat-demo-admin` despesa `D-003` Administração; `cat-demo-revenue` receita `R-001` Pesquisa de mercado; todas ativas (`:150-155`).
- Projetos: `project-demo-1` `DEMO-001` Estudo Horizonte, cliente 1, `2.400.000` cents, progresso `64`, ativo; `project-demo-2` `DEMO-002` Pesquisa Varejo, cliente 2, `1.200.000` cents, progresso `32`, ativo (`:156-159`).
- Centros: `center-demo-1` `DEMO-CC01` Operações de campo ativo; `center-demo-2` `DEMO-CC02` Tecnologia ativo (`:176-179`).
- Títulos: `title-demo-1` pagar, projeto 1, categoria field, `185.000` cents, vencimento `today−3`, settlement `85.000` em `today−2`, origem manual, documento `nao_aplicavel`; `title-demo-2` pagar, projeto 1, tecnologia, `64.900` cents, vencimento `today+5`, sem settlement, manual, documento `demo_ok`; `title-demo-3` receber, projeto 1, receita, `450.000` cents, settlement `120.000` em `today−4`, vencimento `today+12`; `title-demo-4` receber, projeto 2, receita, `240.000` cents, vencimento `today+8`; `title-demo-5` pagar, projeto 2, field, `92.500` cents, vencimento `today+2`, documento `aguardando_demo`; as datas de emissão/competência também são os deslocamentos literais do código em `:162-168`.
- Movimentos bancários: `bank-demo-initial-1` saída `85.000`, origem título 1/settlement 1, classificação `pagamento`; `bank-demo-initial-2` entrada `120.000`, origem título 3/settlement 2, classificação `recebimento`; ambos `reconciled: false`, `exceptionReason: null`, `source: simulado` em `:160-171`.
- Provisões: `provision-demo-1` projeto 1/categoria field `280.000` cents, vencimento `today+18`; `provision-demo-2` projeto 2/categoria tech `75.000` cents, vencimento `today+22`; ambas `prevista`, sem título/motivo (`:180-183`).
- Entrevistadores: itens 1 e 2 no projeto 1, cada `8.500` cents, vencimento `today+2`; item 3 no projeto 2, `10.000` cents, vencimento `today+4`; todos pendentes e sem lote (`:184-188`).
- Campo: item 1 projeto 1, quantidade `2.000` centésimos, unitário `3.000` cents, total `60.000`; item 2 projeto 1, `500 × 4.000` → `20.000`; item 3 projeto 2, `1.000 × 2.500` → `25.000`; todos pendentes (`:189-194`). Folhas e períodos fechados começam vazios.

## 6. Regras e transições intermodulares

### 6.1. Centro, cadastro, categoria e projeto

**CONFIRMADO NO CÓDIGO:** `addParty` exige nome não vazio, acrescenta prefixo `DEMO —`, cria ID e deixa ativo; `toggleParty` apenas alterna `active`; `renameParty` exige ID existente, nome não vazio com até 160 caracteres antes da normalização e preserva o ID em `client/src/contexts/DemoStore.tsx:225-233`. A UI explicita que inativação preserva histórico em `client/src/pages/demo/DemoRegistryPage.tsx:369-419`.

**CONFIRMADO NO CÓDIGO:** `withDemoLabel` remove prefixo DEMO existente, limita o texto-base a 160 caracteres e recoloca `DEMO —`; vazio vira `DEMO — Registro demonstrativo` em `client/src/contexts/DemoStore.tsx:38-40`. O schema final aceita label de até 180 caracteres e exige a palavra demo. `addParty` não aplica limite próprio; `renameParty` aplica o limite de 160 no input antes do prefixo.

**CONFIRMADO NO CÓDIGO:** `addCategory` e `addCenter` exigem nome/código não vazios, normalizam o código para `DEMO-` + conteúdo sem prefixo em maiúsculas, rejeitam duplicidade case-insensitive e criam registros ativos em `client/src/contexts/DemoStore.tsx:234-246`. A tela de centros limita visualmente nome a 120 e código a 30 caracteres, mas isso é UI, não o limite de persistência (`client/src/components/DemoCentersPanel.tsx:17-21`; schema de código máximo 50 em `demoValidation.ts:14,19-20`).

**CONFIRMADO NO CÓDIGO:** `addProject` exige nome/código, cliente ativo do tipo cliente, orçamento seguro positivo, código normalizado e único; cria `progressPercent: 0` e status ativo. `setProjectStatus` apenas altera o status; `setProjectBudget` exige valor seguro positivo e projeto existente, mas não verifica status ativo apesar da mensagem de erro, em `client/src/contexts/DemoStore.tsx:247-257`. A UI pede confirmação modal para fechar/reabrir projeto, porém a regra de confirmação é da tela, não do reducer (`client/src/pages/demo/DemoRegistryPage.tsx:147-163`).

### 6.2. Títulos, documentos e liquidações

**CONFIRMADO NO CÓDIGO:** `addTitle` exige três datas válidas, nenhum dos três meses fechado, descrição, party ativa de fornecedor para pagar ou cliente para receber, categoria ativa de despesa para pagar ou receita para receber, projeto inexistente/nulo ou ativo, valor seguro positivo e centro ativo. O título recebe ID, label DEMO, `source` padrão manual, `sourceId` padrão null, documento `nao_aplicavel` e settlements vazios em `client/src/contexts/DemoStore.tsx:259-271`. `centerId` usa `input.centerId ?? primeiro centro ativo ?? null`; portanto passar `null` também cai no centro ativo padrão quando existe.

**CONFIRMADO NO CÓDIGO:** `resolveDemoDocument` só aceita título existente com `fiscalDocument: aguardando_demo` e muda para `demo_ok`; não recebe/valida arquivo ou nota real em `client/src/contexts/DemoStore.tsx:273-275`. `settleTitle` rejeita data inválida, pendência documental, valor não seguro/positivo/acima do pendente, parcial de lote/folha e período fechado; no sucesso gera settlement e transação bancária com IDs novos em `:277-284`.

**CONFIRMADO NO CÓDIGO:** `appendSettlement` impede título ausente, data inválida, documento pendente, centavos inválidos, valor acima do pendente e período fechado; para fonte `field`/`interviewer`, o valor deve ser exatamente o pendente. Gera transação com fluxo `saida` para pagar ou `entrada` para receber, classificação inicial `pagamento`/`recebimento`, não conciliada, sem exceção e origem `simulado` em `client/src/contexts/DemoStore.tsx:46-68`. Ao completar o título, atualiza itens de entrevistador, folha e itens de campo vinculados para `paga_simulada`.

### 6.3. Provisões e orçamento

**CONFIRMADO NO CÓDIGO:** `addProvision` exige data válida, projeto existente e ativo, categoria de despesa ativa, descrição, centavos positivos e mês da dueDate aberto; cria `prevista`, `titleId: null`, `cancelReason: null` em `client/src/contexts/DemoStore.tsx:286-292`.

**CONFIRMADO NO CÓDIGO:** `convertProvision` exige competência de hoje aberta, provisão `prevista`, projeto ativo, fornecedor ativo e dueDate aberta; cria título pagar com origem `provision`, `sourceId` da provisão, emissão/competência de hoje, vencimento/valor/categoria/projeto da provisão, e muda a provisão para `substituida` com `titleId` do novo título em `client/src/contexts/DemoStore.tsx:294-302`. A tela M4 calcula previsto apenas para provisões `prevista` e comprometido pelo `pendingCents` dos títulos, evitando dupla contagem por estado em `client/src/pages/demo/DemoBudgetPage.tsx:164-203,475-479`.

**CONFIRMADO NO CÓDIGO:** `cancelProvision` exige motivo não vazio e provisão ainda `prevista`, bloqueia dueDate em período fechado e persiste motivo trimado; estados substituída/cancelada permanecem na coleção em `client/src/contexts/DemoStore.tsx:304-309`. Não há limite de 300 aplicado no método, embora o schema de persistência aceite no máximo 300 para `cancelReason` (`demoValidation.ts:29`).

### 6.4. Entrevistadores e lotes exatos

**CONFIRMADO NO CÓDIGO:** `createInterviewerBatch` exige competência de hoje aberta, dueDate válida, IDs sem repetição, itens pendentes do mesmo projeto, projeto ativo e dueDate aberta. Seleciona o primeiro fornecedor ativo e a categoria `cat-demo-field` ativa, ou a primeira despesa ativa; soma os itens em centavos, cria título pagar de fonte `interviewer` e marca os itens `em_lote` em `client/src/contexts/DemoStore.tsx:311-324`.

**CONFIRMADO NO CÓDIGO:** o método não exige que os itens selecionados tenham o mesmo dueDate; a regra de mesmo projeto é a única homogeneidade de itens implementada. A UI força seleção de um projeto e exibe a soma exata em `client/src/pages/demo/DemoPaymentsPage.tsx:65-120,269-285`.

**CONFIRMADO NO CÓDIGO:** `payInterviewerBatch` exige data válida, título de fonte interviewer, itens em lote, saldo ainda integral e soma dos itens exatamente igual ao título; bloqueia data em período fechado e liquida o valor total, com transação local e itens `paga_simulada` em `client/src/contexts/DemoStore.tsx:326-333`. O teste confirma lote de `17.000` cents, parcial rejeitada e segunda baixa rejeitada em `server/demo.test.ts:67-77`.

### 6.5. Folha e itens de campo

**CONFIRMADO NO CÓDIGO:** `addFieldItem` exige projeto ativo, categoria de despesa ativa, descrição, quantidade inteira segura positiva e unitário seguro positivo; calcula o total com BigInt e adiciona item pendente em `client/src/contexts/DemoStore.tsx:334-340`. Não há período a bloquear, pois o item não tem data.

**CONFIRMADO NO CÓDIGO:** `createFieldSheet` exige data válida, projeto ativo, mês aberto e pelo menos um item pendente do projeto; agrega automaticamente todos os pendentes, cria folha `aberta` com soma exata e marca itens `em_lote` em `client/src/contexts/DemoStore.tsx:342-349`. Não existe ação pública para escolher parte dos pendentes.

**CONFIRMADO NO CÓDIGO:** `approveFieldSheet` exige hoje aberta, folha aberta, data da folha aberta, projeto ativo, fornecedor ativo, categoria de despesa ativa e soma exata não zero; cria título pagar fonte `field` com issue/competência de hoje, dueDate da folha, sourceId da folha e muda a folha para `aprovada_demo` em `client/src/contexts/DemoStore.tsx:351-363`.

**CONFIRMADO NO CÓDIGO:** `payFieldSheet` exige data válida, folha aprovada com título, itens não vazios e soma exata dos itens igual ao título; bloqueia período da data de pagamento; usa settlement integral e muda folha/itens para `paga_simulada` em `client/src/contexts/DemoStore.tsx:365-371`. `cancelFieldSheet` só aceita folha aberta e período aberto, remove a folha da coleção e devolve seus itens para `pendente` em `:373-377`; não persiste entidade de cancelamento ou motivo.

### 6.6. Conciliação e períodos fechados

**CONFIRMADO NO CÓDIGO:** a conciliação só recebe transações criadas por settlements no próprio estado; a tela deriva estados `pending`, `reconciled` e `exception` por `reconciled`, `classification` e `exceptionReason` em `client/src/pages/demo/DemoReconciliationPage.tsx:30-34,121-141`. `reconcileTransaction` exige transação existente, período aberto, não conciliada e classificação não vazia; grava classificação com label DEMO, `reconciled: true` e limpa exceção. `markTransactionException` exige os mesmos requisitos, mais motivo não vazio; grava classificação e motivo trimados com label DEMO e marca conciliada em `client/src/contexts/DemoStore.tsx:379-389`.

**CONFIRMADO NO CÓDIGO:** a UI oferece quatro classificações (`pagamento`, `recebimento`, `tarifa DEMO`, `outro DEMO`) em `client/src/pages/demo/DemoReconciliationPage.tsx:19-20,398-410`, mas o store aceita qualquer string não vazia; o schema apenas limita classificação a 100 caracteres (`demoValidation.ts:33`).

**CONFIRMADO NO CÓDIGO:** `closePeriod` aceita apenas `YYYY-MM` de 2000–2099, rejeita pendência em qualquer transação cuja data comece pelo período, rejeita período já fechado e adiciona o mês em ordem. Uma linha com exceção conta como tratada porque fica `reconciled: true` e classificada; não é necessário haver transações no mês para fechar quando chamado diretamente em `client/src/contexts/DemoStore.tsx:391-397` e reducer `:172-177`.

**CONFIRMADO NO CÓDIGO:** `reopenPeriod` exige formato válido, período fechado e motivo não vazio, mas o reducer recebe apenas `period`; o motivo não é armazenado em nenhuma entidade ou histórico em `client/src/contexts/DemoStore.tsx:398-402,71-98`. A mensagem da UI diz “motivo registrado” em `client/src/pages/demo/DemoReconciliationPage.tsx:233-239`, mas esse registro não existe no estado. Isso é uma discrepância confirmada entre UI e modelo.

**CONFIRMADO NO CÓDIGO:** período fechado bloqueia criação de títulos pelas três datas, liquidação pela data da baixa, provisão pela dueDate, conversão pela competência de hoje e dueDate da provisão, cancelamento de provisão pela dueDate, criação de lote pela competência de hoje/dueDate, aprovação de folha pela hoje/data da folha, pagamento pela data de pagamento, cancelamento de folha pela data da folha, conciliação e exceção pela data da transação. Alterar cadastro, centro, projeto/status/orçamento e item de campo não consulta períodos (`DemoStore.tsx:259-271,277-317,342-389`).

## 7. Relatórios e derivadores

### 7.1. Dashboard

**CONFIRMADO NO CÓDIGO:** o dashboard calcula pendentes de pagar/receber por `pendingCents`, realizado do mês pela data do settlement e pelo fuso/hoje de São Paulo, provisões apenas `prevista`, itens de campo apenas `pendente` e extrato apenas não conciliado em `client/src/pages/demo/DemoDashboard.tsx:40-106`. Restaurar seed exige confirmação na UI e chama `resetDemo` em `:108-119`; o store não exige confirmação por si.

### 7.2. M4 orçamento

**CONFIRMADO NO CÓDIGO:** para o projeto selecionado, baseline = `budgetCents`; previsto = soma de provisões `prevista`; comprometido = soma de `pendingCents` dos títulos a pagar abertos; realizado = soma de settlements de todos os títulos a pagar; consumo = previsto + comprometido + realizado; saldo = baseline − consumo; percentual = consumo × 100 / baseline (0 quando baseline não é positiva) em `client/src/pages/demo/DemoBudgetPage.tsx:164-205`. Os avisos visuais marcam 80% e 100%, mas não bloqueiam ou alteram dados em `:400-447`.

### 7.3. M7 relatórios

**CONFIRMADO NO CÓDIGO:** as visões são `titles`, `realized`, `forecast`, `projects`, `aging`, `reconciliation`, com filtros de período, projeto e categoria em `client/src/pages/demo/DemoReportsPage.tsx:35-58,186-205`.

- **Pagar/receber:** filtra por `dueDate`, mostra valor original, settlements acumulados, pendente e status (`:208-217`).
- **Realizado:** explode cada settlement, filtra pela data da liquidação e mantém liquidações parciais separadas (`:219-226`).
- **Previsto:** inclui títulos com saldo pendente por vencimento e provisões `prevista` por dueDate; provisão é sempre saída e entra como expectativa, não como settlement (`:228-253`).
- **Resultado por projeto:** filtra pela `competenceDate`, agrupa por projeto ou “Sem projeto”, soma o valor total de títulos (não o realizado), separa receita/despesa e calcula receita − despesa (`:255-274`).
- **Carteira/aging:** considera apenas linhas com saldo pendente; faixas exatas são “Vencido há mais de 30 dias”, “Vencido há 1–30 dias”, “Vence em 0–7 dias”, “Vence em 8–30 dias” e “Vence após 30 dias” (`:275-293`).
- **Conciliação pendente:** inclui movimentos não conciliados ou com exceção, filtra projeto/categoria via título de origem e data do movimento; no mesmo painel mostra folhas abertas/aprovadas separadamente (`:295-309`). Folha não é tratada como transação bancária (`:646-654`).

**CONFIRMADO NO CÓDIGO:** períodos predefinidos são mês atual, últimos 30 dias de `today−29` a hoje, próximos 30 de hoje a `today+30`, todos ou personalizado; o intervalo inválido é sinalizado e não gera linhas (`:60-89,197-205,350-365,377-420`). O nome “próximos 30” resulta em intervalo inclusivo de 31 datas (hoje e mais 30), fato do código, não uma regra externa.

**CONFIRMADO NO CÓDIGO:** exportação é CSV sintético no navegador, com colunas `*_centavos`, linha de filtros e total; protege células iniciadas por `=`, `+`, `-` ou `@` com apóstrofo; o arquivo segue `relatorio-demo-${activeView}-${today}.csv` em `client/src/pages/demo/DemoReportsPage.tsx:145-157,377-420`. Imprimir chama `window.print` em `:423-425`. Não há endpoint ou relatório financeiro oficial.

## 8. UI versus tipo e riscos de reconstrução

**CONFIRMADO NO CÓDIGO:** os formulários normalmente usam `required`, `type=date`, `maxLength`, listas de ativos e confirmações locais; esses limites de navegador não substituem os guards do store. Exemplos: centros UI 120/30 chars (`DemoCentersPanel.tsx:17-21`), campos de conta com datas e moeda textual (`DemoAccountsPage.tsx:481-665`), quantidade/centavos de folha (`DemoPayrollPage.tsx:260-345`), confirmação de baixa (`DemoAccountsPage.tsx:897-987`) e confirmação de pagamento de folha (`DemoPayrollPage.tsx:534-564`). Chamadores diretos de `createDemoStore` podem ignorar o caminho da UI, mas ainda passam pelos guards quando usam os métodos que os possuem.

**CONFIRMADO NO CÓDIGO:** `DemoComponents` é apresentação sem persistência: shell, painel, métrica, status e empty state apenas renderizam props em `client/src/components/DemoComponents.tsx:6-89`. `DemoCentersPanel` cria/alterna centro via store; centro ativo aparece no seletor de Contas e inativação preserva o registro em `client/src/components/DemoCentersPanel.tsx:5-29` e `client/src/pages/demo/DemoAccountsPage.tsx:574-579`.

**CONFIRMADO NO CÓDIGO:** páginas e testes usam somente dados sintéticos; os testes de renderização verificam aviso, h1 e IDs DOM únicos para as oito telas em `server/demo-render.test.tsx:14-30`; os testes de núcleo cobrem fixtures, vínculos, centavos, lotes, folha, documentos, fechamento/reabertura e preservação de IDs em `server/demo.test.ts:17-139`.

**A CONFIRMAR:** o contrato de negócio para ordem entre emissão/competência/vencimento, possibilidade de liquidação manual parcial de provisão, política de reabertura e retenção de cancelamento de folha não está especificado fora do comportamento local observado. Não devem ser inventadas regras além das guardas descritas.

**RECOMENDAÇÃO — não implementado atualmente:** persistir `reason` de reabertura em uma entidade/histórico; alinhar a UI para não dizer “registrado” enquanto não persistir; decidir se cancelamento de folha deve preservar histórico; alinhar `DemoTitleStatus` removendo `em_aberto` ou implementando sua emissão; adicionar teste para limites UI/schema e para datas de ordem. Nenhuma dessas recomendações é feature existente.

## 9. Catálogo resumido de erros públicos

As mensagens exatas estão no JSON e no store. Os grupos observados são: nome/código obrigatórios; cadastro/contraparte/categoria/projeto ativo e compatível; centavos positivos e dentro de limite seguro; data inválida; período fechado; documento pendente; lote/folha com soma não exata; item repetido; ausência de itens; transação ausente, já conciliada ou sem classificação; motivo de exceção/cancelamento/reabertura obrigatório; período inválido ou já aberto/fechado. Métodos `toggleParty`, `toggleCenter` e `setProjectStatus` não retornam `Result`, não emitem erro e fazem no-op quando nenhum ID coincide (`client/src/contexts/DemoStore.tsx:181-211,229,246,254`).

## 10. Síntese de reconstrução

A reconstrução fiel precisa manter: estado versionado em `localStorage` com chave exata; seed relativo a São Paulo; todos os IDs e vínculos; centavos inteiros e fórmula de quantidade; validação de reload; títulos como fonte comum de liquidações; transação bancária sintética 1:1 por settlement; lotes/folhas com fechamento exato; status e bloqueios de período; conciliação derivada das transações; e relatórios derivados sem mutação. Não há no código backend financeiro, API bancária, Connect, Pix, Itaú, nota/arquivo real ou relatório oficial.
