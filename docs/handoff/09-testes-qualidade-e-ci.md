# Testes, qualidade e CI

Como o P+ Connect prova que uma entrega funciona, e como o Financeiro deve repetir isso: as camadas de teste, os padrões de escrita (com exemplos reais), como simular integrações externas, o script de verificação local, os workflows do GitHub Actions e a definição de pronto. A barra é a mesma do Connect: nada vai para a `main` sem tudo verde.

Caminhos citados são do repositório do Connect, para copiar o padrão.

## 1. Pirâmide

| Camada | Ferramenta | Onde | Banco | Quando escrever |
|---|---|---|---|---|
| Unidade e API (a maior parte) | pytest + `TestClient` do FastAPI | `backend/tests/` | SQLite em memória | toda regra, endpoint, permissão, caso negado |
| Migrations | Alembic no CI | job `migrations` | **Postgres 16** real | toda migration (upgrade, drift, downgrade) |
| Lógica pura do frontend | Vitest | `frontend/src/lib/*.test.ts` | — | formatação, datas, cliente da API, validadores |
| Jornada de tela | Playwright | `frontend/e2e/*.spec.ts` | SQLite em arquivo (`backend/e2e.db`) com seed próprio | tela nova ou fluxo alterado: fluxo principal + 1 caso negado |

No Connect hoje: 46 arquivos de teste no backend, 8 arquivos de Vitest e 4 specs de E2E.

### pytest

**Fixtures** (`backend/tests/conftest.py`, encurtado; sem os tipos e os imports):

```python
# variáveis obrigatórias ganham valor de teste ANTES de importar o app
os.environ.setdefault("DAILY_NOTIFICATIONS_ENABLED", "false")
os.environ.setdefault("DELIVERY_DISPATCHER_ENABLED", "false")
os.environ.setdefault("PIX_SECRET_KEY", "test-pix-secret-key")
os.environ.setdefault("ENCRYPTION_KEY", base64.b64encode(b"0" * 32).decode())
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

engine = create_engine("sqlite:///:memory:",
                       connect_args={"check_same_thread": False}, poolclass=StaticPool)

@event.listens_for(engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    # sem isso, testes de CASCADE/RESTRICT passariam mesmo com ondelete errado
    dbapi_connection.cursor().execute("PRAGMA foreign_keys=ON")

@pytest.fixture()
def db_session():
    Base.metadata.create_all(bind=engine)      # banco limpo por teste
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture()
def client(db_session, monkeypatch):
    limiter.reset()                             # rate limit não vaza entre testes

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture()
def make_user(db_session):
    def _make_user(cpf="12345678909", password="Str0ng!Pass", role="user", status="active"):
        user = User(name="Test User", cpfHash=hash_cpf(cpf), passwordHash=hash_password(password),
                    role=role, status=status, ...)
        ...
        return user, cpf, password
    return _make_user
```

**SQLite × Postgres:**

- Os testes rodam em SQLite (rápido, sem Docker). Os modelos declaram os dois dialetos quando precisa, por exemplo o índice parcial do e2eId:
  ```python
  Index("uq_payment_receipts_e2e_paid", "e2eId", unique=True,
        postgresql_where=text("status = 'pago'"), sqlite_where=text("status = 'pago'"))
  ```
- **SQLite ignora `FOR UPDATE`.** A trava real só roda no Postgres. No teste, prove a **releitura do estado** (ex.: `test_cancel_or_discard_with_stale_batch_does_not_undo_confirmation`) ou a SQL gerada com um listener `do_orm_execute`.
- O Postgres entra no CI pelo job `migrations` (seção 6). Para o Financeiro, vale considerar rodar também a suíte de conciliação contra Postgres, já que a baixa depende de trava.

**Cobertura mínima: 80%** (`--cov=. --cov-fail-under=80`), configurada no `pyproject.toml`:

```toml
[tool.coverage.run]
source = ["."]
omit = ["tests/*", "alembic/*", "*/__init__.py"]
```

**Bug conhecido:** teste com `@pytest.mark.xfail(strict=True, reason="BUG: ...")`. Com `strict`, quando alguém corrige o bug o teste vira XPASS e **falha**, obrigando a tirar o `xfail` no mesmo PR. No Vitest o equivalente é `it.fails`. Fora do escopo do MVP: `@pytest.mark.skip(reason="... fora do MVP")`. Hoje o Connect não tem nenhum `xfail`.

### Vitest

Lógica pura em `src/lib`, teste ao lado do arquivo. Exemplo real (`frontend/src/lib/download.test.ts`): relógio fixo para pegar o virar do dia em São Paulo e dependência simulada:

```ts
const requestFile = vi.fn();
vi.mock("@/lib/api", () => ({ requestFile: (path: string) => requestFile(path) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T02:00:00Z")); // ainda 15/10 em São Paulo
});
```

### Playwright (E2E)

`frontend/playwright.config.ts` sobe uma pilha isolada, **sem Docker**:

```ts
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 8001);
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 3001);
const backendEnv = {
  DATABASE_URL: "sqlite:///./e2e.db",
  SECRET_KEY: "e2e-secret-key", PIX_SECRET_KEY: "e2e-pix-secret-key",
  ENCRYPTION_KEY: Buffer.alloc(32, "e").toString("base64"),
  MINIO_ENDPOINT: "http://127.0.0.1:9",          // porta morta: nada sai
  RATE_LIMIT_ENABLED: "false",                    // a suíte faz vários logins por minuto
  DAILY_NOTIFICATIONS_ENABLED: "false", DELIVERY_DISPATCHER_ENABLED: "false",
  ZENVIA_API_TOKEN: "", SMTP_HOST: "",
};
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1,   // um banco só, em sequência
  retries: process.env.CI ? 1 : 0, forbidOnly: !!process.env.CI,
  use: { baseURL: FRONTEND_URL, locale: "pt-BR", timezoneId: "America/Sao_Paulo",
         trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    { command: `"${python}" scripts/seed_e2e.py && "${python}" -m uvicorn main:app --port ${BACKEND_PORT}`,
      cwd: backendDir, url: `${API_URL}/healthz`, env: backendEnv, reuseExistingServer: false },
    { command: `npm run dev -- --port ${FRONTEND_PORT}`,
      url: `${FRONTEND_URL}/login`, env: { NEXT_PUBLIC_API_URL: API_URL }, reuseExistingServer: false },
  ],
});
```

- **Seed próprio** (`backend/scripts/seed_e2e.py`): apaga e recria `backend/e2e.db` com dados fictícios e determinísticos. Por segurança só aceita `DATABASE_URL` de SQLite em arquivo chamado `e2e.db`:
  ```python
  if not (_url.startswith("sqlite:///") and _url.endswith("e2e.db")):
      raise SystemExit("seed_e2e só roda com DATABASE_URL=sqlite:///.../e2e.db")
  ```
- Os mesmos CPFs e nomes ficam em `frontend/e2e/fixtures.ts` (`USERS`, `PROJECTS`, senha única `E2E_PASSWORD`). Cada teste usa um projeto próprio do seed.
- Seletores por papel, rótulo e texto (`getByRole`, `getByLabel`, `getByText`); `data-testid` só sem alternativa.
- Python do backend: `.venv` no Windows, `python` nos demais, ou `E2E_PYTHON`. Portas trocáveis por `E2E_BACKEND_PORT` / `E2E_FRONTEND_PORT`.
- Rodar: `npm run e2e`, `npm run e2e:ui`, `npx playwright test e2e/financeiro.spec.ts`; relatório com `npx playwright show-report`.

## 2. Padrão de teste: caso feliz + negados

Cada endpoint tem o caminho feliz e os negados que importam: **401** (sem login), **403** (papel errado), **404** (não existe ou é de outro dono), **409** (estado não permite), **422** (entrada inválida), e no Financeiro **413** (parte grande). Os testes conferem o código **e a mensagem** (`detail` em pt-BR) e que **nada mudou** depois da tentativa negada.

Real, `backend/tests/test_verif_financeiro.py` (encurtado):

```python
def test_finance_endpoints_require_authentication(client, db_session):
    project = _project(db_session)
    base = _base(project)
    assert client.get(f"{base}/summary").status_code == 401
    assert client.post(f"{base}/receipt-batches", json={"parts": 1}).status_code == 401
    assert client.get(f"{base}/payments.xlsx").status_code == 401


def test_interviewer_is_blocked_from_every_finance_endpoint(client, db_session, make_user, fake_pdf):
    project = _project(db_session)
    staff = _headers(client, make_user, CPF_STAFF, "supervisor")
    batch_id = _send(client, staff, project, fake_pdf(receipt_text()))
    user = _headers(client, make_user, CPF_INTERVIEWER, "user")
    base = f"{_base(project)}/receipt-batches"

    assert client.get(f"{base}/{batch_id}", headers=user).status_code == 403
    assert client.post(f"{base}/{batch_id}/confirm", headers=user).status_code == 403
    assert client.get(f"{_base(project)}/payments.xlsx", headers=user).status_code == 403
    # nada mudou com as tentativas
    assert db_session.get(ReceiptBatch, batch_id).status == "pronto"


@pytest.mark.parametrize("role", ["admin", "financeiro"])
def test_admin_and_financeiro_run_the_whole_receipt_flow(role, client, db_session, make_user, fake_pdf):
    ...
```

409 com a mensagem certa (`test_verif_orcamento_notificacoes.py`):

```python
def test_launch_that_exactly_fills_budget_is_allowed(client, db_session, make_user):
    project = _project(db_session, budget=Decimal("30.00"))
    profile = _member(db_session, make_user, project)
    headers = _headers(client, make_user, ADMIN_CPF, "admin")
    url = f"/projects/{project.id}/interviews/log-validated"

    ok = client.post(url, json={"interviewer_id": profile.id, "count": 3}, headers=headers)
    blocked = client.post(url, json={"interviewer_id": profile.id, "count": 1}, headers=headers)

    assert ok.status_code == 200
    assert blocked.status_code == 409
    assert "restam R$ 0,00" in blocked.json()["detail"]
```

Outras regras que os testes do Connect seguem:

- Teste de regressão para todo bug corrigido, que **falha sem a correção**.
- Mensagens esperadas em pt-BR, dados 100% fictícios (CPFs válidos e fictícios como `11144477735`).
- Teste de LGPD: a resposta **não** contém o que não pode (`test_review_screen_never_exposes_full_pix_key_or_payee_name_of_known_people`); o banco **não** guarda em claro; a auditoria **foi** gravada (`ExportLog`, `PiiAccessLog`).
- Planilha: abrir o xlsx com `openpyxl.load_workbook` e conferir célula, tipo (`data_type == "s"`) e cabeçalho (`"CPF" not in header`).
- Rotinas em segundo plano desligadas; chame a função direto (`run_daily_notifications(db, now=..., force=True)`).

## 3. Integrações externas: sempre simuladas

Nenhum teste chama rede. Padrões reais:

| Integração | Como simular | Onde |
|---|---|---|
| Zenvia (WhatsApp) | `monkeypatch.setattr(whatsapp.requests, "post", fake_post)` devolvendo um `FakeResponse(200, {"id": "msg-1"})` e guardando o que foi enviado | `test_whatsapp.py` |
| MinIO | `monkeypatch` em `upload_profile_picture` / `get_profile_picture_url` (ex.: devolve `signed:{key}`) | testes de perfil |
| Leitura do PDF | `monkeypatch.setattr("services.finance.extract_pdf_pages", lambda c: c.decode().split("\f"))`: o "PDF" do teste é texto com páginas separadas por `\f` | `test_receipts.py::fake_pdf` |
| Thread pool | prova que `process_part` roda fora do event loop | `test_part_is_processed_outside_the_event_loop` |

```python
# backend/tests/test_whatsapp.py (encurtado)
def fake_post(url: str, json: dict[str, Any], headers: dict[str, str], timeout: int) -> FakeResponse:
    sent.append({"url": url, "json": json, "headers": headers})
    return FakeResponse(200, {"id": f"msg-{len(sent)}"})

monkeypatch.setattr(whatsapp, "ZENVIA_API_TOKEN", "token-teste")
monkeypatch.setattr(whatsapp.requests, "post", fake_post)
```

**No Financeiro, o Connect é uma integração externa.** Proposta de padrão (não existe no Connect hoje):

- Um único cliente HTTP do Connect (ex.: `services/connect_client.py`), e os testes trocam esse cliente por um falso via `monkeypatch` ou `app.dependency_overrides`.
- O falso guarda as chamadas: o teste confere que a baixa foi pedida **uma vez**, com a `Idempotency-Key` = e2eId, e que um erro do Connect (timeout, 409, 5xx) **não** marca nada como pago no Financeiro.
- Teste de contrato dos dois lados: o Connect testa as rotas `/integrations/v1/...` com o mesmo JSON de exemplo que o Financeiro usa no falso.
- O ponta a ponta com os dois sistemas reais roda só no `docker compose`, fora da suíte padrão.

## 4. Fixtures de comprovante: nunca PDF real

- **Backend:** texto fictício no layout real do Itaú/Sispag (`receipt_text` em `backend/tests/test_receipts.py`), com nome "FULANA DE TESTE", chave `fulana.teste@gmail com`, pagador "EMPRESA FICTICIA LTDA", e2eId `E00000000202601011200TESTE000001`. Parâmetros permitem variar chave, valor, data e ID.
- **E2E:** PDF **sintético gerado na hora** com `pdf-lib` (`frontend/e2e/receipts.ts`), com as mesmas linhas de `receipt_text`:
  ```ts
  export async function buildReceiptsPdf(receipts: SyntheticReceipt[]): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);  // WinAnsi cobre os acentos
    for (const receipt of receipts) {
      const page = doc.addPage([595, 842]);
      receiptLines(receipt).forEach((line, index) =>
        page.drawText(line, { x: 40, y: 800 - index * 14, size: 10, font }));
    }
    return Buffer.from(await doc.save());
  }
  ```
- **Demonstração com PDF real:** só lido em tempo de execução (`seed_apresentacao.py --pdf "<caminho>"`), nunca commitado.
- O `.gitignore` do Connect cobre `.env`, `.venv`, `backend/e2e.db`, `.reviews/` e `*.stackdump`. PDF, zip e `.coverage` **não** estão no `.gitignore`: quem barra é a regra de commit e a revisão. No repositório novo, inclua `*.pdf`, `*.xlsx`, `*.zip`, `*.db` e `.coverage` no `.gitignore` desde o início.

## 5. Verificação local: `scripts/verify-delivery.sh`

A mesma barra do CI, num comando. Para no primeiro erro e diz qual etapa falhou. Usado pela skill `entregar`. Versão para o Financeiro (a do Connect é idêntica; só confirme os caminhos `backend/` e `frontend/`):

```bash
#!/usr/bin/env bash
# Verificação completa de uma entrega (a mesma barra da CI), usada pela skill
# /entregar. Para no primeiro erro e diz qual etapa falhou.
#
#   bash scripts/verify-delivery.sh          # backend + frontend
#   bash scripts/verify-delivery.sh --e2e    # + Playwright (tela ou fluxo mudou)
#   bash scripts/verify-delivery.sh --fast   # sem cobertura (iteração local)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E2E=0
FAST=0
for arg in "$@"; do
  case "$arg" in
    --e2e) E2E=1 ;;
    --fast) FAST=1 ;;
    *) echo "uso: $0 [--e2e] [--fast]"; exit 2 ;;
  esac
done

if [ -x "$ROOT/backend/.venv/Scripts/python.exe" ]; then
  PY="$ROOT/backend/.venv/Scripts/python.exe"
elif [ -x "$ROOT/backend/.venv/bin/python" ]; then
  PY="$ROOT/backend/.venv/bin/python"
else
  PY="${PYTHON:-python}"
fi

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31mFALHOU: %s\033[0m\n' "$1"; exit 1; }

cd "$ROOT/backend"
step "backend: ruff check"; "$PY" -m ruff check . || fail "ruff check"
step "backend: ruff format --check"; "$PY" -m ruff format --check . || fail "ruff format"
step "backend: mypy"; "$PY" -m mypy . || fail "mypy"
step "backend: alembic heads (uma só)"
HEADS=$("$PY" -m alembic heads 2>/dev/null | grep -c "(head)" || true)
[ "$HEADS" = "1" ] || fail "alembic tem $HEADS heads"
if [ "$FAST" = "1" ]; then
  step "backend: pytest"; "$PY" -m pytest -q -p no:cacheprovider -W ignore || fail "pytest"
else
  step "backend: pytest + cobertura >= 80%"
  "$PY" -m pytest -q -p no:cacheprovider -W ignore --cov=. --cov-fail-under=80 || fail "pytest/cobertura"
fi

cd "$ROOT/frontend"
step "frontend: next typegen"; npx next typegen >/dev/null || fail "next typegen"
step "frontend: tsc"; npx tsc --noEmit || fail "tsc"
step "frontend: lint"; npm run lint --silent || fail "lint"
step "frontend: check:ui"; npm run check:ui --silent || fail "check:ui"
step "frontend: vitest"; npm test --silent || fail "vitest"

if [ "$E2E" = "1" ]; then
  if grep -q '"e2e"' package.json; then
    step "frontend: e2e (Playwright)"; npm run e2e --silent || fail "e2e"
  else
    fail "script e2e não existe no frontend/package.json"
  fi
fi

printf '\n\033[32mTudo verde.\033[0m\n'
```

Ao adaptar:

- Copie também `frontend/scripts/check-ui.mjs` (barra `<button>`, `<select>`, `<textarea>`, `<table>` fora de `components/ui` e `SelectItem value=""`). Ajuste a constante `EXPECTED_DATA_TOUR` para a contagem do repositório novo, ou remova essa checagem se não houver tour.
- No Windows, rode com Git Bash.
- **Corrija pela causa:** não apague teste, não afrouxe critério, não aumente timeout para ficar verde.

## 6. GitHub Actions

Todos rodam em `pull_request` para a `main` e em `push` na `main`, com Python 3.11 e Node 22.

| Workflow | Job | O que roda |
|---|---|---|
| `tests.yml` | `test` | pytest com cobertura ≥ 80% em SQLite; sobe `coverage.xml` como artefato |
| `tests.yml` | `migrations` | Postgres 16 como serviço: `alembic upgrade head` → `alembic check` (drift models × migrations) → `downgrade -1` → `upgrade head` |
| `lint.yml` | `lint` | `ruff check`, `ruff format --check`, `mypy` |
| `frontend.yml` | `frontend` | `npm ci` → `next typegen` → `tsc --noEmit` → `lint` → `check:ui` → `npm test` → `build` |
| `e2e.yml` | `e2e` | instala backend e frontend, Chromium do Playwright, `next typegen`, `npm run e2e` com `E2E_PYTHON=python`; sobe o relatório se falhar |
| `security.yml` | `dependency-audit` | `pip-audit -r requirements.txt` (ignorados com motivo no próprio YAML) |
| `security.yml` | `frontend-dependency-audit` | `npm audit --omit=dev --audit-level=high` |
| `security.yml` | `secret-scan` | Gitleaks pela CLI no histórico inteiro, respeitando `.gitleaksignore` |

### `tests.yml` (essencial)

```yaml
name: Tests
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  test:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - name: Run tests
        env:
          SECRET_KEY: ci-test-secret-key
          CPF_SECRET_KEY: ci-test-cpf-secret-key
          PIX_SECRET_KEY: ci-test-pix-secret-key
          ENCRYPTION_KEY: MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=   # 32 bytes de "0", fictício
          DATABASE_URL: "sqlite:///:memory:"
          # MINIO_* fictícios
        run: pytest -q --cov=. --cov-report=term-missing --cov-report=xml --cov-fail-under=80
      - uses: actions/upload-artifact@v4
        with: { name: coverage-report, path: backend/coverage.xml }

  migrations:
    # testes rodam em SQLite; aqui as migrations aplicam no Postgres real
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: financeiro }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/financeiro
      # demais segredos fictícios, como no job test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r requirements.txt
      - run: alembic upgrade head
      - run: alembic check          # drift entre models e migrations
      - run: alembic downgrade -1   # o downgrade da última revisão funciona
      - run: alembic upgrade head
```

No Connect o database do CI se chama `entrevistadores_connect`; no Financeiro, use o nome do database próprio.

### `frontend.yml` (essencial)

```yaml
jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      # Tipos globais do App Router (LayoutProps, PageProps, rotas) ficam em .next/types
      # e só existem depois do typegen; sem isso o tsc não acha.
      - run: npx next typegen
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run check:ui
      - run: npm test
      - run: npm run build
        env: { NEXT_PUBLIC_API_URL: http://localhost:8000 }
```

O `next typegen` é a diferença clássica entre a máquina local (que já tem `.next/` de um `next dev`) e o checkout limpo do CI: sem ele o `tsc` passa local e quebra no CI.

### `e2e.yml` (essencial)

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11", cache: pip, cache-dependency-path: backend/requirements.txt }
      - run: pip install -r requirements.txt
        working-directory: backend
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx next typegen
      # Sobe backend (SQLite + seed_e2e.py) e frontend pelo playwright.config.ts
      - run: npm run e2e
        env: { E2E_PYTHON: python }
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            frontend/playwright-report/
            frontend/test-results/
          retention-days: 7
```

### `security.yml` (essencial)

```yaml
jobs:
  dependency-audit:            # backend
    steps:
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - name: pip-audit
        # cada --ignore-vuln tem o motivo escrito em comentário acima
        run: pip-audit -r requirements.txt --ignore-vuln <ID>

  frontend-dependency-audit:
    steps:
      - run: npm audit --omit=dev --audit-level=high

  secret-scan:
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }        # histórico inteiro
      # CLI em vez de gitleaks-action: a action exige licença paga em repositório de
      # organização e permissão de ler PRs (falhava com 403). Ver ADR 0007 do Connect.
      - name: Gitleaks
        env: { GITLEAKS_VERSION: "8.30.1" }
        run: |
          curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" | tar -xz gitleaks
          ./gitleaks git --redact --no-banner --exit-code 1 .
```

- `.gitleaksignore`: uma linha por falso positivo **revisado**, no formato `commit:arquivo:regra:linha`, com comentário do motivo. Exemplo real do Connect: nome de variável `accessed_by_user_id=accessed_by_user_id` lido como `generic-api-key`.
- Segredo vazado é **rotacionado**, não só removido do commit.
- No Connect, o `pip-audit` ignora hoje 6 avisos do starlette, travado pelo fastapi 0.118.3. No repositório novo, comece sem ignorados e só adicione com motivo.

## 7. Lint e tipos

| Ferramenta | Configuração no Connect | Regra |
|---|---|---|
| ruff | `line-length = 100`, `target-version = "py311"`, `select = ["E", "F", "I", "UP", "B"]`, `ignore = ["B008"]` (`Depends(...)` como default é o padrão do FastAPI), exclui `alembic/versions` | `ruff check .` e `ruff format --check .` |
| mypy | `disallow_untyped_defs = true`, `check_untyped_defs = true`, `ignore_missing_imports = true`, exclui `alembic/versions` e `scripts/` | toda função tipada; `# type: ignore` só com motivo |
| ESLint | `frontend/eslint.config.mjs` | `npm run lint` |
| tsc | `frontend/tsconfig.json` | `npx tsc --noEmit` depois do `next typegen` |
| check:ui | `frontend/scripts/check-ui.mjs` | só componentes de `src/components/ui` |

Dependências de desenvolvimento do backend (`requirements-dev.txt`): `ruff`, `mypy`, `pre-commit`, `pytest==8.3.3`, `pytest-cov==5.0.0`, `httpx==0.27.2`, `pip-audit==2.7.3`.

## 8. Definição de pronto

Uma entrega do Financeiro só está pronta quando:

- [ ] `bash scripts/verify-delivery.sh` verde (e com `--e2e` se mudou tela ou fluxo);
- [ ] os workflows do PR verdes (`gh pr checks <n>`);
- [ ] nenhum achado P1 ou P2 aberto dos 3 revisores (ver [10](10-processo-docs-e-skills.md));
- [ ] regra nova ou mudada tem teste, com os casos negados (HTTP e mensagem exata);
- [ ] bug conhecido e não corrigido tem `xfail(strict=True, reason="BUG: ...")` e está nos limites do PR;
- [ ] migration com `downgrade` e um head só;
- [ ] integração com o Connect simulada nos testes; nenhum teste chama rede;
- [ ] nenhum PDF, planilha ou dado real de comprovante no repositório;
- [ ] spec dono e roadmap ("Como testar") atualizados; inventário de dados e ROPA atualizados se o dado pessoal guardado mudou.

## Checklist

- [ ] `conftest.py` copiado e adaptado: env de teste antes do import do app, SQLite em memória com `PRAGMA foreign_keys=ON`, `db_session`, `client` (com `limiter.reset()`) e `make_user`.
- [ ] `pyproject.toml` com ruff, mypy e cobertura iguais aos do Connect.
- [ ] `fake_pdf` + `receipt_text` copiados; `e2e/receipts.ts` gera o PDF sintético.
- [ ] Cliente do Connect simulado em todos os testes; existe teste de "Connect falhou → nada pago".
- [ ] `seed_e2e.py` recusa qualquer banco que não seja `sqlite:///…/e2e.db`.
- [ ] `playwright.config.ts` sobe backend e frontend em portas próprias, com rate limit e rotinas desligados.
- [ ] `scripts/verify-delivery.sh` roda verde num clone limpo.
- [ ] Os 5 workflows (`tests`, `lint`, `frontend`, `e2e`, `security`) estão no `.github/workflows/` e rodam em PR e push na `main`.
- [ ] O job `migrations` faz upgrade, `alembic check`, downgrade e upgrade num Postgres 16.
- [ ] Gitleaks pela CLI com versão fixa e `fetch-depth: 0`; `.gitleaksignore` só com falsos positivos comentados.
