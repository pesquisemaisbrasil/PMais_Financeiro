# 05 — Autenticação e autorização


> **CONFIRMADO NO CÓDIGO:** o fluxo detalhado é o gate `/api/demo-access`, separado de `ctx.user` e das procedures indisponíveis.

## Conclusão curta

O único login funcional observado é um **gate compartilhado do mockup**. Ele aceita o identificador literal `adm` e uma senha configurada somente no servidor, cria uma sessão opaca em memória por processo e declara `scope: "demo_only"`. Não cria registro `users`, não preenche `ctx.user`, não concede papel financeiro e não libera APIs protegidas.

> **Não afirmar como uso atual:** MFA, login OAuth, access token JWT, refresh token, recuperação/reset de senha, cadastro de usuário, RBAC financeiro, autorização por tenant ou auditoria de identidade. Helpers e nomes históricos não são montados pelo entrypoint ativo.

![Tela real de acesso à demonstração, sem senha preenchida](imagens/tela-acesso-demo.png)

Captura local da rota `/login` em estado não autenticado; ela não mostra páginas pós-login.

## Componentes do fluxo

- Cliente: [`DemoAccess.tsx`](../client/src/contexts/DemoAccess.tsx#L4-L100) mantém status, CSRF em `useRef`, `expired`, fila e refresh por leitura de sessão.
- Página: [`Login.tsx`](../client/src/pages/Login.tsx#L22-L229) envia formulário, mostra loading/erro/configuração/sessão expirada e redireciona autenticado para `/`.
- Servidor: [`demoAccess.ts`](../server/security/demoAccess.ts#L19-L133) monta sessão, desafios, rate limit, cookies e endpoints.
- Gate de página: `requirePage` protege GET/HEAD antes do static/Vite.
- tRPC: [`context.ts`](../server/_core/context.ts#L4-L13) retorna sempre `user:null`; não integra a sessão demo.

## Login passo a passo

1. Browser acessa `/login`, rota pública.
2. Provider faz `GET /api/demo-access/session` com `credentials: include` e `cache: no-store`.
3. Se necessário, o servidor cria/renova desafio CSRF em cookie e devolve o desafio também no JSON; sem configuração da senha responde 503 `demo_access_not_configured`.
4. O usuário envia `username` e `password`. O cliente enfileira a operação, envia JSON, cookie e header `X-Pmais-CSRF`.
5. O servidor exige JSON, tipos string, username até 32 caracteres, password até 256, desafio válido e não `Sec-Fetch-Site: cross-site`; identifica apenas `adm` e verifica a senha server-side.
6. Sucesso: sessão opaca em Map, expiração de 30 minutos, cookie de sessão, destruição do desafio usado e `{ok:true}`. O cliente lê a sessão novamente e só considera sucesso se `authenticated` for verdadeiro.
7. O gate de página permite montar `DemoProvider`; falha mantém mensagem e não inventa sessão.

A senha nunca é documentada aqui, não é pré-preenchida no código auditado e não é gravada em localStorage.

## Sessão, cookies e CSRF

| Item | Comportamento confirmado |
|---|---|
| Sessão | Cookie `pmais_demo_session`, opaco, aceito somente no formato esperado e resolvido em Map por processo. |
| Expiração | Sessão 30 min; desafio CSRF 20 min. O cliente consulta a cada 60 s e em foco. |
| Cookies Preview | `HttpOnly`, `Path=/`, `Secure`, `SameSite=None`, `Partitioned`, salvo modo HTTP local explícito. |
| HTTP local | `PMAIS_DEMO_LOCAL_HTTP=1` produz `Secure=false`, `SameSite=Lax`, sem `Partitioned`; isso é só para desenvolvimento local e a configuração fora dele é **A CONFIRMAR**. |
| CSRF | Cookie `pmais_demo_csrf` + header `X-Pmais-CSRF`, desafio ligado ao hash da sessão, ainda válido; login/logout recusam `Sec-Fetch-Site: cross-site`. |
| Renovação | `refresh` do cliente apenas enfileira uma nova leitura de sessão; não existe refresh token nem endpoint de renovação de JWT. |
| Restart | Maps, salt/verificador, sessões, desafios e tentativas são recriados; restart/substituição invalida sessões. |

## Logout

O botão do shell chama `logout()`. A fila faz leitura da sessão, exige CSRF e envia `POST /api/demo-access/logout` com `{}`, cookie e header. O servidor remove a sessão/challenge, limpa cookies e retorna `{ok:true}`. O cliente limpa status/CSRF, releia a sessão e permite redirecionamento a `/login`. O `auth.logout` tRPC é um stub indisponível e não participa do fluxo.

O logout **não limpa** `pmaisfinanceiro:demo:v1`; por isso alterações sintéticas podem reaparecer no mesmo perfil do navegador. Isso é risco para dados reais e não deve ser reutilizado como persistência corporativa.

## Cadastro, recuperação e reset

- Cadastro público: **Não identificado no código.**
- Recuperação de senha: **Não identificado no código.**
- Reset de senha: **Não identificado no código.**
- MFA: somente flags de configuração podem aparecer no status técnico; não há implementação no login demo.
- OAuth: helper `registerOAuthRoutes` existe, mas não é chamado; `/api/oauth` também está no prefixo bloqueado.

## Proteção de páginas e APIs

| Recurso | Requisito atual | Papel |
|---|---|---|
| `/login` | Público | Nenhum. |
| `/`, `/demo/*`, `/fundacao`, `/modulos*`, `/implantacao`, `/seguranca`, `/acesso`, `/documentacao` | Sessão demo para GET/HEAD; sem sessão, 302 para `/login` | `demo_only`; não é role. |
| `/api/demo-access/session` | Cookie opcional; cria desafio se possível | Nenhum papel. |
| `/api/demo-access/login` | CSRF/JSON e credencial demo | `adm` compartilhado; escopo demo. |
| `/api/demo-access/logout` | Sessão + CSRF | `adm` compartilhado. |
| `/api/health`, `/api/deployment/status`, `/api/platform/config.js` | Públicos | Nenhum. |
| tRPC `deployment.status` | GET, público | Nenhum. |
| tRPC auth/admin/finance | Stub/503; POST ainda bloqueado pelo guard | Nenhum papel operacional. |
| Prefixos protegidos e escritas `/api` | HTTP 503 antes do handler | Nenhuma identidade bypassa. |

## Papéis, permissões e recursos

O enum SQL `role('user','admin')` é estrutural do starter, não prova autorização ativa. Não há matriz de permissões, hierarquia, tenant, ownership ou decisão por registro no caminho atual. As mutações dos sete módulos usam IDs do estado local e só afetam a cópia sintética do próprio navegador.

> **RECOMENDAÇÃO — não implementado atualmente:** antes de dados reais, criar identidade individual, MFA aprovado, sessões distribuídas/revogáveis, RBAC/escopo organizacional, autorização server-side em cada consulta/mutação/exportação/storage, recuperação de credencial e trilha de auditoria. Não reutilizar `pmais_demo_session` ou `scope: demo_only`.

## Fontes

[`demoAccess.ts`](../server/security/demoAccess.ts#L19-L133), [`DemoAccess.tsx`](../client/src/contexts/DemoAccess.tsx#L22-L100), [`Login.tsx`](../client/src/pages/Login.tsx#L22-L229), [`App.tsx`](../client/src/App.tsx#L26-L61), [`context.ts`](../server/_core/context.ts#L4-L13), [`routers.ts`](../server/routers.ts#L12-L35), [`readOnlyGuard.ts`](../server/security/readOnlyGuard.ts#L3-L21), [`schema.ts`](../drizzle/schema.ts#L8-L28).
