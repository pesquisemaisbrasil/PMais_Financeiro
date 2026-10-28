# 09 — Regras de negócio


> **CONFIRMADO NO CÓDIGO:** as regras são extraídas do reducer, da validação e das telas citadas; não foram completadas por inferência contábil.
> **RECOMENDAÇÃO — não implementado atualmente:** resolver as discrepâncias explicitadas antes de transformar o modelo local em contrato externo.

## Como ler este documento

As regras abaixo são as guardas realmente implementadas no reducer/localStorage do demo. Elas exercitam um domínio sintético; não são política contábil, fiscal, bancária ou Connect. Onde o código é assimétrico ou contraditório, a divergência é preservada.

## Regras transversais

1. IDs, labels, datas, centavos, cardinalidade e vínculos precisam passar por `validatedDemoState` ao carregar/sincronizar.
2. Labels e seed são DEMO; não inserir dados pessoais/financeiros reais.
3. Valores monetários persistem em inteiros de centavos até `900000000000`; `formatBrl` usa `Intl.NumberFormat` pt-BR.
4. Datas são strings civis, com cálculo relativo a `todayInSaoPaulo`; comparações usam strings ISO. Não há regra de ordem emissão ≤ competência ≤ vencimento.
5. Estado local pode continuar em memória se localStorage falhar, mas exibe aviso e não se torna banco.
6. Mutação datada consulta `closedPeriods`; cadastros, status/orçamento de projeto e itens de campo sem data não consultam período.

## Cadastros e dimensões

### Parties

- `addParty`: nome trim não vazio; cria ID, `withDemoLabel`, tipo informado e `active=true`.
- `renameParty`: exige party existente, nome não vazio e até 160 caracteres antes do prefixo; preserva ID e referências.
- `toggleParty`: alterna `active`; ID desconhecido é no-op; histórico não é removido.
- Não há bloqueio de nomes duplicados em parties.

### Categorias e centros

- `addCategory` e `addCenter` exigem nome/código não vazios.
- Código é normalizado para `DEMO-` + payload em uppercase, removendo prefixo DEMO prévio.
- Duplicidade de código normalizado, case-insensitive, é rejeitada.
- Centro inativo continua no estado/histórico e não é escolhido por novo título.

### Projetos

- `addProject` exige nome/código, cliente party ativo do tipo `cliente` e orçamento positivo seguro.
- Código normalizado e único; `progressPercent=0`, `status=ativo`.
- `setProjectStatus` substitui status; confirmação é responsabilidade da UI.
- `setProjectBudget` exige projeto existente e valor positivo, mas não verifica projeto ativo apesar da mensagem de erro. Isso é confirmado como discrepância.

## Títulos, documentos e liquidação

`addTitle` exige datas válidas e meses abertos, descrição, party ativa compatível (`fornecedor`/`cliente`), categoria ativa compatível (`despesa`/`receita`), projeto nulo ou ativo, valor positivo e centro ativo quando explícito. Se `centerId` for nulo/ausente, o método escolhe o primeiro centro ativo, se houver. O título nasce manual, com `sourceId=null`, documento `nao_aplicavel` e settlements vazios.

`titleStatus` calcula:

1. `liquidado_simulado` se pendente = 0;
2. `parcial` se algum settlement existe;
3. `vencido`, `vence_hoje` ou `a_vencer` pela data de vencimento.

O union/UI também declara `em_aberto`, mas a função não o retorna atualmente.

`resolveDemoDocument` só muda `aguardando_demo` para `demo_ok`; não recebe arquivo ou NF. `settleTitle` exige data válida, documento resolvido, valor positivo não maior que pendente, mês aberto e, para fontes `field`/`interviewer`, valor exatamente igual ao saldo. Cada settlement cria uma transação `saida` para pagar ou `entrada` para receber, `source:simulado`, não conciliada. Ao completar título de campo/entrevistador, itens relacionados viram `paga_simulada`.

## Provisões e orçamento

- `addProvision`: projeto ativo, categoria de despesa ativa, descrição, centavos positivos, data válida e due month aberto; estado `prevista`, sem título/motivo.
- `convertProvision`: competência de hoje aberta, provisão `prevista`, projeto e fornecedor ativos, due month aberto; cria título pagar `source=provision`, copia projeto/categoria/due/valor, usa hoje em emissão/competência, marca provisão `substituida` e salva `titleId`.
- `cancelProvision`: motivo não vazio, status `prevista`, due month aberto; grava `cancelReason` trimado e permanece na coleção.
- M4 calcula baseline = orçamento; previsto = provisões `prevista`; comprometido = saldo pendente de títulos pagar; realizado = settlements de títulos pagar; consumo é a soma. Alertas em 80%/100% são visuais e não bloqueiam.

## Entrevistadores e lotes

`createInterviewerBatch` exige competência de hoje aberta, dueDate válida e aberta, itens únicos, pendentes, do mesmo projeto e projeto ativo. Escolhe primeiro fornecedor ativo e `cat-demo-field` ativa, com fallback para primeira despesa ativa. Soma exatamente, cria título pagar fonte `interviewer` e marca itens `em_lote`. Não exige mesma dueDate entre itens.

`payInterviewerBatch` exige título fonte `interviewer`, itens em lote, saldo integral, soma exata e mês de pagamento aberto; faz baixa total e marca itens `paga_simulada`. Parcial e segunda baixa são rejeitadas.

## Folha e itens de campo

`addFieldItem` exige projeto/categoria de despesa ativos, descrição, quantidade e unitário positivos seguros. A quantidade é em centésimos; `amountCents = floor((quantityHundredths * unitCents + 50) / 100)`, com `BigInt` no store. Não há período porque o item não tem data.

`createFieldSheet` exige data válida, projeto ativo, mês aberto e ao menos um item pendente; inclui automaticamente todos os pendentes do projeto, cria folha `aberta`, soma exata e marca itens `em_lote`.

`approveFieldSheet` exige hoje e data da folha abertos, folha aberta, projeto/fornecedor/categoria ativos e soma exata não zero; cria título pagar fonte `field`, emissão/competência hoje, vencimento da folha, `sourceId=sheet.id`, e marca `aprovada_demo`.

`payFieldSheet` exige folha aprovada com título, itens, soma exata e mês aberto; liquida integralmente e marca folha/itens `paga_simulada`. `cancelFieldSheet` aceita apenas folha aberta e período aberto, remove a folha e devolve itens a `pendente`; não salva motivo/histórico.

## Conciliação e períodos

Movimentos vêm somente de settlements. `reconcileTransaction` exige transação aberta, mês aberto e classificação não vazia; grava classificação DEMO, `reconciled=true`, limpa exceção. `markTransactionException` exige também motivo; grava classificação/motivo DEMO e marca conciliada. A UI oferece quatro escolhas (`pagamento`, `recebimento`, `tarifa DEMO`, `outro DEMO`), mas o store aceita qualquer string não vazia.

`closePeriod` exige `YYYY-MM` entre 2000 e 2099, rejeita se houver transação do mês não conciliada ou sem classificação, rejeita já fechado e insere em ordem. Exceção conta como tratada porque `reconciled=true`; mês sem transação pode ser fechado por chamada direta. `reopenPeriod` exige período fechado e motivo não vazio, mas o reducer recebe/salva somente o período: o motivo é descartado. A UI diz “motivo registrado”, o que contradiz o estado.

## Relatórios e derivações

- Dashboard: pendentes pagar/receber por saldo, realizado do mês por settlement, provisões previstas, itens de campo pendentes e movimentos não conciliados.
- M7 `titles`: vencimento; valor, liquidado, pendente e status.
- `realized`: cada settlement separado, filtrado pela data de liquidação.
- `forecast`: saldo de títulos e provisões ainda `prevista`, filtrado por vencimento.
- `projects`: títulos agrupados por projeto/“Sem projeto”, filtrados por competência; resultado = receita − despesa sobre valor dos títulos, não somente realizado.
- `aging`: saldo pendente em cinco faixas: vencido >30, vencido 1–30, vence 0–7, vence 8–30, após 30; separa pagar/receber.
- `reconciliation`: movimentos não conciliados ou com exceção, e folhas abertas/aprovadas separadas.
- CSV é local, com banner DEMO, colunas `*_centavos`, filtro, total, proteção de fórmula e `ObjectURL` revogado.

## Integridade e lacunas explicitamente confirmadas

A validação de reload verifica IDs únicos por coleção, tipos, limites, referências, settlement ↔ transação, soma de folha e fórmula de item. Não verifica: centro/projeto ativo após reload; datas em ordem; status de item coerente com folha/lote; relação específica source/sourceId; classificação limitada às quatro opções da UI; bloqueio de período em estado já serializado; unicidade global de todos os IDs; existência de histórico de cancelamento.

> **A CONFIRMAR:** ordem obrigatória das três datas; política de baixa parcial de provisão; retenção/auditoria de reabertura; histórico de cancelamento de folha; regras fiscais/contábeis; equivalência com Connect/Bank API. Não escolher silenciosamente.

## Fontes

[`DemoStore.tsx`](../client/src/contexts/DemoStore.tsx#L225-L404), [`demoModel.ts`](../client/src/lib/demoModel.ts#L62-L132), [`demoValidation.ts`](../client/src/lib/demoValidation.ts#L4-L78), páginas M1–M7 em [`client/src/pages/demo/`](../client/src/pages/demo/).
