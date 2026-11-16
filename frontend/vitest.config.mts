import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes unitários de lógica pura (src/lib). Ambiente node: o que precisa de
// window/document é simulado no próprio teste com vi.stubGlobal.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // netlify/: a regra das solicitações, que roda na função do Netlify e no servidor de teste
    include: ["src/**/*.test.ts", "netlify/**/*.test.ts"],
    // e2e/ é do Playwright (npm run e2e), não do vitest
    exclude: ["e2e/**", "node_modules/**"],
  },
});
