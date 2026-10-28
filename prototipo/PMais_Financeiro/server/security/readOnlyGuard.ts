import type { RequestHandler } from "express";

const protectedPrefixes = [
  "/api/auth", "/api/oauth", "/api/admin", "/api/users", "/api/finance", "/api/payments",
  "/api/audit", "/api/uploads", "/api/receipts", "/api/connect", "/api/contas", "/api/token",
  "/api/logout", "/integrations", "/oauth", "/token", "/logout",
];

export const readOnlyGuard: RequestHandler = (req, res, next) => {
  const path = req.path.toLowerCase();
  const protectedPath = protectedPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  const apiWrite = path.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (protectedPath || apiWrite) {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      code: "protected_area_unavailable",
      detail: "Área protegida indisponível. Configure e valide autenticação e MFA antes de habilitar operações.",
    });
    return;
  }
  next();
};
