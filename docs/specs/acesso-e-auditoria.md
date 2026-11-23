# Spec: Acesso e auditoria

Contrato de login, sessão, MFA, papéis, permissões finas e trilha de auditoria do Financeiro. Os detalhes técnicos estão em [handoff/06](../handoff/06-seguranca-e-lgpd.md); este spec diz o que precisa acontecer e como verificar.

## Comportamento

- **Login** por **e-mail + senha** (`POST /auth/token`). O usuário interno não precisa de CPF, e o Financeiro não guarda CPF de ninguém.
- **SSO Google ou Microsoft** como alternativa à senha. Quem entra assim confirma no próprio provedor e não passa pela etapa de código do Financeiro. Por isso, a verificação em duas etapas precisa estar exigida nas contas da empresa, pelo administrador do Google e da Microsoft.
  - `GET /auth/sso/{google|microsoft}/start` leva ao provedor, e `GET /auth/sso/{google|microsoft}/callback` confere a volta e abre a sessão;
  - só entra quem já tem conta ativa no Financeiro: o SSO nunca cria conta;
  - a conta é achada pelo **identificador fixo** da pessoa no provedor (`sub` no Google; `tid` + `oid` na Microsoft), guardado em `sso_identities` no primeiro login. O e-mail só liga a conta nesse primeiro login: depois, e-mail trocado no provedor não muda a conta, e outra pessoa com o e-mail antigo não entra;
  - a Microsoft fica limitada à empresa (`MICROSOFT_TENANT_ID`), e o Google exige e-mail verificado;
  - sem as chaves do provedor, o botão continua na tela e avisa que ainda não está disponível.
- **Não há cadastro público:** a conta nasce com `backend/scripts/create_user.py` até existir a tela de usuários.
- **MFA (TOTP) obrigatório** para quem entra por e-mail e senha, em todos os papéis (`admin` e `financeiro`):
  - no primeiro login, a pessoa cadastra o MFA antes de qualquer outra tela: `POST /auth/mfa/setup` devolve uma chave nova a cada pedido e o QR code, e `POST /auth/mfa/setup/confirm` prova o cadastro com o primeiro código e abre a sessão;
  - `POST /auth/token` devolve um token parcial (`mfa_pending`, 5 min);
  - `POST /auth/token/mfa` com o código de 6 dígitos emite o par de tokens;
  - um código já aceito não vale de novo;
  - 10 códigos de recuperação de uso único, guardados só como hash, que aparecem uma vez no fim do cadastro;
  - a sessão só nasce depois do segundo fator, e conta sem MFA não renova sessão antiga.
- **Navegador liberado** ([ADR 0022](../architecture/adr/0022-navegador-liberado-por-cookie.md)): depois da senha e do autenticador (ou do retorno do Google e da Microsoft), a conta só entra pelos **computadores (navegadores) que um admin liberou**. Pedido do Bruno em 17/11/2026, inspirado no SurveyMonkey:
  - o navegador é reconhecido por um cookie aleatório (`financeiro_navegador`, `HttpOnly`, 400 dias); o banco guarda só o hash dele, o nome do navegador ("Chrome no Windows") e o IP **mascarado**, só para o admin reconhecer o computador. O IP não decide nada: o roteador troca o IP dos computadores;
  - o **primeiro navegador** de cada conta é liberado sozinho: no cadastro do autenticador ou, nas contas que já existiam, no primeiro login depois da entrega;
  - num navegador novo, a pessoa passa senha e código e vê **"Computador ainda não liberado"**, sem sessão. O pedido aparece para os **outros admins** no sino e na tela **Acessos** (só admin), com **Liberar** e **Recusar**. Depois de liberado, ela entra de novo normalmente;
  - quem cadastra o autenticador de novo (celular perdido) num navegador novo vê os códigos de recuperação e, em seguida, o aviso: o navegador continua precisando da liberação;
  - **Revogar** (aba Liberados) tira a liberação e encerra as sessões da conta; se a pessoa tentar entrar por aquele navegador, vira pedido de novo;
  - vale para **todos os papéis, menos o super admin** (o desenvolvedor, provisório: entra com senha e autenticador em qualquer computador, sem liberação; 19/11/2026). Admin não libera o próprio computador; sem outro admin, `backend/scripts/liberar_navegador.py --email` libera pelo servidor;
  - o interruptor `DEVICE_APPROVAL_ENABLED` (ligado por padrão) só fica desligado na demonstração.
- **Sessão:**
  - access token de 15 min, só em memória;
  - refresh token de 7 dias em cookie `HttpOnly; Secure; SameSite=Strict`, rotativo e com detecção de reuso (`family_id`);
  - logout revoga o refresh.
- **Reautenticação com MFA** para ações críticas:
  - gerar a planilha com chave Pix completa;
  - confirmar baixa;
  - cancelar baixa (quando existir);
  - criar ou girar conta de serviço.
- **Troca de senha** exige a senha atual, revoga as outras sessões e avisa o dono.
- **Papéis** (três níveis desde 19/11/2026, [ADR 0023](../architecture/adr/0023-tres-niveis-de-acesso-e-telas-por-pessoa.md)):
  - `financeiro` (na tela, **Usuário**): usuário principal; não libera computador nem bloqueia tela;
  - `admin`: tudo, mais liberar computadores, **bloquear telas dos usuários** (Acessos > Pessoas e telas), usuários, contas de serviço e a tela "Auditoria";
  - `superadmin` (**Super admin**): tudo do admin, mais bloquear telas de admin e a tela **Demandas** ([demandas](demandas.md)). Provisório, até o fim do desenvolvimento.
- **Telas bloqueadas por pessoa:** Contas a pagar, Contas a receber, Conferência bancária, Divergências, Relatório do projeto e Cadastros. A tela bloqueada some do menu, não abre pelo endereço ("Tela não liberada") e a API recusa (403). Início, busca, avisos e Abrir demanda ficam para todos.
- **Permissões finas** por usuário, em `user_permissions`: `confirm_payment`, `download_payment_sheet` e `manage_service_clients`. Por padrão, `financeiro` tem as duas primeiras e `admin` tem todas.
- **Tela "Auditoria"** (só admin): linha do tempo com filtro por usuário, lote, projeto, tipo e período, por cursor.

## Regras

1. Papel e permissões são lidos do banco a cada requisição: promover, rebaixar ou desativar vale na hora.
2. Toda rota checa papel ou permissão como dependência na assinatura (`Depends(require_role(...))`), nunca com `if` solto.
3. Recurso que a pessoa não deve saber que existe (lote de outro projeto, comprovante de outro lote) → **404**. **403** só quando ela sabe que existe, mas não pode agir.
4. Desativar a conta revoga todos os refresh tokens dela.
5. O último `admin` ativo não pode ser rebaixado nem desativado.
6. Toda troca de papel ou de permissão grava `role_change_logs` (antes, depois, autor).
7. **Auditoria append-only** (sem `UPDATE` nem `DELETE` pela aplicação; `REVOKE` na role do Postgres). O autor é FK com `RESTRICT`. As tabelas e o que cada uma grava:

| Tabela | Grava |
|---|---|
| `finance_audit_events` | lote criado, parte enviada, comprovante descartado ou restaurado, lote confirmado, cancelado; baixa pedida ao Connect e resposta |
| `pii_access_logs` | cada chave Pix completa recebida do Connect e entregue a alguém (planilha) |
| `export_logs` | cada planilha ou CSV com dado pessoal |
| `role_change_logs` | troca de papel ou permissão |
| `service_client_logs` | conta de serviço criada, girada ou desativada (sem o segredo) |
| `integration_call_logs` | cada chamada de integração, sem corpo |

8. Nenhum dado pessoal no log técnico: chave Pix, nome lido do comprovante e texto do PDF nunca entram.
9. Rate limit (Redis):
   - `/auth/token`: 5/min por IP e 10 falhas/h por e-mail **na mesma rede** (o IP mascarado, /24 ou /48), contadas em `login_events` para valerem depois de um restart e tratarem igual e-mail com e sem conta;
   - `/auth/token/refresh`: 60/min por IP, porque o access token só vive em memória e cada recarga de página renova;
   - `/auth/token/mfa`: 5/min;
   - `/auth/sso/*`: 20/min por IP;
   - 10 erros seguidos de MFA bloqueiam a conta por 15 minutos, mesmo com o código certo.
10. Headers de segurança e `/docs` e `/openapi.json` desligados em produção, desde o primeiro commit.
11. Gravar o último login (data, IP, user-agent).

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Sem token ou token expirado | 401 | (padrão do login) |
| E-mail ou senha errados, ou conta desativada | 401 | E-mail ou senha incorretos |
| Conta desativada com token de acesso ainda válido | 401 | (padrão do login) |
| Código MFA errado ou token parcial vencido | 401 | Código de verificação inválido |
| Cadastrar MFA numa conta que já tem | 409 | O MFA já está cadastrado |
| SSO sem as chaves do provedor | 303 para `/login?erro=sso_indisponivel` | Esse login ainda não está disponível. Use e-mail e senha. |
| SSO de quem não tem conta ativa no Financeiro | 303 para `/login?erro=sso_conta` | Essa conta não tem acesso ao Financeiro. Fale com o administrador. |
| SSO cancelado, com estado errado ou token recusado | 303 para `/login?erro=sso_falhou` | Não foi possível entrar por essa conta. Tente de novo ou use e-mail e senha. |
| Senha e código certos num navegador ainda não liberado (pedido novo ou esperando) | 403 | Este computador ainda não está liberado. O pedido foi para o administrador; quando ele liberar, entre de novo. |
| Senha e código certos num navegador recusado | 403 | O administrador não liberou este computador. Fale com ele. |
| Navegador não liberado no retorno do Google ou da Microsoft | 303 para `/login?erro=navegador_pendente` (ou `navegador_recusado`) | as mesmas mensagens acima |
| Admin libera o próprio computador | 409 | Peça a outro administrador para liberar este computador |
| Liberar o que já está liberado, ou recusar o que não está esperando | 409 | Esse pedido já foi decidido. Atualize a lista. |
| Revogar um navegador que não está liberado | 409 | Só se revoga um navegador liberado. Atualize a lista. |
| Liberar, recusar ou revogar um navegador que não existe | 404 | Navegador não encontrado |
| Tela Acessos (`/admin/navegadores`) sem ser admin | 403 | Acesso de administrador é necessário |
| Pessoas e telas (`/admin/pessoas`) sem ser admin | 403 | Acesso de administrador é necessário |
| Rota de uma tela bloqueada para a pessoa | 403 | Esta tela não está liberada para você. Fale com o administrador. |
| Mudar as próprias telas | 409 | Peça a outro administrador para mudar as suas telas |
| Admin muda telas de outro admin ou do super admin | 409 | Você não pode mudar as telas desta pessoa |
| Tela que não existe na lista | 422 | Tela desconhecida |
| Mudar telas de quem não existe ou está inativo | 404 | Pessoa não encontrada |
| Excesso de tentativas | 429 | Muitas tentativas — aguarde alguns minutos |
| Papel sem a permissão da ação | 403 | Seu perfil não permite essa ação |
| Rebaixar ou desativar o último admin | 409 | Não é possível remover o último administrador |
| Trocar a senha sem a senha atual correta | 422 | A senha atual não confere |
| Senha fraca | 422 | (validação, mesma regra do Connect) |

## Critérios de aceite

- [x] O primeiro login de um usuário novo cai no cadastro do MFA e não chega a nenhuma outra tela antes disso.
- [ ] Gerar a planilha com chave completa pede o código MFA de novo.
- [x] Desativar um usuário derruba a sessão dele no próximo refresh.
- [x] Reapresentar um refresh já usado revoga a família inteira.
- [ ] Rebaixar o único admin é recusado com 409.
- [ ] A tela Auditoria mostra criação, confirmação e cancelamento de lote e cada download de planilha, com autor.
- [x] Teste de schema: nenhuma coluna de CPF nem de chave Pix em claro no banco do Financeiro (exceção: `payable_items.pix_masked`, a chave do respondente de incentivo já mascarada; veja o ADR 0004).
- [ ] Toda rota tem teste sem token, com token expirado, com papel sem permissão e com conta inativa.
- [x] O primeiro navegador de uma conta entra direto, e o banco guarda só o hash do cookie dele.
- [x] Num navegador novo, senha e código certos não abrem sessão: aparece "Computador ainda não liberado", e os outros admins recebem um aviso, uma vez só.
- [x] Depois que outro admin libera em Acessos, o mesmo navegador entra; o admin não libera o próprio computador: no pedido dele, a tela mostra "É o seu computador: outro administrador libera." no lugar do botão Liberar.
- [x] Revogar encerra as sessões, e revogar tudo não faz o próximo navegador entrar sozinho.

## Onde está no código

- Destino: `backend/api/auth.py`, `backend/services/auth.py`, `backend/services/mfa.py`, `backend/services/sso.py`, `backend/core/crypto.py`, `backend/core/security.py`, `backend/core/permissions.py`, `backend/models/user.py`, `backend/services/audit.py`, `backend/api/audit.py`
- Frontend: `frontend/src/app/login/`, `frontend/src/app/admin/auditoria/`, `RequireAuth`
- Navegador liberado: `backend/services/browsers.py`, `backend/api/browsers.py`, `backend/models/trusted_browser.py`, `frontend/src/app/(app)/acessos/`, o passo `WaitingStep` em `frontend/src/app/login/MfaSteps.tsx`
- Testes: `backend/tests/test_auth.py`, `test_mfa.py`, `test_navegador_liberado.py`, `test_permissions.py`, `test_audit.py`; `frontend/e2e/navegador-liberado.spec.ts`
- Referência no Connect: `api/auth.py`, `services/auth.py`, `core/permissions.py`, `services/audit.py`

## Ajustes

- 2026-10-21: login por e-mail, como manda [handoff/06 §1](../handoff/06-seguranca-e-lgpd.md). O [handoff/04](../handoff/04-banco-de-dados.md) diz para copiar os models do Connect com login por CPF. Conflito registrado em [perguntas-abertas](../planning/perguntas-abertas.md) (Q10).
- 2026-11-03: Q10 fechada (PF-4): login por e-mail + senha, com SSO Google ou Microsoft como alternativa no primeiro fator e TOTP depois nos dois casos. Sem CPF no Financeiro.
- 2026-11-03: primeira entrega só com e-mail + senha, sessão e limites. Faltam MFA e reautenticação, SSO, troca e recuperação de senha, papéis e auditoria. **Nada vai para a `main` antes do MFA.** O limite por IP ainda é em memória: passa para Redis quando a API tiver mais de uma instância.
- 2026-11-03: MFA TOTP entregue. O reset ainda é por script (`backend/scripts/reset_mfa.py`), sem aviso ao dono: a tela de administração vem com a entrega de usuários. A reautenticação com MFA nasce junto com as ações críticas, que ainda não existem. Faltam também SSO, troca e recuperação de senha, papéis e auditoria.
- 2026-11-03: corrige o registro da Q10 acima (Bruno): o TOTP do Financeiro vale só para e-mail e senha. No SSO, o segundo fator é o do Google ou da Microsoft, sem etapa extra aqui. A entrega de SSO precisa definir como essa pessoa se reautentica nas ações críticas e liberar a sessão de quem não tem TOTP.
- 2026-11-03: SSO entregue, com os botões na tela de login. A sessão guarda que veio do provedor (`refresh_tokens.viaSso`), e só ela dispensa o TOTP. Falta definir a reautenticação de quem entra por SSO nas ações críticas, que ainda não existem. O login real depende de registrar o app no Google e na Microsoft.
- 2026-10-21: segregação de funções (quem envia o lote não confirma a baixa acima de um valor) fica como pergunta aberta Q8 até o PO definir o valor.
- 2026-11-05: PF-52. O `starlette` 0.48 não limita formulário urlencoded (PYSEC-2026-249). Enquanto o FastAPI não sobe, qualquer pedido em `/auth/*` com corpo acima de 16 KB recebe 413 ("Pedido grande demais"), contado nos bytes recebidos e não só no `Content-Length`. O `--ignore-vuln` do `security.yml` continua até a atualização do FastAPI (feita em PR próprio, combinada com o Connect).
- 2026-11-06: PF-52 fechado. FastAPI 0.162.0 e starlette 1.10.0 ([ADR 0011](../architecture/adr/0011-fastapi-e-starlette-novos-fora-da-versao-do-connect.md)): o `pip-audit` passa **sem nenhum `--ignore-vuln`**, e os 6 avisos que eram ignorados (todos do starlette 0.48.0) saíram. O limite de 16 KB em `/auth/*` **continua**, como segunda camada: custa uma checagem por pedido e vale mesmo se alguém voltar a um starlette sem o limite do formulário.
- 2026-11-05: PF-49. Primeiro login por SSO liga a conta ao identificador fixo pelo e-mail; contas já cadastradas se ligam sozinhas no próximo login. Se a conta já está ligada a outra pessoa do mesmo provedor, o login é recusado como "sem conta" (e-mail reaproveitado). Para trocar a pessoa de uma conta, hoje é preciso apagar a linha em `sso_identities`; a tela de administração vem com a entrega de usuários.
- 2026-11-17 (**sem os botões do Google e da Microsoft**, pedido do Bruno): a tela de entrada fica só com **e-mail e senha**, como a demonstração já estava desde 16/11. O login por SSO continua no backend (`/auth/sso/{google|microsoft}/start`), desligado enquanto o app não for registrado nos provedores, e quem chegar pelo endereço lê o aviso de sempre. Muda o que a Q10 tinha fechado (SSO como alternativa): para voltar, os botões voltam à tela; decisão do PO.
- 2026-11-17 (**navegador liberado**, pedido do Bruno, [ADR 0022](../architecture/adr/0022-navegador-liberado-por-cookie.md)): depois do autenticador, a conta só entra pelos navegadores que um admin liberou na tela **Acessos**; o primeiro é liberado sozinho. Escolhas dele: o navegador, e não o IP (o roteador troca o IP); vale para todos, admin incluído, liberado por outro admin; pedido pela tela, e não código de liberação. Migration `f3b5d7e9a1c2`. Prazo de guarda dos registros: Q57.
- 2026-11-19 (**três níveis de acesso e telas por pessoa**, Bruno: "Eu quero trabalhar em três níveis de acessos diferentes no sistema: o admin, que pode aprovar acessos em outras máquinas, e o usuário que não pode aprovar, e o super admin; e o admin pode restringir telas para o usuário também. O super admin vai ter tudo, só que ele vai ter uma tela que ele recebe demandas para mudanças do sistema"; [ADR 0023](../architecture/adr/0023-tres-niveis-de-acesso-e-telas-por-pessoa.md)): papéis `superadmin`, `admin` e `financeiro` (Usuário). **Qualquer admin libera o computador do super admin** (Bruno: "essa posição de superadmin é temporária até o desenvolvimento do projeto"). Em **Acessos > Pessoas e telas**, o admin desmarca as telas que cada usuário não usa; o super admin faz o mesmo com os admins. A trava vale no servidor: a rota da tela bloqueada responde 403, e a busca geral tira os grupos dela. Não há tela para trocar nível: `make definir-nivel EMAIL=... NIVEL=superadmin`. A tela Demandas, só do super admin, está em [demandas](demandas.md).
- 2026-11-19 (**super admin sem liberação de computador**, Bruno: "o acesso de super admin não precisa ter liberação, ele é para o desenvolvedor, que no caso sou eu"): o super admin entra em qualquer navegador depois da senha e do autenticador, sem virar pedido em Acessos; `login_events` grava o motivo `browser_superadmin`. Admin e usuário continuam com a liberação ([ADR 0022](../architecture/adr/0022-navegador-liberado-por-cookie.md), [ADR 0023](../architecture/adr/0023-tres-niveis-de-acesso-e-telas-por-pessoa.md)).
- 2026-11-23 (**PF-53, quem é de fora não trava o login de outra pessoa**, Bruno): as 10 falhas/h passam a contar por e-mail e rede juntos. Antes, bastava saber o e-mail para deixar a pessoa uma hora sem entrar, mesmo com a senha certa. Um ataque de muitas redes fica no limite de 5 tentativas por minuto de cada IP, e a conta continua protegida pelo autenticador e pelo computador liberado.
