# Arquitetura e stack

Como o Financeiro deve ser montado: camadas, versões exatas, pastas, como a API sobe, configuração por variável de ambiente e como ele se liga ao Connect, ao MinIO e ao Postgres. Tudo aqui espelha o que o P+ Connect já faz (caminhos citados são do repositório do Connect).

## Visão em camadas

```
Navegador (Next.js) ──Bearer JWT──▶ API FastAPI
                                     api/        rota: auth, permissão, rate limit, exceção → HTTP
                                       │
                                     services/   regra de negócio, exceção de domínio, commit
                                       │
                         models/ (SQLAlchemy)   schemas/ (Pydantic)   core/ (config, cripto, storage…)
                                       │
                                     db/connection.py ──▶ PostgreSQL 16
```

- A rota **nunca** tem regra de negócio; o serviço **nunca** conhece HTTP.
- Parsers puros (sem banco) ficam em módulo próprio para testar só com texto. No Connect: `services/receipt_parser.py`. No Financeiro, o leitor do PDF de comprovantes do banco vem para cá do mesmo jeito.
- Detalhes de cada camada: [03-padroes-backend.md](03-padroes-backend.md).

## Stack com versões exatas

Copie as versões de `backend/requirements.txt` e `backend/requirements-dev.txt` do Connect. Atualizar versão é uma mudança própria (PR separado), não "de carona".

### Backend (runtime)

| Pacote | Versão | Para quê |
|---|---|---|
| Python | **3.11** (imagem `python:3.11-slim` e CI). Local aceita 3.12 | — |
| fastapi | 0.118.3 | API |
| starlette | 0.48.0 | base do FastAPI (fixada à parte) |
| uvicorn | 0.34.2 | servidor ASGI |
| SQLAlchemy | **1.4.39** | ORM, **estilo legado `db.query(...)`** (não use `select()` 2.0) |
| psycopg2-binary | 2.9.10 | driver Postgres |
| pydantic | **2.11.5** | schemas (v2) |
| alembic | 1.16.5 | migrations |
| PyJWT | 2.15.1 | JWT (HS256) |
| cryptography | 50.0.0 | AES-256-GCM (`AESGCM`) |
| passlib[bcrypt] / bcrypt | 1.7.4 / 4.0.1 | hash de senha |
| python-multipart | 0.0.31 | upload (`UploadFile`, `Form`) |
| python-dotenv | 1.2.2 | `.env` |
| slowapi | 0.1.10 | rate limit |
| boto3 | 1.35.99 | cliente S3 do MinIO |
| requests | 2.33.0 | chamadas HTTP de saída (Connect) |
| openpyxl | 3.1.5 | planilha `.xlsx` de pagamentos |
| tzdata | 2025.2 | fuso `America/Sao_Paulo` em imagem slim/Windows |
| pypdf | 6.19.0 | leitura do PDF de comprovantes |

### Backend (dev/CI)

| Pacote | Versão |
|---|---|
| pytest | 8.3.3 |
| pytest-cov | 5.0.0 |
| httpx | 0.27.2 (TestClient) |
| pip-audit | 2.7.3 |
| ruff, mypy, pre-commit | **sem versão fixa hoje** no Connect. No Financeiro, fixe (ex.: `ruff==<versão>`), para o CI não mudar sozinho |

### Infra

| Peça | Versão |
|---|---|
| PostgreSQL | **16** (`postgres:16`) |
| MinIO | `quay.io/minio/minio:latest` no Connect. No Financeiro, **fixe a tag** (o `latest` é dívida do Connect) |
| Docker Compose | arquivo `docker-compose.yml` sem `version:` (Compose v2) |

### Frontend (de `frontend/package.json` do Connect)

| Pacote | Versão |
|---|---|
| next | 16.4.2 (APIs diferentes das versões antigas: leia `frontend/AGENTS.md` do Connect) |
| react / react-dom | 19.2.8 |
| tailwindcss | ^4 |
| radix-ui (shadcn) | ^1.6.7 |
| sonner (toast) | ^2.0.8 |
| lucide-react | ^1.49.0 |
| pdf-lib | ^1.17.1 (corta o PDF em partes no navegador) |
| typescript | ^5 |
| vitest | ^3.2.4 |
| @playwright/test | ^1.64.1 |
| Node (imagem) | 22 |

## Estrutura de pastas do backend do Financeiro

Igual à do Connect. Não invente pastas novas.

```
backend/
  main.py                 app, middlewares, routers, threads de fundo
  api/                    1 arquivo por domínio: batches.py, payments.py, exports.py, health.py…
  services/               regra: batches.py, reconciliation.py, receipt_parser.py, connect_client.py, outbox.py…
  models/                 1 arquivo por agregado: receipt_batch.py, payable_item.py, outbox_event.py…
  schemas/                Pydantic de entrada/saída, 1 por domínio
  core/                   config.py, crypto.py, security.py, storage.py, permissions.py,
                          limiter.py, logging_config.py, pagination.py, text.py, exceptions.py, csv_export.py
  db/connection.py        engine, SessionLocal, Base, get_db
  alembic/  alembic.ini   migrations (env.py importa todos os models)
  scripts/                rotinas e seeds (idempotentes, dry-run por padrão)
  tests/                  pytest (conftest.py com db_session, client, make_user)
  Dockerfile  requirements.txt  requirements-dev.txt  pyproject.toml  pytest.ini  .env.example
```

`pytest.ini` do Connect é só:

```ini
[pytest]
pythonpath = .
```

## Como a app sobe (`main.py`)

Ordem no Connect, que o Financeiro deve repetir:

1. `setup_logging()` (logs em JSON no stdout) e `access_logger = logging.getLogger("app.access")`.
2. `app = FastAPI()`.
3. Thread de fundo no `startup`, **só se a variável ligar** (nos testes fica desligada):

```python
@app.on_event("startup")
def _start_delivery_dispatcher() -> None:
    if DELIVERY_DISPATCHER_ENABLED:
        start_dispatcher_thread()
```

No Financeiro a mesma forma serve para o despachante do outbox de eventos (ex.: `OUTBOX_DISPATCHER_ENABLED`).

4. Rate limit:

```python
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)
```

5. CORS só com as origens do `.env`, expondo os cabeçalhos que o front lê:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Truncated", "X-Total-Count"],
)
```

6. Middleware `log_requests`: mede o tempo e loga `method`, `path`, `status_code`, `duration_ms`, `client_ip`. Nunca corpo, query string ou cabeçalho.
7. `app.include_router(...)` de cada router, `health_router` primeiro.

Não existe handler global de exceção de domínio no Connect: cada rota traduz a sua (ver 03). Não existe versionamento de rota (`/v1`) hoje nas rotas de tela.

Health check (copie de `backend/api/health.py`): `GET /healthz` (processo de pé) e `GET /readyz` (faz `SELECT 1`; 503 se o banco não responde).

Subida do container (`backend/Dockerfile`): usuário não-root `api` (uid 1001), e:

```dockerfile
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
```

Atrás de proxy reverso, rode o uvicorn com `--proxy-headers --forwarded-allow-ips="<IP do proxy>"`, senão rate limit e logs veem o IP do proxy. O Connect ainda não tem isso no `CMD`; o Financeiro já deve nascer com isso configurável.

## Configuração por variável de ambiente

Padrão de `backend/core/config.py`: `load_dotenv()` no topo; **obrigatória** com `os.environ["X"]` (a app nem sobe sem ela); **opcional** com `os.getenv("X", "padrão")`; booleano com `.lower() == "true"`.

```python
load_dotenv()

SECRET_KEY = os.environ["SECRET_KEY"]
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
DELIVERY_DISPATCHER_ENABLED = os.getenv("DELIVERY_DISPATCHER_ENABLED", "true").lower() == "true"
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]
```

Segredo novo entra em `core/config.py` e no `.env.example` (com valor `change-me-…`), nunca no código.

### Variáveis que o Financeiro terá

| Variável | Obrigatória | Padrão | Uso |
|---|---|---|---|
| `DATABASE_URL` | sim | — | Postgres **do Financeiro** (role da app, nunca a do Connect) |
| `MIGRATION_DATABASE_URL` | não | = `DATABASE_URL` | **novo, não existe no Connect**: role de migração (dona das tabelas), usada só pelo `alembic/env.py`. Ver [04-banco-de-dados.md](04-banco-de-dados.md) |
| `SECRET_KEY` | sim | — | assina o JWT dos usuários do Financeiro (diferente da do Connect) |
| `ALGORITHM` | não | `HS256` | JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | não | `15` | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | não | `7` | |
| `CPF_SECRET_KEY` | sim | — | HMAC do CPF dos **usuários do Financeiro** (login por CPF, como no Connect) |
| `PIX_SECRET_KEY` | sim | — | HMAC da chave Pix lida no comprovante (detectar repetido). **Própria do Financeiro, nunca a do Connect.** Para saber de quem é a chave, o Financeiro pergunta ao Connect pela rota `pix-key-matches` (ver 07). |
| `ENCRYPTION_KEY` | sim | — | base64 de 32 bytes, AES-256-GCM (envelope do backend). Própria do Financeiro |
| `CORS_ORIGINS` | não | `http://localhost:3000` | só o domínio do front do Financeiro |
| `ENVIRONMENT` | não | `development` | `production` em produção |
| `RATE_LIMIT_ENABLED` | não | `true` | só os testes de tela desligam |
| `FRONTEND_URL` | não | `http://localhost:3000` | links em e-mail |
| `SMTP_*` (`HOST`, `PORT`, `USER`, `PASSWORD`, `FROM`, `STARTTLS`) | não | — | e-mail transacional (reset de senha) |
| `MINIO_ENDPOINT` | sim | — | endpoint interno (ex.: `http://minio:9000`) |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | sim | — | usuário **próprio** do Financeiro no MinIO, com policy só no bucket dele |
| `MINIO_BUCKET` | sim | — | bucket do Financeiro (ex.: `financeiro-arquivos`) |
| `MINIO_PUBLIC_URL` | não | = endpoint | host usado nas URLs pré-assinadas |
| `MINIO_SSE_KMS_KEY_ID` | sim em produção | — | **novo, não existe no Connect**: nome da chave no KES para SSE-KMS |
| `CONNECT_API_URL` | sim | — | **novo**: base HTTPS da API do Connect |
| `CONNECT_CLIENT_ID` / `CONNECT_CLIENT_SECRET` | sim | — | **novo**: conta de serviço do Financeiro no Connect (`client_credentials`) |
| `CONNECT_WEBHOOK_SECRET` | sim | — | **novo**: segredo HMAC para validar eventos vindos do Connect (`X-Signature`) |
| `OUTBOX_DISPATCHER_ENABLED` | não | `true` | **novo**: liga a thread do outbox (desligada nos testes) |
| `PAYMENT_TERM_DAYS` | não | `30` | só se o Financeiro calcular prazo sem o projeto (o prazo real vem do Connect) |

Conta de serviço, token `client_credentials`, webhook assinado e outbox de eventos **não existem hoje** no Connect: estão como proposta em `docs/architecture/integracao-entre-sistemas.md`. Ver [07-integracao-com-o-connect.md](07-integracao-com-o-connect.md).

## Docker Compose local

Mesmo formato do `docker-compose.yml` do Connect: serviços `db`, `minio`, `api`, `frontend`, com healthcheck e `depends_on: condition: service_healthy`. Para rodar os dois sistemas na mesma máquina, mude as portas do Financeiro.

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: "troque-local"
      POSTGRES_DB: financeiro
    ports: ["5433:5432"]            # 5432 fica com o Connect
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
  minio:
    image: quay.io/minio/minio:<tag fixa>
    command: server /data --console-address ":9001"
    ports: ["9010:9000", "9011:9001"]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
  api:
    build: ./backend
    env_file: [./backend/.env]
    environment:
      DATABASE_URL: postgresql://financeiro_app:troque-local@db:5432/financeiro
      MINIO_ENDPOINT: http://minio:9000
      CONNECT_API_URL: http://host.docker.internal:8000
    ports: ["8010:8000"]
    depends_on:
      db: { condition: service_healthy }
      minio: { condition: service_healthy }
  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: http://localhost:8010   # endereço que o NAVEGADOR alcança
    ports: ["3010:3000"]
```

KES não precisa subir em dev: sem `MINIO_SSE_KMS_KEY_ID`, o upload vai sem SSE e o envelope AES-GCM do backend continua valendo. Em produção, as duas camadas são obrigatórias (ver o arquivo de segurança deste pacote). Credenciais do compose são só locais: o Connect tem `postgres/1234` e `minioadmin/minioadmin123` fixos e isso está no checklist de produção como dívida.

## Diagrama: Financeiro, Connect, MinIO e Postgres

```
                 ┌──────────────── navegador ────────────────┐
                 │ Financeiro (Next.js)     Connect (Next.js)│
                 └──────┬───────────────────────────┬────────┘
                   JWT do Financeiro           JWT do Connect
                        ▼                           ▼
┌───────────────────────────────┐  HTTPS + token  ┌───────────────────────────────┐
│ API Financeiro (FastAPI)      │ client_creds ──▶│ API Connect (FastAPI)         │
│  services/connect_client.py   │  /integrations  │  itens a pagar, projetos,     │
│  outbox → despachante         │  /v1/...        │  chave Pix sob demanda        │
│                               │◀── webhook ─────│  (auditada), baixa idempotente│
│                               │  X-Signature    │                               │
└──────┬─────────────────┬──────┘   HMAC          └──────────────┬────────────────┘
       │ SQLAlchemy      │ boto3 (S3)                            │ SQLAlchemy
       ▼                 ▼                                       ▼
┌──────────────┐  ┌──────────────────────────┐          ┌──────────────────┐
│ Postgres     │  │ MinIO: bucket financeiro │          │ Postgres         │
│ db financeiro│  │ SSE-KMS (KES)            │          │ db connect       │
│ role própria │  │ + objeto já cifrado      │          │ (Financeiro NUNCA│
└──────────────┘  │   AES-256-GCM no backend │          │  conecta aqui)   │
                  └──────────────────────────┘          └──────────────────┘
```

- O Financeiro não tem rede liberada para o Postgres do Connect (nem usuário lá).
- Chave Pix trafega só na resposta da rota auditada do Connect, em memória, para montar a planilha; não é gravada no banco do Financeiro.
- O bucket do Financeiro é outro bucket, com outro usuário MinIO. Mesmo servidor MinIO é aceitável; o usuário do Connect não enxerga o bucket do Financeiro e vice-versa.

## Checklist

- [ ] `requirements.txt` com as mesmas versões fixas da tabela; `ruff` e `mypy` também fixados.
- [ ] Python 3.11 na imagem e no CI; imagem com usuário não-root.
- [ ] Pastas `api/ services/ models/ schemas/ core/ db/ alembic/ scripts/ tests/`, sem regra de negócio em `api/`.
- [ ] `main.py` com logging JSON, slowapi (`app.state.limiter`, handler, middleware), CORS por env com `expose_headers`, middleware de log de acesso e threads de fundo atrás de variável.
- [ ] `/healthz` e `/readyz` respondendo.
- [ ] Toda variável obrigatória lida com `os.environ[...]`; `.env.example` lista todas, sem segredo real.
- [ ] `DATABASE_URL` aponta para o database do Financeiro com a role da app; não existe string de conexão do Connect no repositório.
- [ ] Usuário e bucket MinIO próprios; em produção, `MINIO_SSE_KMS_KEY_ID` configurado e upload com SSE.
- [ ] Container roda `alembic upgrade head` antes do uvicorn; uvicorn com `--proxy-headers` atrás de proxy.
- [ ] Compose local sobe junto com o do Connect sem conflito de porta.
