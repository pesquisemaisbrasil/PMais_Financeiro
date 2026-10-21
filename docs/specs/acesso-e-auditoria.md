# Spec: Acesso e auditoria

Contrato de login, sessão, MFA, papéis, permissões finas e trilha de auditoria do Financeiro. Os detalhes técnicos estão em [handoff/06](../handoff/06-seguranca-e-lgpd.md); este spec diz o que precisa acontecer e como verificar.

## Comportamento

- **Login** por **e-mail + senha** (`POST /auth/token`). O usuário interno não precisa de CPF, e o Financeiro não guarda CPF de ninguém.
- **MFA (TOTP) obrigatório** para todos os papéis (`admin` e `financeiro`):
  - no primeiro login, a pessoa cadastra o MFA antes de qualquer outra tela;
  - `POST /auth/token` devolve um token parcial (`mfa_pending`, 5 min);
  - `POST /auth/token/mfa` com o código de 6 dígitos emite o par de tokens;
  - códigos de recuperação de uso único.
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
   - `/auth/token`: 5/min por IP e 10/h por e-mail;
   - `/auth/token/mfa`: 5/min;
   - 10 erros seguidos de MFA bloqueiam temporariamente.
10. Headers de segurança e `/docs` e `/openapi.json` desligados em produção, desde o primeiro commit.
11. Gravar o último login (data, IP, user-agent).

## Casos negados

| Situação | HTTP | `detail` |
|---|---|---|
| Sem token ou token expirado | 401 | (padrão do login) |
| E-mail ou senha errados, ou conta desativada | 401 | E-mail ou senha incorretos |
| Código MFA errado ou token parcial vencido | 401 | Código de verificação inválido |
| Excesso de tentativas | 429 | Muitas tentativas — aguarde alguns minutos |
| Papel sem a permissão da ação | 403 | Seu perfil não permite essa ação |
| Rebaixar ou desativar o último admin | 409 | Não é possível remover o último administrador |
| Trocar a senha sem a senha atual correta | 422 | A senha atual não confere |
| Senha fraca | 422 | (validação, mesma regra do Connect) |

## Critérios de aceite

- [ ] O primeiro login de um usuário novo cai no cadastro do MFA e não chega a nenhuma outra tela antes disso.
- [ ] Gerar a planilha com chave completa pede o código MFA de novo.
- [ ] Desativar um usuário derruba a sessão dele no próximo refresh.
- [ ] Reapresentar um refresh já usado revoga a família inteira.
- [ ] Rebaixar o único admin é recusado com 409.
- [ ] A tela Auditoria mostra criação, confirmação e cancelamento de lote e cada download de planilha, com autor.
- [ ] Teste de schema: nenhuma coluna de CPF nem de chave Pix em claro no banco do Financeiro.
- [ ] Toda rota tem teste sem token, com token expirado, com papel sem permissão e com conta inativa.

## Onde está no código

- Destino: `backend/api/auth.py`, `backend/services/auth.py`, `backend/core/security.py`, `backend/core/permissions.py`, `backend/models/user.py`, `backend/services/audit.py`, `backend/api/audit.py`
- Frontend: `frontend/src/app/login/`, `frontend/src/app/admin/auditoria/`, `RequireAuth`
- Testes: `backend/tests/test_auth.py`, `test_mfa.py`, `test_permissions.py`, `test_audit.py`
- Referência no Connect: `api/auth.py`, `services/auth.py`, `core/permissions.py`, `services/audit.py`

## Ajustes

- 2026-10-21: login por e-mail, como manda [handoff/06 §1](../handoff/06-seguranca-e-lgpd.md). O [handoff/04](../handoff/04-banco-de-dados.md) diz para copiar os models do Connect com login por CPF. Conflito registrado em [perguntas-abertas](../planning/perguntas-abertas.md) (Q10).
- 2026-10-21: segregação de funções (quem envia o lote não confirma a baixa acima de um valor) fica como pergunta aberta Q8 até o PO definir o valor.
