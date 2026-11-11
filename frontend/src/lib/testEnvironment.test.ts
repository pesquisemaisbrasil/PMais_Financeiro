import { describe, expect, it } from "vitest";
import { readTestEnvironment } from "./testEnvironment";

describe("ambiente de teste", () => {
  it("sem as variáveis (desenvolvimento e produção), nada aparece", () => {
    expect(readTestEnvironment({})).toEqual({ banner: false, prototypeUrl: null });
    expect(readTestEnvironment({ testEnv: "0" })).toEqual({ banner: false, prototypeUrl: null });
  });

  it("liga a faixa só com NEXT_PUBLIC_TEST_ENV=1", () => {
    expect(readTestEnvironment({ testEnv: "1" })).toEqual({ banner: true, prototypeUrl: null });
    expect(readTestEnvironment({ testEnv: "true" }).banner).toBe(false);
  });

  it("aceita o protótipo no mesmo site ou num endereço http(s)", () => {
    expect(readTestEnvironment({ testEnv: "1", prototypeUrl: "/" }).prototypeUrl).toBe("/");
    expect(readTestEnvironment({ testEnv: "1", prototypeUrl: " https://prototipo.exemplo.app/ " }).prototypeUrl).toBe(
      "https://prototipo.exemplo.app/"
    );
  });

  it("recusa endereço perigoso ou torto", () => {
    for (const url of ["javascript:alert(1)", "//outro-site.com", "data:text/html,x", "prototipo", "https://a b"]) {
      expect(readTestEnvironment({ testEnv: "1", prototypeUrl: url }).prototypeUrl).toBeNull();
    }
  });

  it("o link de volta não existe sem a faixa", () => {
    expect(readTestEnvironment({ prototypeUrl: "/" }).prototypeUrl).toBeNull();
  });
});
