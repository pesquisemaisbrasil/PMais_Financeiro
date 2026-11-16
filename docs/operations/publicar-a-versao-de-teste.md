# Versão de demonstração no mesmo site do protótipo

O botão **Abrir para teste de produção** do protótipo (menu, abaixo de "Restaurar dados de exemplo") abre `teste/`, no mesmo site, em outra aba. Ali fica **o Financeiro real, com as telas e as regras de verdade, só com dados fictícios**. Decisão do Bruno em 12/11/2026; o porquê e as alternativas estão no [ADR 0017](../architecture/adr/0017-demonstracao-com-o-backend-no-navegador.md).

## Como funciona

- O Netlify só serve páginas. Por isso o **backend (Python) roda dentro do navegador**, via Pyodide, num SQLite em memória cheio de dados fictícios. Não há API, banco, cofre de arquivos nem conta em outro provedor.
- É o mesmo código do repositório: toda tela ou regra nova aparece na demonstração quando o site é gerado de novo.
- O que a pessoa faz fica **só no navegador dela** (IndexedDB) e **sobrevive ao F5**: o banco e a sessão voltam como estavam. Cada navegador tem o seu, nada é compartilhado, e **dado real não entra aqui**. O botão **Restaurar dados de exemplo** (com confirmação) apaga tudo e recomeça.
- A tela de entrada já vem com o login fictício preenchido: é só clicar em **Entrar** (o código do autenticador também é fictício e entra sozinho). No site do protótipo (modo `/teste`), uma faixa roxa "Ambiente de teste com dados fictícios" fica no topo, com o link **Voltar ao protótipo**; num site só da demonstração, sem protótipo, não há faixa.
- O Connect é o **simulado**. O teste real com o Connect fica só na máquina do Bruno: [testar com o Connect de dev](testar-com-o-connect-dev.md).
- Nunca digite dado real, nem comprovante, planilha ou chave Pix reais: nada sai do navegador, mas a regra do projeto vale (AGENTS.md).

## Ver na sua máquina

Dentro de `frontend/` (o `DEMO_DIST_DIR` evita mexer na pasta `.next` do seu `next dev`; precisa de internet na primeira vez, para baixar o Pyodide e os pacotes, que ficam em `.demo-cache/`):

```bash
DEMO_DIST_DIR=.next-demo node scripts/build-demo.mjs      # gera o app e o que roda ao lado (alguns minutos)
node scripts/serve-demo.mjs .next-demo 3020               # serve em /teste, com a CSP do netlify.toml
```

Abra <http://localhost:3020/teste/>. Se só o backend ou os pacotes mudaram, `node scripts/build-demo.mjs --so-pacotes` refaz só isso, sem o `next build`.

Testes de tela da demonstração (sobem o servidor sozinhos; `DEMO_DIST_DIR` igual ao da geração):

```bash
DEMO_DIST_DIR=.next-demo npx playwright test -c playwright.demo.config.ts
```

## Publicar (Netlify)

O `netlify.toml` da raiz já tem tudo: roda `frontend/scripts/build-demo.mjs`, copia o resultado para `prototipo/financeiro/teste/` e publica a pasta `prototipo/financeiro`, e põe a política de segurança (CSP) em `/teste/*`. Cada deploy gera a demonstração do commit que o Netlify estiver lendo.

**O que conferir no painel do Netlify (o `prototipo/financeiro/README.md` fala em "Netlify Drop"):**

1. O site precisa estar **ligado ao repositório** no GitHub. Um site criado arrastando a pasta não lê o `netlify.toml`, e o `teste/` nunca seria gerado. Se estiver assim, ligue o site ao repositório (Site configuration → Build & deploy → Link repository) ou publique pela CLI.
2. **Qual branch é a de produção.** O trabalho está na `homolog`; a `main` só recebe com o João ([AGENTS.md](../../AGENTS.md)). Escolha a branch do site de teste de acordo.
3. **Netlify Forms:** depois do primeiro deploy com o `teste/`, confira que o formulário de validação do protótipo continua recebendo respostas.
4. Se o Node do Netlify reclamar, a versão está em `NODE_VERSION` (22) no `netlify.toml`.

**Pergunta ao João (Q47):** o código Python do backend (as regras de negócio, sem nenhum segredo) vai junto no site (`teste/demo/backend.json`) e fica baixável por quem abrir o endereço. Hoje o repositório do GitHub é **público** e já traz esse código, então a demonstração não expõe nada novo. Se o João quiser o código fechado, o repositório e o site precisam ficar fechados (senha do Netlify).

## Num site só da demonstração (por exemplo, o Netlify de uma pessoa)

Para publicar **só a demonstração**, sem tocar no site do protótipo: ela sai na **raiz** do site, sem link de volta ao protótipo (o aviso de dados fictícios continua).

### Com as solicitações da equipe (o jeito de publicar desde 16/11/2026)

O botão **Enviar solicitação** manda o pedido para uma **função do Netlify** do próprio site (`frontend/netlify/functions/solicitacoes.mts`), que guarda tudo no **Netlify Blobs**; o acesso **Desenvolvimento** lê com uma chave ([spec](../specs/solicitacoes.md), [ADR 0019](../architecture/adr/0019-solicitacoes-da-demonstracao-no-netlify.md)). O ZIP arrastado **não leva funções**, então este site passa a ser publicado pelo Netlify CLI:

1. **Uma vez:** `npx netlify-cli@27.16.1 login` (abre o navegador para você entrar no Netlify).
2. **Uma vez:** no site, em **Site configuration → Environment variables**, crie `SOLICITACOES_CHAVE` com uma chave longa que só você saiba. Ela nunca vai para o código, o chat, prints nem o git. Sem ela, as meninas conseguem enviar, mas a lista responde "A chave do desenvolvimento ainda não foi configurada no Netlify".
3. **A cada publicação**, dentro de `frontend/`:

```bash
NETLIFY_SITE=<nome-ou-ID-do-site> node scripts/deploy-demo.mjs
# só gerar e ver o comando, sem publicar:
DEMO_DEPLOY_DRY_RUN=1 NETLIFY_SITE=<nome-ou-ID-do-site> node scripts/deploy-demo.mjs
```

O script gera o site em `frontend/out`, grava o `_headers` e chama `netlify deploy --prod --no-build` com a pasta e a função, rodando fora do repositório (o `netlify.toml` da raiz é do site do protótipo e não vale aqui). Para ver as solicitações: na tela de entrada, aba **Desenvolvimento**, digite a chave; no menu aparece **Solicitações**.

### Só as telas, sem as solicitações (ZIP)

Dentro de `frontend/`:

```bash
node scripts/package-demo.mjs
# ou, escolhendo onde gravar o ZIP:
DEMO_ZIP=C:/caminho/netlify-upload.zip node scripts/package-demo.mjs
```

O comando gera a demonstração e escreve um **ZIP** (por padrão em `frontend/.demo-cache/netlify-upload.zip`) com o `_headers` da política de segurança. No Netlify:

- **Site novo:** Add new site → **Upload your project files** → "browse files to upload" e o ZIP.
- **Atualizar o site que já existe:** abra o site → **Deploys** → arraste o ZIP na área de envio. O endereço continua o mesmo.

Se o Netlify disser "We're having some trouble connecting you", é bloqueador de anúncios ou extensão do navegador: use uma janela anônima. `DEMO_PROTOTYPE_URL=https://endereço` liga a faixa roxa do topo ("Ambiente de teste com dados fictícios", com o link "Voltar ao protótipo"); sem ele, o site da demonstração não tem faixa. Cada atualização exige gerar e arrastar de novo (ou ligar um site ao repositório com uma configuração própria). **Publicado por ZIP, o botão Enviar solicitação não funciona** (a função não vai junto): use o `deploy-demo.mjs` acima.

## Limites

- O trabalho fica guardado **no navegador de cada pessoa**: não é compartilhado, e limpar os dados do site ou trocar de navegador começa do zero. **Quando o app muda a estrutura das tabelas, a demonstração recomeça do zero** e quem testava perde o que tinha (avise antes de subir uma versão nova). Duas abas abertas ao mesmo tempo guardam por cima uma da outra.
- Primeira abertura: alguns segundos com a tela "Preparando a demonstração" (o Python liga e os dados são criados); depois o navegador guarda os arquivos (a pasta gerada tem cerca de 26 MB).
- Comprovante em PDF e planilha de importação de verdade não fazem parte (não há arquivo real); o resto das telas funciona, inclusive baixa, conciliação do extrato, fechamento do mês e exportação para Excel.
- A tela de entrada tem **dois acessos**: **Financeiro** (o das meninas, já preenchido) e **Desenvolvimento** (pede a chave do Netlify e mostra a tela **Solicitações**). Não há Google nem Microsoft na demonstração.
- As **solicitações** são a única coisa que sai do navegador: vão para o Netlify Blobs do site (dado fora da empresa). Por isso o print e a descrição só podem ter **dados de exemplo**. O limite é de 500 solicitações guardadas e 4 MB por imagem; apagar é pelo painel do Netlify (Blobs, store `solicitacoes`) até a regra de guarda do DPO (Q50).
- Python 3.13 e SQLAlchemy 2.0 no navegador, contra 3.11 e 1.4 na produção: a CI roda o teste de tela da demonstração para pegar diferença.

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| "Preparando a demonstração" não sai | Navegador sem WebAssembly ou com a política de conteúdo diferente da do `netlify.toml`; abra o console (F12) e procure o erro. A tela mostra "Tentar de novo" quando o Python falha ao ligar |
| `/teste/` mostra o aviso "este endereço ainda não existe" | O deploy não gerou o `teste/`: o site não está ligado ao repositório ou o build falhou (veja o log do deploy) |
| Pedidos 404 em `__next.…txt` no console | Pré-carregamentos que o Next pede e a exportação estática não gera; não afetam o uso |
| O build local falha ao baixar pacotes | Sem internet ou hash diferente do esperado em `frontend/scripts/demo-packages.json` (o script para de propósito) |
| "Enviar solicitação" diz "Não encontrado" ou "O serviço está indisponível" | O site foi publicado por ZIP, sem a função: publique com `scripts/deploy-demo.mjs` |
| Aba Desenvolvimento: "A chave do desenvolvimento ainda não foi configurada no Netlify" | Falta `SOLICITACOES_CHAVE` nas variáveis do site; depois de criar, publique de novo |
| Aba Desenvolvimento: "Chave errada." | A chave digitada não é a do Netlify (diferença de maiúscula ou espaço conta) |
