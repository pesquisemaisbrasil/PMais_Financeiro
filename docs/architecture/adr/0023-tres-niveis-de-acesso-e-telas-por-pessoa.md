# ADR 0023: Três níveis de acesso e telas bloqueadas por pessoa, barradas também no servidor

**Status:** Aceito (o super admin é provisório, até o fim do desenvolvimento)
**Data:** 19/11/2026

## Contexto

O Bruno pediu, em 19/11/2026, três níveis de acesso: o **admin**, que libera computadores e restringe telas dos usuários; o **usuário**, que não libera nem restringe; e o **super admin**, que tem tudo e mais uma tela que recebe as demandas de mudança do sistema ([demandas](../../specs/demandas.md)). Até aqui havia dois papéis, `admin` e `financeiro`, na coluna `users.role`, checados em `core/permissions.py`.

## Decisão

- **Os níveis são valores de `users.role`:** `superadmin`, `admin` e `financeiro` (mostrado como "Usuário"). Nada de tabela nova de papéis. `require_admin` aceita admin e super admin; `require_finance`, os três; `require_superadmin`, só o super admin. Os avisos para admins (pedido de navegador) também vão para o super admin.
- **O super admin não passa pela liberação do computador** ([ADR 0022](0022-navegador-liberado-por-cookie.md)): é o desenvolvedor, e o cargo é provisório (Bruno, 19/11/2026). Senha e autenticador continuam; `login_events` grava `browser_superadmin`. Admin e usuário seguem com a liberação, e ninguém libera o próprio computador.
- **Sem tela para trocar nível.** Conta nova com `make admin` ou `create_user.py --role`; conta que já existe com `make definir-nivel EMAIL=... NIVEL=...` (`scripts/definir_nivel.py`), que fica em `login_events`.
- **Telas bloqueadas por pessoa** em `users.blockedScreens` (códigos separados por vírgula): Contas a pagar, Contas a receber, Conferência bancária, Divergências, Relatório do projeto e Cadastros (todas as abas juntas). Admin muda as telas dos usuários; o super admin, também as dos admins; ninguém muda as próprias nem as de um super admin. A troca fica em `record_events` (`kind = userScreens`).
- **A trava vale no servidor**, não só no menu: `require_screen(tela)` é dependência das rotas de cada tela (no router inteiro quando ele é só daquela tela). Ficam abertas as rotas que várias telas usam: Início (`/home`), cadastros ativos (`/reference`, que saiu para um router à parte), leitura de cadastros, avisos e a busca. Em Cadastros, só o que grava é barrado. A busca geral tira os grupos das telas bloqueadas.
- Na tela, o menu esconde a tela bloqueada (e o grupo que ficar vazio), e o endereço mostra "Tela não liberada".

## Consequências

- Uma rota nova de uma tela precisa da trava. No router que é só da tela ela vem sozinha; nos compartilhados (`batches.shared`, `records`, `holidays`, `tax_rates`), é na rota.
- O menu de quem teve tela bloqueada muda quando a pessoa recarrega a página; o servidor já recusa na hora.
- O ADR 0022 continua para admin e usuário. O super admin fica de fora: quem tiver a senha e o autenticador dele entra de qualquer computador. Por isso a conta precisa sair (ou virar admin) quando o desenvolvimento acabar (Q61).
- Alternativas descartadas:
  - **permissões finas** (`user_permissions`, previstas no spec): mais do que o pedido, e ainda sem tela;
  - **esconder só no menu**: quem conhece o endereço ou chama a API veria os dados.
