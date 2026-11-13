# ADR 0017: Versão de demonstração com o backend rodando no navegador (Pyodide)

**Status:** Aceito (provisório: depende da resposta do João sobre o código do backend ficar baixável, pergunta Q47)
**Data:** 12/11/2026

## Contexto

O site do protótipo (HTML puro, dados fictícios, no Netlify) tem o botão **Abrir para teste de produção**, que abre `teste/`. Ele precisa levar às **telas reais** do Financeiro, para o João e a Vivi verem o sistema **como ele realmente está ficando**, e não uma cópia que fica para trás (o problema do protótipo).

O Netlify só serve páginas: a API (Python) e o banco do Financeiro não rodam lá. O Bruno decidiu em 12/11/2026 **não hospedar** API e banco (custo, contas e chaves em outro provedor, risco de dado real) e **manter só na máquina dele** o teste real com o Connect (`backend/.env.connect` + `scripts/connect_dev_check.py`).

## Decisão

O **backend real roda dentro do navegador**, em Python (WebAssembly) com o **Pyodide**, num Web Worker, sobre um SQLite em memória alimentado só com dados fictícios. O app é exportado como site estático e publicado em `/teste` do mesmo site do protótipo.

- **Mesmo código:** as telas e o backend são os do repositório. Uma tela ou regra nova aparece na demonstração só de gerar o app de novo.
- **Telas:** `NEXT_PUBLIC_DEMO=1` liga `output: "export"`, o prefixo `/teste` (`NEXT_PUBLIC_BASE_PATH`) e troca o único `fetch` do app (`frontend/src/lib/api.ts`) por `frontend/src/lib/demo/client.ts`, que fala com `frontend/scripts/demo-worker.js`. Sem a variável (desenvolvimento e produção), nada muda.
- **Backend no navegador:** `backend/demo_runtime.py` define chaves fictícias, cria as tabelas e roda `backend/scripts/seed_demonstracao.py`, que cria usuário, baixas, recebimento, extratos conciliados, um mês fechado, um feriado e uma segunda agenda de incentivos, **pelos próprios serviços** (baixa, conciliação, fechamento), então regras e histórico são os de verdade. As chamadas viram um app ASGI em memória (`httpx.ASGITransport`), um pedido por vez.
- **Sessão:** o cookie de renovação do backend (HttpOnly, `/auth`) vira uma marca no `localStorage`; o login com senha e código do autenticador é o real, mas na tela de entrada ele já vem preenchido (e-mail e senha fictícios) e o **Entrar** passa direto pelo código, que o próprio navegador gera.
- **Pacotes:** as bibliotecas compiladas (SQLAlchemy, pydantic, cryptography, bcrypt…) são as do Pyodide **0.29.5**, e as só de Python (FastAPI e Starlette nas versões do backend, openpyxl, pypdf…) vêm do PyPI com **versão e hash fixos** (`frontend/scripts/demo-packages.json`). Tudo é copiado para dentro do site na geração (`frontend/scripts/build-demo.mjs`): nada é baixado de terceiros quando alguém abre a demonstração.
- **Segurança:** a política de conteúdo vai no `netlify.toml` (a exportação estática não tem `proxy.ts`): `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` (o último é o que o WebAssembly exige) e `connect-src 'self'`. Um teste de tela confere que **nenhum pedido sai do navegador**. Só dado fictício: usuário `.invalid`, nenhuma chave Pix, CPF ou documento real.

### Mudanças no backend por causa disso

- **bcrypt direto, sem `passlib`** (`backend/core/security.py`): o `passlib` está sem manutenção e quebra com o bcrypt 5. O hash é o mesmo (as senhas já gravadas continuam valendo), a senha continua cortada em 72 bytes e recusada com byte nulo ou acima de 4096 bytes.
- **SQLite em memória numa conexão só** (`backend/db/connection.py`): sem isso cada thread via um banco vazio.
- Os ajustes que só existem no navegador (rotas síncronas sem thread, relógio do limite de requisições) ficam em `demo_runtime.py`, ativos só quando o Python é o do Pyodide.

## Alternativas consideradas

- **Hospedar API e banco** (Render, Fly.io, túnel da máquina do Bruno): descartado pelo Bruno; custo, contas, chaves e risco de dado real. O túnel só funciona com o computador ligado.
- **Simulador das rotas em JavaScript:** o frontend usa cerca de 65 rotas, com regras grandes (lista com filtros, indicadores e abas, conciliação, fechamento, recorrência, planilhas); seriam milhares de linhas que **ficam para trás a cada recurso novo**.
- **Pyodide 314 (Python 3.14):** descartado. O `cryptography` 47 dele aborta ao ser importado (erro fatal do Rust); o 0.29.5 traz o 46.0.3, que funciona.
- **Tela só de leitura com respostas gravadas:** não deixa testar baixa, conciliação nem fechamento.

## Consequências

- O João e a Vivi usam as telas reais sem instalar nada e sem servidor, e o que fazem fica só no navegador de cada um.
- A pasta gerada tem cerca de 26 MB (núcleo do Pyodide, bibliotecas, pacotes puros, telas e o backend). A primeira abertura leva alguns segundos (o Python liga e os dados são criados); depois o navegador guarda os arquivos.
- **O estado volta ao inicial ao recarregar a página** e a sessão cai (guardar o banco no IndexedDB fica como melhoria). O botão **Restaurar dados de exemplo** faz o mesmo de propósito.
- **O código Python do backend fica baixável** por quem abrir o site (`demo/backend.json`; sem segredo, mas são as regras de negócio). Hoje o repositório do GitHub é **público** e já traz esse código, então a demonstração não expõe nada novo; se o João decidir fechar o repositório, o site também precisa ficar fechado. Pergunta **Q47**.
- A demonstração roda em Python 3.13 e SQLAlchemy 2.0, e a produção em 3.11 e SQLAlchemy 1.4: a suíte do backend foi rodada nas versões novas (972 testes verdes) e o teste de tela da demonstração na CI cobre o resto. Quem escrever código que só funciona na versão antiga vê o erro lá.
- **A demonstração não testa o Connect:** o Connect é o simulado. O teste real continua na máquina do Bruno ([testar com o Connect de dev](../../operations/testar-com-o-connect-dev.md)).
- Onde está: `backend/demo_runtime.py`, `backend/scripts/seed_demonstracao.py`, `frontend/src/lib/demo/`, `frontend/src/components/Demo.tsx`, `frontend/scripts/demo-worker.js`, `frontend/scripts/build-demo.mjs` e `serve-demo.mjs`, `netlify.toml`, `frontend/e2e-demo/`. Como gerar e publicar: [publicar a versão de teste](../../operations/publicar-a-versao-de-teste.md).
