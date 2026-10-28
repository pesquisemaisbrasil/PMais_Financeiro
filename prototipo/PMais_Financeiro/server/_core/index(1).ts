import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDeploymentStatus } from "../services/deployment";
import { readOnlyGuard } from "../security/readOnlyGuard";
import { contentPolicy } from "../security/contentPolicy";
import { createDemoAccess } from "../security/demoAccess";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    // Keep Manus Preview embedding possible. No restrictive frame-ancestor/X-Frame-Options.
    res.setHeader("Content-Security-Policy", contentPolicy(process.env.NODE_ENV === "development"));
    next();
  });
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  const demoAccess = createDemoAccess({ localHttp: process.env.PMAIS_DEMO_LOCAL_HTTP === "1" });
  app.use("/api/demo-access", express.json({ limit: "2kb" }), demoAccess.router);
  app.use("/api/demo-access", (_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).json({ ok: false, code: "invalid_request", message: "Não foi possível processar o acesso. Confira os campos." });
  });
  app.use(readOnlyGuard);
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok", mode: "read_only" }));
  app.get("/api/deployment/status", async (_req, res) => {
    try { res.json(await getDeploymentStatus()); }
    catch { res.status(503).json({ code: "status_unavailable", detail: "Não foi possível verificar o ambiente. Tente novamente." }); }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.type("application/javascript").send(publicPlatformScript());
  });
  // OAuth is intentionally not registered: it cannot substitute the postponed app access/MFA.
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  app.use("/api", (_req, res) => res.status(404).json({ code: "not_found", detail: "Endpoint não disponível nesta etapa." }));

  app.use(demoAccess.requirePage);
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", () => { console.error("Servidor indisponível."); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`P+ Financeiro • modo implantação • porta ${port}`));
}

startServer().catch(() => { console.error("Não foi possível iniciar o servidor."); process.exit(1); });
