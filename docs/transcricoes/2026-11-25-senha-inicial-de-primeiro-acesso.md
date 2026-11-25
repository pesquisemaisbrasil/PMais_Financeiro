# 25/11/2026 · Contas da equipe com senha inicial de primeiro acesso

Pedido do Bruno, na conversa com o agente. Fala bruta, sem edição, com **duas exceções**: os e-mails das pessoas e a senha inicial ficaram de fora. O e-mail é dado pessoal, a senha é segredo, e nenhum dos dois vai para o repositório.

## O que o Bruno escreveu

(a lista dos 5 e-mails da equipe: 2 marcados "usuarios" e 3 marcados "admin")

> Claude eu quero que você crie os usuarios para esses e-mils que eu mandei e eu quero que para todos eles coloque essa senha inicial: (a senha inicial) e apenas para o primeiro acesso depois eu peça para eles trocarem par auma propria e para eles anotarem, depois disso ele vai para as opções normais de cadatsro que nós ja temos que são essas:

(e colou o resumo do login que o agente tinha feito: e-mail e senha, o código do autenticador no primeiro login com os 10 códigos de recuperação, e o primeiro computador de cada conta liberado sozinho)

## A escolha dele, na pergunta do agente

A senha inicial que ele mandou não tinha letra maiúscula, e a regra de força do Financeiro (a mesma do Connect) a recusaria. Ele escolheu **pôr o P maiúsculo** em vez de abrir uma exceção na regra.

## Como ficou

- **Contas:** as 5 contas no banco local, com o nível Usuário (`financeiro`) para as 2 marcadas "usuarios" e `admin` para as outras 3. O nome de cada uma veio do e-mail. Elas vão no pacote do banco para o servidor ([ADR 0026](../architecture/adr/0026-banco-local-no-servidor-e-atualizacao-as-22h.md)).
- **Primeiro login:** depois da senha inicial, a tela "Crie a sua senha" pede a senha nova e diz para anotá-la; depois, o cadastro do autenticador, como antes.
- **Onde está:** spec [acesso-e-auditoria](../specs/acesso-e-auditoria.md) (Ajustes de 25/11).
