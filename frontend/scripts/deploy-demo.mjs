/**
 * Publica a versão de demonstração no Netlify COM a função das solicitações da equipe (o ZIP
 * arrastado no Netlify não leva funções). Gera o site na raiz, sem link de volta ao protótipo, põe
 * o _headers (a mesma CSP do netlify.toml) e chama o Netlify CLI.
 *
 * Antes, uma vez:
 *   1. npx netlify-cli@27.16.1 login            (abre o navegador para entrar no Netlify)
 *   2. no site, em Site configuration → Environment variables, crie SOLICITACOES_CHAVE com a sua
 *      chave (escolha uma longa). Ela nunca vai para o código, o chat nem o git.
 *
 * Uso: NETLIFY_SITE=<nome ou ID do site> node scripts/deploy-demo.mjs
 *      DEMO_DEPLOY_DRY_RUN=1 ...  gera o site e só mostra o comando, sem publicar
 * docs/operations/publicar-a-versao-de-teste.md
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FRONTEND, OUT, build, headersFile } from "./package-demo.mjs";

const CLI = "netlify-cli@27.16.1";
const site = process.env.NETLIFY_SITE;
if (!site) {
  console.error("[demo] Diga qual é o site: NETLIFY_SITE=<nome ou ID do site no Netlify> node scripts/deploy-demo.mjs");
  process.exit(1);
}

build();
fs.writeFileSync(path.join(OUT, "_headers"), headersFile());
const args = [
  "--yes",
  CLI,
  "deploy",
  "--prod",
  "--no-build",
  "--dir",
  OUT,
  "--functions",
  path.join(FRONTEND, "netlify", "functions"),
  "--site",
  site,
];
if (process.env.DEMO_DEPLOY_DRY_RUN === "1") {
  console.log(`[demo] Pronto para publicar: npx ${args.join(" ")}`);
  process.exit(0);
}

// Roda fora do repositório: o netlify.toml da raiz é do site do protótipo e não vale para este.
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "financeiro-demo-"));
const windows = process.platform === "win32";
const result = spawnSync(windows ? "npx.cmd" : "npx", args, { cwd: workdir, stdio: "inherit", shell: windows });
fs.rmSync(workdir, { recursive: true, force: true });
process.exit(result.status ?? 1);
