# ADR 0019: Solicitações da demonstração numa função do Netlify, com Netlify Blobs e chave do desenvolvimento

**Status:** Aceito, provisório (prazo de guarda com o DPO: Q50)
**Data:** 16/11/2026

## Contexto

A equipe do financeiro vai usar a **versão de demonstração** ([ADR 0017](0017-demonstracao-com-o-backend-no-navegador.md)) para testar o sistema, e o Bruno quer receber dela pedidos de **correção de bug**, **correção de regra** e **melhoria**, cada um com descrição e um print, numa tela só dele.

A demonstração roda **inteira no navegador de cada pessoa**: não há servidor, e o que uma pessoa faz fica só no computador dela. Um pedido guardado ali nunca chegaria ao Bruno. O site é estático e era publicado arrastando um ZIP no Netlify.

Caminhos considerados (o Bruno escolheu em 16/11/2026, junto com "só dados fictícios"):

- **Função do Netlify + Netlify Blobs**: um código pequeno no próprio site guarda texto e imagem; a tela do Bruno lê com uma chave.
- **Formulário do Netlify**: sem código no servidor, mas os envios só aparecem no painel do Netlify, e o plano grátis tem cerca de 100 envios e 10 MB de arquivos por mês.
- **Tarefa no Jira**: cada pedido vira tarefa no PF; precisa da mesma função e de um token do Jira guardado no Netlify.

## Decisão

- **Função do Netlify** (`frontend/netlify/functions/solicitacoes.mts`) em `/api/solicitacoes`, no mesmo endereço do site: a política de segurança (`connect-src 'self'`) não muda, e nada vai para outro domínio. Guarda no **Netlify Blobs** do site (store `solicitacoes`): o texto em `solicitacao/<id>` e a imagem em `imagem/<id>`.
- A **regra** fica num módulo à parte (`frontend/netlify/solicitacoes.mjs`), com o armazenamento recebido de fora. A função usa o Netlify Blobs; o servidor de teste local (`scripts/serve-demo.mjs`) e os testes usam memória. Assim a mesma regra é testada no Vitest e no E2E da demonstração sem Netlify.
- **Enviar é aberto**; **ler pede a chave** `SOLICITACOES_CHAVE` (variável do site no Netlify, nunca no código), comparada pelo resumo SHA-256 em tempo constante. A conta "Desenvolvimento" da demonstração é só a porta de entrada da tela: a senha dela não protege nada, porque o código roda no navegador. Quem protege a lista e as imagens é a chave.
- **Limites** para um endereço aberto: imagem até 4 MB (a função recebe no máximo 6 MB, e a imagem chega codificada), conferida pelos primeiros bytes (PNG, JPG, WEBP ou GIF; nada de SVG), descrição até 4.000 caracteres e no máximo 500 solicitações guardadas. A imagem volta com o tipo conferido e `X-Content-Type-Options: nosniff`, e a tela a mostra por um endereço `blob:`, que a CSP já permite.
- **Publicação**: o ZIP arrastado não leva funções, então este site passa a ser publicado por `frontend/scripts/deploy-demo.mjs` (Netlify CLI 27.16.1, versão fixa, rodando fora do repositório para o `netlify.toml` do protótipo não valer aqui). O ZIP continua possível, sem as solicitações.
- Biblioteca nova: **`@netlify/blobs` 11.1.7** (MIT, do próprio Netlify), só para a função (devDependency: não entra na imagem do frontend).

## Consequências

- **Dado novo fora da empresa**: texto livre e prints vão para o Netlify (operador, fora do Brasil). Inventário e ROPA (FIN-S1) atualizados; prazo de guarda e quem mais lê ficam com o DPO (Q50). A regra "só dados de exemplo" vale para o print e a descrição, e o modal lembra disso.
- A demonstração deixa de ser 100% no navegador: o teste "nada sai do navegador" continua valendo, porque o pedido vai para o próprio site.
- O Bruno precisa, uma vez, entrar no Netlify pelo CLI e criar a variável `SOLICITACOES_CHAVE`. Mudou a chave: publique de novo.
- `shortcut`: sem situação do pedido (em análise, resolvido), sem apagar pela tela e sem nome por pessoa (as meninas usam a mesma conta). Evoluir quando a lista crescer, ou levar o recurso para o backend de verdade quando o sistema estiver em produção.
- Alternativas descartadas: o formulário do Netlify (sem tela no sistema e com cota baixa de arquivos), o Jira (mais uma credencial guardada e tarefa criada sem triagem) e guardar no navegador (nunca chegaria ao Bruno).
