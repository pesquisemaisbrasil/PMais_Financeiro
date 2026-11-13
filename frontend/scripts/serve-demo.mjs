/**
 * Serve o site como o Netlify serve: o protótipo (prototipo/financeiro) na raiz e a versão de
 * demonstração gerada em /teste, esta com a mesma política de segurança (CSP) do netlify.toml.
 * Para conferir na máquina (inclusive o "Voltar ao protótipo" e o botão do protótipo) e para o
 * teste de tela da demonstração.
 *
 * Uso: node scripts/serve-demo.mjs [pasta=out] [porta=3020]
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = path.resolve(FRONTEND, process.argv[2] ?? "out");
const prototypeRoot = path.resolve(FRONTEND, "..", "prototipo", "financeiro");
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
  ".md": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".whl": "application/octet-stream",
};

/** O arquivo de um endereço dentro de `root`: o próprio, a pasta com index.html ou "URL bonita" (.html). */
function find(root, relativePath) {
  const relative = decodeURIComponent(relativePath).replace(/^\/+/, "");
  const full = path.resolve(root, relative);
  if (!full.startsWith(root)) return null;
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  const index = path.join(full, "index.html");
  if (fs.existsSync(index)) return index;
  const page = `${full}.html`;
  return fs.existsSync(page) ? page : null;
}

function send(response, file, status, extraHeaders) {
  response.writeHead(status, {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  fs.createReadStream(file).pipe(response);
}

http
  .createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === PREFIX) {
      response.writeHead(301, { Location: `${PREFIX}/` }).end();
      return;
    }
    const pathname = url.pathname.replace(/(?<=.)\/$/, "");

    if (pathname === PREFIX || pathname.startsWith(`${PREFIX}/`)) {
      const file = find(demoRoot, pathname.slice(PREFIX.length));
      send(response, file ?? path.join(demoRoot, "404.html"), file ? 200 : 404, {
        "Content-Security-Policy": csp,
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Opener-Policy": "same-origin",
      });
      return;
    }

    // Fora de /teste é o protótipo, como no site do Netlify
    const file = find(prototypeRoot, pathname);
    send(response, file ?? path.join(prototypeRoot, "404.html"), file ? 200 : 404, {});
  })
  .listen(port, () => {
    console.log(`Protótipo em http://localhost:${port}/ e demonstração em http://localhost:${port}${PREFIX}/`);
  });
