# Validação da tela de acesso demo — 26/10/2026

## Entrega

Tela `/login`, identificador compartilhado `adm`, senha configurada no formulário protegido e validada apenas no servidor. Não há senha/hash nos fontes ou bundle do cliente. Login cria sessão opaca em memória, limitada a 30 minutos. Logout revoga a sessão do servidor e limpa os cookies. O reinício/substituição da instância exige novo acesso.

O login não cria papel `admin`/`financeiro`, cadastro individual ou MFA. Todas as APIs financeiras e administrativas permanecem bloqueadas. Dados dos sete módulos continuam sintéticos e locais, nunca enviados ao banco/Connect/Itaú.

## Evidências executadas

- `pnpm check`: TypeScript sem erros após integração e correção.
- `pnpm build`: frontend e servidor compilados. Aviso não bloqueante de pacote inicial acima de 500 kB permanece.
- `server/demo-access.test.ts`: nove testes aprovados; credencial exclusivamente de teste, nunca a senha real. Cobrem ausência de configuração, token inventado/OAuth ignorado, atributos de cookies, CSRF, erro genérico, sessão validada, APIs reais bloqueadas, revogação, expiração e limite de tentativas.
- `server/demo-render.test.tsx`: oito telas demonstrativas continuam renderizando após a integração.
- `server/access-queue.test.ts`: três verificações dirigidas da correção de concorrência. Refreshes não se sobrepõem, login e suas leituras são atômicos na fila e uma falha não bloqueia operações futuras.
- `python3 scripts/check-demo-access.py`: checagem HTTP local com a senha do ambiente, usada apenas em memória e não registrada. Confirmou tela de entrada, redirecionamento sem sessão, login válido, sessão `demo_only`, página aberta após validação, APIs administrativas/financeiras em 503 e logout. Confirmou atributos HTTPS/iframe nos headers e ausência da senha nos fontes/bundle cliente.
- Revisão independente somente leitura em `revisao-acesso-demo.md`: apontou concorrência CSRF e divergências textuais. Correções posteriores registradas pelo responsável, sem atribuí-las ao revisor.

## Limites honestos

A checagem HTTP local não certifica políticas de cookies do navegador. Cookies são HttpOnly/Secure/SameSite=None/Partitioned no HTTPS Preview, mas o navegador pode bloqueá-los. A interface não libera acesso se não conseguir confirmar a sessão. Não houve screenshot/browser com credenciais, gravação no banco, integração externa ou teste com dados reais.

Sessões, desafios e limites estão em memória por instância. Não há identidade corporativa, sessão distribuída, MFA, auditoria financeira ou proteção certificada para dados reais. Esses itens permanecem no backlog. O modo HTTP local é explicitamente separado e não deve ser habilitado no Preview/produção.
