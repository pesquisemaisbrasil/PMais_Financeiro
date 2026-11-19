# ADR 0021: Projeto cadastrado no Financeiro, provisório, com a unidade e o centro de custo do lançamento

**Status:** Aceito, provisório (até o Connect mandar os projetos; pergunta ao João: Q52)
**Data:** 17/11/2026

## Contexto

Nos testes com o financeiro de 16/11 ([registro](../../transcricoes/2026-11-16-testes-em-conjunto-com-o-financeiro.md), A2 e A22), a Bruna mostrou como lança no sistema atual: ao cadastrar o projeto, ela já informa a **unidade**, o **centro de custo** e o **cliente**, e o lançamento puxa a unidade e o centro sozinhos. "A unidade e o centro de custo daquele projeto nunca vão mudar." Ela também pediu que **toda conta tenha projeto**, até a administrativa (A3).

Até aqui, a [D4 de 21/10](../../transcricoes/2026-10-21-decisoes-pos-reuniao.md) dizia que o projeto fica no Connect e que o Financeiro não tem projeto próprio. Mas o Connect ainda não manda os projetos (PF-6), e o piloto começa antes disso: em produção não havia como criar um projeto no Financeiro. Na reunião, o Bruno disse que ia liberar o cadastro por enquanto, para não atrasar o financeiro; o João lembrou que, em tese, eles viriam do Connect, e a Bruna apontou o risco de "criar dois". Em 17/11 o Bruno confirmou: fazer agora, como provisório.

Há duas tabelas de projeto: `projects` (o projeto em que a conta é lançada, com o código que o financeiro usa, como 1804) e `project_refs` (o espelho do projeto do Connect, usado no envio de comprovantes). Nada liga uma à outra, e o envio de comprovantes pergunta o projeto do Connect toda vez (A18). **Ligar as duas fica para o futuro** (decisão do Bruno em 17/11/2026), junto com o projeto vindo do Connect.

## Decisão

- **Cadastros > Projetos** ganha **Novo projeto** e a edição completa: número (único, só letras, números, ponto e traço), nome, **cliente**, **unidade** e **centro de custo** padrão e o tipo e incentivo que já existiam (`POST /projects`, `PATCH /projects/{id}`). Cada mudança fica no histórico dos cadastros.
- `projects` ganha três colunas opcionais (migration `e1a3c5e7f9b2`): `customer_id`, `unit_id` e `cost_center_id` (`RESTRICT`: cadastro usado como padrão de projeto não é excluído, só inativado).
- Na **Nova conta a pagar**, escolher o projeto **preenche a unidade e o centro de custo** dele; a pessoa ainda pode trocar. Mudar o padrão do projeto **não muda as contas já lançadas**.
- **Toda conta tem projeto**: a criação pela tela e pela API recusa conta sem projeto (422). A importação do relatório do sistema antigo continua aceitando conta sem projeto, como hoje, porque o sistema antigo tem contas assim.
- O **envio de comprovantes** continua perguntando o projeto do Connect. **Atualizar do Connect** continua no mesmo lugar e traz essa lista (`project_refs`).

## Consequências

- Contraria a D4 enquanto valer. Quando o Connect mandar os projetos, eles devem entrar em `projects` pelo sincronismo, com o mesmo código, e o cadastro manual sai ou fica só para os administrativos: decisão do João (Q52).
- Risco de **projeto em dobro** (o mesmo projeto criado aqui e depois vindo do Connect com outro código). Mitigação, por ora: o número é único. A ligação com o projeto do Connect, quando vier, resolve.
- Sem dado pessoal novo: o projeto guarda ids de cadastros. O inventário de dados registra as colunas.
- Alternativas descartadas: esperar o Connect (o piloto ficaria sem projeto em produção) e guardar unidade e centro só na conta, sem padrão no projeto (a Bruna escolheria os dois a cada lançamento, que é o que ela pediu para não fazer).
