import { describe, expect, it } from "vitest";
import { loadedCount, loadingDuration } from "./incentive-loading";

describe("a contagem da tela de carregamento", () => {
  it("demora mais quanto mais incentivos a planilha tem, dentro de um limite", () => {
    expect(loadingDuration(5)).toBe(1500);
    expect(loadingDuration(200)).toBe(3000);
    expect(loadingDuration(300)).toBe(4500);
    expect(loadingDuration(5000)).toBe(6000);
  });

  it("avança na proporção do tempo", () => {
    expect(loadedCount(200, 0, false)).toBe(0);
    expect(loadedCount(200, 1500, false)).toBe(100);
    expect(loadedCount(200, 2250, true)).toBe(150);
  });

  it("só chega ao total depois que o servidor confirmou", () => {
    expect(loadedCount(200, 60000, false)).toBe(199);
    expect(loadedCount(200, 60000, true)).toBe(200);
    expect(loadedCount(1, 60000, false)).toBe(0);
    expect(loadedCount(1, 60000, true)).toBe(1);
  });

  it("confirmado antes da hora, a contagem segue até o fim do tempo", () => {
    expect(loadedCount(200, 1500, true)).toBe(100);
  });
});
