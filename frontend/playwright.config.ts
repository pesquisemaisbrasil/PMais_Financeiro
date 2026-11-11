import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de tela (e2e). Sobem uma pilha isolada, sem Docker:
 * - backend com SQLite em arquivo (backend/e2e.db), recriado pelo scripts/seed_e2e.py a cada execução;
 * - frontend (next dev) apontando para esse backend.
 * Os dois servidores sempre sobem do zero: o banco precisa estar no estado do seed.
 * O `next dev` não sobe duas vezes na mesma pasta: pare o da porta 3010 antes de rodar.
 */

// Portas trocáveis se já estiverem em uso na máquina (E2E_BACKEND_PORT / E2E_FRONTEND_PORT).
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 8011);
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 3011);
// localhost nos dois: com 127.0.0.1 na API seriam sites diferentes, e o cookie SameSite=Strict não volta.
const API_URL = `http://localhost:${BACKEND_PORT}`;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

const backendDir = path.resolve(__dirname, "../backend");
// Python com as dependências do backend. Na CI: E2E_PYTHON=python.
const python =
  process.env.E2E_PYTHON ??
  (process.platform === "win32" ? path.join(backendDir, ".venv", "Scripts", "python.exe") : "python");

// Segredos só de teste: nada aqui é usado fora do e2e.
const backendEnv = {
  DATABASE_URL: "sqlite:///./e2e.db",
  SECRET_KEY: "e2e-secret-key-com-pelo-menos-32-caracteres", // gitleaks:allow
  ENCRYPTION_KEY: Buffer.alloc(32, "e").toString("base64"),
  PIX_SECRET_KEY: "pix-e2e-chave-ficticia-com-mais-de-32-caracteres", // gitleaks:allow
  ENVIRONMENT: "development",
  // Connect de mentira (dados fictícios): o de verdade nunca entra nos testes.
  CONNECT_MODE: "simulated",
  // Cofre de arquivos de mentira (na memória), com uma chave de teste: o MinIO nunca entra no e2e.
  // Consulta de CNPJ de mentira (CNPJs inventados): a BrasilAPI de verdade nunca entra no e2e.
  CNPJ_LOOKUP_MODE: "simulated",
  FILES_MODE: "memory",
  FILES_MASTER_KEY: Buffer.alloc(32, "f").toString("base64"), // gitleaks:allow
  CORS_ORIGINS: FRONTEND_URL,
  FRONTEND_URL,
  API_PUBLIC_URL: API_URL,
  // sem chaves de Google e Microsoft, mesmo que o backend/.env da máquina tenha
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  MICROSOFT_CLIENT_ID: "",
  MICROSOFT_CLIENT_SECRET: "",
  MICROSOFT_TENANT_ID: "",
  REFRESH_COOKIE_SECURE: "false",
  RATE_LIMIT_ENABLED: "false",
  PYTHONUTF8: "1",
};

export default defineConfig({
  testDir: "./e2e",
  // Um banco só para a suíte inteira: os testes rodam em sequência.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Sem nova tentativa: o teste consome o estado da conta (código usado, cadastro feito).
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: FRONTEND_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // O passeio de introdução abre sozinho na primeira visita e cobriria a tela de todo teste: todo
    // navegador de teste já nasce com ele visto. O teste do passeio apaga esta marca.
    storageState: {
      cookies: [],
      origins: [{ origin: FRONTEND_URL, localStorage: [{ name: "financeiro:passeio-visto", value: "1" }] }],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `"${python}" scripts/seed_e2e.py && "${python}" -m uvicorn main:app --host 127.0.0.1 --port ${BACKEND_PORT}`,
      cwd: backendDir,
      url: `http://127.0.0.1:${BACKEND_PORT}/healthz`,
      env: backendEnv,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      // Na CI, o build de produção: a CSP de lá é mais rígida que a do `next dev`.
      command: process.env.CI
        ? `npx next build && npx next start --port ${FRONTEND_PORT}`
        : `npx next dev --port ${FRONTEND_PORT}`,
      cwd: __dirname,
      url: `${FRONTEND_URL}/login`,
      // Fora da CI, outra pasta de build, para não brigar com o `next dev` da porta 3010.
      // A faixa do ambiente de teste fica ligada: o site de teste publicado sempre a tem, e os testes
      // conferem que ela não esconde o menu nem a tela.
      env: {
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_PUBLIC_TEST_ENV: "1",
        NEXT_PUBLIC_PROTOTYPE_URL: "/",
        ...(process.env.CI ? {} : { NEXT_DIST_DIR: ".next-e2e" }),
      },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
