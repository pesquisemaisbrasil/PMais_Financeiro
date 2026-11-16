/**
 * Serve o site como o Netlify serve: o protótipo (prototipo/financeiro) na raiz e a versão de
 * demonstração gerada em /teste, esta com a mesma política de segurança (CSP) do netlify.toml, e as
 * solicitações da equipe em /api/solicitacoes (a regra da função do Netlify, guardando em memória).
 * Para conferir na máquina (inclusive o "Voltar ao protótipo" e o botão do protótipo) e para o
 * teste de tela da demonstração.
 *
 * Uso: node scripts/serve-demo.mjs [pasta=out] [porta=3020]
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle, memoryStore } from "../netlify/solicitacoes.mjs";

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

// As solicitações da equipe: a mesma regra da função do Netlify, com o armazenamento em memória e a
// chave de teste (SOLICITACOES_CHAVE). Somem quando o servidor para.
const feedbackStore = memoryStore();
const feedbackKey = process.env.SOLICITACOES_CHAVE ?? "chave-de-teste-local";

async function feedback(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const answer = await handle(
    new Request(`http://localhost:${port}${request.url}`, {
      method: request.method,
      headers: Object.entries(request.headers).flatMap(([name, value]) =>
        value === undefined ? [] : [[name, Array.isArray(value) ? value.join(", ") : value]]
      ),
      body: body.length ? body : undefined,
    }),
    { store: feedbackStore, key: feedbackKey }
  );
  response.writeHead(answer.status, Object.fromEntries(answer.headers));
  response.end(Buffer.from(await answer.arrayBuffer()));
}

http
  .createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/solicitacoes" || url.pathname.startsWith("/api/solicitacoes/")) {
      feedback(request, response).catch(() => response.writeHead(500).end());
      return;
    }
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
