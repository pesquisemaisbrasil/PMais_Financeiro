# EVIDÊNCIA DE AUDITORIA — Frontend

**Base auditada:** `pmaisfin`, base declarada `81bc243` (mockup de sete módulos + login administrativo de demonstração). **Escopo:** somente fontes do frontend, manifesto público de rotas e catálogo compartilhado necessários à reconstrução da UI. **Não foram lidos** `.env*` nem `.manus-logs`; nenhum segredo, valor de cookie/token, senha, hash, DSN ou log bruto foi reproduzido.

## 1. Resultado executivo

- **CONFIRMADO NO CÓDIGO:** a entrada real é `client/src/main.tsx:1-35`. Ela monta `trpc.Provider`, `QueryClientProvider`, `DemoAccessProvider` e `App`, e importa `index.css`, `demo.css` e `demo-enhancements.css` (`client/src/main.tsx:29-34`). A página de login importa adicionalmente `login.css` (`client/src/pages/Login.tsx:1-5`).
- **CONFIRMADO NO CÓDIGO:** `App.tsx` usa React lazy/Suspense, Wouter, `ErrorBoundary`, `DemoAccess`, `DemoStore` e `AppShell` (`client/src/App.tsx:1-24`). O branch autenticado envolve todas as rotas protegidas em `DemoProvider` e monta `DemoConfirmationHost` (`client/src/App.tsx:57-60`).
- **CONFIRMADO NO CÓDIGO:** a aplicação não é uma tela financeira conectada ao backend de negócio. Os módulos `/demo/*` operam sobre estado local do navegador (`client/src/contexts/DemoStore.tsx:26-36`, `408-432`), com validação Zod e dados sintéticos; o acesso de demonstração conversa apenas com endpoints `/api/demo-access/*` (`client/src/contexts/DemoAccess.tsx:23-40`, `54-99`).
- **CONFIRMADO NO CÓDIGO:** o estado técnico informativo é a única leitura de servidor de páginas ativas, via `GET /api/deployment/status`, sem credenciais, sem cache e sem retry automático (`client/src/components/DeploymentStatus.tsx:71-91`).
- **CONFIRMADO NO CÓDIGO:** há sete módulos demo e seis vistas de Relatórios. O catálogo compartilhado define os IDs `pagamentos`, `cadastros`, `contas`, `orcamento`, `folha`, `conciliacao`, `relatorios` (`shared/catalog.ts:19-76`); `DemoReportsPage` define as seis chaves (`client/src/pages/demo/DemoReportsPage.tsx:35-58`).
- **CONFIRMADO NO CÓDIGO:** exportação CSV e impressão são handlers de UI local; não são exportação/relatório financeiro real (`client/src/pages/demo/DemoReportsPage.tsx:377-425`).
- **RECOMENDAÇÃO — não implementado atualmente:** tratar a paridade do manifesto de rotas, o estado do `ErrorBoundary`, a certificação de acessibilidade das tabs e a política de componentes legados como itens explícitos de hardening antes de transformar o mockup em produto.

## 2. Entrada, composição e ciclo de renderização

### 2.1 Composição efetiva

- **CONFIRMADO NO CÓDIGO:** `main.tsx` cria um `QueryClient` (`client/src/main.tsx:12`) e um cliente tRPC com `httpBatchLink`, URL `/api/trpc`, `superjson` e `credentials: "omit"` (`client/src/main.tsx:14-27`). O provider tRPC não implica que alguma página demo faça chamada de negócio; as páginas ativas usam o store local e `DeploymentStatus` usa `fetch` direto.
- **CONFIRMADO NO CÓDIGO:** a ordem dos providers é tRPC → TanStack Query → `DemoAccessProvider` → `App` (`client/src/main.tsx:29-34`).
- **CONFIRMADO NO CÓDIGO:** `App` lê `useDemoAccess` antes de decidir se cria `DemoProvider`. Se o status for autenticado, monta `DemoProvider`, as rotas lazy e o host global de confirmação; caso contrário, monta somente as rotas (`client/src/App.tsx:57-60`).
- **CONFIRMADO NO CÓDIGO:** `ShellRoute` exibe loading enquanto o acesso está em `loading`, redireciona qualquer status não autenticado a `/login` e só então monta `AppShell` (`client/src/App.tsx:26-31`).
- **CONFIRMADO NO CÓDIGO:** `Suspense` usa o mesmo loading textual “Verificando acesso à demonstração…” como fallback de imports lazy (`client/src/App.tsx:26`, `57-60`).
- **CONFIRMADO NO CÓDIGO:** toda exceção não capturada abaixo de `ErrorBoundary` cai em uma tela de erro com `error.stack` renderizado e recarga da página (`client/src/components/ErrorBoundary.tsx:14-22`, `24-52`). Isso é comportamento de diagnóstico de frontend, não evidência de logging seguro.

### 2.2 Contexto de acesso

- **CONFIRMADO NO CÓDIGO:** `DemoAccessProvider` tem estados `loading`, `authenticated`, `anonymous`, `error` e `unconfigured` (`client/src/contexts/DemoAccess.tsx:4-10`). A sessão é consultada com `credentials: "include"`, `cache: "no-store"`, guarda um desafio CSRF em memória e atualiza ao montar, a cada 60 segundos e no foco da janela (`client/src/contexts/DemoAccess.tsx:23-51`).
- **CONFIRMADO NO CÓDIGO:** login/logout são enfileirados para evitar concorrência; a recuperação automática ocorre somente para resposta `invalid_challenge`, nunca para falha de rede ou senha inválida (`client/src/contexts/DemoAccess.tsx:54-77`, `82-99`).
- **CONFIRMADO NO CÓDIGO:** `Login` redireciona usuário autenticado para `/`, tem estados de carregamento/rede/desconfiguração/sessão expirada e mantém `feedback` de submissão (`client/src/pages/Login.tsx:22-75`, `120-155`, `207-220`). Não há valor de senha pré-preenchido no código auditado (`client/src/pages/Login.tsx:23-29`).
- **CONFIRMADO NO CÓDIGO:** o formulário de login codifica labels/IDs, `autoComplete`, campo de senha real, botão de mostrar/ocultar com `aria-label`, `aria-pressed` e `aria-controls`, além de estados `role="status"`/`role="alert"` (`client/src/pages/Login.tsx:158-220`).
- **A CONFIRMAR:** a disponibilidade efetiva do endpoint de acesso, a política real de cookies do ambiente e o comportamento de expiração no servidor não são dedutíveis somente do frontend; o código apenas trata as respostas recebidas.

### 2.3 Contexto de composição e estado demo

- **CONFIRMADO NO CÓDIGO:** `DemoStore` define inputs para parties, categorias, projetos, títulos, provisões, lotes de entrevistadores e itens/folhas de campo (`client/src/contexts/DemoStore.tsx:15-24`), expõe os handlers para todos os módulos (`181-211`) e fornece `useDemoStore` com erro explícito se o provider faltar (`436-440`).
- **CONFIRMADO NO CÓDIGO:** a persistência usa a chave local `pmaisfinanceiro:demo:v1`, carrega e valida JSON com `validatedDemoState`, cai no seed se storage falhar e avisa quando não consegue persistir (`client/src/contexts/DemoStore.tsx:10`, `26-36`, `408-418`). Uma aba sincroniza estado validado por evento `storage` (`419-430`).
- **CONFIRMADO NO CÓDIGO:** o modelo é deliberadamente sintético: IDs, labels e seed contêm marca DEMO; o seed possui parties, categorias, centros, projetos, títulos, provisões, itens de entrevistadores, itens/folhas de campo e movimentos bancários simulados (`client/src/lib/demoModel.ts:11-60`, `143-195`).
- **CONFIRMADO NO CÓDIGO:** a validação Zod restringe versão, IDs, labels DEMO, datas, centavos, cardinalidade de linhas e referências entre títulos, settlements, transações, projetos, categorias, provisões e folhas (`client/src/lib/demoValidation.ts:10-35`, `37-78`).
- **CONFIRMADO NO CÓDIGO:** `DemoPageShell` coloca em todas as páginas demo um aviso de mockup, dados sintéticos e armazenamento local; exibe falha de persistência em `role="status"` (`client/src/components/DemoComponents.tsx:6-35`).
- **CONFIRMADO NO CÓDIGO:** não há contexto offline específico para o store demo. Como o estado é local, as telas demo podem continuar a renderização local; somente Overview/Deployment observam `navigator.onLine` (`client/src/components/DeploymentStatus.tsx:94-110`, `client/src/pages/Overview.tsx:23-27`, `client/src/pages/Deployment.tsx:37-42`).

## 3. Rotas, manifesto e navegação

### 3.1 Comparação `manus-routes.json` × `App.tsx`

A comparação abaixo usa `client/public/manus-routes.json:1-20` e `client/src/App.tsx:33-54`. As duas cópias públicas (`client/public/manus-routes.json` e `dist/public/manus-routes.json`) são byte a byte iguais no workspace auditado.

| Manifesto | Implementação no App | Proteção/observação |
|---|---|---|
| `/login` (`client/public/manus-routes.json:3`) | `Route path="/login" component={Login}` (`client/src/App.tsx:35-36`) | Pública; Login redireciona autenticado. |
| `/` (`:4`) | `Route path="/"` → `DemoDashboard` (`client/src/App.tsx:37`) | `ShellRoute`, lazy. |
| `/demo/pagamentos` (`:5`) | `DemoPaymentsPage` (`client/src/App.tsx:38`) | `ShellRoute`, lazy; M1. |
| `/demo/cadastros` (`:6`) | `DemoRegistryPage` (`:39`) | `ShellRoute`, lazy; M2. |
| `/demo/contas` (`:7`) | `DemoAccountsPage` (`:40`) | `ShellRoute`, lazy; M3. |
| `/demo/orcamento` (`:8`) | `DemoBudgetPage` (`:41`) | `ShellRoute`, lazy; M4. |
| `/demo/folha` (`:9`) | `DemoPayrollPage` (`:42`) | `ShellRoute`, lazy; M5. |
| `/demo/conciliacao` (`:10`) | `DemoReconciliationPage` (`:43`) | `ShellRoute`, lazy; M6. |
| `/demo/relatorios` (`:11`) | `DemoReportsPage` (`:44`) | `ShellRoute`, lazy; M7. |
| `/fundacao` (`:12`) | `Overview` (`client/src/App.tsx:45`) | `ShellRoute`; rota ativa porém sem link no sidebar ou nas páginas. |
| `/modulos` (`:13`) | `ModulesCatalog` (`:46`) | `ShellRoute`. |
| `/modulos/:id` (`:14`) | `ModuleGuide` (`:47`) | `ShellRoute`; `useRoute` consulta `id`. |
| `/implantacao` (`:15`) | `Deployment` (`:48`) | `ShellRoute`; query de status técnico. |
| `/seguranca` (`:16`) | `Security` (`:49`) | `ShellRoute`; conteúdo de salvaguardas. |
| `/acesso` (`:17`) | `Access` (`:50`) | `ShellRoute`; áreas adiadas. |
| `/documentacao` (`:18`) | `Documentation` (`:51`) | `ShellRoute`; inclui impressão. |

- **CONFIRMADO NO CÓDIGO:** além das 16 entradas do manifesto, `App` possui rota explícita `/404` e uma rota fallback sem `path`, ambas renderizando `NotFound` (`client/src/App.tsx:52-54`). Elas não estão declaradas no manifesto (`client/public/manus-routes.json:1-20`).
- **CONFIRMADO NO CÓDIGO:** `NotFound` injeta `meta robots=noindex` e, em qualquer caminho diferente de `/404`, executa `window.location.replace("/404")` (`client/src/pages/NotFound.tsx:5-13`). Portanto, o fallback não é uma tela inline por URL desconhecida: ele redireciona para a rota 404.
- **RECOMENDAÇÃO — não implementado atualmente:** decidir se `/404` deve ser incluída no manifesto de rotas (ou documentada como rota técnica) e se `/fundacao` deve ganhar um link de navegação. Hoje há divergência documental e uma rota informativa órfã. O único uso encontrado de `/fundacao` é `App.tsx:45` e o manifesto:12.

### 3.2 AppShell e sidebar

- **CONFIRMADO NO CÓDIGO:** `navigationItems` contém Visão geral, os sete módulos demo, Módulos, Implantação, Segurança, Acesso e Documentação (`client/src/components/AppShell.tsx:26-77`). Não contém `/fundacao` nem `/modulos/:id` como entradas próprias.
- **CONFIRMADO NO CÓDIGO:** a seleção ativa compara pathname exato ou prefixo; `/modulos/:id` é tratado como “Módulos” por `getCurrentSection` (`client/src/components/AppShell.tsx:79-83`, `93-105`). Cada link codifica `aria-current="page"` somente quando ativo (`99-105`).
- **CONFIRMADO NO CÓDIGO:** a navegação desktop é `<nav aria-label="Navegação principal">` dentro de `<aside aria-label="Barra lateral">` (`client/src/components/AppShell.tsx:139-145`, `85-115`).
- **CONFIRMADO NO CÓDIGO:** a navegação móvel usa Radix `Sheet`, tem título/descrição `sr-only`, botão de abrir com `aria-label` e `aria-expanded`, e botão de fechar com label (`client/src/components/AppShell.tsx:170-189`, `195-203`).
- **CONFIRMADO NO CÓDIGO:** o cabeçalho mostra breadcrumb, marca de mockup/dados sintéticos, logout `adm · Sair`, estados de saída e erro inline (`client/src/components/AppShell.tsx:192-223`). Logout chama `useDemoAccess().logout`, desabilita o botão durante a operação e mantém a mensagem de falha no `role="alert"` (`157-162`, `215-222`).
- **CONFIRMADO NO CÓDIGO:** a marca usa imagem em `/manus-storage/Logo2025_branco_2abedc7a.png` com fallback para `/brand/Logo2025_branco.png`, alt “Pesquise+” (`client/src/components/AppShell.tsx:119-135`). Login usa `/brand/Logo2025_branco.png` com alt “P+ Financeiro” (`client/src/pages/Login.tsx:79-84`).
- **CONFIRMADO NO CÓDIGO:** o rodapé declara demonstração local e “Não insira dados reais” (`client/src/components/AppShell.tsx:224-227`).

## 4. Páginas ativas não demo

- **CONFIRMADO NO CÓDIGO — `Login`:** formulário de acesso compartilhado, estados de sessão, retry e feedback já descritos; não oferece recuperação de senha, MFA ou conta financeira (`client/src/pages/Login.tsx:22-75`, `152-229`).
- **CONFIRMADO NO CÓDIGO — `Overview` em `/fundacao`:** exibe offline, hero de fundação, três métricas informativas, links para implantação/catálogo/documentação/segurança/acesso, resumo de status técnico e prévia dos três primeiros módulos (`client/src/pages/Overview.tsx:11-59`, `61-138`). Usa `useDeploymentStatus` e `useOnlineStatus` (`11-14`).
- **CONFIRMADO NO CÓDIGO — `ModulesCatalog`:** busca normalizada sem acentos, filtro por `todos`/`operacao`/`planejamento`/`analise`, contagem live e empty state com limpar filtros (`client/src/pages/ModulesCatalog.tsx:6-19`, `21-63`). Os cartões geram links `/modulos/:id` em `ProductComponents` (`client/src/components/ProductComponents.tsx:38-56`).
- **CONFIRMADO NO CÓDIGO — `ModuleGuide`:** resolve o parâmetro por `useRoute`, renderiza `NotFound` se não encontra módulo, mostra pré-requisito, readiness, fluxo conceitual, salvaguardas, capacidades e link para o próximo guia (`client/src/pages/ModuleGuide.tsx:7-15`, `16-80`). O texto marca o fluxo como fase posterior e exige validação futura no servidor (`client/src/pages/ModuleGuide.tsx:43-59`).
- **CONFIRMADO NO CÓDIGO — `Deployment`:** consulta `useDeploymentStatus`, mostra offline, loading, erro com retry, dados confirmados, banco, Connect e quatro gates de segurança (`client/src/pages/Deployment.tsx:19-51`, `53-98`).
- **CONFIRMADO NO CÓDIGO — `Security`:** lista seis requisitos de `securityRequirements`, mas o próprio texto os apresenta como regras/fases futuras; não é feature operacional (`client/src/pages/Security.tsx:6-40`, `shared/catalog.ts:86-93`).
- **CONFIRMADO NO CÓDIGO — `Access`:** declara login/identidade, MFA e administração adiados, e liga para Segurança (`client/src/pages/Access.tsx:5-9`, `11-44`). Textos como sessão demo de até 30 minutos são documentação da tela; a duração efetiva é **A CONFIRMAR** no servidor, não uma feature inferida apenas deste texto.
- **CONFIRMADO NO CÓDIGO — `Documentation`:** mostra guia de três passos e aviso local; botão “Imprimir guia” chama `window.print()` (`client/src/pages/Documentation.tsx:5-18`, `21-57`). Não deve ser tratado como documentação de operação real.
- **CONFIRMADO NO CÓDIGO — `NotFound`:** fallback público, noindex e redirecionamento para `/404` (`client/src/pages/NotFound.tsx:5-25`).

## 5. Páginas demo e handlers de UI

### M1 — Pagamentos de campo (`DemoPaymentsPage`)

- **CONFIRMADO NO CÓDIGO:** filtra itens de entrevistadores pendentes por projeto, permite seleção de IDs e data de vencimento, calcula totais em centavos e cria lote pelo `createInterviewerBatch` (`client/src/pages/demo/DemoPaymentsPage.tsx:56-121`).
- **CONFIRMADO NO CÓDIGO:** exibe títulos cuja origem é `interviewer`, itens associados, saldo e status; “Pagar lote” abre confirmação inline e chama `payInterviewerBatch`, resultando em status `paga_simulada` e transação local (`client/src/pages/demo/DemoPaymentsPage.tsx:289-385`).
- **CONFIRMADO NO CÓDIGO:** a seleção fica desabilitada enquanto o filtro está em “Todos os projetos” para preservar lote de projeto único (`239-273`). O botão só cria lote quando há projeto, itens e data (`86-88`, `280-284`).

### M2 — Cadastros (`DemoRegistryPage` + `DemoCentersPanel`)

- **CONFIRMADO NO CÓDIGO:** cria/edita/inativa parties, cria categorias e projetos; orçamento usa `parseBrlToCents`; fechamento/reabertura de projeto pede confirmação pelo host global (`client/src/pages/demo/DemoRegistryPage.tsx:32-163`).
- **CONFIRMADO NO CÓDIGO:** os formulários têm campos nome/tipo de party, nome/código/natureza de categoria, código/nome/cliente/orçamento de projeto (`client/src/pages/demo/DemoRegistryPage.tsx:191-365`). Busca de parties filtra nome/tipo; histórico não é removido e projetos alternam “Fechar/Reabrir” (`369-535`).
- **CONFIRMADO NO CÓDIGO:** centros de custo têm nome/código, criação e alternância ativo/inativo; feedback usa `role="alert"` ou `role="status"` (`client/src/components/DemoCentersPanel.tsx:5-29`). O texto liga centros ativos ao seletor de Contas (`17-20`).

### M3 — Contas a pagar/receber (`DemoAccountsPage`)

- **CONFIRMADO NO CÓDIGO:** o formulário de título usa direção, contraparte compatível, categoria compatível, projeto opcional, centro de custo, descrição, valor, emissão, competência e vencimento (`client/src/pages/demo/DemoAccountsPage.tsx:38-85`, `481-671`).
- **CONFIRMADO NO CÓDIGO:** filtros são busca textual, direção, status e projeto; a tabela mostra origem, IDs, contraparte, projeto/categoria, datas, valor, liquidado, pendente e histórico de settlements (`client/src/pages/demo/DemoAccountsPage.tsx:200-247`, `673-895`).
- **CONFIRMADO NO CÓDIGO:** baixa parcial/total exige valor não superior ao saldo, data, checkbox de confirmação e confirmação global; o handler chama `settleTitle` e cria movimento local (`client/src/pages/demo/DemoAccountsPage.tsx:249-267`, `359-427`, `897-989`). Títulos com pendência documental exibem botão de resolver pendência demo (`797-815`).
- **CONFIRMADO NO CÓDIGO:** a própria tela liga o evento local a Conciliação e Relatórios (`client/src/pages/demo/DemoAccountsPage.tsx:991-1014`).

### M4 — Projetos, orçamento e provisões (`DemoBudgetPage`)

- **CONFIRMADO NO CÓDIGO:** seleciona projeto, calcula baseline, previsto, comprometido, realizado, saldo e percentual de consumo a partir do mesmo estado de provisões/títulos/settlements (`client/src/pages/demo/DemoBudgetPage.tsx:90-211`). Há alertas visuais para consumo abaixo de 80%, a partir de 80% e a partir de 100% (`400-447`).
- **CONFIRMADO NO CÓDIGO:** cria provisão com projeto, categoria de despesa, descrição, valor e data; converte provisão em título M3 escolhendo fornecedor; cancela provisão exigindo motivo (`client/src/pages/demo/DemoBudgetPage.tsx:220-290`, `482-601`, `645-782`).
- **CONFIRMADO NO CÓDIGO:** a UI explica que provisão convertida sai do previsto e entra em comprometido/realizado sem dupla contagem (`client/src/pages/demo/DemoBudgetPage.tsx:449-480`). A própria tela declara ausência de API real/Connect (`299-326`).

### M5 — Folha e lotes (`DemoPayrollPage`)

- **CONFIRMADO NO CÓDIGO:** adiciona item de campo com projeto, categoria, descrição, quantidade e valor unitário; quantidade é convertida a centésimos e o valor calculado aparece em `<output aria-live="polite">` (`client/src/pages/demo/DemoPayrollPage.tsx:41-70`, `120-169`, `260-352`).
- **CONFIRMADO NO CÓDIGO:** cria folha por projeto com todos os itens pendentes, confere soma exata, aprova/cancela folha e, após aprovação, pede data/checkbox de confirmação para pagamento simulado (`client/src/pages/demo/DemoPayrollPage.tsx:424-467`, `479-566`).
- **CONFIRMADO NO CÓDIGO:** após paga_simulada, a UI liga o lançamento à conferência no M6; ações rápidas ligam M5 a M3 e M6 (`client/src/pages/demo/DemoPayrollPage.tsx:209-223`, `568-588`).

### M6 — Conciliação (`DemoReconciliationPage`)

- **CONFIRMADO NO CÓDIGO:** monta meses a partir de movimentos/fechamentos, filtra por mês e estado (`all`, `pending`, `reconciled`, `exception`), calcula contagens e bloqueia ações em período fechado (`client/src/pages/demo/DemoReconciliationPage.tsx:85-141`).
- **CONFIRMADO NO CÓDIGO:** cada linha mostra movimento, origem sintética, valor, situação e classificação; linhas abertas permitem classificar, confirmar ação local, conciliar ou registrar exceção com motivo (`client/src/pages/demo/DemoReconciliationPage.tsx:338-516`).
- **CONFIRMADO NO CÓDIGO:** fechamento exige zero pendências; reabertura exige período fechado, motivo e checkbox de confirmação (`client/src/pages/demo/DemoReconciliationPage.tsx:518-594`). O código não importa upload/extrato bancário real; o aviso da tela declara origem exclusiva de liquidações demo (`243-255`).

### M7 — Relatórios (`DemoReportsPage`)

#### Filtros, estado e agregações

- **CONFIRMADO NO CÓDIGO:** filtros globais são período (`todos`, mês atual, últimos 30, próximos 30, personalizado), datas De/Até, projeto e categoria (`client/src/pages/demo/DemoReportsPage.tsx:42-43`, `350-375`, `451-494`). Data inválida de início maior que fim gera `role="alert"` (`446-449`).
- **CONFIRMADO NO CÓDIGO:** `reportData` é calculado por `useMemo` e separa rows de títulos, realizado, previsto, projetos, aging, conciliação pendente e folhas abertas/aprovadas (`client/src/pages/demo/DemoReportsPage.tsx:186-344`).
- **CONFIRMADO NO CÓDIGO:** semântica de data por vista: títulos filtram vencimento; realizado, data do settlement; previsto, vencimento de títulos/provisões; projeto, competência; conciliação, data do movimento (`client/src/pages/demo/DemoReportsPage.tsx:208-309`, `452-454`).
- **CONFIRMADO NO CÓDIGO:** cada vista fornece resumo de registros, entradas, saídas e saldo líquido; valores são formatados a partir de centavos (`client/src/pages/demo/DemoReportsPage.tsx:325-348`, `512-517`).

#### As seis vistas reconstruíveis

1. **Pagar / receber (`titles`):** tabela de tipo, descrição, projeto, vencimento, valor, liquidado, saldo pendente e status; origem é `state.titles` (`client/src/pages/demo/DemoReportsPage.tsx:51-53`, `208-217`, `521-543`).
2. **Realizado (`realized`):** cada settlement permanece separado, com tipo, descrição, projeto, data de liquidação e valor (`client/src/pages/demo/DemoReportsPage.tsx:219-226`, `545-563`).
3. **Previsto (`forecast`):** combina saldo pendente de títulos e provisões ainda `prevista`, com origem, descrição, projeto, vencimento, tipo, valor e status (`client/src/pages/demo/DemoReportsPage.tsx:228-253`, `565-585`).
4. **Resultado por projeto (`projects`):** agrupa títulos por projeto/“Sem projeto”, soma receita e despesa por competência e calcula resultado (`client/src/pages/demo/DemoReportsPage.tsx:255-274`, `587-605`).
5. **Carteira / aging (`aging`):** agrupa saldo pendente por faixas vencidas/por vencer em relação a hoje e separa pagar/receber (`client/src/pages/demo/DemoReportsPage.tsx:275-293`, `607-625`).
6. **Conciliação pendente (`reconciliation`):** mostra movimentos não conciliados ou com exceção, e adicionalmente folhas abertas/aprovadas; não trata a folha como movimento conciliado (`client/src/pages/demo/DemoReportsPage.tsx:295-309`, `627-656`).

#### Exportação CSV e impressão

- **CONFIRMADO NO CÓDIGO:** `csvCell` protege strings que começam por `=`, `+`, `-` ou `@` com apóstrofo e escapa aspas; `csvDocument` gera banner DEMO, cabeçalho separado por `;`, rows e total (`client/src/pages/demo/DemoReportsPage.tsx:145-157`).
- **CONFIRMADO NO CÓDIGO:** `exportCurrentView` rejeita intervalo invertido e cria colunas/total específicos para cada uma das seis vistas; inclui uma primeira linha com filtros aplicados (`client/src/pages/demo/DemoReportsPage.tsx:377-412`).
- **CONFIRMADO NO CÓDIGO:** o handler cria `Blob` CSV, `URL.createObjectURL`, âncora com nome `relatorio-demo-<view>-<today>.csv`, dispara clique, revoga URL e mostra feedback de exportação sintética (`client/src/pages/demo/DemoReportsPage.tsx:413-421`). Não há envio de arquivo ao servidor.
- **CONFIRMADO NO CÓDIGO:** `printCurrentView` chama `window.print()`; os botões são `no-print` (`client/src/pages/demo/DemoReportsPage.tsx:423-425`, `430-444`).
- **CONFIRMADO NO CÓDIGO:** CSS de impressão esconde sidebar, header, footer, ações, botões e avisos read-only, amplia conteúdo e evita quebra de cartões/tabelas (`client/src/index.css:2130-2157`, `client/src/demo.css:87`).
- **RECOMENDAÇÃO — não implementado atualmente:** se CSV for futuramente considerado exportação oficial, acrescentar contrato/versionamento, autorização, auditoria do download, encoding formal e teste de reconciliação dos totais. O código atual é explicitamente demo/local.

## 6. Ligações entre módulos e dependências de dados

- **CONFIRMADO NO CÓDIGO:** M2 alimenta o estado base: parties, categorias, projetos e centros; seus handlers vêm de `useDemoStore` (`client/src/pages/demo/DemoRegistryPage.tsx:32-41`, `client/src/components/DemoCentersPanel.tsx:5-15`).
- **CONFIRMADO NO CÓDIGO:** M3 consome parties/categorias/projetos/centros ativos para criar títulos; liquidações de títulos geram settlements e movimentos que M6/M7 leem (`client/src/pages/demo/DemoAccountsPage.tsx:179-235`, `412-425`, `991-1010`).
- **CONFIRMADO NO CÓDIGO:** M4 consome projetos/títulos/provisões; conversão chama o store para criar título cuja origem é provisão, e o M4 separa previsto/comprometido/realizado (`client/src/pages/demo/DemoBudgetPage.tsx:164-211`, `249-289`, `475-480`).
- **CONFIRMADO NO CÓDIGO:** M1 agrupa itens de entrevistadores por projeto e cria título com `source: interviewer`; o pagamento gera evento/movimento local (`client/src/pages/demo/DemoPaymentsPage.tsx:65-85`, `102-135`, `289-385`).
- **CONFIRMADO NO CÓDIGO:** M5 agrupa itens de campo em folhas, aprova folha e cria título com origem de campo; pagamento leva movimento à conciliação (`client/src/pages/demo/DemoPayrollPage.tsx:172-207`, `479-571`).
- **CONFIRMADO NO CÓDIGO:** M6 consome `bankTransactions` nascidos de settlements; classificação/exceção e fechamento atualizam somente o estado demo (`client/src/pages/demo/DemoReconciliationPage.tsx:121-141`, `151-241`, `518-594`).
- **CONFIRMADO NO CÓDIGO:** M7 consome títulos, settlements, provisões, projetos, categorias, transações e folhas para produzir suas seis leituras (`client/src/pages/demo/DemoReportsPage.tsx:202-344`).
- **CONFIRMADO NO CÓDIGO:** Dashboard deriva pendências de contas, settlements do mês, provisões, itens de campo e transações não conciliadas; os atalhos ligam Contas → Conciliação → Relatórios e Dashboard → módulos (`client/src/pages/demo/DemoDashboard.tsx:45-106`, `214-422`).
- **CONFIRMADO NO CÓDIGO:** o host global de confirmação é registrado no `DemoConfirmationHost` e resolve prompts chamados por M2/M3/M4/M5/Dashboard (`client/src/components/DemoConfirmationHost.tsx:5-35`, `client/src/lib/demoConfirm.ts:1-12`).

## 7. Componentes, hooks e classificação pelo import graph

A classificação foi feita por alcançabilidade a partir de `client/src/main.tsx`, seguindo imports estáticos, imports lazy declarados em `App.tsx` e imports transitivos. “Legado/importado” significa que o arquivo permanece no repositório ou é importado somente por outro arquivo não alcançado pelo App; não significa feature ativa.

| Alvo | Classificação | Evidência |
|---|---|---|
| `_core/hooks/useAuth.ts` | **Legado não alcançado** | Não há importador no client ativo; o próprio arquivo é uma superfície de compatibilidade que retorna `user: null`, `isAuthenticated: false`, `loading: false` e lança ao `refresh/logout` (`client/src/_core/hooks/useAuth.ts:14-38`). |
| `components/DashboardLayout.tsx` | **Legado não alcançado** | É explicitamente wrapper de compatibilidade e apenas retorna `children` (`client/src/components/DashboardLayout.tsx:3-10`); não é importado por App/páginas ativas. |
| `pages/Home.tsx` | **Legado não alcançado** | É o starter “Example Page”, sem import no App (`client/src/pages/Home.tsx:5-25`; rotas efetivas em `client/src/App.tsx:33-54`). |
| `pages/ComponentShowcase.tsx` | **Legado não alcançado** | Vitrine não é importada pelo App; concentra os imports da UI genérica, tema, sonner e chat (`client/src/pages/ComponentShowcase.tsx:1-175`). |
| `components/AIChatBox.tsx` | **Legado importado somente pela vitrine** | Único importador é `ComponentShowcase.tsx:174`; o componente simula callbacks recebidos, auto-scroll e resposta não própria do produto (`client/src/components/AIChatBox.tsx:62-70`, `168-181`). |
| `components/Map.tsx` | **Legado não alcançado** | Não há importador no client; é guia de integração Google Maps que injeta script/configuração e não é montado (`client/src/components/Map.tsx:1-75`, `89-153`). |
| `contexts/ThemeContext.tsx` | **Legado importado somente pela vitrine** | É importado em `ComponentShowcase.tsx:160`; não é provider montado em `main.tsx`/`App.tsx`. O próprio comentário o chama de provider de compatibilidade (`client/src/contexts/ThemeContext.tsx:19-22`). |
| `hooks/useComposition.ts` | **Legado transitivo da UI genérica** | Importado apenas por `components/ui/input.tsx` e `textarea.tsx`; ambos pertencem ao conjunto não alcançado pela aplicação ativa. Implementa proteção de Enter/Escape durante composição IME (`client/src/hooks/useComposition.ts:23-80`). |
| `hooks/useMobile.tsx` | **Legado transitivo da UI genérica** | Importado apenas por `components/ui/sidebar.tsx`, que não é importado por App; não é o mecanismo móvel efetivo do `AppShell`, que usa `Sheet` (`client/src/hooks/useMobile.tsx:1-21`, `client/src/components/AppShell.tsx:18-24`, `170-189`). |
| `components/ui/sheet.tsx` | **Ativo/importado** | Importado diretamente por `AppShell` (`client/src/components/AppShell.tsx:18-24`) para sidebar móvel. |
| `components/ui/alert-dialog.tsx` | **Ativo/importado** | Importado por `DemoConfirmationHost` (`client/src/components/DemoConfirmationHost.tsx:1-3`). |
| `components/ui/button.tsx` | **Ativo transitivo** | Importado por `alert-dialog`; também é usado em legados, mas sua presença ativa vem da cadeia do host de confirmação. |
| restante de `components/ui/*` | **Legado/importado ou não alcançado** | `ComponentShowcase` importa a maior parte (`client/src/pages/ComponentShowcase.tsx:1-159`); `ManusDialog`, sidebar e wrappers não têm caminho até App. |

- **CONFIRMADO NO CÓDIGO:** componentes próprios ativos incluem `AppShell`, `DemoComponents`, `DemoCentersPanel`, `DemoConfirmationHost`, `DeploymentStatus`, `ErrorBoundary` e `ProductComponents`, conforme imports de `App`, páginas ativas e páginas demo (`client/src/App.tsx:3-24`; `client/src/pages/demo/DemoRegistryPage.tsx:1-16`; `client/src/pages/Deployment.tsx:1-9`; `client/src/pages/Overview.tsx:1-9`).
- **CONFIRMADO NO CÓDIGO:** `ProductComponents` fornece `PageHeader`, `ReadinessBadge`, `ModuleCard`, `SafeguardList` e `ReadOnlyNotice` para as páginas informativas (`client/src/components/ProductComponents.tsx:6-79`).
- **CONFIRMADO NO CÓDIGO:** `DeploymentStatus` valida estritamente a forma do status técnico, usa TanStack Query sem retry e observa online/offline (`client/src/components/DeploymentStatus.tsx:30-69`, `71-110`).
- **CONFIRMADO NO CÓDIGO:** `ThemeProvider` e `useTheme` não fazem parte da composição real; o provider apenas alterna classe `dark` se usado, sem persistência (`client/src/contexts/ThemeContext.tsx:23-49`). Não há tema escuro ativo dedutível da entrada.

## 8. CSS e comportamento visual

Arquivos auditados: `client/src/index.css:1-2168`, `client/src/demo.css:1-87`, `client/src/demo-enhancements.css:1-35` e `client/src/login.css:1-567`.

- **CONFIRMADO NO CÓDIGO:** `index.css` importa Tailwind v4 e `tw-animate-css`, define tokens de cor, foco, raio, sombra, sidebar e superfícies (`client/src/index.css:1-29`). O corpo usa Open Sans/Arial, min-width 320px e base 15px (`40-50`).
- **CONFIRMADO NO CÓDIGO:** há regra global `:focus-visible` para botão/link/input/select e utilitário `.sr-only` (`client/src/index.css:81-87`, `123-133`). Isso é acessibilidade codificada, não certificação WCAG.
- **CONFIRMADO NO CÓDIGO:** layout desktop usa sidebar sticky de 274px, header sticky e main flexível (`client/src/index.css:135-150`, `298-318`). O CSS esconde sidebar desktop e exibe menu móvel até 800px; em 590px empilha grids/ações (`client/src/index.css:1923-2128`).
- **CONFIRMADO NO CÓDIGO:** `demo.css` fornece cards, métricas, campos com min-height 44px, estados, feedback, tabelas com overflow horizontal, checkbox de 18px e breakpoints 1100/800/520px (`client/src/demo.css:10-58`, `84-87`).
- **CONFIRMADO NO CÓDIGO:** `demo-enhancements.css` transforma formulários demo em grid, fornece `table-scroll`/`data-table`, estilos de alertas/histórico e reduz formulário a uma coluna em 620px (`client/src/demo-enhancements.css:1-30`).
- **CONFIRMADO NO CÓDIGO:** `login.css` define layout de duas colunas, painéis de login, foco, status loading/error/blocked, botão de senha, breakpoints 900/680/430px e `prefers-reduced-motion` (`client/src/login.css:1-16`, `171-379`, `405-567`).
- **CONFIRMADO NO CÓDIGO:** CSS de print de `index.css` remove shell/ações/avisos read-only, enquanto `demo.css` remove ações e mantém aviso demo/cartões/tabelas imprimíveis (`client/src/index.css:2130-2157`, `client/src/demo.css:87`).
- **CONFIRMADO NO CÓDIGO:** `prefers-reduced-motion` reduz animação/transição globais e o CSS de login desliga spinner/transições (`client/src/index.css:2159-2167`, `client/src/login.css:556-567`).
- **A CONFIRMAR:** contraste real, reflow, zoom, leitores de tela e impressão em navegadores não foram certificados por teste manual/automatizado nesta auditoria de fonte.

## 9. Acessibilidade codificada (não certificada)

- **CONFIRMADO NO CÓDIGO:** landmarks e nomes: `nav`, `aside`, `main`, `header`, `footer`, headings, `aria-label`, `aria-labelledby`, `aria-current`, `aria-expanded`, `aria-controls`, captions e `scope="col"` estão presentes em vários fluxos (`client/src/components/AppShell.tsx:89-115`, `170-223`; `client/src/pages/demo/DemoPaymentsPage.tsx:144-146`, `226-238`; `client/src/pages/demo/DemoReportsPage.tsx:159-179`).
- **CONFIRMADO NO CÓDIGO:** estados dinâmicos usam `role="status"`, `role="alert"`, `aria-live` e `aria-atomic` em login, deployment, catálogo, dashboards e demos (`client/src/pages/Login.tsx:127-155`, `207-210`; `client/src/pages/Deployment.tsx:37-50`; `client/src/pages/demo/DemoAccountsPage.tsx:470-478`).
- **CONFIRMADO NO CÓDIGO:** tabelas demo principais têm `caption` e `scope` em vários módulos; campos têm `<label htmlFor>` e IDs estáveis, e os botões de ação demo têm área mínima CSS de 44px (`client/src/pages/demo/DemoPaymentsPage.tsx:226-237`, `245-255`; `client/src/demo.css:30-42`).
- **CONFIRMADO NO CÓDIGO:** as seis vistas de relatório usam `role="group"`, `aria-pressed` e `aria-controls`, mas os botões não usam `role="tab"` e a região não usa `role="tabpanel"` (`client/src/pages/demo/DemoReportsPage.tsx:496-510`, `521-656`).
- **CONFIRMADO NO CÓDIGO:** em M2 há tabelas sem `caption`/`scope` explícito em todos os cabeçalhos e há duas ações lado a lado com o nome renderizado no botão (`client/src/pages/demo/DemoRegistryPage.tsx:369-425`, `428-468`).
- **RECOMENDAÇÃO — não implementado atualmente:** executar teste manual de teclado/leitor de tela/zoom e, se a semântica de tabs for desejada, converter as seis vistas para padrão `tablist`/`tab`/`tabpanel` com foco e seleção verificáveis. Não afirmar conformidade antes desses testes.

## 10. Tecnologias efetivamente usadas

- **CONFIRMADO NO CÓDIGO:** React 19 + `react-dom`, Vite, TypeScript, Wouter, TanStack React Query, tRPC client/server types, superjson, Zod, Lucide e Radix UI estão declarados em `package.json:48-82`, e os pontos de uso ativos são `main.tsx`, `App.tsx`, `DeploymentStatus`, componentes e páginas.
- **CONFIRMADO NO CÓDIGO:** Wouter implementa rotas/links (`client/src/App.tsx:2`, `33-54`; `client/src/components/AppShell.tsx:16`, `99-112`).
- **CONFIRMADO NO CÓDIGO:** TanStack Query cria client global (`client/src/main.tsx:1`, `12-34`) e executa a query técnica (`client/src/components/DeploymentStatus.tsx:1`, `84-91`).
- **CONFIRMADO NO CÓDIGO:** tRPC cria o tipo/client (`client/src/lib/trpc.ts:1-4`) e o provider é montado, mas nenhum handler demo observado usa mutação tRPC; o estado demo é reducer/localStorage.
- **CONFIRMADO NO CÓDIGO:** Zod valida o snapshot local (`client/src/lib/demoValidation.ts:1-2`, `16-78`); `clsx`/`tailwind-merge` fornecem `cn` (`client/src/lib/utils.ts:1-6`); CSS usa Tailwind importado mais CSS autoral.
- **CONFIRMADO NO CÓDIGO:** o frontend usa `fetch` para sessão demo e status técnico (`client/src/contexts/DemoAccess.tsx:25`, `56-60`; `client/src/components/DeploymentStatus.tsx:71-81`), `localStorage`/evento `storage` para dados demo (`client/src/contexts/DemoStore.tsx:26-36`, `411-430`) e `Blob`/Object URL para CSV (`client/src/pages/demo/DemoReportsPage.tsx:413-419`).
- **CONFIRMADO NO CÓDIGO:** não há caminho ativo até Google Maps, chat LLM, ThemeContext ou a UI genérica completa. `AIChatBox`, `Map` e o tema são superfícies de starter/compatibilidade, não capacidades disponíveis nas rotas declaradas.

## 11. Riscos, limites e pontos a confirmar

1. **RISCO — CONFIRMADO NO CÓDIGO:** `ErrorBoundary` renderiza `error.stack` diretamente (`client/src/components/ErrorBoundary.tsx:34-39`), podendo expor detalhes de implementação ao usuário. **RECOMENDAÇÃO — não implementado atualmente:** mensagem segura/localizada em produção e telemetria aprovada sem stack na UI.
2. **RISCO — CONFIRMADO NO CÓDIGO:** `/fundacao` está no manifesto e no App, mas não no sidebar nem em links internos encontrados (`client/src/App.tsx:45`; `client/public/manus-routes.json:12`). **RECOMENDAÇÃO — não implementado atualmente:** tornar a descoberta intencional ou retirar/documentar a rota.
3. **RISCO — CONFIRMADO NO CÓDIGO:** `/404` e o catch-all existem no App, mas não no manifesto (`client/src/App.tsx:52-54`; `client/public/manus-routes.json:1-20`). **RECOMENDAÇÃO — não implementado atualmente:** alinhar manifesto e contrato de navegação.
4. **RISCO — CONFIRMADO NO CÓDIGO:** tabs de Relatórios são visualmente selecionáveis, porém sem semântica completa de tablist/tabpanel (`client/src/pages/demo/DemoReportsPage.tsx:496-510`). **RECOMENDAÇÃO — não implementado atualmente:** teste e semântica ARIA formal antes de certificação.
5. **RISCO — CONFIRMADO NO CÓDIGO:** o componente legado `MapView` rejeita sem tratar a falha de configuração e só faz `console.error` no erro do script (`client/src/components/Map.tsx:89-107`, `126-148`); ele não está em caminho ativo. **RECOMENDAÇÃO — não implementado atualmente:** se reativado, adicionar loading/error/timeout e remover dependência implícita de configuração global.
6. **A CONFIRMAR:** status de banco, assinatura, MFA, Connect, sessão e duração da sessão dependem de respostas do servidor; o frontend valida/exibe contratos, mas não certifica o backend (`client/src/components/DeploymentStatus.tsx:30-68`; `client/src/contexts/DemoAccess.tsx:23-40`).
7. **A CONFIRMAR:** contraste, foco após abertura/fechamento de Sheet/AlertDialog, comportamento de impressão em cada vista e leitura das tabelas em leitor de tela exigem teste de execução; as regras CSS/ARIA acima são apenas evidência de intenção codificada.

## 12. Reconstrução mínima do domínio

Para reproduzir o frontend sem recorrer a texto histórico: inicializar providers na ordem de `main.tsx`; implementar as rotas de `App.tsx`; proteger todas as rotas exceto login/404 com o estado de `DemoAccess`; montar `AppShell` com 13 links fixos; montar `DemoProvider` somente no branch autenticado; carregar seed/validação/persistência de `DemoStore`; usar `DemoPageShell` e os componentes de `DemoComponents`; ligar M2 → M3/M4/M5, M1/M5/M3 → movimentos M6, e todos os registros relevantes → M7. A fundação técnica (`Overview`, `Deployment`, `ModulesCatalog`, `ModuleGuide`, `Security`, `Access`, `Documentation`) é informativa/read-only; `Home`, `ComponentShowcase`, `AIChatBox`, `Map`, `ThemeContext`, `DashboardLayout` e `useAuth` não devem ser tratados como páginas/capacidades ativas com base no import graph auditado.
