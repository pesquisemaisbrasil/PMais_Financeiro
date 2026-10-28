import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createDemoAccess } from "./security/demoAccess";
import { readOnlyGuard } from "./security/readOnlyGuard";

const FIXTURE_PASSWORD = "fixture-only-password";
const servers: Server[] = [];
async function fixture(password = FIXTURE_PASSWORD) {
  let time = Date.now();
  const access = createDemoAccess({ password, now: () => time });
  const app = express();
  app.use("/api/demo-access", express.json({ limit: "2kb" }), access.router);
  app.use(readOnlyGuard);
  app.use(access.requirePage);
  app.get(["/", "/demo/contas"], (_req, res) => res.send("fixture-demo-only"));
  const server = createServer(app); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test listener unavailable");
  const origin = `http://127.0.0.1:${address.port}`;
  const jar = new Map<string, string>();
  let csrf = "";
  async function request(path: string, method = "GET", body?: object, token = csrf) {
    const response = await fetch(origin + path, {
      method, redirect: "manual",
      headers: { "Cookie": [...jar].map(([k,v]) => `${k}=${v}`).join("; "), "Content-Type": "application/json", "X-Pmais-CSRF": token },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const entry = cookie.split(";")[0]; const split = entry.indexOf("=");
      const name = entry.slice(0, split); const value = entry.slice(split + 1);
      if (value) jar.set(name, value); else jar.delete(name);
    }
    return response;
  }
  async function session() {
    const response = await request("/api/demo-access/session");
    const data = await response.json(); csrf = data.csrf || "";
    return { response, data };
  }
  return { request, session, jar, advance: (ms: number) => { time += ms; } };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeIdleConnections(); server.close(() => resolve());
  })));
});

describe("Acesso compartilhado restrito à demonstração", () => {
  it("sem senha configurada recusa e nunca inventa identidade", async () => {
    const f = await fixture(""); const { response, data } = await f.session();
    expect(response.status).toBe(503); expect(data.code).toBe("demo_access_not_configured");
    expect((await f.request("/")).status).toBe(302);
  });
  it("nega páginas sem sessão ou com token inventado e não usa cookie OAuth", async () => {
    const f = await fixture();
    expect((await f.request("/demo/contas")).headers.get("location")).toBe("/login");
    f.jar.set("pmais_demo_session", "a".repeat(64)); f.jar.set("webdev_app_session", "untrusted");
    expect((await f.session()).data.authenticated).toBe(false);
  });
  it("emite cookie CSRF elegível ao iframe HTTPS, sem liberar acesso", async () => {
    const f = await fixture(); const { response, data } = await f.session();
    expect(data.authenticated).toBe(false); expect(data.scope).toBe("demo_only");
    const cookie = response.headers.getSetCookie().join(";");
    for (const attr of ["HttpOnly", "Secure", "SameSite=None", "Partitioned", "Path=/"]) expect(cookie).toContain(attr);
  });
  it("exige desafio CSRF válido antes de verificar a credencial", async () => {
    const f = await fixture(); await f.session();
    expect((await f.request("/api/demo-access/login", "POST", { username:"adm",password:FIXTURE_PASSWORD }, "wrong")).status).toBe(403);
  });
  it("retorna erro genérico para senha errada e identificador diferente de adm", async () => {
    const f = await fixture(); await f.session();
    const wrongPassword = await f.request("/api/demo-access/login", "POST", { username:"adm",password:"wrong" });
    const wrongLogin = await f.request("/api/demo-access/login", "POST", { username:"ADM",password:FIXTURE_PASSWORD });
    expect(wrongPassword.status).toBe(401); expect(wrongLogin.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await wrongLogin.json());
  });
  it("cria sessão opaca mas mantém APIs financeiras/administrativas bloqueadas", async () => {
    const f = await fixture(); await f.session();
    const response = await f.request("/api/demo-access/login", "POST", { username:"adm",password:FIXTURE_PASSWORD });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ok:true});
    const token = f.jar.get("pmais_demo_session"); expect(token).toMatch(/^[a-f0-9]{64}$/);
    const { data } = await f.session(); expect(data.authenticated).toBe(true); expect(data.login).toBe("adm");
    expect((await f.request("/")).status).toBe(200);
    expect((await f.request("/api/admin/users")).status).toBe(503);
    expect((await f.request("/api/payments", "POST", {})).status).toBe(503);
  });
  it("logout revoga a sessão capturada, não só o cookie do navegador", async () => {
    const f = await fixture(); await f.session();
    await f.request("/api/demo-access/login", "POST", { username:"adm",password:FIXTURE_PASSWORD });
    await f.session(); const oldToken = f.jar.get("pmais_demo_session")!;
    expect((await f.request("/api/demo-access/logout", "POST", {})).status).toBe(200);
    f.jar.set("pmais_demo_session", oldToken);
    expect((await f.session()).data.authenticated).toBe(false);
  });
  it("expira após 30 minutos, independentemente do cookie presente", async () => {
    const f = await fixture(); await f.session();
    await f.request("/api/demo-access/login", "POST", { username:"adm",password:FIXTURE_PASSWORD });
    f.advance(31 * 60 * 1000);
    expect((await f.session()).data.authenticated).toBe(false);
  });
  it("limita tentativas por janela sem imprimir credenciais", async () => {
    const f = await fixture(); await f.session();
    for (let i = 0; i < 10; i++) expect((await f.request("/api/demo-access/login", "POST", { username:"adm",password:"wrong" })).status).toBe(401);
    const blocked = await f.request("/api/demo-access/login", "POST", { username:"adm",password:FIXTURE_PASSWORD });
    expect(blocked.status).toBe(429); expect(blocked.headers.get("Retry-After")).toBe("300");
  });
});
