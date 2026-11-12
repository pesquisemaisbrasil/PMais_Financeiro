import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // pasta de build do E2E local (next.config.ts, NEXT_DIST_DIR)
    ".next-e2e/**",
    // saída local da versão de demonstração (scripts/build-demo.mjs, DEMO_DIST_DIR) e o cache dela
    ".next-demo/**",
    ".demo-cache/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
