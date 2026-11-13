/* Worker da versão de demonstração: roda o backend real (Python, via Pyodide) dentro do navegador.
 *
 * A página manda `{ id, method, path, headers, body }` e recebe `{ id, status, headers, body }`.
 * Os arquivos ao lado (pyodide/, vendor/, backend.json, manifest.json) são gerados por
 * frontend/scripts/build-demo.mjs; nada daqui chama a internet.
 * Um pedido por vez: o banco é uma conexão só, e dois pedidos misturados se atropelariam.
 */
/* global importScripts, loadPyodide */

const BASE = new URL("./", self.location.href).href;

let pyodide = null;
let runtime = null;
let queue = Promise.resolve();

function progress(text) {
  self.postMessage({ type: "progress", text });
}

async function boot() {
  progress("Carregando o Python…");
  importScripts(`${BASE}pyodide/pyodide.js`);
  pyodide = await loadPyodide({ indexURL: `${BASE}pyodide/` });

  const manifest = await (await fetch(`${BASE}manifest.json`)).json();

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
import demo_runtime
demo_runtime.start()
`);
  runtime = pyodide.pyimport("demo_runtime");
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
        self.postMessage({ type: "response", id: message.id, ...response }, [response.body.buffer]);
      } else if (message.type === "totp") {
        self.postMessage({ type: "totp", id: message.id, value: runtime.totp_code() });
      } else if (message.type === "credentials") {
        const proxy = runtime.credentials();
        const value = proxy.toJs({ dict_converter: Object.fromEntries });
        self.postMessage({ type: "credentials", id: message.id, value });
        proxy.destroy();
      } else if (message.type === "reset") {
        runtime.reset();
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
