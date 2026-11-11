# P+ Financeiro

Sistema financeiro da Pesquise+. É separado do **P+ Connect** e substitui o SGE4B, em módulos:

1. pagamento de entrevistadores;
2. cadastros e migração;
3. contas a pagar e a receber;
4. projetos, orçamento e provisionamento;
5. folha de campo e pagamento em lote;
6. conciliação bancária;
7. relatórios e fluxo de caixa.

**Estado:** o código começou: login por e-mail e senha com MFA em `backend/` e `frontend/`. O restante segue a fase 0 do [plano](docs/handoff/11-plano-de-implementacao.md).

## Comece por aqui

- [docs/README.md](docs/README.md): índice da documentação.
- [docs/specs/visao-geral.md](docs/specs/visao-geral.md): o que o sistema faz, a fronteira com o Connect e as regras de produto.
- [docs/planning/roadmap.md](docs/planning/roadmap.md): ordem dos módulos.
- [docs/planning/perguntas-abertas.md](docs/planning/perguntas-abertas.md): o que ainda precisa de decisão.

## Como rodar

Pede Docker, Python 3.12 (o CI usará 3.11) e Node 22. Os comandos são para Git Bash no Windows.

```bash
docker compose up -d --wait db

cd backend
py -3.12 -m venv .venv    # ou: uv venv --python 3.12 .venv
.venv/Scripts/python -m pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env        # gere SECRET_KEY e ENCRYPTION_KEY: a API não sobe com as de exemplo
.venv/Scripts/alembic upgrade head
.venv/Scripts/python scripts/seed_demo.py   # opcional: contas fictícias para ver o Início e o Contas a pagar
.venv/Scripts/python scripts/create_user.py --email voce@pesquisemais.com.br --name "Seu nome" --role admin
.venv/Scripts/python -m uvicorn main:app --port 8010
```

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Para subir tudo em containers (`backend/.env` precisa existir), com a API em `:8010` e o front em `:3010`:

```bash
docker compose up -d --build --wait
```

O banco tem duas roles: `financeiro_migrator`, dona das tabelas, e `financeiro_app`, que só lê e grava. Um volume criado antes delas continua funcionando com o `postgres` do seu `.env`. Para passar a usar as roles:

```bash
docker compose exec -T db psql -U postgres -d financeiro < docker/postgres/roles.sql
```

Depois, troque `DATABASE_URL` e `MIGRATION_DATABASE_URL` no `backend/.env`, como no `.env.example`.

Abra `http://localhost:3010`. No primeiro login, o sistema pede para cadastrar um app autenticador. O roteiro de teste está no [roadmap](docs/planning/roadmap.md#como-testar).

Quem perdeu o celular e os códigos de recuperação: `.venv/Scripts/python scripts/reset_mfa.py --email voce@pesquisemais.com.br`.

## Login com Google e Microsoft

Os botões já aparecem na tela. Para funcionarem de verdade, registre o app em cada provedor e coloque as chaves no `backend/.env`:

| Provedor | Onde registrar | Variáveis |
|---|---|---|
| Google | Google Cloud Console → APIs e serviços → Credenciais → ID do cliente OAuth, tipo Aplicativo da Web | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Microsoft | Microsoft Entra → Registros de aplicativo, com contas somente desta organização | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` |

A URL de retorno é `<API_PUBLIC_URL>/auth/sso/google/callback` e `<API_PUBLIC_URL>/auth/sso/microsoft/callback`. Só entra quem já tem conta no Financeiro com o mesmo e-mail, e reinicie a API depois de mudar o `.env`.

Quem administra as contas da empresa precisa exigir a verificação em duas etapas nelas, porque o Financeiro não pede código nesse caminho.

## Antes de abrir um PR

```bash
bash scripts/verify-delivery.sh          # a mesma barra do CI
bash scripts/verify-delivery.sh --e2e    # mais os testes de tela, se mudou tela ou fluxo
bash scripts/verify-delivery.sh --fast   # sem cobertura, para iterar
```

O `--e2e` pede `npx playwright install chromium` uma vez, e o `npm run dev` da porta 3010 parado, porque o `next dev` não sobe duas vezes na mesma pasta.

## Regras que valem para tudo

- Integração com o Connect **só por API**: nunca acessar o banco ou o MinIO dele.
- Dinheiro em `Decimal`, Pix com valor exato, nada pago sem confirmação humana.
- CPF só como hash, chave Pix mascarada, nenhum dado pessoal em log.
- **Nenhum dado real no repositório:** comprovantes, notas, planilhas de pagamento e transcrições brutas ficam fora daqui.
