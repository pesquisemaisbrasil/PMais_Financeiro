/**
 * Serve a versão de demonstração como o Netlify serve: a pasta gerada fica em /teste, com a mesma
 * política de segurança (CSP) do netlify.toml. Para conferir na máquina e para o teste de tela.
 *
 * Uso: node scripts/serve-demo.mjs [pasta=out] [porta=3020]
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(FRONTEND, process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 3020);
const PREFIX = "/teste";

const toml = fs.readFileSync(path.join(FRONTEND, "..", "netlify.toml"), "utf8");
const csp = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)?.[1];
if (!csp) throw new Error("Não achei a Content-Security-Policy no netlify.toml");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".whl": "application/octet-stream",
};

function find(urlPath) {
  const relative = decodeURIComponent(urlPath.slice(PREFIX.length)).replace(/^\/+/, "");
  const full = path.resolve(root, relative);
  if (!full.startsWith(root)) return null;
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  const index = path.join(full, "index.html");
  if (fs.existsSync(index)) return index;
  // "URLs bonitas" do Netlify: /teste/login serve login.html
  const page = `${full}.html`;
  return fs.existsSync(page) ? page : null;
}

http
  .createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === PREFIX) {
      response.writeHead(301, { Location: `${PREFIX}/` }).end();
      return;
    }
    if (!url.pathname.startsWith(`${PREFIX}/`)) {
      response.writeHead(404).end("fora de /teste");
      return;
    }
    let file = find(url.pathname.replace(/(?<=.)\/$/, ""));
    let status = 200;
    if (!file) {
      file = path.join(root, "404.html");
      status = 404;
    }
    response.writeHead(status, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(response);
  })
  .listen(port, () => console.log(`Demonstração em http://localhost:${port}${PREFIX}/`));
