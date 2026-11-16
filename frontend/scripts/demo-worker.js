/* Worker da versão de demonstração: roda o backend real (Python, via Pyodide) dentro do navegador.
 *
 * A página manda `{ id, method, path, headers, body }` e recebe `{ id, status, headers, body }`.
 * Os arquivos ao lado (pyodide/, vendor/, backend.json, manifest.json) são gerados por
 * frontend/scripts/build-demo.mjs; nada daqui chama a internet.
 * Um pedido por vez: o banco é uma conexão só, e dois pedidos misturados se atropelariam.
 *
 * O banco (em memória) é guardado no IndexedDB do navegador depois de cada escrita e volta na
 * próxima visita; recarregar a página não apaga o que foi feito. Cada navegador tem o seu. A cópia
 * só vale para a mesma estrutura de tabelas (`schemaId` do manifest): se mudar, recomeça do zero.
 */
/* global importScripts, loadPyodide */

const BASE = new URL("./", self.location.href).href;

let pyodide = null;
let runtime = null;
let schemaId = "";
let queue = Promise.resolve();

// ---- O banco guardado no navegador ----
const STORE = { name: "financeiro-demonstracao", table: "estado", key: "banco" };

function openStore() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(STORE.name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE.table);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function withStore(mode, run) {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = run(db.transaction(STORE.table, mode).objectStore(STORE.table));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** A cópia da visita anterior, se for da mesma estrutura de tabelas. Sem armazenamento (janela
 * privativa), a demonstração funciona do mesmo jeito, só não guarda. */
async function loadSaved() {
  try {
    const found = await withStore("readonly", (store) => store.get(STORE.key));
    if (found && found.schemaId === schemaId && found.bytes instanceof Uint8Array) return found.bytes;
  } catch (error) {
    console.error("[demonstração] não foi possível ler o estado guardado", error);
  }
  return null;
}

async function persist() {
  try {
    const proxy = runtime.snapshot();
    const bytes = proxy.toJs();
    proxy.destroy();
    await withStore("readwrite", (store) => store.put({ schemaId, bytes }, STORE.key));
  } catch (error) {
    console.error("[demonstração] não foi possível guardar o estado", error);
  }
}

async function forgetSaved() {
  try {
    await withStore("readwrite", (store) => store.delete(STORE.key));
  } catch (error) {
    console.error("[demonstração] não foi possível apagar o estado guardado", error);
  }
}

function progress(text) {
  self.postMessage({ type: "progress", text });
}

async function boot() {
  progress("Carregando o Python…");
  importScripts(`${BASE}pyodide/pyodide.js`);
  pyodide = await loadPyodide({ indexURL: `${BASE}pyodide/` });

  const manifest = await (await fetch(`${BASE}manifest.json`)).json();
  schemaId = String(manifest.schemaId ?? "");

  progress("Carregando as bibliotecas…");
  await pyodide.loadPackage(manifest.pyodidePackages);

  progress("Carregando as demais bibliotecas…");
  for (const wheel of manifest.pureWheels) {
    const buffer = await (await fetch(`${BASE}vendor/${wheel}`)).arrayBuffer();
    pyodide.unpackArchive(buffer, "wheel", { extractDir: "/vendor" });
  }

  progress("Carregando o Financeiro…");
  const backend = await (await fetch(`${BASE}backend.json`)).json();
  for (const [path, source] of Object.entries(backend.files)) {
    const target = `/backend/${path}`;
    pyodide.FS.mkdirTree(target.slice(0, target.lastIndexOf("/")));
    pyodide.FS.writeFile(target, source);
  }

  progress("Preparando os dados de exemplo…");
  pyodide.runPython(`
import sys
sys.path.insert(0, "/backend")
sys.path.insert(0, "/vendor")
`);
  runtime = pyodide.pyimport("demo_runtime");
  // `undefined` (e não `null`) vira `None` no Python: sem cópia guardada, nasce do zero
  runtime.start((await loadSaved()) ?? undefined);
}

async function handle({ method, path, headers, body }) {
  const result = await runtime.handle(method, path, pyodide.toPy(headers), body);
  const [status, responseHeaders, responseBody] = result.toJs({ create_proxies: false });
  result.destroy();
  return { status, headers: responseHeaders, body: responseBody };
}

function run(job) {
  queue = queue.then(job, job);
  return queue;
}

const ready = boot().then(
  () => self.postMessage({ type: "ready" }),
  (error) => self.postMessage({ type: "error", message: String((error && error.message) || error) })
);

self.onmessage = (event) => {
  const message = event.data;
  run(async () => {
    await ready;
    if (!runtime) return;
    try {
      if (message.type === "request") {
        const response = await handle(message);
        // O que mudou o banco fica guardado antes de a tela saber que deu certo: se a pessoa recarregar
        // logo em seguida, o trabalho está lá.
        if (response.status < 400 && !["GET", "HEAD", "OPTIONS"].includes(message.method)) {
          await persist();
        }
        self.postMessage({ type: "response", id: message.id, ...response }, [response.body.buffer]);
      } else if (message.type === "totp") {
        // kind: "financeiro" (o acesso das meninas) ou "dev" (o do desenvolvimento)
        self.postMessage({ type: "totp", id: message.id, value: runtime.totp_code(message.kind) });
      } else if (message.type === "credentials") {
        const proxy = runtime.credentials(message.kind);
        const value = proxy.toJs({ dict_converter: Object.fromEntries });
        self.postMessage({ type: "credentials", id: message.id, value });
        proxy.destroy();
      } else if (message.type === "reset") {
        runtime.reset();
        await forgetSaved();
        self.postMessage({ type: "reset", id: message.id });
      }
    } catch (error) {
      console.error("[demonstração]", error);
      self.postMessage({
        type: "failure",
        id: message.id,
        message: String((error && error.message) || error),
      });
    }
  });
};
