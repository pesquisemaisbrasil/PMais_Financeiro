# Operação

Runbooks: `rodar-local.md`, `bootstrap.md` e `deploy.md` entram aqui. Comando, variável de ambiente ou script novo atualiza esta pasta e o `.env.example`.

Enquanto isso, o passo a passo para rodar localmente está na seção "Como rodar" do [README](../../README.md).

Versão de demonstração (as telas reais com dados fictícios, backend no navegador) no mesmo site do protótipo, em `teste/`: como gerar, publicar e o que conferir no Netlify: [publicar-a-versao-de-teste.md](publicar-a-versao-de-teste.md).

Testar a integração com o Connect de dev (conta de serviço, `backend/.env.connect` e o comando `scripts/connect_dev_check.py`): [testar-com-o-connect-dev.md](testar-com-o-connect-dev.md). O guia do João com os endereços e as rotas está em [connect-dev-integracao-financeiro.md](../connect-dev-integracao-financeiro.md).

## Cofre de arquivos (anexos das contas)

Variáveis do `backend/.env` (modelo em `backend/.env.example`). Sem elas, anexar responde "Os anexos não estão disponíveis agora" e o resto do sistema funciona.

| Variável | O que é |
|---|---|
| `FILES_ENDPOINT_URL` | Endereço do MinIO (local: `http://localhost:9010`). Em produção, `https://` |
| `FILES_BUCKET` | Bucket dos anexos (`financeiro-arquivos`, criado pelo `minio-init` do compose) |
| `FILES_ACCESS_KEY`, `FILES_SECRET_KEY` | Usuário do bucket. Local: o do compose. Em produção, um usuário restrito ao bucket |
| `FILES_MASTER_KEY` | 32 bytes em base64 que embrulham a chave de cada arquivo. **Permanente:** sem ela os arquivos guardados não abrem. Guarde com backup à parte do banco. Para gerar: `python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"` |
| `FILES_MODE` | Deixe vazio. `memory` é um cofre de mentira só para teste de tela e é recusado em produção |

Detalhes e limites: [ADR 0012](../architecture/adr/0012-anexos-das-contas-cifrados-por-arquivo.md).

| Variável | O que é |
|---|---|
| `CNPJ_LOOKUP_MODE` | Consulta de CNPJ no Cadastros. Padrão `brasilapi` (dados públicos da Receita, sem chave). `simulated` usa CNPJs inventados, só para teste de tela, e é recusado em produção. Qualquer outro valor desliga a consulta: o cadastro continua à mão |
| `HOLIDAYS_LOOKUP_MODE` | Busca dos feriados nacionais do ano no Cadastros → Feriados. Padrão `brasilapi` (dados públicos, sem chave, só o ano sai do sistema). `simulated` usa feriados inventados, só para teste de tela, e é recusado em produção. Qualquer outro valor desliga a busca: os feriados continuam cadastrados à mão. Veja o [ADR 0015](../architecture/adr/0015-feriados-por-cadastro-e-brasilapi.md) |

Só o CNPJ sai do sistema, pelo servidor: [ADR 0013](../architecture/adr/0013-consulta-de-cnpj-pela-brasilapi.md).
