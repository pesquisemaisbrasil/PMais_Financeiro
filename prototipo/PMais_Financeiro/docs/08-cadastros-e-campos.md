# 08 — Cadastros e campos


> **A CONFIRMAR:** papéis distintos de criação/edição/exclusão e ownership não existem no caminho demo e precisam de decisão para um domínio real.
> **RECOMENDAÇÃO — não implementado atualmente:** tratar este dicionário local como contrato de reconstrução do mockup, não como schema financeiro.

## Escopo

Este documento descreve **todos os campos do modelo local documentado no catálogo** `dominio-campos.json` (evidência auditada em `evidencias/dominio-campos.json`), incluindo entidades persistidas em `DemoState`, inputs públicos e a borda de acesso. Os objetos locais não são tabelas SQL. Criar/editar/excluir significa mutar o estado demo do navegador; não há role server-side no caminho.

> **CONFIRMADO NO CÓDIGO:** os tipos, campos e limites deste documento vêm do modelo TypeScript/validação local; o SQL é tratado separadamente em [04 — Banco de dados](04-banco-de-dados.md).

### Convenções globais

- Coleções persistidas aceitam no máximo 2.500 linhas; IDs têm até 100 caracteres e padrão `^[a-z]+-demo-[A-Za-z0-9-]+$`.
- Labels têm 1–180 caracteres e precisam conter `demo` em qualquer caixa; o store normalmente aplica `DEMO —`.
- Centavos são inteiros seguros `1..900000000000`; datas são `YYYY-MM-DD`, anos 2000–2100, validas no calendário.
- `closedPeriods` aceita `YYYY-MM` de 2000–2099, no máximo 1.200.
- Acesso atual: usuário demo autenticado pode usar as telas; não há permissão individual, owner, tenant ou auditoria.

## Aliases e enums exatos

| Nome | Valores |
|---|---|
| `DemoPartyType` | `fornecedor \| cliente` |
| `DemoDirection` | `pagar \| receber` |
| `DemoFlow` | `saida \| entrada` |
| `DemoProjectStatus` | `ativo \| fechado` |
| `DemoProvisionStatus` | `prevista \| substituida \| cancelada` |
| `DemoBatchStatus` | `pendente \| em_lote \| paga_simulada` |
| `DemoTitleStatus` | `em_aberto \| parcial \| vencido \| vence_hoje \| a_vencer \| liquidado_simulado` (derivado; `em_aberto` é declarado/UI, mas não é retornado por `titleStatus`). |

> A notação `|` acima representa a barra vertical `|` do union TypeScript; os valores literais são exatamente os textos à esquerda/direita.

## Entidades persistidas

### `DemoParty`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO, máx. 100. |
| `name` | `string` | Sim | Não | Label 1–180 contendo `demo`; store normaliza. |
| `type` | `DemoPartyType` | Sim | Não | `fornecedor` ou `cliente`. |
| `active` | `boolean` | Sim | Não | Inativar preserva referências/histórico. |

Criar/renomear/inativar: M2. Não há exclusão física nem guarda de nome duplicado em `addParty`. Fornecedor é contraparte compatível de títulos `pagar`; cliente, de `receber`.

### `DemoCategory`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO, máx. 100. |
| `name` | `string` | Sim | Não | Label 1–180 contendo `demo`. |
| `type` | `"despesa" \| "receita"` | Sim | Não | Compatível com direção do título. |
| `code` | `string` | Sim | Não | 1–50; store normaliza `DEMO-` + uppercase. |
| `active` | `boolean` | Sim | Não | Duplicidade de código normalizado rejeitada. |

A tela cria categoria; não há edição/inativação pública observada para categoria além do estado seed.

### `DemoCostCenter`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO, máx. 100. |
| `name` | `string` | Sim | Não | Label 1–180 contendo `demo`; UI usa limite visual 120. |
| `code` | `string` | Sim | Não | 1–50; store normaliza `DEMO-` + uppercase; UI usa 30. |
| `active` | `boolean` | Sim | Não | Centro ativo aparece no seletor de título. |

O array `centers` tem default `[]` no schema de reidratação. Inativação preserva histórico; não há exclusão física.

### `DemoProject`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO. |
| `code` | `string` | Sim | Não | 1–50, normalizado, único após normalização. |
| `name` | `string` | Sim | Não | Label 1–180 contendo `demo`. |
| `clientId` | `string` | Sim | Não | Deve apontar para party do tipo `cliente`; criação exige ativa. |
| `budgetCents` | `number` | Sim | Não | Inteiro seguro positivo até 900 bi de centavos. |
| `progressPercent` | `number` | Sim | Não | Schema 0–100; pode ser decimal; novo projeto começa 0. |
| `status` | `DemoProjectStatus` | Sim | Não | `ativo`/`fechado`. |

A UI pede confirmação para fechar/reabrir. `setProjectBudget` verifica existência e valor, mas não verifica status ativo apesar da mensagem.

### `DemoSettlement`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID único global entre settlements. |
| `date` | `string` | Sim | Não | Data demo válida. |
| `amountCents` | `number` | Sim | Não | Centavos positivos; total não excede título. |
| `bankTransactionId` | `string` | Sim | Não | ID único; aponta para transação correspondente. |

É criado por baixa/pagamento local, nunca por importação bancária.

### `DemoTitle`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO. |
| `direction` | `DemoDirection` | Sim | Não | `pagar`/`receber`; escolhe party/categoria compatíveis. |
| `description` | `string` | Sim | Não | Label DEMO 1–180. |
| `partyId` | `string` | Sim | Não | Fornecedor para pagar; cliente para receber; ação exige ativo. |
| `projectId` | `string \| null` | Sim | Sim | Projeto existente; criação aceita nulo ou projeto ativo. |
| `categoryId` | `string` | Sim | Não | Categoria existente e ativa, despesa/receita compatível. |
| `centerId` | `string \| null` | Não | Sim | Se nulo/ausente, `addTitle` escolhe primeiro centro ativo ou nulo. |
| `issueDate` | `string` | Sim | Não | Data válida e mês aberto na criação. |
| `competenceDate` | `string` | Sim | Não | Data válida e mês aberto; ordem relativa não é validada. |
| `dueDate` | `string` | Sim | Não | Data válida e mês aberto; ordem relativa não é validada. |
| `amountCents` | `number` | Sim | Não | Inteiro seguro positivo. |
| `settlements` | `DemoSettlement[]` | Sim | Não | Somas e vínculos validados; array máx. 2.500. |
| `source` | `"manual" \| "provision" \| "interviewer" \| "field"` | Sim | Não | Manual por default; fluxos gerados definem origem. |
| `sourceId` | `string \| null` | Sim | Sim | ID DEMO ou nulo; schema não verifica relação específica. |
| `fiscalDocument` | `"nao_aplicavel" \| "aguardando_demo" \| "demo_ok"` | Sim | Não | `aguardando_demo` bloqueia baixa até `resolveDemoDocument`. |

`titleStatus` é derivado de total menos settlements e data de vencimento; não é persistido.

### `DemoProvision`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO. |
| `projectId` | `string` | Sim | Não | Projeto existente; ação exige ativo. |
| `categoryId` | `string` | Sim | Não | Categoria existente; ação exige despesa ativa. |
| `description` | `string` | Sim | Não | Label DEMO. |
| `amountCents` | `number` | Sim | Não | Centavos positivos. |
| `dueDate` | `string` | Sim | Não | Data válida; add/convert/cancel verificam mês aberto. |
| `status` | `DemoProvisionStatus` | Sim | Não | `prevista`, `substituida`, `cancelada`. |
| `titleId` | `string \| null` | Sim | Sim | Nulo até conversão; depois título existente. |
| `cancelReason` | `string \| null` | Sim | Sim | Até 300 no schema; motivo trimado ao cancelar. |

### `DemoInterviewerItem`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO. |
| `label` | `string` | Sim | Não | Label DEMO. |
| `projectId` | `string` | Sim | Não | Projeto existente. |
| `amountCents` | `number` | Sim | Não | Centavos positivos. |
| `dueDate` | `string` | Sim | Não | Data demo válida. |
| `status` | `DemoBatchStatus` | Sim | Não | `pendente`, `em_lote`, `paga_simulada`. |
| `batchTitleId` | `string \| null` | Sim | Sim | Título de lote quando formado. |

Lote exige itens pendentes do mesmo projeto; não exige mesma data de vencimento.

### `DemoFieldItem`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO. |
| `projectId` | `string` | Sim | Não | Projeto existente e ativo na criação. |
| `description` | `string` | Sim | Não | Label DEMO. |
| `categoryId` | `string` | Sim | Não | Categoria de despesa existente/ativa na criação. |
| `quantityHundredths` | `number` | Sim | Não | Inteiro positivo; schema máximo 1.000.000; representa centésimos de quantidade. |
| `unitCents` | `number` | Sim | Não | Centavos positivos. |
| `amountCents` | `number` | Sim | Não | Derivado por round-half-up de quantidade × unitário / 100. |
| `status` | `"pendente" \| "em_lote" \| "paga_simulada"` | Sim | Não | Sincronizado no ciclo de folha/pagamento. |

### `DemoFieldSheet`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO. |
| `projectId` | `string` | Sim | Não | Projeto existente; criação exige ativo. |
| `date` | `string` | Sim | Não | Data válida; criação/aprovação/cancelamento/pagamento têm guards de período. |
| `itemIds` | `string[]` | Sim | Não | Não vazio, IDs únicos por folha, itens existentes do projeto. |
| `amountCents` | `number` | Sim | Não | Soma exata dos itens. |
| `status` | `"aberta" \| "aprovada_demo" \| "paga_simulada"` | Sim | Não | Ciclo local. |
| `titleId` | `string \| null` | Sim | Sim | Nulo até aprovação; depois título fonte `field`. |

`createFieldSheet` inclui automaticamente todos os itens pendentes do projeto; cancelar remove a folha e devolve itens a `pendente`, sem histórico de cancelamento.

### `DemoBankTransaction`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `id` | `string` | Sim | Não | ID DEMO; transação nasce de settlement. |
| `date` | `string` | Sim | Não | Data válida; período usa prefixo `YYYY-MM`. |
| `description` | `string` | Sim | Não | Label DEMO. |
| `flow` | `DemoFlow` | Sim | Não | `saida`/`entrada`, compatível com título. |
| `amountCents` | `number` | Sim | Não | Igual ao settlement vinculado. |
| `originTitleId` | `string` | Sim | Não | Título que contém settlement de origem. |
| `originSettlementId` | `string` | Sim | Não | Settlement cujo `bankTransactionId` aponta para esta transação. |
| `reconciled` | `boolean` | Sim | Não | `true` para conciliação ou exceção. |
| `classification` | `string \| null` | Sim | Sim | Máx. 100 no schema; ação exige não vazio, mas aceita qualquer string. |
| `exceptionReason` | `string \| null` | Sim | Sim | Máx. 300; motivo para exceção. |
| `source` | `"simulado"` | Sim | Não | Literal, não importado de banco. |

### `DemoState`

| Campo | Tipo | Obrigatório | Nulo | Validação/observação |
|---|---|---:|---:|---|
| `version` | `1` | Sim | Não | Literal de versão; não há migração observada. |
| `parties` | `DemoParty[]` | Sim | Não | Máx. 2.500, IDs únicos na coleção. |
| `categories` | `DemoCategory[]` | Sim | Não | Máx. 2.500. |
| `centers` | `DemoCostCenter[]` | Sim | Não | Máx. 2.500; default `[]` na reidratação. |
| `projects` | `DemoProject[]` | Sim | Não | Referências de cliente validadas. |
| `titles` | `DemoTitle[]` | Sim | Não | Referências/settlements/transações validados. |
| `provisions` | `DemoProvision[]` | Sim | Não | Projeto/categoria/título validados. |
| `interviewerItems` | `DemoInterviewerItem[]` | Sim | Não | Projeto/lote validados. |
| `fieldItems` | `DemoFieldItem[]` | Sim | Não | Produto quantidade × unitário validado. |
| `fieldSheets` | `DemoFieldSheet[]` | Sim | Não | Itens, projeto, soma e título validados. |
| `bankTransactions` | `DemoBankTransaction[]` | Sim | Não | Cada uma precisa de settlement correspondente. |
| `closedPeriods` | `string[]` | Sim | Não | `YYYY-MM`, 2000–2099, máx. 1.200. |

## Inputs públicos do store

| Tipo | Campos completos | Criação/edição atual |
|---|---|---|
| `PartyInput` | `name:string`, `type:DemoPartyType` | `addParty`; rename usa `name` separado. |
| `CategoryInput` | `name:string`, `type:"despesa"|"receita"`, `code:string` | `addCategory`. |
| `ProjectInput` | `code:string`, `name:string`, `clientId:string`, `budgetCents:number` | `addProject`. |
| `TitleInput` | `direction`, `description`, `partyId`, `projectId:string|null`, `categoryId`, `centerId?:string|null`, `issueDate`, `competenceDate`, `dueDate`, `amountCents`, `source?`, `sourceId?` | `addTitle`; source default `manual`, sourceId null. |
| `ProvisionInput` | `projectId`, `categoryId`, `description`, `amountCents`, `dueDate` | `addProvision`. |
| `FieldItemInput` | `projectId`, `categoryId`, `description`, `quantityHundredths`, `unitCents` | `addFieldItem`; `amountCents` derivado. |
| `Result` | `{ok:true}` ou `{ok:false,message:string}` | Retorno síncrono das mutações guardadas; toggles/status não retornam Result. |

## Borda de acesso local

`AccessStatus` é `loading|authenticated|anonymous|error|unconfigured`. `AccessResult` contém `ok:boolean`, `message?:string`, `code?:string`. `Access` expõe `status`, `expired`, `login(username,password)`, `logout()` e `retry()`. Nenhum desses campos pertence a `DemoState`.

## Quem pode criar/editar/excluir

- Estado atual: o usuário com sessão demo pode disparar handlers da UI; não existem roles distintas.
- Criação/edição: feita pelos métodos do `DemoStore` e telas M1–M6; o usuário não envia entidades para API.
- Exclusão: não há exclusão genérica de cadastro; cancelamento de folha remove a folha local; reset substitui todo o estado após confirmação de UI.
- Proteção: validações do reducer e do reload, não autorização server-side.

Fontes: [`domínio auditado`](evidencias/auditoria-dominio.md), [`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L15-L24), [`demoModel.ts`](../client/src/lib/demoModel.ts#L3-L60), [`demoValidation.ts`](../client/src/lib/demoValidation.ts#L4-L78).
