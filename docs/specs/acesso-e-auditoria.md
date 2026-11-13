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
- **Papéis:**
  - `financeiro`: usuário principal;
  - `admin`: tudo, mais usuários, contas de serviço e a tela "Auditoria".
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
   - `/auth/token`: 5/min por IP e 10 falhas/h por e-mail, contadas em `login_events` para valerem depois de um restart e tratarem igual e-mail com e sem conta;
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

## Onde está no código

- Destino: `backend/api/auth.py`, `backend/services/auth.py`, `backend/services/mfa.py`, `backend/services/sso.py`, `backend/core/crypto.py`, `backend/core/security.py`, `backend/core/permissions.py`, `backend/models/user.py`, `backend/services/audit.py`, `backend/api/audit.py`
- Frontend: `frontend/src/app/login/`, `frontend/src/app/admin/auditoria/`, `RequireAuth`
- Testes: `backend/tests/test_auth.py`, `test_mfa.py`, `test_permissions.py`, `test_audit.py`
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
