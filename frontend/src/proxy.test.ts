import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCsp, proxy } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildCsp", () => {
  it("usa o nonce, strict-dynamic e fecha frame, object e base", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("libera unsafe-eval só em desenvolvimento", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
    expect(buildCsp("n", false)).not.toContain("'unsafe-eval'");
  });

  it("libera conexão só para a própria API", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.exemplo.com.br/");
    expect(buildCsp("n", false)).toContain("connect-src 'self' https://api.exemplo.com.br;");
  });
});

describe("proxy", () => {
  function run(headers: Record<string, string> = {}) {
    return proxy(new NextRequest("http://localhost/login", { headers })).headers;
  }

  it("manda um nonce diferente a cada pedido", () => {
    const nonceOf = (csp: string | null) => csp?.match(/nonce-([^']+)/)?.[1];
    const first = nonceOf(run().get("content-security-policy"));
    expect(first).toBeTruthy();
    expect(nonceOf(run().get("content-security-policy"))).not.toBe(first);
  });

  it("manda HSTS só em HTTPS", () => {
    expect(run().get("strict-transport-security")).toBeNull();
    expect(run({ "x-forwarded-proto": "https" }).get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains"
    );
  });
});
