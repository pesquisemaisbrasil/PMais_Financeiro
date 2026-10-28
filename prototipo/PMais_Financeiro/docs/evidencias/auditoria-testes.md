# Evidência de auditoria — domínio Testes existentes

**Projeto auditado:** `<raiz-do-repositorio>`
**Base informada:** `81bc243` (mockup de sete módulos + acesso demo-only)
**Data de coleta:** 26/10/2026
**Escopo:** arquivos `server/*test.ts*`, `vitest.config.ts`, `scripts/verify-delivery.sh`, `scripts/check-readonly-http.py` e `scripts/check-demo-access.py`, além das rotas e componentes mínimos necessários para reconstruir a relação entre testes, login e manifesto.
**Natureza:** evidência de auditoria intermediária; não é documentação final nem certificação de produção.

## 1. Convenções e limites da evidência

- **CONFIRMADO NO CÓDIGO** significa que o fato é observável nos arquivos-fonte citados.
- **A CONFIRMAR** significa que o código ou a suíte não fornece prova suficiente para concluir o comportamento em ambiente real.
- **RECOMENDAÇÃO — não implementado atualmente** significa uma ação de qualidade/aceitação ainda ausente; não deve ser lida como funcionalidade existente.
- As referências são relativas a este arquivo: `../../pmaisfin/...:linha(s)`.
- Não foram lidos `.env` nem `.manus-logs`, não foi executado browser, não foi acessado banco/Connect/Itaú/serviço externo, não foi usado segredo real e não foi cadastrada pessoa nem movimentado dinheiro.
- Não foi executado nenhum dos três scripts de `scripts/`. O script `check-demo-access.py` lê a senha configurada no ambiente e, portanto, foi deliberadamente excluído desta auditoria conforme a restrição de não executar script que lê senha real.

## 2. Execuções autorizadas e evidências produzidas

Foram executados uma única vez cada: `pnpm check`, `pnpm test` e `pnpm build`. Os outputs separados estão em:

- `../../pmaisfin/docs/evidencias/check.txt:1-7` — `pnpm check`, status 0, `tsc --noEmit`, tempo de shell registrado de 6 s.
- `../../pmaisfin/docs/evidencias/testes.txt:1-31` — `pnpm test`, status 0, Vitest.
- `../../pmaisfin/docs/evidencias/build.txt:1-40` — `pnpm build`, status 0, Vite + esbuild.
- `../../pmaisfin/docs/evidencias/testes-resumo.json:1-39` — resumo estruturado de status, contagens, tempos, data de coleta, versões/dependências e avisos.

**CONFIRMADO NO OUTPUT:** `pnpm test` aprovou **8 arquivos de teste e 81 testes**, sem falhas (`../../pmaisfin/docs/evidencias/testes.txt:8-27`). A distribuição observada foi: `auth.logout` 14, `deployment` 25, `demo` 14, `access-queue` 3, `contentPolicy` 3, `platform` 5, `demo-access` 9 e `demo-render` 8 (`../../pmaisfin/docs/evidencias/testes.txt:8-22`).

**CONFIRMADO NO OUTPUT:** o build produziu cliente e servidor, mas deixou dois avisos não bloqueantes: script `/api/platform/config.js` no HTML sem `type="module"` (`../../pmaisfin/docs/evidencias/build.txt:5-8`) e chunk inicial de 540,34 kB após minificação, acima do limiar de 500 kB (`../../pmaisfin/docs/evidencias/build.txt:27-33`). Nenhum aviso foi tratado como falha.

**CONFIRMADO NO OUTPUT:** o `check` valida somente o TypeScript de projeto com `tsc --noEmit` (`../../pmaisfin/docs/evidencias/check.txt:2-7`). O comando `test` é `vitest run` e o `build` é Vite seguido de esbuild conforme os scripts declarados (`../../pmaisfin/package.json:6-16`).

## 3. Inventário do domínio e configuração do runner

O inventário atual contém oito arquivos que correspondem ao padrão `server/*test.ts*`:

1. `../../pmaisfin/server/access-queue.test.ts:1-31`
2. `../../pmaisfin/server/auth.logout.test.ts:1-38`
3. `../../pmaisfin/server/contentPolicy.test.ts:1-19`
4. `../../pmaisfin/server/demo-access.test.ts:1-110`
5. `../../pmaisfin/server/demo-render.test.tsx:1-30`
6. `../../pmaisfin/server/demo.test.ts:1-140`
7. `../../pmaisfin/server/deployment.test.ts:1-76`
8. `../../pmaisfin/server/platform.test.ts:1-54`

**CONFIRMADO NO CÓDIGO:** `vitest.config.ts` fixa a raiz no repositório, aliases `@`, `@shared` e `@assets`, JSX automático, ambiente `node` e inclusão de `server/**/*.test.ts`, `server/**/*.test.tsx` e `server/**/*.spec.ts` (`../../pmaisfin/vitest.config.ts:1-20`). Assim, a suíte atual não configura ambiente de browser, Playwright, banco de teste ou servidor de release.

**CONFIRMADO NO CÓDIGO:** o manifesto de dependências declara `pnpm@10.18.0`, TypeScript 5.9.3, Vite 7.x e Vitest 2.x; o lockfile é `pnpm-lock.yaml` (`../../pmaisfin/package.json:84-108`). O resumo de execução registra as versões observadas sem instalar pacotes (`../../pmaisfin/docs/evidencias/testes-resumo.json:21-35`).

## 4. Matriz de suites, requisitos cobertos e modo de prova

### 4.1 `access-queue.test.ts` — concorrência do acesso demo

**CONFIRMADO NO CÓDIGO:** há três testes: serialização de três refreshes, atomicidade entre login e leitura antes/depois, e recuperação após uma falha (`../../pmaisfin/server/access-queue.test.ts:4-30`). As asserções reconstroem `maxActive === 1`, a ordem `read-before → login → read-after → refresh` e uma operação posterior bem-sucedida após erro (`../../pmaisfin/server/access-queue.test.ts:5-29`).

**Requisito mapeado:** não intercalar renovações CSRF durante login/logout/refresh; evitar que erro de uma operação trave a fila.

**Natureza:** teste unitário de fila em memória, com `Promise`, contador e timers locais; não é HTTP, browser, CSRF real ou teste de carga. **A CONFIRMAR:** comportamento entre múltiplas abas, processos/instâncias e condições de rede.

### 4.2 `auth.logout.test.ts` — áreas protegidas deliberadamente indisponíveis

**CONFIRMADO NO CÓDIGO:** o contexto usa cookie de fixture, e um objeto de admin é fornecido artificialmente (`../../pmaisfin/server/auth.logout.test.ts:5-12`). Primeiro, `createContext` não resolve identidade a partir do cookie do starter (`../../pmaisfin/server/auth.logout.test.ts:14-18`). Depois, 13 operações de identidade, logout, login, MFA, refresh, administração e financeiro são chamadas com contexto de admin e todas devem rejeitar com `SERVICE_UNAVAILABLE` (`../../pmaisfin/server/auth.logout.test.ts:19-37`).

**Requisito mapeado:** não transformar o cookie OAuth/starter nem um contexto de teste em identidade financeira; manter auth/admin/finance indisponíveis na entrega read-only/demo-only.

**Natureza:** chamadas diretas ao caller tRPC e ao contexto; não percorre HTTP/Express e não prova uma autenticação válida. **A CONFIRMAR:** códigos, cabeçalhos e corpos através de todas as rotas expostas, além de uma implementação futura de login/MFA real.

### 4.3 `contentPolicy.test.ts` — CSP e embedding

**CONFIRMADO NO CÓDIGO:** a suíte verifica `default-src`, scripts, estilos, fontes, imagens, conexões, `object-src 'none'` e `form-action 'self'`; preserva embedding ao não emitir `frame-ancestors`, admite HTTPS e rejeita host CDN obsoleto; HMR WebSocket somente na variante de desenvolvimento (`../../pmaisfin/server/contentPolicy.test.ts:4-19`).

**Requisito mapeado:** política de conteúdo explícita para a entrega informativa e compatibilidade controlada com Preview/HMR.

**Natureza:** função pura; não é inspeção de headers em uma resposta live. **A CONFIRMAR:** política efetivamente entregue por proxy, navegador, cache e combinação com outros headers em produção.

### 4.4 `demo-access.test.ts` — fluxo HTTP local de sessão demo-only

**CONFIRMADO NO CÓDIGO:** a fixture cria uma aplicação Express, monta `/api/demo-access`, `readOnlyGuard` e `requirePage`, abre um servidor em `127.0.0.1` numa porta efêmera e usa `fetch` com jar de cookies em memória (`../../pmaisfin/server/demo-access.test.ts:8-42`). O teardown fecha os servidores após cada caso (`../../pmaisfin/server/demo-access.test.ts:44-48`).

**CONFIRMADO NO CÓDIGO:** os nove testes cobrem senha não configurada e redirecionamento, cookie/token inventado e cookie OAuth ignorado, atributos do cookie CSRF para iframe HTTPS, CSRF inválido antes da credencial, mensagens genéricas para senha/identificador inválidos, sessão opaca com `scope` demo-only e APIs admin/finance bloqueadas, revogação server-side no logout, expiração de 30 minutos e rate limit após dez tentativas (`../../pmaisfin/server/demo-access.test.ts:50-109`).

**Requisito mapeado:** gate de demonstração separado de identidade financeira, CSRF, expiração, revogação, limitação de tentativas e read-only.

**Natureza:** é HTTP real somente contra uma fixture local efêmera, não contra o servidor construído, Preview, banco ou produção. A implementação confirma que as sessões são por processo e em memória (`../../pmaisfin/server/security/demoAccess.ts:19-35`), que login/logout exigem JSON, desafio CSRF e rejeitam `cross-site` (`../../pmaisfin/server/security/demoAccess.ts:82-123`), e que a guarda de página redireciona GET/HEAD sem sessão para `/login` (`../../pmaisfin/server/security/demoAccess.ts:126-131`). **A CONFIRMAR:** comportamento do cookie em navegadores reais, proxy HTTPS, múltiplas instâncias, reinício, clock skew, IPv6/proxy de IP e observabilidade sem dados sensíveis.

### 4.5 `demo-render.test.tsx` — renderização estática de oito telas demo

**CONFIRMADO NO CÓDIGO:** a lista contém dashboard e os sete módulos demo (`../../pmaisfin/server/demo-render.test.tsx:4-18`). Cada caso chama `renderToStaticMarkup` dentro de `Router` com `ssrPath`, e verifica aviso `DADOS SINTÉTICOS`, aviso `NENHUMA OPERAÇÃO REAL`, presença de `<h1>` e unicidade dos atributos `id` (`../../pmaisfin/server/demo-render.test.tsx:19-29`).

**Requisito mapeado:** cada tela demonstrativa renderiza com aviso de não produção e sem IDs duplicados na saída estática.

**Limite essencial:** SSR/`renderToStaticMarkup` **não é E2E de browser**. Não testa navegação real, click-through, foco, teclado, leitor de tela, CSS computado, contraste, hidratação, viewport, cookies ou interação com `/login`.

### 4.6 `demo.test.ts` — modelo local dos sete módulos

**CONFIRMADO NO CÓDIGO:** a suíte cria estado seed local, usa fake timers em `2026-10-25` e testa validação de estado, valores em centavos/parse BRL, liquidação parcial, provisão, cadastros/centros inativos, código duplicado, lote de entrevistadores, folha, pendência documental, conciliação, período fechado/reaberto, datas inválidas, unicidade de liquidação, bloqueios por competência e preservação de IDs históricos (`../../pmaisfin/server/demo.test.ts:6-15` e `../../pmaisfin/server/demo.test.ts:17-139`).

**Requisito mapeado:** coerência de fixtures e invariantes locais dos sete módulos, sempre sem API/DB.

**Natureza:** reducer/store local; não verifica persistência, transação, autorização de servidor, contabilidade real, integração bancária ou dados de produção. Os valores e identificadores do teste são fixtures sintéticas e não são saldos reais.

### 4.7 `deployment.test.ts` — status técnico, guard read-only e catálogo

**CONFIRMADO NO CÓDIGO:** `buildDeploymentStatus` é verificado para configuração ausente, chaves presentes sem liberar acesso, ausência de valores sensíveis no JSON e banco indisponível (`../../pmaisfin/server/deployment.test.ts:8-32`). A segunda parte chama diretamente `readOnlyGuard` com `res`/`next` mockados e exige 503 para prefixos protegidos e escritas, e passagem para as rotas informativas (`../../pmaisfin/server/deployment.test.ts:34-61`). A terceira verifica sete módulos únicos com fluxo, salvaguarda e pré-requisito, sem `amount`, `balance` ou `user` (`../../pmaisfin/server/deployment.test.ts:63-76`).

**Requisito mapeado:** modo somente leitura, ausência de liberação financeira e catálogo conceitual sanitizado.

**Natureza:** funções/handlers chamados diretamente; não prova status do servidor empacotado nem cobertura de todos os métodos, headers e caminhos equivalentes em proxy.

### 4.8 `platform.test.ts` — helpers de plataforma e armazenamento

**CONFIRMADO NO CÓDIGO:** a suíte testa configuração pública sem API key/JWT/DSN, ausência de chamada quando `MANUS_API_URL` não está configurada, resultado de imagem somente por URL persistido em storage gerenciado com `fetch` stubado, cookie seguro atrás do Preview HTTPS e sessão assinada vinculada ao projeto (`../../pmaisfin/server/platform.test.ts:10-54`). O teardown remove stubs (`../../pmaisfin/server/platform.test.ts:1-9`).

**Requisito mapeado:** não expor segredos em configuração pública, não adivinhar API de produção, usar storage gerenciado e vincular sessão ao projeto.

**Natureza:** funções locais com `fetch` e ambiente falsos; não é chamada externa ou integração live. **A CONFIRMAR:** contrato real do proxy, storage, API, rotação de chaves, falhas de rede e permissões no ambiente de implantação.

## 5. Rota `/login`, manifesto de 16 páginas e guards

**CONFIRMADO NO CÓDIGO:** `App.tsx` declara `/login` explicitamente como rota pública e 16 rotas informativas/demo antes de `/404`; todas as demais rotas passam por `ShellRoute`, que aguarda status e redireciona para `/login` quando não autenticado (`../../pmaisfin/client/src/App.tsx:26-54`). O componente principal usa `DemoProvider` somente quando o status é autenticado (`../../pmaisfin/client/src/App.tsx:57-60`).

**CONFIRMADO NO CÓDIGO:** o manifesto contém exatamente 16 entradas, começando por `/login` e incluindo dashboard, sete módulos demo e as rotas de fundação, catálogo, guia, implantação, segurança, acesso e documentação (`../../pmaisfin/client/public/manus-routes.json:1-20`).

**CONFIRMADO NO CÓDIGO:** a tela `Login` redireciona uma sessão autenticada para `/`, mantém usuário pré-preenchido como estado transitório, chama o contexto demo e dispõe de estados de carregamento, rede, não configurado, erro, senha e retry (`../../pmaisfin/client/src/pages/Login.tsx:22-75`). O formulário possui `label`/`htmlFor`, `autocomplete`, `required`, status/alert e controles com `aria-label`/`aria-controls` (`../../pmaisfin/client/src/pages/Login.tsx:112-229`). Isso é evidência de marcação existente, não certificação de acessibilidade.

**CONFIRMADO NO CÓDIGO:** o gate de página server-side inclui `/`, `/demo`, `/fundacao`, `/modulos`, `/implantacao`, `/seguranca`, `/acesso` e `/documentacao`, e exclui `/login` da regex de páginas protegidas (`../../pmaisfin/server/security/demoAccess.ts:10`); a ordem do servidor monta a API demo antes de `readOnlyGuard` e aplica `requirePage` antes do static/Vite (`../../pmaisfin/server/_core/index.ts:26-49`).

## 6. Auditoria dos scripts e possíveis desatualizações

### 6.1 `scripts/verify-delivery.sh`

**CONFIRMADO NO CÓDIGO:** o script chama `pnpm check`, `pnpm test` e `pnpm build`, depois lê `client/public/manus-routes.json` e extrai do `client/src/App.tsx` todos os `<Route path="...">`, excluindo apenas `/404`; exige que cada rota esteja no manifesto, rejeita duplicidade e exige igualdade de cardinalidade (`../../pmaisfin/scripts/verify-delivery.sh:1-20`).

**Conclusão:** **não está stale para a contagem atual do manifesto**: a regex inclui a nova linha `/login` de `../../pmaisfin/client/src/App.tsx:35-37`, e o conjunto de 16 rotas declaradas coincide com `../../pmaisfin/client/public/manus-routes.json:2-18`. **A CONFIRMAR:** a robustez futura da regex se o JSX deixar de usar literal `<Route path="...">`, usar rotas geradas ou adicionar exceções além de `/404`.

**Lacuna:** não verifica login/session/logout, CSRF, `scope=demo_only`, cookies, APIs 503, 404 real, CSP ou logo. Portanto, “manifesto completo” não equivale a “acesso demo validado”. **RECOMENDAÇÃO — não implementado atualmente:** separar uma checagem de contrato de rotas de uma checagem HTTP de acesso e tornar explícito no nome/relatório que são níveis diferentes.

### 6.2 `scripts/check-readonly-http.py`

**CONFIRMADO NO CÓDIGO:** este script é uma checagem HTTP live contra `origin`, por padrão `http://127.0.0.1:3000`, usando `urllib` e timeout de 12 segundos (`../../pmaisfin/scripts/check-readonly-http.py:1-17`). Verifica health/CSP/embedding, manifesto HTTP idêntico ao arquivo local, status de deployment sem negócio, dez caminhos protegidos com 503, `/404` e PNG do logo (`../../pmaisfin/scripts/check-readonly-http.py:19-53`).

**Possível stale/incompleto diante da nova rota:** não visita `/login`, `/api/demo-access/session`, `/api/demo-access/login` ou `/api/demo-access/logout`; não confirma redirecionamento de `/` sem sessão, `scope=demo_only`, expiração, CSRF, rate limit ou revogação. Também imprime “dez rotas protegidas” mas não valida nenhuma das 16 páginas individualmente. A ausência é observável nas listas `../../pmaisfin/scripts/check-readonly-http.py:39-47`; a nova rota é observável em `../../pmaisfin/client/src/App.tsx:35-37` e no manifesto `../../pmaisfin/client/public/manus-routes.json:2-18`.

**Classificação:** **A CONFIRMAR** como contrato de release, pois não foi executado. **RECOMENDAÇÃO — não implementado atualmente:** atualizar a checagem para diferenciar `/login` público, páginas protegidas e APIs demo-only; não reutilizar este script como prova de autenticação.

### 6.3 `scripts/check-demo-access.py`

**CONFIRMADO NO CÓDIGO:** este script conhece a nova rota `/login`, verifica health, redirecionamento de `/`, HTTP 200 de `/login`, sessão anônima, login compartilhado, atributos de cookie, `scope=demo_only`, `/demo/contas`, bloqueios 503 e logout (`../../pmaisfin/scripts/check-demo-access.py:13-54`). Também procura a senha em artefatos cliente (`../../pmaisfin/scripts/check-demo-access.py:55-62`).

**Risco operacional/lacuna:** lê uma senha configurada no ambiente (`../../pmaisfin/scripts/check-demo-access.py:41-44`), fixa `http://127.0.0.1:3000` (`../../pmaisfin/scripts/check-demo-access.py:13`), testa uma única página demo e não confronta as 16 entradas do manifesto. Não foi executado nesta auditoria por causa da restrição de não ler senha real. **RECOMENDAÇÃO — não implementado atualmente:** usar somente um segredo de fixture injetado em processo isolado para checagem autorizada, parametrizar a origem e agregar a verificação do manifesto; nunca registrar senha, cookies ou corpos de resposta.

### 6.4 Discrepância documental relacionada

`../../pmaisfin/docs/development/validacao-mockup.md:8-18` registra uma validação histórica sem browser e fala em manifesto com 15 rotas, enquanto o código/manifesto atuais têm 16 porque `/login` foi acrescentada (`../../pmaisfin/client/src/App.tsx:35-52` e `../../pmaisfin/client/public/manus-routes.json:2-18`). Este texto histórico não é tratado como estado atual nem como feature. **RECOMENDAÇÃO — não implementado atualmente:** revisar a documentação final para separar o resultado histórico de 15 rotas da evidência atual de 16.

## 7. API fixture, HTTP local e evidência histórica

1. **In-process/fixture:** `access-queue`, `auth.logout`, `contentPolicy`, `demo`, `deployment` e `platform` exercitam funções, reducers, callers ou mocks. Não há servidor live nesses casos.
2. **HTTP local fixture:** `demo-access.test.ts` usa Express + `fetch` contra uma porta efêmera de loopback (`../../pmaisfin/server/demo-access.test.ts:12-42`). É evidência de integração HTTP local, não de Preview/produção.
3. **Scripts live não executados:** os dois scripts Python usam HTTP para `127.0.0.1:3000`, mas permanecem não executados nesta coleta; `check-demo-access.py` é ainda restrito por ler a senha do ambiente.
4. **Evidência histórica:** `../../pmaisfin/docs/development/validacao-acesso-demo.md:9-17` relata execuções anteriores de check/build, suites dirigidas e `check-demo-access.py`; `../../pmaisfin/docs/development/validacao-acesso-demo.md:19-24` declara limites de browser, banco, integração externa, MFA e sessão distribuída. Esses registros são contexto histórico, não reexecução desta auditoria e não substituem os outputs atuais em `docs/evidencias/`.

## 8. Lacunas, riscos e causas de falha

### 8.1 Acessibilidade e E2E

**CONFIRMADO NO CÓDIGO:** existe verificação estática de `h1`, avisos e IDs únicos em oito telas (`../../pmaisfin/server/demo-render.test.tsx:19-29`), e a tela de login contém rótulos e alguns atributos ARIA (`../../pmaisfin/client/src/pages/Login.tsx:158-229`).

**A CONFIRMAR:** teclado, foco, ordem de foco, contraste, zoom, leitor de tela, mensagens após erro, hidratação, comportamento responsivo e compatibilidade de cookies no browser. Nenhum teste atual inicia browser. **RECOMENDAÇÃO — não implementado atualmente:** adicionar E2E de browser com fixtures não reais, incluindo login demo, logout, redirecionamento, foco/teclado e assertions de acessibilidade; manter separado dos testes SSR.

### 8.2 Carga e concorrência

**CONFIRMADO NO CÓDIGO:** a concorrência coberta é a fila local com três chamadas (`../../pmaisfin/server/access-queue.test.ts:5-14`); rate limit é exercitado em uma instância em memória (`../../pmaisfin/server/demo-access.test.ts:104-109`).

**A CONFIRMAR:** throughput, latência, limites sob múltiplos IPs, múltiplos processos, proxy, reinício e concorrência de navegador. **RECOMENDAÇÃO — não implementado atualmente:** estabelecer teste de carga e contrato operacional para o rate limit; não concluir capacidade produtiva a partir dos 81 testes unitários/integração local.

### 8.3 Segurança e produção

**CONFIRMADO NO CÓDIGO:** o guard bloqueia prefixes protegidos e toda escrita `/api` que não seja GET/HEAD/OPTIONS com 503 (`../../pmaisfin/server/security/readOnlyGuard.ts:3-22`); o servidor monta headers de segurança e CSP, força `no-store` na API e deixa OAuth não registrado (`../../pmaisfin/server/_core/index.ts:17-45`).

**A CONFIRMAR:** gestão/rotação de segredos, MFA real, usuários individuais, autorização por papel, auditoria append-only, sessão distribuída, persistência, backup, logs operacionais, revisão de dependências, hardening do proxy, política efetiva de cookies e integração bancária. O acesso demo usa sessões/challenges em memória e não é identidade financeira (`../../pmaisfin/server/security/demoAccess.ts:19-27`). **RECOMENDAÇÃO — não implementado atualmente:** não liberar produção financeira, dados reais ou operações de dinheiro com base nesta suíte; exigir critérios separados para autenticação, MFA, autorização, auditoria, persistência, segurança e integração.

### 8.4 Cobertura de negócio e API

**CONFIRMADO NO CÓDIGO:** a suíte valida modelo sintético local e bloqueios read-only, mas `auth.logout.test.ts` espera indisponibilidade de login/MFA/admin/finance (`../../pmaisfin/server/auth.logout.test.ts:19-37`). Portanto, não existe prova atual de login financeiro real, MFA ou autorização de produção.

**A CONFIRMAR:** contratos funcionais, mensagens, códigos e invariantes da API real, migração, banco e integração. **RECOMENDAÇÃO — não implementado atualmente:** criar uma matriz de aceitação para a futura API real, com fixtures isoladas e negativos 401/403/404/409/422/429, antes de remover os bloqueios 503.

## 9. Conclusão auditável

**CONFIRMADO NO CÓDIGO/OUTPUT:** a entrega atual possui runner Vitest em Node, oito suites, 81 testes aprovados, TypeScript aprovado e build aprovado com dois avisos de empacotamento; o núcleo demo tem testes locais de modelo, render SSR e integração HTTP contra fixture; os guards mantêm áreas financeiras/admin indisponíveis; `/login` está na aplicação e o manifesto atual tem 16 rotas.

**A CONFIRMAR:** qualquer comportamento de browser, Preview/HTTP live, persistência, banco, integração externa, carga, produção, acessibilidade certificada, identidade financeira, MFA, papéis, auditoria e operação monetária.

**RECOMENDAÇÃO — não implementado atualmente:** tratar os scripts Python e a documentação histórica como evidências complementares, não como substitutos de E2E; atualizar `check-readonly-http.py`/documentação para a rota `/login` e o manifesto de 16 páginas; e só considerar a transição para produção após testes e controles das lacunas acima. Nenhuma dessas recomendações foi implementada nesta tarefa.
