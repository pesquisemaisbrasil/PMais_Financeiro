# ADR 0022: Navegador liberado por cookie, e não por IP

**Status:** Aceito (prazo de guarda dos registros com o DPO: Q57)
**Data:** 17/11/2026

## Contexto

O Bruno pediu, em 17/11/2026, um passo a mais no login, inspirado no SurveyMonkey: a conta fica presa às máquinas autorizadas. O primeiro acesso, no cadastro do autenticador, libera aquela máquina; outra máquina só entra se uma pessoa de nível maior liberar. Hoje há dois papéis, **financeiro** e **admin**: o de nível maior é o admin.

O login já tem senha e autenticador (TOTP), com a sessão aberta em `_start_session` (`backend/api/auth.py`). O servidor do escritório fica atrás do Caddy, que repassa o IP de cada computador na rede local. O projeto **nunca guarda o IP completo** (`core/net.mask_ip`, `login_events.ipMasked`).

## Decisão

- **A máquina é o navegador liberado.** Ao liberar, a API grava no navegador um cookie aleatório (`financeiro_navegador`, 32 bytes, `httpOnly`, `Secure` como o de refresh, `path=/auth`, 400 dias). No banco fica só o SHA-256 dele (`trusted_browsers.tokenHash`), como o refresh token. O nome do navegador ("Chrome no Windows") e o IP mascarado ficam só para o admin reconhecer o computador; o IP não decide nada.
- `SameSite=Lax`, e não `Strict`: o cookie precisa voltar no retorno do login por Google ou Microsoft, que vem de outro site. Ele sozinho não abre sessão: só vale depois da senha e do autenticador.
- **A regra roda depois do autenticador**, antes de abrir a sessão, em `verify_mfa`, `confirm_mfa_setup` e no retorno do SSO (`services/browsers.check`):
  - navegador liberado → entra;
  - a conta nunca teve navegador → este é o primeiro e é liberado na hora (no cadastro do autenticador ou, nas contas que já existiam, no primeiro login depois da entrega);
  - senão → vira pedido (ou continua pedido, ou recusado), sem sessão, com **403** e a mensagem em pt-BR; os outros admins recebem aviso no sino.
- **Vale para todos.** Admin não libera o próprio computador (409): quem roubou a senha e o celular de um admin não se libera sozinho. Sem outro admin, `scripts/liberar_navegador.py` libera pelo servidor.
- **Revogar** derruba as sessões da conta, como o reset do autenticador. Um navegador revogado que tenta entrar volta a ser pedido, e a conta que já teve qualquer navegador nunca ganha outro sozinha.
- **Interruptor** `DEVICE_APPROVAL_ENABLED`, ligado por padrão. A demonstração (backend no navegador, [ADR 0017](0017-demonstracao-com-o-backend-no-navegador.md)) desliga: lá não há outro navegador nem admin para liberar. Os testes do backend desligam por padrão (eles limpam os cookies para simular uma sessão nova) e `tests/test_navegador_liberado.py` liga.

## Consequências

- Limpar os dados do navegador, trocar de navegador ou usar janela anônima pede nova liberação. A tela de espera explica isso, e o admin libera em **Acessos**.
- Dado novo da equipe: navegador, IP mascarado e datas de pedido, decisão e último uso (`trusted_browsers`). Inventário e ROPA atualizados; o prazo de guarda fica com o DPO (Q57). Nada é apagado: a role da app não tem `DELETE` na tabela.
- `login_events` ganha os motivos `browser_first`, `browser_pending`, `browser_refused` e `browser_server_approved`.
- Alternativas descartadas:
  - **trava por IP**, como o SurveyMonkey: o roteador do escritório troca o IP dos computadores (DHCP), e a pessoa seria barrada sem motivo; exigiria IP fixo para cada máquina e guardar o IP completo, contra a regra do projeto;
  - **navegador e IP juntos**: herda o problema do IP;
  - **código de liberação** que o admin passa para a pessoa: exige falar com o admin a cada vez. Fica para depois, se o pedido pela tela não bastar.
