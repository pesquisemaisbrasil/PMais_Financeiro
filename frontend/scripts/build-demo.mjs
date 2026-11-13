/**
 * Gera a versão de demonstração do Financeiro: o app real (telas) mais o backend real rodando no
 * navegador (Python via Pyodide), tudo estático, em `frontend/out/`. Quem publica copia `out/` para
 * dentro do site do protótipo, em `teste/` (ver netlify.toml e docs/operations/publicar-a-versao-de-teste.md).
 *
 * Uso: node scripts/build-demo.mjs            (gera tudo; DEMO_DIST_DIR=.next-demo muda a pasta de saída)
 *      node scripts/build-demo.mjs --so-pacotes (refaz só o que vai ao lado do app, sem o next build)
 *
 * Variáveis de ambiente de verdade, não `VAR=x npm run`: isto roda igual no Windows, no Netlify e na CI.
 * Nada aqui usa segredo; só baixa o Pyodide e os pacotes de Python com hash conferido.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND = path.resolve(FRONTEND, "..", "backend");
// No Netlify e na CI a saída é `out/`. Localmente, com um `next dev` aberto, use DEMO_DIST_DIR=.next-demo:
// com `output: "export"` a pasta de build é também o destino da exportação (e `.next` é a do servidor).
const DIST_DIR = process.env.DEMO_DIST_DIR;
const OUT = path.join(FRONTEND, DIST_DIR || "out");
const DEMO = path.join(OUT, "demo");
const CACHE = path.join(FRONTEND, ".demo-cache");
const config = JSON.parse(fs.readFileSync(path.join(FRONTEND, "scripts", "demo-packages.json"), "utf8"));
const pyodideRoot = path.join(FRONTEND, "node_modules", "pyodide");
const installed = JSON.parse(fs.readFileSync(path.join(pyodideRoot, "package.json"), "utf8")).version;
if (installed !== config.pyodide) {
  throw new Error(`Pyodide instalado (${installed}) é diferente do manifesto (${config.pyodide})`);
}

const log = (text) => console.log(`[demo] ${text}`);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function download(url, expected, name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const cached = path.join(CACHE, `${expected}-${name}`);
  if (fs.existsSync(cached)) {
    // Uma escrita interrompida deixa arquivo truncado no cache: confere o hash também aqui.
    const buffer = fs.readFileSync(cached);
    if (sha256(buffer) === expected) return buffer;
    fs.rmSync(cached, { force: true });
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (sha256(buffer) !== expected) throw new Error(`${name}: hash diferente do esperado (${url})`);
  fs.writeFileSync(cached, buffer);
  return buffer;
}

function buildApp() {
  log("Gerando o app (next build, modo demonstração)…");
  const env = {
    ...process.env,
    NEXT_PUBLIC_DEMO: "1",
    NEXT_PUBLIC_BASE_PATH: "/teste",
    NEXT_PUBLIC_TEST_ENV: "1",
    NEXT_PUBLIC_PROTOTYPE_URL: "/",
    // Só para o app montar os endereços: nenhuma chamada sai do navegador.
    NEXT_PUBLIC_API_URL: "http://demonstracao.invalid",
  };
  delete env.NEXT_DIST_DIR;
  if (DIST_DIR) env.NEXT_DIST_DIR = DIST_DIR;
  fs.rmSync(OUT, { recursive: true, force: true });
  const next = path.join(FRONTEND, "node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [next, "build"], { cwd: FRONTEND, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error("next build falhou");
  if (!fs.existsSync(path.join(OUT, "index.html"))) throw new Error(`o next build não gerou ${path.relative(FRONTEND, OUT)}/index.html`);
}

async function copyPyodide() {
  log(`Copiando o Pyodide ${config.pyodide}…`);
  const target = path.join(DEMO, "pyodide");
  fs.mkdirSync(target, { recursive: true });
  for (const file of ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
    fs.copyFileSync(path.join(pyodideRoot, file), path.join(target, file));
  }
  const lock = JSON.parse(fs.readFileSync(path.join(pyodideRoot, "pyodide-lock.json"), "utf8"));
  const wanted = new Map();
  const visit = (key) => {
    if (wanted.has(key)) return;
    const entry = lock.packages[key] ?? Object.values(lock.packages).find((p) => p.name === key);
    if (!entry) throw new Error(`Pacote ${key} não existe no Pyodide ${config.pyodide}`);
    wanted.set(key, entry);
    for (const dependency of entry.depends ?? []) visit(dependency);
  };
  config.pyodidePackages.forEach(visit);
  log(`Baixando ${wanted.size} bibliotecas do Pyodide…`);
  for (const entry of wanted.values()) {
    const url = `https://cdn.jsdelivr.net/pyodide/v${config.pyodide}/full/${entry.file_name}`;
    fs.writeFileSync(path.join(target, entry.file_name), await download(url, entry.sha256, entry.file_name));
  }
}

async function copyPureWheels() {
  log(`Baixando ${config.pure.length} pacotes de Python…`);
  const target = path.join(DEMO, "vendor");
  fs.mkdirSync(target, { recursive: true });
  for (const wheel of config.pure) {
    fs.writeFileSync(path.join(target, wheel.file), await download(wheel.url, wheel.sha256, wheel.file));
  }
}

function listPython(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__pycache__" ? [] : listPython(full);
    return entry.name.endsWith(".py") ? [full] : [];
  });
}

function bundleBackend() {
  const files = {};
  const add = (full) => {
    files[path.relative(BACKEND, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
  };
  for (const dir of ["api", "core", "db", "models", "schemas", "services"]) {
    listPython(path.join(BACKEND, dir)).forEach(add);
  }
  for (const file of ["main.py", "demo_runtime.py", "scripts/seed_demo.py", "scripts/seed_demonstracao.py"]) {
    add(path.join(BACKEND, file));
  }
  fs.writeFileSync(path.join(DEMO, "backend.json"), JSON.stringify({ files }));
  log(`Backend empacotado: ${Object.keys(files).length} arquivos`);
}

async function main() {
  const onlyPackages = process.argv.includes("--so-pacotes");
  if (!onlyPackages) buildApp();
  fs.mkdirSync(DEMO, { recursive: true });
  fs.copyFileSync(path.join(FRONTEND, "scripts", "demo-worker.js"), path.join(DEMO, "worker.js"));
  await copyPyodide();
  await copyPureWheels();
  bundleBackend();
  fs.writeFileSync(
    path.join(DEMO, "manifest.json"),
    JSON.stringify({
      pyodide: config.pyodide,
      pyodidePackages: config.pyodidePackages,
      pureWheels: config.pure.map((wheel) => wheel.file),
    })
  );
  log(`Pronto: frontend/${path.relative(FRONTEND, OUT).split(path.sep).join("/")}/`);
}

main().catch((error) => {
  console.error(`[demo] ERRO: ${error.message}`);
  process.exit(1);
});
