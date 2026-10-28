# EVIDÊNCIA DE AUDITORIA — Configuração, deploy, dependências e superfície externa

**Escopo:** projeto `<raiz-do-repositorio>`, base observada no commit `81bc2439fb10`.

**Classificação usada:**

- **CONFIRMADO NO CÓDIGO:** fato observado em fonte/configuração executável, com caminho relativo e linha.
- **A CONFIRMAR:** depende de ambiente/plataforma, de execução externa, de condição não demonstrada ou apresenta divergência entre documentação e código.
- **RECOMENDAÇÃO — não implementado atualmente:** medida sugerida pela evidência; não foi implementada nesta auditoria.

Nenhum valor de segredo, senha, hash de senha, token, cookie, DSN, project ID privado ou Preview URL é reproduzido. O arquivo `docs/evidencias/dependencias-audit.json` contém somente a evidência sanitizada da auditoria de dependências: metadados, ações, versões, caminhos, severidade e URLs HTTPS retornadas pelo JSON; o texto livre dos avisos foi removido.

## 1. Estado observado e execução real

**CONFIRMADO NO CÓDIGO:** o repositório é uma aplicação React/TypeScript com Vite no cliente e Express/tRPC no servidor. O `package.json` define `dev` como `NODE_ENV=development tsx watch server/_core/index.ts`, `build` como `vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` e `start` como `NODE_ENV=production node dist/index.js` (`package.json:6-16`).

**CONFIRMADO NO CÓDIGO:** a produção não é um site estático puro. O build cria `dist/public` para o cliente e `dist/index.js` para o servidor; o comando de produção sobe Express, que serve `dist/public` e mantém endpoints `/api/*` (`package.json:8-9`; `server/_core/index.ts:14-57`; `server/_core/vite.ts:51-73`). Existe um modo Vite estático separado (`dev:static` e `build:static`), mas ele não é o caminho do `Dockerfile` nem o `start` de produção (`package.json:15-16`).

**CONFIRMADO NO CÓDIGO:** o servidor escuta `0.0.0.0`, usa `PORT` ou o default `3000`, valida a porta entre 1 e 65535 e expõe `/api/health`, retornando `{"status":"ok","mode":"read_only"}` (`server/_core/index.ts:35-54`). A documentação também registra `/api/health` e `/api/deployment/status` (`README.md:54-64`).

**CONFIRMADO NO CÓDIGO:** o release atual é read-only. `readOnlyGuard` bloqueia prefixos protegidos e toda escrita em `/api`, retornando HTTP 503; o `appRouter` mantém autenticação, administração e operações financeiras como indisponíveis (`server/security/readOnlyGuard.ts:3-21`; `server/routers.ts:6-35`).

**OBSERVADO PELO PAI — A CONFIRMAR FORA DO REPOSITÓRIO:** foi reportado deploy runtime bem-sucedido na revisão `81bc2439fb10da2b2aadd6d69e553460eccd1254`, em `2026-10-26T21:19Z`, com `server/database=true`, Dockerfile, health `/api/health` e porta 3000. A hospedagem observada foi `on_demand`; não foram identificados domínios, backups ou SSH no material auditado. Esses fatos não são revalidados por uma chamada de plataforma nesta tarefa.

**OBSERVADO PELO PAI — A CONFIRMAR:** `PMAIS_DEMO_LOGIN_PASSWORD` está configurada no ambiente protegido para todos os ambientes, sem que seu valor seja reproduzido aqui. O acesso implementado é somente `demo_only`, não é identidade financeira nem habilita as áreas protegidas (`server/security/demoAccess.ts:19-35,68-123`; `server/routers.ts:14-32`).

**OBSERVADO PELO PAI — A CONFIRMAR:** branding informou `hideManusBadge=true`; analytics foi declarada como habilitada, porém efetiva `null`; `auto_publish=true`. Não há essas chaves de control-plane em fonte executável local. Há divergência com o README, que afirma que a publicação automática continua desativada (`README.md:79-83`). A situação efetiva de publicação e analytics precisa ser confirmada no ambiente de hospedagem antes de qualquer conclusão operacional.

## 2. Dockerfile, contexto de build e runtime

**CONFIRMADO NO CÓDIGO:** o `Dockerfile` usa `node:22-bookworm-slim`, habilita Corepack, fixa pnpm `10.18.0`, copia `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` e `patches`, instala com `CI=1 pnpm install --frozen-lockfile`, copia o restante, executa `pnpm build`, define `NODE_ENV=production` e `PORT=3000`, expõe 3000 e inicia `node dist/index.js` (`Dockerfile:1-13`).

A sequência é determinística quanto ao lockfile, mas é uma imagem de estágio único: as dependências de desenvolvimento permanecem na imagem final e não há separação explícita builder/runtime. O `build` é executado durante a construção da imagem, não no startup.

**CONFIRMADO NO CÓDIGO:** `.dockerignore` exclui `node_modules`, `dist`, `.git`, `.env`, `.env.*`, `.manus-logs` e artefatos `*.manus-starter-*` (`.dockerignore:1-8`). Isso evita copiar segredos de arquivos de ambiente, logs locais e saídas previamente construídas para o contexto Docker.

**CONFIRMADO NO CÓDIGO:** `.gitignore` exclui arquivos de ambiente, `dist`, logs, dados SQLite/DB, caches, artefatos `.webdev` e o arquivo de versão automático do Manus (`.gitignore:5-15,33-39,104-114`). O arquivo de evidência criado nesta auditoria aparece como não rastreado em `docs/evidencias/`; não houve commit nem alteração de Git.

**A CONFIRMAR:** não há instrução `HEALTHCHECK` no Dockerfile (`Dockerfile:1-13`). Há endpoint HTTP de health no Express (`server/_core/index.ts:35`), e o script de verificação o consulta (`scripts/check-readonly-http.py:19-24`), mas a integração de healthcheck do orquestrador não é demonstrada no repositório.

**RECOMENDAÇÃO — não implementado atualmente:** se o ambiente exigir healthcheck nativo da imagem, declarar explicitamente a política no mecanismo de deploy ou no Dockerfile, usando `/api/health` e sem introduzir segredo no comando. Validar primeiro o contrato do hosting para não duplicar a configuração de plataforma.

## 3. Scripts de configuração, build e verificação

**CONFIRMADO NO CÓDIGO:** scripts declarados no `package.json` são:

- `dev`: servidor Express/tsx em modo desenvolvimento;
- `build`: Vite do cliente seguido de bundle esbuild do servidor;
- `start`: servidor bundle em produção;
- `check`: `tsc --noEmit`;
- `format`: Prettier;
- `test`: `vitest run`;
- `db:push`: `drizzle-kit generate && drizzle-kit migrate`;
- `db:migrate`: `drizzle-kit migrate`;
- `dev:static`: Vite em `0.0.0.0`, porta `PORT` ou 3000 e `strictPort`;
- `build:static`: somente build Vite (`package.json:6-16`).

**CONFIRMADO NO CÓDIGO:** `scripts/verify-delivery.sh` roda `pnpm check`, `pnpm test`, `pnpm build` e verifica que `client/public/manus-routes.json` corresponde às rotas encontradas em `client/src/App.tsx` (`scripts/verify-delivery.sh:1-19`). `scripts/check-readonly-http.py` testa health, CSP, embedding, manifesto, status de deploy, rotas protegidas e 404 sem executar escritas de negócio (`scripts/check-readonly-http.py:1-53`). `scripts/check-demo-access.py` exercita login demo, cookies, sessão, logout e bloqueios sem imprimir a senha ou corpos de resposta (`scripts/check-demo-access.py:1-62`).

**CONFIRMADO NO CÓDIGO:** `db:push` e `db:migrate` dependem de `DATABASE_URL` por meio de `drizzle.config.ts`; comandos Drizzle falham explicitamente quando essa variável não existe (`drizzle.config.ts:1-15`). Nenhum desses scripts é chamado pelo Dockerfile (`Dockerfile:1-13`), portanto o deploy observado não executa migração automaticamente durante o build/start.

**A CONFIRMAR:** a documentação chama `scripts/verify-delivery.sh` de rotina completa reproduzível (`README.md:54-64`), mas não há arquivo de CI/Workflow para executá-la automaticamente.

## 4. Vite, TypeScript e Vitest

**CONFIRMADO NO CÓDIGO:** `vite.config.ts` usa React, Tailwind, JSX location e dois plugins Manus locais: um endpoint/asset público `/api/platform/config.js` e um coletor de debug somente fora de produção (`vite.config.ts:1-7,77-171`). O cliente tem root `client`, publicDir `client/public`, saída `dist/public`, alias `@`, `@shared` e `@assets` (`vite.config.ts:173-205`).

**CONFIRMADO NO CÓDIGO:** em desenvolvimento, o Vite é integrado como middleware com HMR; em produção, `serveStatic` serve `dist/public`, dá 404 real para `/404` e faz fallback para `index.html` (`server/_core/vite.ts:9-49,51-73`). O servidor Express seleciona Vite somente quando `NODE_ENV=development`; qualquer outro modo usa o build estático (`server/_core/index.ts:47-50`).

**CONFIRMADO NO CÓDIGO:** `tsconfig.json` inclui `client/src`, `shared` e `server`, exclui `node_modules`, `build`, `dist` e testes `.test.ts`, usa ES2022, `strict`, `noEmit`, resolução `bundler`, `skipLibCheck` e aliases para `@`/`@shared` (`tsconfig.json:1-24`). O `check` não verifica os arquivos de teste excluídos por esse padrão.

**CONFIRMADO NO CÓDIGO:** `vitest.config.ts` usa root do repositório, os mesmos aliases, JSX automático, ambiente Node e inclui testes `server/**/*.test.ts`, `server/**/*.test.tsx` e `server/**/*.spec.ts` (`vitest.config.ts:1-20`).

**CONFIRMADO NO CÓDIGO:** `vite.config.ts.bak` é uma cópia histórica versionada. Ela referencia `vite-plugin-manus-runtime` (`vite.config.ts.bak:1-8,153-187`), enquanto a configuração ativa não o referencia (`vite.config.ts:1-7,171-205`) e o pacote não aparece no manifest direto (`package.json:84-106`). O `.bak` não é importado pelos scripts atuais; não deve ser tratado como configuração de execução.

**RECOMENDAÇÃO — não implementado atualmente:** remover ou marcar claramente arquivos `.bak` de configuração que possam ser confundidos com o caminho ativo, ou adicionar uma regra de verificação que confirme qual configuração é carregada. Não foi feita essa alteração.

## 5. Workspace, patch e template

**CONFIRMADO NO CÓDIGO:** há um único pacote no workspace (`.`), sem subworkspaces adicionais. `pnpm-workspace.yaml` declara patch de `wouter@3.7.1`, override `tailwindcss>nanoid: 3.3.7` e permite scripts de build somente para `@tailwindcss/oxide` e `esbuild` (`pnpm-workspace.yaml:1-10`).

**CONFIRMADO NO CÓDIGO:** `pnpm-lock.yaml` é lockfile v9, com peers automáticos e `excludeLinksFromLockfile=false`; registra o patch de Wouter e o hash do patch (`pnpm-lock.yaml:1-13`). O patch coleta no browser as rotas filhas do `Switch` em `window.__WOUTER_ROUTES__`, sem alterar a seleção da rota (`patches/wouter@3.7.1.patch:1-29`).

**CONFIRMADO NO CÓDIGO:** o template declarado é `web-db-user`, com capacidades `server`, `db` e `user`, e lista arquivos de base do template (`template.json:1-25`). Esse metadata descreve a origem/forma do template; não é prova de que os fluxos de usuário ou banco originalmente previstos estejam habilitados nesta entrega. O `appRouter` atual deixa autenticação e financeiro indisponíveis (`server/routers.ts:12-35`).

**CONFIRMADO NO CÓDIGO:** `app.config.ts` contém somente `logoUrl`, apontando para um upload no host `files.manuscdn.com`; o caminho completo do upload não é reproduzido por conter identificador de sessão (`app.config.ts:1-3`). Não foi encontrada importação de `app.config.ts` no runtime atual. A interface usa uma rota de storage gerenciado e fallback local diretamente em `AppShell` (`client/src/components/AppShell.tsx:123-130`).

## 6. Dependências: manifest, versões resolvidas e instalação

**CONFIRMADO NO CÓDIGO:** o manifest fixa `packageManager: pnpm@10.18.0`, `jose` exatamente em `6.1.0` e TypeScript exatamente em `5.9.3`; as demais dependências usam ranges semver, salvo tipos e ferramentas declarados com versão exata (`package.json:18-108`). O lockfile registra as versões realmente resolvidas no importer raiz, não apenas os ranges do manifest (`pnpm-lock.yaml:15-277`).

Abaixo estão as versões resolvidas das dependências diretas de runtime, conforme o importer raiz do lockfile (`pnpm-lock.yaml:17-210`):

```text
@aws-sdk/client-s3 3.907.0; @aws-sdk/s3-request-presigner 3.907.0;
@hookform/resolvers 5.2.2; @radix-ui/react-accordion 1.2.12;
@radix-ui/react-alert-dialog 1.1.15; @radix-ui/react-aspect-ratio 1.1.7;
@radix-ui/react-avatar 1.1.10; @radix-ui/react-checkbox 1.3.3;
@radix-ui/react-collapsible 1.1.12; @radix-ui/react-context-menu 2.2.16;
@radix-ui/react-dialog 1.1.15; @radix-ui/react-dropdown-menu 2.1.16;
@radix-ui/react-hover-card 1.1.15; @radix-ui/react-label 2.1.7;
@radix-ui/react-menubar 1.1.16; @radix-ui/react-navigation-menu 1.2.14;
@radix-ui/react-popover 1.1.15; @radix-ui/react-progress 1.1.7;
@radix-ui/react-radio-group 1.3.8; @radix-ui/react-scroll-area 1.2.10;
@radix-ui/react-select 2.2.6; @radix-ui/react-separator 1.1.7;
@radix-ui/react-slider 1.3.6; @radix-ui/react-slot 1.2.3;
@radix-ui/react-switch 1.2.6; @radix-ui/react-tabs 1.1.13;
@radix-ui/react-toggle 1.1.10; @radix-ui/react-toggle-group 1.1.11;
@radix-ui/react-tooltip 1.2.8; @tanstack/react-query 5.90.2;
@trpc/client 11.6.0; @trpc/react-query 11.6.0; @trpc/server 11.6.0;
axios 1.12.2; class-variance-authority 0.7.1; clsx 2.1.1; cmdk 1.1.1;
cookie 1.0.2; date-fns 4.1.0; dotenv 17.2.3; drizzle-orm 0.44.6;
embla-carousel-react 8.6.0; express 4.21.2; framer-motion 12.23.22;
input-otp 1.4.2; jose 6.1.0; lucide-react 0.453.0; mysql2 3.15.1;
nanoid 5.1.6; next-themes 0.4.6; react 19.2.1; react-day-picker 9.11.1;
react-dom 19.2.1; react-hook-form 7.64.0; react-resizable-panels 3.0.6;
recharts 2.15.4; sonner 2.0.7; streamdown 1.4.0; superjson 1.13.3;
tailwind-merge 3.3.1; tailwindcss-animate 1.0.7; vaul 1.1.2;
wouter 3.7.1 com patch; zod 4.1.12.
```

As versões resolvidas das dependências diretas de desenvolvimento são: `@builder.io/vite-plugin-jsx-loc 0.1.1`, `@tailwindcss/typography 0.5.19`, `@tailwindcss/vite 4.1.14`, `@types/express 4.17.21`, `@types/google.maps 3.58.1`, `@types/node 24.7.0`, `@types/react 19.2.1`, `@types/react-dom 19.2.1`, `@vitejs/plugin-react 5.0.4`, `add 2.0.6`, `autoprefixer 10.4.21`, `drizzle-kit 0.31.5`, `esbuild 0.25.10`, `pnpm 10.18.0`, `postcss 8.5.6`, `prettier 3.6.2`, `tailwindcss 4.1.14`, `tsx 4.20.6`, `tw-animate-css 1.4.0`, `typescript 5.9.3`, `vite 7.3.7` e `vitest 2.1.9` (`pnpm-lock.yaml:211-277`).

**CONFIRMADO POR EXECUÇÃO LOCAL:** `pnpm install --frozen-lockfile --offline --ignore-scripts` terminou com status `0`, sem atualização e sem alteração do manifest/lockfile. Isso confirma que a árvore disponível é compatível com o lockfile; não é uma prova de segurança dos pacotes.

## 7. Auditoria produtiva de dependências

**CONFIRMADO POR EXECUÇÃO:** `pnpm audit --prod --json` foi executado uma única vez no cwd `<raiz-do-repositorio>`, sem instalar nem atualizar dependências. O processo retornou código `1`, produziu JSON parseável e foi salvo no arquivo seguro `docs/evidencias/dependencias-audit.json:1-2922`. O status é `completed_nonzero`; deve ser tratado como **A CONFIRMAR** quanto a triagem, impacto e correção, não como prova de exploração.

O JSON reportou 598 dependências de produção e 96 advisories distribuídos em 21 módulos; o resumo de severidade foi 2 críticas, 26 altas, 55 moderadas e 13 baixas (`docs/evidencias/dependencias-audit.json:2908-2915`). A lista integral de URLs HTTPS retornadas pelo JSON permanece nos campos `url` e `referenceUrls` de cada advisory (`docs/evidencias/dependencias-audit.json:201-2907`).

### 7.1 Pacotes diretos afetados

Os seguintes pacotes são dependências diretas do manifest e aparecem afetados no lockfile/JSON:

- `@trpc/server` resolvido em `11.6.0`; advisory de alta severidade, caminho direto `.>@trpc/server`, recomendação retornada `>=11.8.0` (`pnpm-lock.yaml:2292,6674`; `docs/evidencias/dependencias-audit.json:201-227`).
- `axios` resolvido em `1.12.2`; 32 advisories, severidades baixa/moderada/alta, caminho direto `.>axios`; os alvos retornados variam de `>=1.13.5` até `>=1.20.0` (`pnpm-lock.yaml:2558,6992`; o primeiro registro do módulo está em `docs/evidencias/dependencias-audit.json:728-751`, com os demais registros até `2286`).
- `drizzle-orm` resolvido em `0.44.6`; advisory de alta severidade, caminho direto `.>drizzle-orm`, alvo `>=0.45.2` (`pnpm-lock.yaml:2950,7395`; registro em `docs/evidencias/dependencias-audit.json:650-675`).
- `mysql2` resolvido em `3.15.1`; dois advisories, alta/moderada, caminho direto `.>mysql2`, alvos `>=3.22.0` e `>=3.23.1` (`pnpm-lock.yaml:3739,8452`; registros em `docs/evidencias/dependencias-audit.json:2355-2380,2539-2562`).
- `nanoid` resolvido em `5.1.6`; dois advisories de alta severidade, caminho direto `.>nanoid`, alvos `>=5.1.11` e `>=5.1.16` (`pnpm-lock.yaml:3752,8470`; registros em `docs/evidencias/dependencias-audit.json:2256-2285,2481-2510`).
- `zod` resolvido em `4.1.12`; advisory de alta severidade, caminho direto `.>zod`, alvo `>=4.6.6` (`pnpm-lock.yaml:4470,9265`; registro em `docs/evidencias/dependencias-audit.json:2847-2875`).
- `express` resolvido em `4.21.2`; o JSON atribui advisories aos transitivos `body-parser`, `path-to-regexp`, `proxy-addr` e `qs`, todos em caminhos `.>express>...` (`pnpm-lock.yaml:3156,7585`; registros representativos em `docs/evidencias/dependencias-audit.json:477-506,1820-1848,2766-2793,309-337`).
- `streamdown` resolvido em `1.4.0`; os advisories encontrados estão em seus transitivos `mdast-util-to-hast`, `mermaid`, `dompurify`, `lodash-es`, `uuid` e `katex` (`pnpm-lock.yaml:4125,8925`; registros iniciais em `docs/evidencias/dependencias-audit.json:253-279,538-565,1252-1280,1341-1369,2737-2764`).
- `@aws-sdk/client-s3` resolvido em `3.907.0`; os advisories encontrados estão em `@smithy/config-resolver` e `fast-xml-parser` (`pnpm-lock.yaml:310,4532`; registros em `docs/evidencias/dependencias-audit.json:228-251,281-308`).
- `recharts` resolvido em `2.15.4`; o advisory de `lodash` aparece pelo caminho `.>recharts>lodash` (`pnpm-lock.yaml:3980,8694`; registro inicial em `docs/evidencias/dependencias-audit.json:567-595`).

### 7.2 Transitivos afetados e versões realmente resolvidas

O lockfile registra as seguintes versões transitivas afetadas: `@smithy/config-resolver 4.3.0` (`pnpm-lock.yaml:1966,6252`), `body-parser 1.20.3` (`pnpm-lock.yaml:2568,7004`), `dompurify 3.3.0` (`pnpm-lock.yaml:2939,7380`), `fast-xml-parser 5.2.5` (`pnpm-lock.yaml:3170,7627`), `follow-redirects 1.15.11` (`pnpm-lock.yaml:3187,7647`), `form-data 4.0.4` (`pnpm-lock.yaml:3196,7649`), `katex 0.16.25` (`pnpm-lock.yaml:3408,7911`), `lodash 4.17.21` e `lodash-es 4.17.21` (`pnpm-lock.yaml:3496-3499,7982-7984`), `mdast-util-to-hast 13.2.0` (`pnpm-lock.yaml:3590,8159`), `mermaid 11.12.0` (`pnpm-lock.yaml:3606,8191`), `path-to-regexp 0.1.12` (`pnpm-lock.yaml:3808,8519`), `proxy-addr 2.0.7` (`pnpm-lock.yaml:3870,8577`), `qs 6.13.0` (`pnpm-lock.yaml:3877,8584`) e `uuid 11.1.0` (`pnpm-lock.yaml:4303,9107`).

O JSON preserva, por advisory, a versão encontrada, caminho de dependência, intervalo afetado, versão corrigida recomendada, severidade, CVE/GHSA e URLs oficiais retornadas (`docs/evidencias/dependencias-audit.json:1-2907`). A presença de um advisory não demonstra que a condição vulnerável é alcançável na aplicação.

### 7.3 Presença versus uso/exploração observável

**CONFIRMADO NO CÓDIGO — presença e uso:** `@trpc/server` é importado pelo servidor em `server/_core/trpc.ts`, `server/routers.ts` e `server/_core/systemRouter.ts`; o transporte ativo é o adapter Express em `server/_core/index.ts:44`. Não foi observado no código ativo o adapter Next App Router nem `experimental_caller`/`experimental_nextAppDirCaller`, condição descrita no advisory. Portanto, a presença do pacote é confirmada, mas exploração não é declarada (`server/_core/trpc.ts:1-44`; `server/_core/index.ts:43-45`).

**CONFIRMADO NO CÓDIGO — presença e uso:** `axios` é usado no SDK OAuth (`server/_core/sdk.ts:1-3,31-90`), mas `registerOAuthRoutes` não é chamado pelo entrypoint ativo (`server/_core/oauth.ts:13-64`; `server/_core/index.ts:14-50`). A dependência permanece no bundle/código, mas a rota OAuth correspondente não está demonstrada como montada.

**CONFIRMADO NO CÓDIGO — presença e uso:** `drizzle-orm` é usado em `server/db.ts` e `mysql2` é usado ativamente no probe de status de deploy, que cria um pool limitado e executa `SELECT 1` quando `DATABASE_URL` existe (`server/db.ts:1-19`; `server/services/deployment.ts:18-43`). O endpoint público de status pode acionar esse probe (`server/_core/index.ts:36-38`). Não há leitura/escrita de dados financeiros nesse probe.

**CONFIRMADO NO CÓDIGO — presença e uso:** `zod` é usado tanto no router de health/notification quanto na validação do estado local demo (`server/_core/systemRouter.ts:1-27`; `client/src/lib/demoValidation.ts:1-79`). As entradas financeiras do mockup são dados locais sintéticos, mas a dependência é usada em caminho de cliente.

**CONFIRMADO NO CÓDIGO — presença e uso condicional:** `nanoid` é usado para adicionar um query string aleatório ao template HMR em `setupVite`, caminho de desenvolvimento (`server/_core/vite.ts:1-6,24-43`). Não é chamado pelo `serveStatic` de produção.

**CONFIRMADO NO CÓDIGO — presença:** `streamdown` é importado em `Home.tsx` e `AIChatBox.tsx`, renderizando conteúdo Markdown (`client/src/pages/Home.tsx:1-24`; `client/src/components/AIChatBox.tsx:1-8,263-266`). Não foi observado no `App.tsx` um uso da página `Home`; o componente de chat é código presente, mas não há evidência nesta auditoria de endpoint LLM conectado ao fluxo demo (`client/src/App.tsx:1-61`).

**CONFIRMADO NO CÓDIGO — ausência de uso direto localizado:** não foi localizado import direto de `fast-xml-parser`, `dompurify`, `mermaid`, `katex`, `lodash`, `lodash-es`, `mdast-util-to-hast`, `uuid`, `follow-redirects`, `form-data`, `body-parser`, `proxy-addr`, `qs` ou `path-to-regexp` na aplicação fonte; eles aparecem como transitivos do lockfile. Isso distingue presença na árvore de dependências de exploração no código. Não constitui garantia de ausência em código empacotado de terceiros.

**A CONFIRMAR:** a auditoria npm reporta condições de segurança, mas não foi executado PoC, teste de exploit, análise de reachability de cada advisory nem upgrade. Os avisos que têm ação `review` devem ser triados por caminho de uso, configuração e entrada não confiável antes de qualquer decisão de correção.

**RECOMENDAÇÃO — não implementado atualmente:** estabelecer uma triagem de dependências que primeiro corrija os pacotes diretos e transitivos com severidade crítica/alta e depois registre exceções justificadas para caminhos não alcançáveis. Qualquer atualização deve ser feita em mudança separada, com testes/build e reexecução controlada de `pnpm audit --prod --json`; não foi feita atualização nesta auditoria.

## 8. Inventário de variáveis de ambiente por nome

Os nomes abaixo foram mapeados sem ler `.env`, `.env.*` ou `.manus-logs` e sem reproduzir valores.

### 8.1 Runtime atual

| Nome | Uso observado | Necessidade | Público/servidor | Evidência |
|---|---|---|---|---|
| `NODE_ENV` | Seleciona desenvolvimento/produção, Vite middleware versus static, CSP e coletor de debug; Docker força produção e scripts definem os dois modos | Necessário para o modo correto; default efetivo depende do comando | Servidor; não é serializado na configuração pública | `Dockerfile:9`; `package.json:7-9`; `vite.config.ts:81-84`; `server/_core/index.ts:23,48-49`; `server/_core/vite.ts:53-55` |
| `PORT` | Porta HTTP, com default 3000; `dev:static` também a usa | Opcional, default 3000 | Servidor | `Dockerfile:10-11`; `package.json:15`; `server/_core/index.ts:51-54` |
| `DATABASE_URL` | Drizzle CLI, conexão lazy da aplicação e probe `SELECT 1` de deployment | Necessária para comandos/migração e para status `available`; aplicação sobe sem ela e informa `not_configured` | Servidor; segredo/DSN, nunca público | `drizzle.config.ts:3-15`; `server/db.ts:9-18`; `server/services/deployment.ts:20-36` |
| `PMAIS_DEMO_LOGIN_PASSWORD` | Verificador scrypt do login `adm` demo-only | Necessária para habilitar o login demo; sem ela `/api/demo-access/session` retorna 503 | Servidor; segredo; não deve chegar ao cliente | `server/security/demoAccess.ts:19-24,68-84`; `README.md:13-19`; `scripts/check-demo-access.py:41-45` |
| `PMAIS_DEMO_LOCAL_HTTP` | Seleciona cookies de HTTP local (`Secure=false`, `SameSite=Lax`, sem partitioning) | Opcional; somente desenvolvimento HTTP local | Servidor; configuração sensível de segurança, nunca público | `server/_core/index.ts:27`; `server/security/demoAccess.ts:29-35`; `README.md:17-19` |
| `PMAIS_SESSION_SIGNING_SECRET` | Apenas booleano `signingConfigured` no status técnico | Não habilita sessão; não é usado como chave de assinatura no caminho atual | Servidor; segredo, não público | `server/services/deployment.ts:45-63`; `server/deployment.test.ts:16-23` |
| `PMAIS_MFA_ENCRYPTION_KEY` | Apenas booleano `mfaConfigured` no status técnico | Não implementa MFA; o status continua `accessEnabled:false` | Servidor; segredo, não público | `server/services/deployment.ts:45-63`; `server/deployment.test.ts:16-23` |
| `MANUS_PROJECT_ID` | `ENV.appId`, payload/validação de sessão OAuth e valor `projectId` da configuração pública | Necessária para OAuth/integrações que usam o app ID; pode ficar vazia em modo read-only | Servidor e cliente como identificador público whitelisted; não reproduzir valor privado | `server/_core/env.ts:2-11`; `server/_core/publicConfig.ts:2-8`; `client/src/platform.d.ts:3-6` |
| `MANUS_JWT_SECRET` | Assinatura/verificação JWT no SDK legado de OAuth | Necessária somente no caminho OAuth/JWT; não habilita o demo-only | Servidor; segredo, não público | `server/_core/env.ts:3-4`; `server/_core/sdk.ts:156-159,181-210` |
| `MANUS_OAUTH_API_URL` | Base URL do cliente Axios OAuth e aviso de configuração | Necessária para OAuth legado; rota callback não está montada pelo entrypoint atual | Servidor; URL de servidor, não serializada na whitelist pública | `server/_core/env.ts:6`; `server/_core/sdk.ts:31-38,78-82`; `server/_core/oauth.ts:13-64` |
| `OWNER_OPEN_ID` | Fallback de role `admin` no upsert de usuário | Opcional; não cria usuário nem habilita áreas protegidas por si só | Servidor; dado de identidade, não público | `server/_core/env.ts:8`; `server/db.ts:50-60` |
| `MANUS_API_URL` | Base de Data API, Maps proxy, storage, heartbeat, LLM, imagens e notificações | Necessária somente ao chamar esses serviços externos | Servidor; também é whitelisted como `apiUrl` para o browser | `server/_core/env.ts:10`; `server/_core/publicConfig.ts:4-8`; `server/_core/dataApi.ts:20-31`; `server/_core/llm.ts:215-224`; `server/storage.ts:7-18`; `server/_core/heartbeat.ts:45-60` |
| `MANUS_API_KEY` | Bearer de Data API, Maps, storage, heartbeat, LLM, imagens e notificações | Necessária para chamadas externas correspondentes | Servidor; segredo; nunca whitelisted | `server/_core/env.ts:11`; `server/_core/dataApi.ts:20-38`; `server/_core/llm.ts:221-224,405-412`; `server/storage.ts:7-17,43-45`; `server/_core/notification.ts:71-96` |
| `MANUS_OAUTH_PORTAL_URL` | Campo `oauthPortalUrl` no script de configuração pública | Opcional; não há login OAuth ativo montado no entrypoint | Público por desenho | `server/_core/publicConfig.ts:2-8,11-13` |
| `MANUS_API_BROWSER_KEY` | Campo `apiBrowserKey` da configuração pública; usado para carregar Maps no browser | Necessária somente para o componente de mapa | Público por desenho, como chave browser; não é chave de servidor | `server/_core/publicConfig.ts:4-8`; `client/src/components/Map.tsx:89-107` |

**CONFIRMADO NO CÓDIGO:** a whitelist pública contém somente `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_API_URL` e `MANUS_API_BROWSER_KEY`; `MANUS_API_KEY`, `MANUS_JWT_SECRET`, `DATABASE_URL` e demais segredos não são serializados por `publicPlatformScript` (`server/_core/publicConfig.ts:1-13`). O script ainda escapa `<` antes de emitir JavaScript (`server/_core/publicConfig.ts:11-13`).

### 8.2 Nomes encontrados somente em testes, fixtures ou documentação histórica

- `MANUS_ANALYTICS_ENDPOINT` e `MANUS_ANALYTICS_WEBSITE_ID` aparecem como valores de fixture em `server/platform.test.ts:12`; não há leitor runtime correspondente. Portanto, analytics declarada como habilitada/effective `null` é fato de control-plane a confirmar, não uma integração comprovada no código.
- `CI` aparece como atribuição local no `Dockerfile:6` (`CI=1 pnpm install`) e em documentação/testes históricos; não é configuração persistente da aplicação.
- `E2E_BACKEND_PORT`, `E2E_FRONTEND_PORT`, `E2E_PYTHON`, `MIGRATION_DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS` e `NEXT_PUBLIC_API_URL` aparecem em `docs/source/original/` ou material histórico. Não há leitor desses nomes no runtime atual; não devem ser tratados como features implementadas.
- Os nomes `PMAIS_SESSION_SIGNING_SECRET` e `PMAIS_MFA_ENCRYPTION_KEY` também aparecem em fixtures de teste, mas seus leitores atuais só calculam booleanos no status (`server/services/deployment.ts:57-60`); não constituem implementação de assinatura/MFA.

## 9. Superfície externa e integração de serviços

**CONFIRMADO NO CÓDIGO — endpoints montados:**

- `GET /api/health`: health read-only sem credenciais (`server/_core/index.ts:35`).
- `GET /api/deployment/status`: status do modo, banco e flags de segurança; não revela DSN, credenciais ou dados de negócio (`server/_core/index.ts:36-38`; `server/services/deployment.ts:45-68`).
- `GET /api/platform/config.js`: whitelist pública (`server/_core/index.ts:40-41`; plugin Vite equivalente em `vite.config.ts:155-168`).
- `/api/demo-access/*`: sessão, login e logout demo com JSON limitado, CSRF, cookies HttpOnly, rate limit e sessão em memória (`server/_core/index.ts:27-32`; `server/security/demoAccess.ts:63-123`).
- `/api/trpc`: router tRPC Express, com rotas públicas de status/health e rotas protegidas atualmente indisponíveis (`server/_core/index.ts:43-45`; `server/routers.ts:12-35`).
- assets estáticos, páginas e `manus-routes.json` são servidos por Vite em desenvolvimento ou `express.static` em produção (`server/_core/vite.ts:51-73`).

**CONFIRMADO NO CÓDIGO — bloqueios:** os prefixos `/api/auth`, `/api/oauth`, `/api/admin`, `/api/users`, `/api/finance`, `/api/payments`, `/api/audit`, `/api/uploads`, `/api/receipts`, `/api/connect`, `/api/contas`, `/api/token`, `/api/logout`, `/integrations`, `/oauth`, `/token` e `/logout` são bloqueados; toda escrita em `/api` também é bloqueada (`server/security/readOnlyGuard.ts:3-21`).

**CONFIRMADO NO CÓDIGO — browser e recursos externos:** `client/index.html` faz preconnect e carrega fonte Open Sans de `fonts.googleapis.com`/`fonts.gstatic.com`, e carrega `/api/platform/config.js` antes do bundle (`client/index.html:1-17`). O Maps browser usa `apiUrl` e `apiBrowserKey` públicos para carregar o proxy Maps (`client/src/components/Map.tsx:89-107`). A CSP permite `https:` em scripts/conexões, fontes Google em estilos/fontes e imagens HTTPS (`server/security/contentPolicy.ts:1-15`).

**CONFIRMADO NO CÓDIGO — integração disponível, não necessariamente montada:** existem helpers para Data API, Maps, storage S3 presigned, heartbeat, LLM, geração de imagem e notification, todos com `MANUS_API_URL`/`MANUS_API_KEY` no servidor (`server/_core/dataApi.ts:16-64`; `server/_core/map.ts:21-89`; `server/storage.ts:31-99`; `server/_core/heartbeat.ts:43-99`; `server/_core/llm.ts:215-452`; `server/_core/imageGeneration.ts:43-167`; `server/_core/notification.ts:66-113`). A busca de referências mostrou que vários são helpers exportados, não rotas registradas no entrypoint.

**A CONFIRMAR:** `registerOAuthRoutes` e `registerStorageProxy` existem, mas não são chamados em `server/_core/index.ts`; portanto `/api/oauth/callback` e `/manus-storage/*` não estão demonstrados como montados pelo servidor Express ativo (`server/_core/oauth.ts:13-64`; `server/_core/storageProxy.ts:4-48`; `server/_core/index.ts:14-50`). `AppShell` tenta `/manus-storage/Logo2025_branco_2abedc7a.png` e cai para `/brand/Logo2025_branco.png` no erro (`client/src/components/AppShell.tsx:123-130`), e o fallback existe no `client/public`/`dist/public`, mas a afirmação documental de storage gerenciado não pode ser considerada confirmada pelo entrypoint local.

**CONFIRMADO NO CÓDIGO:** o cliente envia tRPC com `credentials: "omit"`; o fluxo demo usa `fetch` com credenciais para os endpoints próprios de acesso (`client/src/main.tsx:14-25`; `client/src/contexts/DemoAccess.tsx:20-99`). Isso separa o fluxo de dados demo local da sessão cookie do login demo.

**A CONFIRMAR:** `app.config.ts` contém um URL de logo externo, mas não é importado no runtime localizado. A origem efetivamente usada pela interface é o asset local com fallback; qualquer expectativa de atualização dinâmica da logo pelo `logoUrl` requer validação de plataforma.

## 10. Docker Compose, CI/CD, publicação e operação

**CONFIRMADO NO CÓDIGO:** não foi encontrado `docker-compose`, `compose`, `.github/`, `.gitlab-ci*`, `Jenkinsfile`, `.circleci/`, workflow ou arquivo `healthcheck` no repositório pesquisado. O único container declarado é `Dockerfile` (`find` dos arquivos do projeto; `Dockerfile:1-13`).

**CONFIRMADO NO CÓDIGO:** não há pipeline local que execute `pnpm audit`, `pnpm check`, `pnpm test` ou `pnpm build` automaticamente. A rotina existente é manual (`scripts/verify-delivery.sh:1-19`).

**A CONFIRMAR:** o pai observou `auto_publish=true`, mas o README diz “Publicação automática continua desativada” e também diferencia Preview de publicação/produção (`README.md:79-83`). Não há configuração local que resolva essa divergência. Confirmar o estado no control-plane e atualizar documentação em mudança separada.

**A CONFIRMAR:** não foram identificados no repositório domínio, backup ou SSH; a hospedagem `on_demand` foi observada externamente pelo pai. O repositório não contém evidência suficiente para afirmar retenção, rollback, escalabilidade, política de reinício ou persistência entre instâncias.

**RECOMENDAÇÃO — não implementado atualmente:** documentar, fora do código de aplicação, o contrato operacional mínimo: imagem/revisão implantada, porta, endpoint de health, política de restart, persistência de `DATABASE_URL`, backup/restore, domínio e acesso administrativo. Não registrar IDs privados nem URLs de Preview em documentação de auditoria.

## 11. Divergências e riscos prioritários

1. **[A CONFIRMAR] Auditoria de dependências não limpa:** a execução única retornou código 1 e registrou 96 advisories, incluindo 2 críticas e 26 altas. Há dependências diretas afetadas (`@trpc/server`, `axios`, `drizzle-orm`, `mysql2`, `nanoid`, `zod`) e transitivos por Express, AWS SDK, Recharts e Streamdown. O JSON preservado está em `docs/evidencias/dependencias-audit.json`; nenhuma atualização foi feita.
2. **[A CONFIRMAR] Exploitabilidade não demonstrada:** os advisories são sinais de versão/caminho, não prova de exploração. No caso tRPC, a condição descrita pelo aviso não foi localizada no adapter ativo; no caso XML/AWS e sanitização/Markdown, os módulos são principalmente transitivos e não há import direto localizado na aplicação.
3. **[A CONFIRMAR] Storage gerenciado e OAuth não montados no entrypoint:** helpers e rotas existem, mas não são registrados em `server/_core/index.ts`. A documentação e a UI mencionam storage/integrações; a execução local pode depender do fallback local ou de infraestrutura externa não visível no código.
4. **[A CONFIRMAR] Health existe como endpoint, mas não como `HEALTHCHECK` Docker:** o deploy pode conhecer o endpoint, mas a imagem não declara a instrução. Validar o contrato do hosting.
5. **[A CONFIRMAR] Publicação/analytics divergentes:** fatos observados pelo pai (`auto_publish=true`, analytics efetiva `null`) não coincidem integralmente com a documentação e não têm configuração local correspondente.
6. **[CONFIRMADO NO CÓDIGO] Read-only não é produção financeira:** o router, guard e status mantêm autenticação corporativa, MFA, Connect e operações financeiras indisponíveis (`server/security/readOnlyGuard.ts:9-21`; `server/routers.ts:12-35`; `server/services/deployment.ts:45-63`). A senha demo habilita apenas navegação de demonstração, não deve ser interpretada como autenticação financeira.
7. **[RECOMENDAÇÃO — não implementado atualmente]** corrigir primeiro os advisories diretos/transitivos prioritários em mudança isolada; depois revalidar build, testes, bundle, health e rotas read-only. Não fazer atualização automática a partir deste documento.

## Referências de código e evidência

As referências primárias desta auditoria são relativas ao repositório `<raiz-do-repositorio>` e incluem linha inicial/final quando aplicável: `Dockerfile:1-13`; `.dockerignore:1-8`; `.gitignore:1-114`; `package.json:1-109`; `pnpm-lock.yaml:1-13,15-277,1966-2292,2558-4125,4303-4470,6252-9265`; `pnpm-workspace.yaml:1-10`; `tsconfig.json:1-24`; `vite.config.ts:1-205`; `vite.config.ts.bak:1-187`; `vitest.config.ts:1-20`; `patches/wouter@3.7.1.patch:1-29`; `template.json:1-25`; `app.config.ts:1-3`; `drizzle.config.ts:1-15`; `server/_core/env.ts:1-12`; `server/_core/publicConfig.ts:1-13`; `server/_core/index.ts:14-57`; `server/_core/vite.ts:9-73`; `server/services/deployment.ts:18-74`; `server/security/demoAccess.ts:19-133`; `server/security/readOnlyGuard.ts:3-21`; `server/routers.ts:12-35`; `client/index.html:1-17`; `client/src/main.tsx:1-35`; `client/src/App.tsx:1-61`; `scripts/verify-delivery.sh:1-19`; `scripts/check-readonly-http.py:1-53`; `scripts/check-demo-access.py:1-62`; `README.md:1-84`.

A única execução de auditoria de dependências solicitada está preservada de forma sanitizada em `docs/evidencias/dependencias-audit.json:1-2922`, com comando, cwd, código de saída, status, ações, advisories, caminhos, versões e URLs HTTPS retornadas pelo JSON.
