import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Message = Record<string, unknown> & { type: string; id: number };

let sent: Message[] = [];
let answer: (message: Message) => Record<string, unknown> | null = () => null;
let storage: Record<string, string> = {};

class FakeWorker {
  onmessage: ((event: { data: Record<string, unknown> }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    queueMicrotask(() => this.onmessage?.({ data: { type: "ready" } }));
  }
  postMessage(message: Message) {
    sent.push(message);
    const reply = answer(message);
    if (reply) queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ...reply } }));
  }
}

async function load() {
  vi.resetModules();
  return import("./client");
}

const bytes = (text: string) => new TextEncoder().encode(text);

beforeEach(() => {
  sent = [];
  storage = {};
  answer = () => null;
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => void (storage[key] = value),
      removeItem: (key: string) => void delete storage[key],
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("demoFetch", () => {
  it("manda método, caminho com a query e devolve a resposta do backend do navegador", async () => {
    answer = () => ({
      type: "response",
      status: 200,
      headers: [["content-type", "application/json"]],
      body: bytes('{"ok":true}'),
    });
    const { demoFetch } = await load();

    const response = await demoFetch("http://demonstracao.invalid/payables?mode=tudo&page=2");

    expect(sent[0]).toMatchObject({ type: "request", method: "GET", path: "/payables?mode=tudo&page=2" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("serializa o corpo (formulário e JSON) e leva o Content-Type", async () => {
    answer = () => ({ type: "response", status: 200, headers: [], body: bytes("{}") });
    const { demoFetch } = await load();

    await demoFetch("http://demonstracao.invalid/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: "a@b.c", password: "x y" }),
    });
    await demoFetch("http://demonstracao.invalid/payables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "10.00" }),
    });

    const [form, json] = sent;
    expect(new TextDecoder().decode(form.body as Uint8Array)).toBe("username=a%40b.c&password=x+y");
    expect(Object.fromEntries(form.headers as [string, string][])["content-type"]).toContain(
      "application/x-www-form-urlencoded"
    );
    expect(new TextDecoder().decode(json.body as Uint8Array)).toBe('{"amount":"10.00"}');
  });

  it("resposta 204 não tem corpo", async () => {
    answer = () => ({ type: "response", status: 204, headers: [], body: new Uint8Array() });
    const { demoFetch } = await load();

    const response = await demoFetch("http://demonstracao.invalid/auth/logout", { method: "POST" });

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it("o cookie de renovação vira marca local e volta só para a renovação e a saída", async () => {
    answer = (message) =>
      message.path === "/auth/token/mfa"
        ? {
            type: "response",
            status: 200,
            headers: [["set-cookie", "refresh_token=abc123; HttpOnly; Max-Age=604800; Path=/auth"]],
            body: bytes("{}"),
          }
        : { type: "response", status: 200, headers: [], body: bytes("{}") };
    const { demoFetch } = await load();

    await demoFetch("http://demonstracao.invalid/auth/token/mfa", { method: "POST" });
    await demoFetch("http://demonstracao.invalid/auth/token/refresh", { method: "POST" });
    await demoFetch("http://demonstracao.invalid/payables");

    expect(storage["financeiro:demo:refresh"]).toBe("abc123");
    const cookie = (index: number) =>
      (sent[index].headers as [string, string][]).find(([name]) => name === "cookie")?.[1];
    expect(cookie(1)).toBe("refresh_token=abc123");
    expect(cookie(2)).toBeUndefined();
  });

  it("cookie apagado pelo backend (Max-Age=0) apaga a marca local", async () => {
    storage["financeiro:demo:refresh"] = "abc123";
    const { rememberRefreshCookie } = await load();

    rememberRefreshCookie('refresh_token=""; Max-Age=0; Path=/auth');

    expect(storage["financeiro:demo:refresh"]).toBeUndefined();
  });

  it("outros cookies são ignorados", async () => {
    const { rememberRefreshCookie } = await load();

    rememberRefreshCookie("sso_state=zzz; Path=/auth/sso");

    expect(storage).toEqual({});
  });

  it("falha do backend do navegador vira erro", async () => {
    answer = () => ({ type: "failure", message: "boom" });
    const { demoFetch } = await load();

    await expect(demoFetch("http://demonstracao.invalid/home")).rejects.toThrow("boom");
  });
});

describe("estado da demonstração", () => {
  it("começa preparando e fica pronto quando o backend avisa", async () => {
    const { getDemoState, startDemo } = await load();
    expect(getDemoState().phase).toBe("starting");

    await startDemo();

    expect(getDemoState().phase).toBe("ready");
  });

  it("sem NEXT_PUBLIC_DEMO a demonstração fica desligada", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO", "");
    expect((await load()).DEMO).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_DEMO", "1");
    expect((await load()).DEMO).toBe(true);
  });
});
