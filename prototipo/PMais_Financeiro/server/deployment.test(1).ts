import { describe, expect, it, vi } from "vitest";
import { buildDeploymentStatus } from "./services/deployment";
import { readOnlyGuard } from "./security/readOnlyGuard";
import { modules } from "../shared/catalog";

const now = "2026-10-25T06:00:00.000Z";

describe("status técnico sem dados de negócio", () => {
  it("distingue configuração ausente e nunca libera acesso financeiro", () => {
    expect(buildDeploymentStatus({}, "not_configured", now)).toEqual({
      mode: "read_only", application: "P+ Financeiro", checkedAt: now,
      database: { state: "not_configured" },
      security: { signingConfigured: false, mfaConfigured: false, accessEnabled: false },
      connect: { validated: false }, businessDataEnabled: false,
    });
  });
  it("nunca revela valores de segredos nem libera acesso se chaves estiverem presentes", () => {
    const status = buildDeploymentStatus({
      PMAIS_SESSION_SIGNING_SECRET: "fixture-only-signing-secret",
      PMAIS_MFA_ENCRYPTION_KEY: "fixture-only-mfa-secret",
      DATABASE_URL: "mysql://fixture-password@private-host/fixture",
      CONNECT_CLIENT_SECRET: "fixture-only-connect-secret",
    }, "available", now);
    expect(status.security).toEqual({ signingConfigured: true, mfaConfigured: true, accessEnabled: false });
    expect(status.connect.validated).toBe(false);
    expect(status.businessDataEnabled).toBe(false);
    expect(JSON.stringify(status)).not.toMatch(/fixture|private-host|password|mysql:/);
  });
  it("relata indisponibilidade do banco sem inventar disponibilidade", () => {
    expect(buildDeploymentStatus({}, "unavailable", now).database.state).toBe("unavailable");
  });
});

describe("bloqueio HTTP no modo somente leitura", () => {
  function invoke(path: string, method = "GET") {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const res = { status, json, setHeader: vi.fn() };
    const next = vi.fn();
    readOnlyGuard({ path, method, headers: { cookie: "webdev_app_session=fixture" } } as never, res as never, next);
    return { status, json, next };
  }
  for (const path of ["/api/auth/token", "/api/users", "/api/admin/audit", "/api/payments/1", "/api/finance/summary", "/api/connect", "/api/receipts", "/api/uploads", "/oauth/token", "/integrations/v1/payments", "/token"]) {
    it(`bloqueia ${path} independentemente de cookies`, () => {
      const result = invoke(path);
      expect(result.status).toHaveBeenCalledWith(503);
      expect(result.json).toHaveBeenCalledWith(expect.objectContaining({ code: "protected_area_unavailable" }));
      expect(result.next).not.toHaveBeenCalled();
    });
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    it(`não admite escrita via ${method}`, () => {
      expect(invoke("/api/trpc/finance.confirm", method).status).toHaveBeenCalledWith(503);
    });
  }
  for (const path of ["/", "/modulos/contas", "/api/health", "/api/deployment/status", "/api/trpc/deployment.status", "/api/platform/config.js"]) {
    it(`permite somente a leitura informativa ${path}`, () => {
      expect(invoke(path).next).toHaveBeenCalledOnce();
    });
  }
});

describe("catálogo documental", () => {
  it("tem sete módulos únicos, fluxos e salvaguardas, não registros financeiros", () => {
    expect(modules).toHaveLength(7);
    expect(new Set(modules.map(m => m.id)).size).toBe(7);
    for (const module of modules) {
      expect(module.flow.length).toBeGreaterThan(0);
      expect(module.safeguards.length).toBeGreaterThan(0);
      expect(module.prerequisite).toBeTruthy();
      expect(module).not.toHaveProperty("amount");
      expect(module).not.toHaveProperty("balance");
      expect(module).not.toHaveProperty("user");
    }
  });
});
