import { defineConfig, devices } from "@playwright/test";

/**
 * Teste de tela da versão de demonstração (o app real com o backend rodando no navegador).
 * Sobe só um servidor estático com a pasta gerada por `node scripts/build-demo.mjs` (out/, ou a pasta
 * de DEMO_DIST_DIR), do jeito que o Netlify serve: em /teste, com a CSP do netlify.toml.
 * Não precisa de API, banco nem Docker.
 */
const PORT = Number(process.env.DEMO_PORT ?? 3020);
const DIR = process.env.DEMO_DIST_DIR ?? "out";

export default defineConfig({
  testDir: "./e2e-demo",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // O Pyodide liga em alguns segundos e a primeira tela espera por ele.
  timeout: 180_000,
  expect: { timeout: 60_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // O passeio de introdução abre sozinho na primeira visita e cobriria a tela.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${PORT}`,
          localStorage: [{ name: "financeiro:passeio-visto", value: "1" }],
        },
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node scripts/serve-demo.mjs ${DIR} ${PORT}`,
    cwd: __dirname,
    url: `http://localhost:${PORT}/teste/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
