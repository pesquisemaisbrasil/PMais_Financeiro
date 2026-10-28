# EVIDÊNCIA DE AUDITORIA — banco, schema, migrations e armazenamento efetivo

**Projeto auditado:** `<raiz-do-repositorio>`
**Base informada:** `81bc243`
**Audit path:** `auditoria-banco.md`
**Evidência de metadata:** `docs/evidencias/schema-metadata.json`
**Escopo:** reconstrução factual do domínio Drizzle/MySQL e do armazenamento realmente usado pela aplicação atual. Este arquivo é evidência de auditoria; não é documentação final de produto e não implementa schema, migration, seed, upload ou alteração de aplicação.

## 1. Conclusão executiva

**CONFIRMADO NO CÓDIGO:** o schema Drizzle contém somente a tabela de autenticação `users`; `drizzle/relations.ts` não declara relações; o domínio financeiro dos sete módulos é um modelo sintético no cliente, persistido no `localStorage`, e não possui tabelas financeiras no código atual. O próprio schema termina com `TODO: Add your tables here` (`drizzle/schema.ts:L23-L28`).

**CONFIRMADO NO METADADO:** a inspeção read-only do MySQL gerenciado encontrou exatamente duas tabelas no schema selecionado pela `DATABASE_URL`: `users` e a tabela técnica `__drizzle_migrations`, ambas InnoDB (`docs/evidencias/schema-metadata.json:L25-L37`). Foram confirmadas 12 colunas, quatro entradas de índice, quatro constraints, nenhuma chave estrangeira e nenhuma regra referencial (`docs/evidencias/schema-metadata.json:L38-L285`). Nenhuma linha de usuário, negócio ou de `__drizzle_migrations` foi lida.

**Correspondência:** a estrutura efetiva de `users` corresponde ao schema, à migration inicial e ao snapshot Drizzle em colunas, tipos, nullability, defaults, chave primária e unicidade de `openId`. Há uma diferença nominal a registrar: o artefato SQL/snapshot chama a PK lógica de `users_id`, enquanto o MySQL expõe o constraint efetivo como `PRIMARY`; o comportamento estrutural é correspondente (`drizzle/0000_initial_users.sql:L1-L14`, `drizzle/meta/0000_snapshot.json:L81-L95`, `docs/evidencias/schema-metadata.json:L254-L274`). Se a nomenclatura literal da constraint for requisito externo, fica **A CONFIRMAR**.

**CONFIRMADO NO CÓDIGO:** `server/services/deployment.ts` possui uma sonda técnica MySQL com pool e `SELECT 1`, mas o app atual está em modo somente leitura e não habilita acesso financeiro (`server/services/deployment.ts:L18-L43`, `server/_core/index.ts:L33-L49`, `server/routers.ts:L12-L33`). Os helpers de `server/db.ts` para leitura/upsert de usuários existem, porém pertencem ao caminho legado OAuth, que não é registrado pelo entrypoint atual (`server/db.ts:L6-L91`, `server/_core/index.ts:L43-L45`, `server/_core/oauth.ts:L13-L64`).

**CONFIRMADO NO CÓDIGO:** o storage gerenciado é referenciado para a logo, com fallback local (`client/src/components/AppShell.tsx:L119-L132`). Existem helpers genéricos de presign/PUT/S3 e um proxy de download, mas não há fluxo de upload de usuário/documento ativo: o proxy não é registrado no entrypoint, `storagePut` só é referenciado pelo helper de geração de imagem e a rota `/api/uploads` é bloqueada (`server/storage.ts:L1-L98`, `server/_core/storageProxy.ts:L4-L47`, `server/_core/imageGeneration.ts:L43-L114`, `server/security/readOnlyGuard.ts:L3-L21`).

## 2. Método, limites e segurança da inspeção

A inspeção do banco foi feita depois da análise do domínio no código. Foi usado `mysql2/promise` com `process.env.DATABASE_URL`, em um pool separado de inspeção com `connectionLimit: 1` e encerramento no bloco `finally`. A consulta foi limitada a metadata de `information_schema`: `TABLES`, `COLUMNS`, `STATISTICS`, `TABLE_CONSTRAINTS`, `KEY_COLUMN_USAGE` e `REFERENTIAL_CONSTRAINTS`, conforme registrado no arquivo saneado (`docs/evidencias/schema-metadata.json:L1-L23`). Todas as consultas filtraram o schema corrente por `TABLE_SCHEMA = DATABASE()`.

Não foram consultadas tabelas de aplicação, `SELECT *`, contagens, amostras, valores de usuários, valores financeiros, valores de `__drizzle_migrations`, nem logs. Não foi executado `SELECT 1` pela inspeção de metadata; o `SELECT 1` abaixo é apenas o comportamento da sonda já existente no código. Não foi executado migration, DDL, seed, `drizzle-kit migrate`, `drizzle-kit push`, INSERT, UPDATE ou DELETE. O JSON registra `poolClosed: true` (`docs/evidencias/schema-metadata.json:L18-L25`). DSN, schema identificador, host, usuário, credenciais e quaisquer valores de registros não foram gravados.

O metadata JSON inclui `COLUMN_DEFAULT`/`defaultSQL` de definição de schema, não valores de linhas. Assim, `"user"` e `CURRENT_TIMESTAMP` na evidência são defaults de coluna, não dados de pessoas (`docs/evidencias/schema-metadata.json:L152-L205`).

## 3. Domínio Drizzle e schema declarado

### 3.1 Tabela `users`

**CONFIRMADO NO CÓDIGO:** `users` é declarada com `mysqlTable("users", ...)` (`drizzle/schema.ts:L1-L8`). Os tipos TypeScript `User` e `InsertUser` são inferidos diretamente da tabela (`drizzle/schema.ts:L25-L26`). Os campos abaixo são definição estrutural; nenhum valor de registro foi consultado.

| Ordem | Campo | Tipo/limite declarado | Nulabilidade e comportamento | Fonte |
|---:|---|---|---|---|
| 1 | `id` | `int` | `NOT NULL`, auto-incremento, chave primária | `drizzle/schema.ts:L9-L13`; metadata `docs/evidencias/schema-metadata.json:L82-L93` |
| 2 | `openId` | `varchar(64)` | `NOT NULL`, único; identificador OAuth Manus por comentário do schema | `drizzle/schema.ts:L14-L15`; metadata `docs/evidencias/schema-metadata.json:L95-L107` |
| 3 | `name` | `text` | nullable | `drizzle/schema.ts:L16`; metadata `docs/evidencias/schema-metadata.json:L109-L121` |
| 4 | `email` | `varchar(320)` | nullable | `drizzle/schema.ts:L17`; metadata `docs/evidencias/schema-metadata.json:L123-L135` |
| 5 | `loginMethod` | `varchar(64)` | nullable | `drizzle/schema.ts:L18`; metadata `docs/evidencias/schema-metadata.json:L137-L149` |
| 6 | `role` | `enum('user','admin')` | `NOT NULL`, default SQL efetivo `user` | `drizzle/schema.ts:L19`; migration `drizzle/0000_initial_users.sql:L7`; metadata `docs/evidencias/schema-metadata.json:L151-L163` |
| 7 | `createdAt` | `timestamp` | `NOT NULL`, default SQL efetivo `CURRENT_TIMESTAMP` | `drizzle/schema.ts:L20`; migration `drizzle/0000_initial_users.sql:L8`; metadata `docs/evidencias/schema-metadata.json:L165-L177` |
| 8 | `updatedAt` | `timestamp` | `NOT NULL`, default SQL efetivo `CURRENT_TIMESTAMP`, `ON UPDATE CURRENT_TIMESTAMP` | `drizzle/schema.ts:L21`; migration `drizzle/0000_initial_users.sql:L9`; metadata `docs/evidencias/schema-metadata.json:L179-L191` |
| 9 | `lastSignedIn` | `timestamp` | `NOT NULL`, default SQL efetivo `CURRENT_TIMESTAMP` | `drizzle/schema.ts:L22`; migration `drizzle/0000_initial_users.sql:L10`; metadata `docs/evidencias/schema-metadata.json:L193-L205` |

A migration inicial repete a ordem, os tipos, `NOT NULL`, enum, defaults, auto-incremento e unicidade (`drizzle/0000_initial_users.sql:L1-L13`). O snapshot Drizzle confirma o mesmo conjunto de nove colunas; `updatedAt` possui `onUpdate: true` e `users_openId_unique` está no conjunto de constraints únicas (`drizzle/meta/0000_snapshot.json:L7-L98`).

### 3.2 Relações, chaves e constraints

**CONFIRMADO NO CÓDIGO:** `drizzle/relations.ts` só contém um import vazio e não declara `relations(...)` (`drizzle/relations.ts:L1`). O snapshot também declara `foreignKeys: {}` e não há nenhuma FK na migration (`drizzle/meta/0000_snapshot.json:L79-L80`, `drizzle/0000_initial_users.sql:L11-L12`).

**CONFIRMADO NO METADADO:** não há foreign keys nem regras referenciais (`docs/evidencias/schema-metadata.json:L276-L277`). Os índices efetivos são:

- `users.PRIMARY` em `id`, BTREE, único (`docs/evidencias/schema-metadata.json:L232-L241`);
- `users_openId_unique` em `openId`, BTREE, único (`docs/evidencias/schema-metadata.json:L242-L251`);
- `__drizzle_migrations.PRIMARY` em `id` e o índice/constraint único `id` da tabela técnica (`docs/evidencias/schema-metadata.json:L208-L230`).

Não há índice de negócio, índice por e-mail ou relacionamento com outras entidades. A presença de uma coluna `email` no starter não significa que existam valores ou que o login corporativo atual esteja habilitado.

## 4. Migrations, snapshot e correspondência efetiva

**CONFIRMADO NO CÓDIGO:** `drizzle.config.ts` exige `DATABASE_URL`, aponta `schema` para `./drizzle/schema.ts`, saída para `./drizzle`, usa dialect `mysql` e repassa a URL ao `dbCredentials` (`drizzle.config.ts:L1-L15`). Os scripts `db:push` e `db:migrate` existem em `package.json`, mas não foram executados nesta auditoria (`package.json:L6-L16`).

O conjunto versionado local é composto por `drizzle/0000_initial_users.sql`, `drizzle/meta/0000_snapshot.json`, `drizzle/meta/_journal.json` e um `.gitkeep` em `drizzle/migrations`; o journal possui uma única entrada `0000_initial_users` (`drizzle/meta/_journal.json:L1-L13`). Não há outra migration SQL no diretório observado.

**CONFIRMADO NO METADADO:** existe `__drizzle_migrations` como tabela técnica InnoDB (`docs/evidencias/schema-metadata.json:L26-L31`). Seus campos estruturais observados são `id bigint unsigned NOT NULL auto_increment` com PK, `hash text NOT NULL` e `created_at bigint NULL`; essa descrição veio somente de `information_schema.COLUMNS` (`docs/evidencias/schema-metadata.json:L38-L80`). A tabela foi detectada por metadata, mas suas linhas não foram lidas; portanto não se afirma quantidade, hash, data ou estado de execução das migrations.

A comparação é:

| Camada | Resultado |
|---|---|
| `drizzle/schema.ts` versus `drizzle/0000_initial_users.sql` | Correspondência declarativa confirmada para `users` e seus nove campos. |
| Migration/snapshot | Correspondência confirmada; snapshot registra MySQL, a tabela `users`, PK lógica `users_id` e unique `users_openId_unique` (`drizzle/meta/0000_snapshot.json:L1-L6`, `L81-L98`). |
| Código/snapshot versus `users` efetiva | Correspondência estrutural confirmada por columns, defaults, PK e unique no metadata. |
| Nome literal da PK | `users_id` no SQL/snapshot versus `PRIMARY` no metadata; diferença nominal a **CONFIRMAR** somente se consumidores dependerem do nome literal. |
| Tabelas financeiras | Não existem no schema declarado nem no inventário metadata; não devem ser inventadas. |
| Estado das linhas de migration | **A CONFIRMAR**; deliberadamente não foram lidas. |

## 5. Uso efetivo do banco pela aplicação

### 5.1 Helper Drizzle de usuário

`server/db.ts` mantém `_db` lazy e somente instancia Drizzle quando `process.env.DATABASE_URL` existe (`server/db.ts:L6-L19`). O driver importado é `drizzle-orm/mysql2`, mas a chamada é `drizzle(process.env.DATABASE_URL)`; não há `mysql2.createPool`, `ssl` ou opção TLS explícita nesse helper (`server/db.ts:L1-L15`).

`upsertUser` valida `openId`, copia apenas `openId`, `name`, `email`, `loginMethod`, `lastSignedIn` e opcionalmente `role`, atualizando pelo conflito de chave (`server/db.ts:L21-L77`). O caminho `getUserByOpenId` é um `select` filtrado por `openId` com `limit(1)` (`server/db.ts:L79-L89`). Esse comportamento descreve código disponível, não uma leitura realizada durante a auditoria.

### 5.2 Ativação atual versus helper legado

**CONFIRMADO NO CÓDIGO:** o entrypoint atual registra health/status, guard read-only, tRPC e páginas; ele não importa nem chama `registerOAuthRoutes` (`server/_core/index.ts:L1-L12`, `server/_core/index.ts:L33-L49`). O contexto tRPC retorna `user: null` (`server/_core/context.ts:L10-L13`) e os procedimentos de `auth`, `admin` e `finance` lançam `SERVICE_UNAVAILABLE` (`server/routers.ts:L6-L33`). Portanto, o caminho OAuth que faria `upsertUser` não é uma feature ativa do runtime atual (`server/_core/oauth.ts:L13-L64`).

O SDK ainda contém caminho legado de autenticação que chama `getUserByOpenId`/`upsertUser` e sincronizaria perfil OAuth (`server/_core/sdk.ts:L259-L326`), mas sua rota não está conectada pelo entrypoint. Não há base factual para afirmar que existe usuário, administrador, sessão corporativa ou login financeiro no banco; nenhum registro foi lido.

### 5.3 Sonda de deployment, pool e `SELECT 1`

**CONFIRMADO NO CÓDIGO:** `checkDatabase` retorna `not_configured` sem DSN; caso contrário cria/reutiliza `mysql2/promise` pool com `uri: dsn`, `connectionLimit: 2` e `connectTimeout: 4_000`, executa somente `SELECT 1`, armazena o estado por 10 segundos e converte falhas em `unavailable` sem publicar erro do driver (`server/services/deployment.ts:L18-L43`). A resposta pública permanece `mode: read_only`, `accessEnabled: false`, `connect.validated: false` e `businessDataEnabled: false` (`server/services/deployment.ts:L45-L68`).

O código fornece `closeDeploymentPool()` para `pool.end()` (`server/services/deployment.ts:L70-L74`), mas a busca de usos não encontrou chamada no entrypoint. Assim, **A CONFIRMAR** fica a estratégia de encerramento do pool de runtime em shutdown; a conexão criada especificamente para esta inspeção de metadata foi encerrada e isso está confirmado no JSON (`docs/evidencias/schema-metadata.json:L18-L25`).

**TLS:** nenhum dos dois caminhos de conexão explicita `ssl`/TLS em TypeScript: o deployment passa somente `uri`, limite e timeout (`server/services/deployment.ts:L27-L30`), e Drizzle recebe somente a string da URL (`server/db.ts:L9-L13`). Se TLS é imposto pelos parâmetros do DSN/driver ou pelo serviço gerenciado, isso não foi inferido nem exposto: **A CONFIRMAR**. Não se deve declarar transporte TLS efetivo apenas pela presença de MySQL gerenciado.

## 6. Fronteira de persistência: demo no `localStorage`, não no MySQL

**CONFIRMADO NO CÓDIGO:** `DemoStore` define a chave `pmaisfinanceiro:demo:v1`, carrega JSON de `window.localStorage`, valida o estado e usa fixtures sintéticas quando o armazenamento não existe ou é inválido (`client/src/contexts/DemoStore.tsx:L10-L36`). Depois de cada alteração, serializa o estado no mesmo `localStorage`; falha de armazenamento mantém uso em memória e apresenta aviso (`client/src/contexts/DemoStore.tsx:L408-L418`). Há sincronização entre abas pelo evento `storage`, não por API de banco (`client/src/contexts/DemoStore.tsx:L419-L430`).

O store trabalha com tipos de demonstração como `DemoParty`, `DemoCategory`, `DemoCostCenter`, `DemoProject`, `DemoTitle`, `DemoProvision`, `DemoFieldSheet` e `DemoBankTransaction` (`client/src/contexts/DemoStore.tsx:L3-L7`). Esses tipos e fixtures não são tabelas MySQL; as ações de cadastro, título, provisão, baixa, lote, folha, conciliação e fechamento são reducer/local state (`client/src/contexts/DemoStore.tsx:L100-L179`). Não existe uma tabela financeira a documentar ou reconstruir a partir desse domínio. O README também delimita que os sete módulos são mockup, sem banco financeiro, e que o servidor recusa operações protegidas (`README.md:L5-L11`, `README.md:L66-L75`).

**Implicação:** a continuidade do estado demonstrativo é local ao navegador, pode ser removida e não é compartilhada entre computadores; não é retenção corporativa nem persistência financeira. Isso é uma fronteira efetiva do código, não uma recomendação histórica (`README.md:L35-L39`).

## 7. Storage efetivo, logo e uploads

### 7.1 Helpers gerenciados existentes

`server/storage.ts` implementa helpers genéricos: obtém configuração Forge por `MANUS_API_URL`/`MANUS_API_KEY`, solicita presign de PUT, faz PUT direto ao S3 e devolve uma URL relativa `/manus-storage/{key}` (`server/storage.ts:L5-L17`, `L31-L72`). `storageGet` devolve a mesma forma relativa e `storageGetSignedUrl` pede presign de GET (`server/storage.ts:L74-L98`). Os valores de configuração não foram lidos ou registrados nesta auditoria.

`server/_core/storageProxy.ts` define uma rota `GET /manus-storage/*` que solicita URL assinada e redireciona 307 com `Cache-Control: no-store` (`server/_core/storageProxy.ts:L4-L47`). Contudo, não há importação/registro desse proxy em `server/_core/index.ts`; a busca no código encontrou a definição, mas nenhum `registerStorageProxy(...)` executável. Portanto, o módulo existe, mas o vínculo do proxy ao servidor atual é **A CONFIRMAR** fora deste source path.

### 7.2 Logo gerenciada e fallback

**CONFIRMADO NO CÓDIGO:** `BrandMark` tenta primeiro `/manus-storage/Logo2025_branco_2abedc7a.png`; em erro, troca uma única vez para `/brand/Logo2025_branco.png` (`client/src/components/AppShell.tsx:L119-L132`). O fallback local existe no repositório (`client/public/brand/Logo2025_branco.png`), e a tela de login também referencia o asset local (`client/src/pages/Login.tsx:L81`). A configuração de logo da aplicação possui um `logoUrl` HTTPS separado (`app.config.ts:L1-L3`).

Isso comprova referência a storage gerenciado e fallback local da marca, mas não comprova quota, retenção, ciclo de vida, ACL, backup ou disponibilidade do objeto remoto. Esses itens permanecem **A CONFIRMAR**.

### 7.3 Uploads e anexos

**CONFIRMADO NO CÓDIGO:** não há rota de negócio ativa que chame `storagePut`. O único chamador encontrado é `generateImage`, helper de geração de imagem que também não é registrado pelos routers atuais (`server/_core/imageGeneration.ts:L43-L114`, `server/routers.ts:L12-L33`). O teste de plataforma exercita esse helper com mocks, o que prova apenas cobertura de helper, não execução de produção (`server/platform.test.ts:L29-L40`).

`/api/uploads` aparece apenas como prefixo protegido no guard e como caso de teste bloqueado; requisições protegidas retornam 503 (`server/security/readOnlyGuard.ts:L3-L21`, `server/deployment.test.ts:L34-L60`). Não há upload de PDF, comprovante, extrato, anexo ou documento financeiro ativo. Comentários de exemplos em helpers não são tratados como feature.

## 8. Deploy, limites e recuperação

**CONFIRMADO NO CÓDIGO:** o Dockerfile instala com pnpm congelado, executa build, define `NODE_ENV=production`, porta 3000 e inicia `dist/index.js` (`Dockerfile:L1-L12`). O servidor escuta `0.0.0.0` e usa `PORT` ou 3000 (`server/_core/index.ts:L51-L57`). O endpoint técnico é `/api/deployment/status`, e o cliente o consulta sem credenciais (`server/_core/index.ts:L35-L39`, `client/src/components/DeploymentStatus.tsx:L71-L91`).

**A CONFIRMAR / não presumir:** não há evidência no código auditado de quota de banco/storage, retenção, RPO/RTO, backup, restore, exportação completa, isolamento dev/produção, point-in-time recovery ou política de recuperação. Não se declara nenhum desses controles como disponível. A referência de banco gerenciado também adverte que o serviço não fornece, por esta superfície, banco de desenvolvimento separado, cópia produção-desenvolvimento, PITR ou API completa de backup/exportação (`skills/webdev/references/database.md:L13-L29`).

A aplicação e a publicação podem apontar para a mesma base gerenciada conforme a referência operacional (`skills/webdev/references/database.md:L5-L15`); por isso qualquer futura migration ou escrita deve ser tratada como alteração real compartilhada. Nenhuma alteração foi feita nesta auditoria.

## 9. Riscos e recomendações não implementadas

1. **RECOMENDAÇÃO — não implementado atualmente:** definir e verificar explicitamente a política TLS do driver/serviço para as duas vias de conexão. Hoje o código não informa `ssl`; não inferir a partir do DSN sem uma validação operacional segura.
2. **RECOMENDAÇÃO — não implementado atualmente:** garantir encerramento do pool de deployment no ciclo de shutdown, ou documentar a política de ciclo de vida do processo. Existe `closeDeploymentPool`, mas não foi encontrado uso no entrypoint (`server/services/deployment.ts:L70-L74`).
3. **A CONFIRMAR:** se consumidores externos exigem que o nome da PK seja literalmente `users_id`; o metadata MySQL informa `PRIMARY`, embora a estrutura seja equivalente.
4. **A CONFIRMAR:** estado/linhas da tabela `__drizzle_migrations`; sua existência e colunas foram confirmadas sem ler suas linhas.
5. **A CONFIRMAR:** comportamento de disponibilidade/ACL do objeto remoto da logo e resolução do caminho `/manus-storage` fora do source atual; o fallback local existe.
6. **RECOMENDAÇÃO — não implementado atualmente:** antes de qualquer evolução financeira, criar migrations aditivas, relações, índices, política de ownership/tenant, auditoria, backup/restore e controles de retenção aprovados; nada disso deve ser presumido a partir do starter `users`.
7. **Risco de fronteira:** `localStorage` é deliberadamente suficiente para a demonstração, mas não é persistência financeira durável; não inserir dados reais nesse estado (`client/src/contexts/DemoStore.tsx:L26-L36`, `README.md:L35-L39`).

## 10. Inventário final de evidências

- Código Drizzle: `drizzle/schema.ts:L1-L28`.
- Relações: `drizzle/relations.ts:L1`.
- Migration: `drizzle/0000_initial_users.sql:L1-L14`.
- Snapshot: `drizzle/meta/0000_snapshot.json:L1-L110`.
- Journal: `drizzle/meta/_journal.json:L1-L13`.
- Configuração: `drizzle.config.ts:L1-L15`.
- Metadata saneado, sem DSN e sem linhas: `docs/evidencias/schema-metadata.json:L1-L285`.
- Helper DB: `server/db.ts:L1-L91`.
- Pool/sonda/SELECT 1: `server/services/deployment.ts:L1-L74`.
- Entrypoint/read-only: `server/_core/index.ts:L1-L57`, `server/security/readOnlyGuard.ts:L1-L22`.
- Storage/presign/proxy: `server/storage.ts:L1-L98`, `server/_core/storageProxy.ts:L1-L47`.
- Logo/fallback: `client/src/components/AppShell.tsx:L119-L135`, `client/public/brand/Logo2025_branco.png`.
- Persistência demo: `client/src/contexts/DemoStore.tsx:L10-L36`, `L408-L430`.
- Roteadores indisponíveis: `server/routers.ts:L6-L33`.

**Resultado da auditoria:** metadata confirmou a correspondência estrutural entre o starter Drizzle e o MySQL gerenciado para `users`; não confirmou e não deve ser interpretado como existência de domínio financeiro relacional. O domínio financeiro observado é local/sintético; autenticação OAuth/DB e uploads são helpers ou caminhos não ativos no runtime atual. Nenhuma linha de aplicação foi lida e a conexão de inspeção foi encerrada.
