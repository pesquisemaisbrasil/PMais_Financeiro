import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Router, type Request, type RequestHandler, type Response } from "express";
import { parse } from "cookie";

const SESSION_COOKIE = "pmais_demo_session";
const CSRF_COOKIE = "pmais_demo_csrf";
const SESSION_MS = 30 * 60 * 1000;
const CHALLENGE_MS = 20 * 60 * 1000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const demoPages = /^\/(?:$|demo(?:\/|$)|fundacao(?:\/|$)|modulos(?:\/|$)|implantacao(?:\/|$)|seguranca(?:\/|$)|acesso(?:\/|$)|documentacao(?:\/|$))/;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const derive = (value: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  scrypt(value, salt, 32, (error, key) => error ? reject(error) : resolve(key));
});
function cookies(req: Request): Record<string, string | undefined> {
  try { return parse(req.headers.cookie || ""); } catch { return {}; }
}

export function createDemoAccess(options: { password?: string; now?: () => number; localHttp?: boolean } = {}) {
  const password = options.password ?? process.env.PMAIS_DEMO_LOGIN_PASSWORD;
  const now = options.now ?? Date.now;
  const salt = randomBytes(16);
  const verifier = password ? derive(password, salt) : null;
  // These are demo-only, per-process sessions, never financial identities or permission grants.
  const sessions = new Map<string, { expires: number }>();
  const challenges = new Map<string, { expires: number; sessionHash: string | null }>();
  const attempts = new Map<string, { started: number; count: number }>();
  let globalWindow = { started: now(), count: 0 };
  const cookieOptions = {
    httpOnly: true,
    path: "/",
    secure: !options.localHttp,
    sameSite: options.localHttp ? "lax" as const : "none" as const,
    partitioned: !options.localHttp,
  };
  const router = Router();

  function cleanup() {
    for (const [key, value] of sessions) if (value.expires <= now()) sessions.delete(key);
    for (const [key, value] of challenges) if (value.expires <= now()) challenges.delete(key);
    for (const [key, value] of attempts) if (value.started + RATE_WINDOW_MS <= now()) attempts.delete(key);
  }
  function sessionHash(req: Request): string | null {
    const token = cookies(req)[SESSION_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const key = digest(token);
    const session = sessions.get(key);
    if (!session || session.expires <= now()) { sessions.delete(key); return null; }
    return key;
  }
  function csrf(req: Request, hash: string | null): boolean {
    const token = cookies(req)[CSRF_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token) || req.get("X-Pmais-CSRF") !== token) return false;
    const challenge = challenges.get(digest(token));
    return Boolean(challenge && challenge.expires > now() && challenge.sessionHash === hash);
  }
  function clearSessionCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
  }
  function reject(res: Response, status: number, code: string, message: string) {
    res.status(status).json({ ok: false, code, message });
  }
  router.use((_req, res, next) => {
    cleanup();
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/session", (req, res) => {
    if (!verifier) { reject(res, 503, "demo_access_not_configured", "Acesso à demonstração ainda não configurado."); return; }
    const hash = sessionHash(req);
    let token = cookies(req)[CSRF_COOKIE];
    const existing = token ? challenges.get(digest(token)) : null;
    if (!existing || existing.expires <= now() || existing.sessionHash !== hash) {
      if (challenges.size >= 2000) { reject(res, 429, "demo_access_busy", "Tente novamente em alguns minutos."); return; }
      token = randomBytes(32).toString("hex");
      challenges.set(digest(token), { expires: now() + CHALLENGE_MS, sessionHash: hash });
      res.cookie(CSRF_COOKIE, token, { ...cookieOptions, maxAge: CHALLENGE_MS });
    }
    if (!hash && cookies(req)[SESSION_COOKIE]) clearSessionCookie(res);
    res.json({ authenticated: hash !== null, login: hash ? "adm" : null, scope: "demo_only", csrf: token, expiresAt: hash ? sessions.get(hash)?.expires : null });
  });
  router.post("/login", async (req, res) => {
    if (!verifier) { reject(res, 503, "demo_access_not_configured", "Acesso à demonstração ainda não configurado."); return; }
    if (!req.is("application/json") || req.get("Sec-Fetch-Site") === "cross-site" || !csrf(req, sessionHash(req))) {
      reject(res, 403, "invalid_challenge", "Recarregue a tela antes de tentar entrar."); return;
    }
    if (typeof req.body?.username !== "string" || typeof req.body?.password !== "string" || req.body.username.length > 32 || req.body.password.length > 256) {
      reject(res, 400, "invalid_credentials", "Login ou senha inválidos."); return;
    }
    const rateKey = digest(req.ip || req.socket.remoteAddress || "unknown");
    const window = attempts.get(rateKey) || { started: now(), count: 0 };
    if (globalWindow.started + RATE_WINDOW_MS <= now()) globalWindow = { started: now(), count: 0 };
    if (window.count >= 10 || globalWindow.count >= 30 || attempts.size >= 2000 || sessions.size >= 1000) {
      res.setHeader("Retry-After", "300");
      reject(res, 429, "too_many_attempts", "Muitas tentativas. Aguarde alguns minutos."); return;
    }
    window.count += 1; globalWindow.count += 1; attempts.set(rateKey, window);
    try {
      const candidate = await derive(req.body.password, salt);
      const validPassword = timingSafeEqual(candidate, await verifier);
      if (!validPassword || req.body.username !== "adm") { reject(res, 401, "invalid_credentials", "Login ou senha inválidos."); return; }
      const oldHash = sessionHash(req);
      if (oldHash) sessions.delete(oldHash);
      const token = randomBytes(32).toString("hex");
      sessions.set(digest(token), { expires: now() + SESSION_MS });
      const challenge = cookies(req)[CSRF_COOKIE];
      if (challenge) challenges.delete(digest(challenge));
      res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MS });
      res.json({ ok: true });
    } catch { reject(res, 503, "demo_access_unavailable", "Não foi possível verificar o acesso. Tente novamente."); }
  });
  router.post("/logout", (req, res) => {
    const hash = sessionHash(req);
    if (!req.is("application/json") || req.get("Sec-Fetch-Site") === "cross-site" || !csrf(req, hash)) {
      reject(res, 403, "invalid_challenge", "Atualize a sessão antes de sair."); return;
    }
    if (hash) sessions.delete(hash);
    const token = cookies(req)[CSRF_COOKIE];
    if (token) challenges.delete(digest(token));
    clearSessionCookie(res);
    res.clearCookie(CSRF_COOKIE, cookieOptions);
    res.json({ ok: true });
  });
  router.use((_req, res) => reject(res, 404, "not_found", "Endpoint de acesso não disponível."));

  const requirePage: RequestHandler = (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || !demoPages.test(req.path)) { next(); return; }
    res.setHeader("Cache-Control", "no-store");
    if (!sessionHash(req)) { res.redirect(302, "/login"); return; }
    next();
  };
  return { router, requirePage };
}
