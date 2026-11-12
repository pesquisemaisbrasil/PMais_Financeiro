/**
 * Versão de demonstração (NEXT_PUBLIC_DEMO=1): o backend real roda dentro do navegador, num Web
 * Worker com o Pyodide (public/demo/worker.js), e este arquivo faz o papel do `fetch`.
 *
 * Fora da demonstração (desenvolvimento e produção) nada daqui roda: o `fetch` de verdade é usado.
 * docs/operations/publicar-a-versao-de-teste.md
 */
import { BASE_PATH } from "@/lib/basePath";

// As variáveis NEXT_PUBLIC_* só entram no navegador quando aparecem escritas assim, por inteiro.
export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

const REFRESH_KEY = "financeiro:demo:refresh";
// Endereço de enfeite: a tela monta URLs absolutas, e só o caminho vale para o backend do navegador.
const ORIGIN = "http://demonstracao.invalid";

export interface DemoState {
  phase: "starting" | "ready" | "error";
  text: string;
}

interface Reply {
  type: string;
  id: number;
  [key: string]: unknown;
}

let state: DemoState = { phase: "starting", text: "Preparando a demonstração…" };
const listeners = new Set<(state: DemoState) => void>();
const pending = new Map<number, { resolve: (reply: Reply) => void; reject: (error: Error) => void }>();
let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;

function emit(next: DemoState) {
  state = next;
  listeners.forEach((listener) => listener(state));
}

export function getDemoState(): DemoState {
  return state;
}

export function subscribeDemo(listener: (state: DemoState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Liga o backend do navegador (uma vez só). Quem precisa dele espera por esta promessa. */
export function startDemo(): Promise<void> {
  ready ??= new Promise<void>((resolve, reject) => {
    worker = new Worker(`${BASE_PATH}/demo/worker.js`);
    worker.onmessage = (event: MessageEvent<Reply & { text?: string; message?: string }>) => {
      const message = event.data;
      if (message.type === "progress") emit({ phase: "starting", text: String(message.text) });
      else if (message.type === "ready") {
        emit({ phase: "ready", text: "" });
        resolve();
      } else if (message.type === "error") {
        emit({ phase: "error", text: String(message.message) });
        reject(new Error(String(message.message)));
      } else {
        const waiting = pending.get(message.id);
        if (!waiting) return;
        pending.delete(message.id);
        if (message.type === "failure") waiting.reject(new Error(String(message.message)));
        else waiting.resolve(message);
      }
    };
    worker.onerror = () => {
      const text = "Não foi possível carregar a demonstração neste navegador.";
      emit({ phase: "error", text });
      reject(new Error(text));
    };
  });
  return ready;
}

async function call(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<Reply> {
  await startDemo();
  const id = nextId++;
  return new Promise<Reply>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ ...message, id }, transfer);
  });
}

// ---- A sessão: o cookie de renovação do backend (HttpOnly, path /auth) vira uma marca local ----

function storedRefresh(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function storeRefresh(value: string | null) {
  try {
    if (value) window.localStorage.setItem(REFRESH_KEY, value);
    else window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    // sem armazenamento (janela privativa): a sessão só dura até recarregar
  }
}

/** Lê um `Set-Cookie` do backend e guarda ou apaga o cookie de renovação. */
export function rememberRefreshCookie(setCookie: string) {
  const [pair, ...attributes] = setCookie.split(";").map((part) => part.trim());
  const separator = pair.indexOf("=");
  if (pair.slice(0, separator) !== "refresh_token") return;
  const value = pair.slice(separator + 1).replace(/^"|"$/g, "");
  const expired = attributes.some((attribute) => /^max-age=0$/i.test(attribute));
  storeRefresh(value && !expired ? value : null);
}

const SESSION_PATHS = new Set(["/auth/token/refresh", "/auth/logout"]);

/** O que o `fetch` faria: manda o pedido para o backend do navegador e devolve uma `Response`. */
export async function demoFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, ORIGIN);
  // `Request` serializa o corpo (JSON, formulário, arquivos) e põe o Content-Type certo.
  const request = new Request(url, init);
  const headers: [string, string][] = [...request.headers.entries()];
  const refresh = SESSION_PATHS.has(url.pathname) ? storedRefresh() : null;
  if (refresh) headers.push(["cookie", `refresh_token=${refresh}`]);
  const body = new Uint8Array(await request.arrayBuffer());

  const reply = await call(
    { type: "request", method: request.method, path: url.pathname + url.search, headers, body },
    [body.buffer]
  );

  const replyHeaders = new Headers();
  for (const [name, value] of reply.headers as [string, string][]) {
    if (name.toLowerCase() === "set-cookie") rememberRefreshCookie(value);
    else replyHeaders.append(name, value);
  }
  const status = reply.status as number;
  const noBody = status === 204 || status === 205 || status === 304;
  return new Response(noBody ? null : (reply.body as Uint8Array<ArrayBuffer>), {
    status,
    headers: replyHeaders,
  });
}

export interface DemoCredentials {
  email: string;
  password: string;
}

/** E-mail e senha fictícios da demonstração. */
export async function demoCredentials(): Promise<DemoCredentials> {
  return (await call({ type: "credentials" })).value as DemoCredentials;
}

/** O código do autenticador do momento (muda a cada 30 s). */
export async function demoCode(): Promise<string> {
  return (await call({ type: "totp" })).value as string;
}

/** Apaga o que foi feito e volta aos dados de exemplo; quem chama recarrega a página. */
export async function resetDemo(): Promise<void> {
  await call({ type: "reset" });
  storeRefresh(null);
}
