# Revisão do acesso demo — mockup compartilhado

**Escopo:** revisão somente leitura da extensão do gate de acesso demo para o username `adm`, sem execução da bateria de aceitação completa, sem acesso a senha real, logs de credenciais ou imagens. O relatório cobre os arquivos de autenticação/rotas/frontend indicados e as referências textuais em README, Access e Documentation.

## Resultado executivo

Foi encontrado **1 defeito concreto de prioridade alta**: concorrência entre requisições de refresh pode deixar divergentes o cookie CSRF emitido pelo navegador e o token CSRF mantido em memória pelo frontend. Isso pode bloquear login ou logout válidos com `403 invalid_challenge` de forma intermitente.

Fora esse ponto, os contratos aprovados foram verificados: senha vem do ambiente em produção, sessão é opaca e somente em memória por 30 minutos, cookies têm o perfil HTTPS de Preview e o ramo HTTP local é explícito, CSRF é vinculado à sessão, logout revoga a entrada no servidor, rate limit é temporário, `adm` não recebe papel, as APIs financeiras continuam indisponíveis e o frontend não persiste senha/token em browser storage.

## Problema concreto

### P1 — refresh concorrente pode dessincronizar CSRF e bloquear login/logout

**Arquivos/linhas:**

- `client/src/contexts/DemoAccess.tsx:20-48`: `refresh()` é disparado na montagem, a cada 60 segundos e em `focus`; o contador `sequence` apenas descarta a atualização de estado de respostas antigas.
- `server/security/demoAccess.ts:71-78`: cada `/session` concorrente sem desafio válido pode gerar um novo token e enviar `Set-Cookie`.
- `client/src/contexts/DemoAccess.tsx:51-57,66-81`: login/logout usam o token atual em `csrf.current`, sem serializar ou cancelar refreshes concorrentes.
- `server/security/demoAccess.ts:51-56,84-85,112-121`: o servidor exige que header, cookie e desafio armazenado coincidam.

**Cenário:** duas chamadas `/session` podem começar antes de o primeiro cookie CSRF ser aplicado, por exemplo na montagem combinada com `focus`. Cada uma pode receber um token diferente. Se as respostas chegarem fora de ordem, o navegador pode terminar com o cookie da resposta antiga, enquanto `csrf.current` conserva o token da resposta mais nova porque a resposta antiga foi ignorada pelo `sequence`. O próximo POST envia header e cookie diferentes e é recusado como `invalid_challenge`. A mesma janela existe após login, quando o desafio anterior é removido e refreshes sobrepostos podem renovar o token mais de uma vez.

**Impacto:** falha intermitente de acesso demo e de saída, apesar de credenciais/challenge válidos; o usuário é orientado a recarregar/tentar novamente. Antes de liberar a tela, o refresh precisa ser serializado ou abortado de forma que somente uma renovação possa alterar o cookie CSRF, e as ações de login/logout devem usar um desafio consistente com essa renovação.

## Verificações sem defeito encontrado

- **Guardas de página:** `server/security/demoAccess.ts:10,126-130` cobre `/`, `/demo`, `/fundacao`, `/modulos`, `/implantacao`, `/seguranca`, `/acesso` e `/documentacao`, apenas para `GET/HEAD`, redirecionando sem sessão para `/login`. `client/src/App.tsx:27-31,35-53` repete o gate no `ShellRoute`; `/login` permanece acessível em `App.tsx:36` e o próprio `Login` redireciona uma sessão já autenticada em `Login.tsx:31-33`.
- **Cookie/Preview:** `server/security/demoAccess.ts:29-35` usa `Secure`, `HttpOnly`, `SameSite=None` e `Partitioned` por padrão; `PMAIS_DEMO_LOCAL_HTTP=1` é o ramo explícito para HTTP local, com `Secure=false`, `SameSite=Lax` e sem particionamento. Sessão e CSRF usam `Path=/` e respostas de acesso têm `Cache-Control: no-store`.
- **Senha, sessão e logout:** `demoAccess.ts:19-25` lê `PMAIS_DEMO_LOGIN_PASSWORD` e não contém senha de produção; o token é aleatório, armazenado apenas como hash em `sessions`, expira em 30 minutos e é removido no logout em `demoAccess.ts:102-121`. As limitações por processo/memória e a invalidação no restart são compatíveis com o gate demo-only aprovado, não uma exigência de banco durável nesta etapa.
- **CSRF e rate limit:** `demoAccess.ts:51-56` vincula o desafio ao hash da sessão; login/logout exigem JSON, header CSRF e rejeitam `Sec-Fetch-Site: cross-site` em `84-85` e `112-115`. A janela temporária por IP e global está em `90-98`, com limites de memória e `Retry-After`.
- **Escopo de autorização:** o retorno de sessão declara `scope: "demo_only"` e apenas `login: "adm"` (`demoAccess.ts:68-80`), sem papel `admin`/`financeiro`. O mount do demo antecede o `readOnlyGuard`, mas não o substitui (`server/_core/index.ts:27-45`). O guard mantém prefixes financeiros/administrativos e escritas de API em `503` (`server/security/readOnlyGuard.ts:3-18`); os procedimentos `admin`/`finance` do tRPC continuam `unavailable` (`server/routers.ts:12-32`) e o contexto mantém `user: null` (`server/_core/context.ts:10-13`).
- **Frontend sem persistência de auth:** o CSRF fica somente em `useRef` (`DemoAccess.tsx:16-17`), a senha fica no estado transitório do formulário (`Login.tsx:24-28,183-190`) e o cliente tRPC envia `credentials: "omit"` (`main.tsx:18-23`). Não há armazenamento de senha/token em `localStorage` ou `sessionStorage` no fluxo revisado.
- **Cancelamento de logout:** não há `AbortController` em `action()` e o teste de `mounted` não cobre cada etapa de `logout()` (`DemoAccess.tsx:51-61,74-80`). Porém o provider envolve a aplicação inteira (`main.tsx:29-35`) e não é desmontado na navegação normal; portanto não elevo isso como falha concreta do fluxo atual. Fica como endurecimento futuro caso o provider passe a ser desmontável.

## Pendências textuais — prioridade baixa

Estas divergências não alteram a proteção do gate, mas devem ser atualizadas pelo responsável do conteúdo:

- `README.md:11` afirma que não há “login” e `README.md:44` diz que não é necessário fornecer chaves para a demonstração. Agora há um login demo condicionado ao segredo de ambiente; esclarecer a diferença entre o gate demo e autenticação financeira real, além de documentar o ramo HTTP local quando aplicável.
- `README.md:25,74` descreve acesso/segurança como rotas futuras e fala de acesso seguro/MFA sem distinguir explicitamente o gate demo já presente da autenticação de produção. Ajustar a redação para não parecer que o login demo concede identidade financeira.
- `client/src/pages/Access.tsx:17,25,44` ainda diz que o portal permanece público, que login não está disponível e que nenhum login existe nesta fase. A rota `/acesso` agora está atrás do `ShellRoute`; dizer que a identidade financeira/MFA permanecem adiadas, mas que existe um acesso demo restrito.
- `client/src/pages/Documentation.tsx:21-24` afirma que o servidor continua sem login. Substituir por “sem autenticação financeira, MFA ou operações reais; o portal usa somente o gate demo compartilhado”.

## Limites desta revisão

Não foram solicitadas nem executadas MFA, persistência durável, papéis reais, banco, API externa, browser ou bateria de aceitação completa. Os nove testes de servidor já informados como aprovados não foram reexecutados nesta revisão.

## Atualização posterior do responsável — 26/10/2026

O achado P1 foi corrigido: `createAccessQueue` serializa todo o ciclo de login/logout e todas as leituras de sessão. Respostas com `Set-Cookie` não podem concorrer dentro do mesmo provider; não se usa mais apenas um contador para descartar respostas. Um `invalid_challenge` pode renovar o desafio e repetir uma única vez, somente porque a resposta 403 comprovadamente não realizou mutação. Falha de rede ou senha inválida não causa retry automático.

Três testes dirigidos de fila passaram e TypeScript/build foram rechecados. README, Access, Documentation e roteiro foram atualizados para distinguir acesso demo de autenticação financeira/MFA ainda pendente. Essa anotação e a rechecagem foram feitas pelo responsável pela implementação, não pelo revisor independente. Evidências detalhadas em `validacao-acesso-demo.md`.
