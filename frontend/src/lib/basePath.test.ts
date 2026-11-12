import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load(basePath: string | undefined) {
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", basePath);
  vi.resetModules();
  return import("./basePath");
}

describe("publicAsset", () => {
  it("não muda nada sem prefixo (desenvolvimento e produção)", async () => {
    const { BASE_PATH, publicAsset } = await load(undefined);
    expect(BASE_PATH).toBe("");
    expect(publicAsset("/logo.png")).toBe("/logo.png");
  });

  it("coloca o prefixo do ambiente de teste na frente", async () => {
    const { BASE_PATH, publicAsset } = await load("/teste");
    expect(BASE_PATH).toBe("/teste");
    expect(publicAsset("/logo.png")).toBe("/teste/logo.png");
  });
});
