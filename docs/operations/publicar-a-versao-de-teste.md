# Versão de demonstração no mesmo site do protótipo

O botão **Abrir para teste de produção** do protótipo (menu, abaixo de "Restaurar dados de exemplo") abre `teste/`, no mesmo site, em outra aba. Ali fica **o Financeiro real, com as telas e as regras de verdade, só com dados fictícios**. Decisão do Bruno em 12/11/2026; o porquê e as alternativas estão no [ADR 0017](../architecture/adr/0017-demonstracao-com-o-backend-no-navegador.md).

## Como funciona

- O Netlify só serve páginas. Por isso o **backend (Python) roda dentro do navegador**, via Pyodide, num SQLite em memória cheio de dados fictícios. Não há API, banco, cofre de arquivos nem conta em outro provedor.
- É o mesmo código do repositório: toda tela ou regra nova aparece na demonstração quando o site é gerado de novo.
- O que a pessoa faz fica **só no navegador dela**. **Recarregar a página volta aos dados de exemplo** (e pede para entrar de novo); o botão **Restaurar dados de exemplo** faz o mesmo de propósito. Navegue pelo menu: abrir um endereço direto também recarrega.
- A tela de entrada mostra o e-mail, a senha e o código fictícios, com o botão **Entrar na demonstração**. A faixa roxa "Ambiente de teste com dados fictícios" fica no topo, com o link **Voltar ao protótipo**.
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

**Antes de publicar de verdade, decisão do João (Q47):** o código Python do backend (as regras de negócio, sem nenhum segredo) vai junto no site (`teste/demo/backend.json`) e fica baixável por quem abrir o endereço. Confirmar se o site é fechado ao público (senha do Netlify) ou se isso é aceitável.

## Limites

- Recarregar a página volta aos dados de exemplo e derruba a sessão (guardar no navegador entre visitas é melhoria futura).
- Primeira abertura: alguns segundos com a tela "Preparando a demonstração" (o Python liga e os dados são criados); depois o navegador guarda os arquivos (a pasta gerada tem cerca de 26 MB).
- Comprovante em PDF e planilha de importação de verdade não fazem parte (não há arquivo real); o resto das telas funciona, inclusive baixa, conciliação do extrato, fechamento do mês e exportação para Excel.
- Login com Google e Microsoft não aparece na demonstração.
- Python 3.13 e SQLAlchemy 2.0 no navegador, contra 3.11 e 1.4 na produção: a CI roda o teste de tela da demonstração para pegar diferença.

## Solução de problemas

| Sintoma | Causa provável |
|---|---|
| "Preparando a demonstração" não sai | Navegador sem WebAssembly ou com a política de conteúdo diferente da do `netlify.toml`; abra o console (F12) e procure o erro. A tela mostra "Tentar de novo" quando o Python falha ao ligar |
| `/teste/` mostra o aviso "este endereço ainda não existe" | O deploy não gerou o `teste/`: o site não está ligado ao repositório ou o build falhou (veja o log do deploy) |
| Pedidos 404 em `__next.…txt` no console | Pré-carregamentos que o Next pede e a exportação estática não gera; não afetam o uso |
| O build local falha ao baixar pacotes | Sem internet ou hash diferente do esperado em `frontend/scripts/demo-packages.json` (o script para de propósito) |
