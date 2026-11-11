import { describe, expect, it } from "vitest";
import { isCheckable, shortDay } from "./businessDays";

describe("aviso de dia não útil", () => {
  it("só pergunta por uma data completa e dentro do intervalo aceito", () => {
    expect(isCheckable("2026-11-07")).toBe(true);
    expect(isCheckable("2026-11-0")).toBe(false);
    expect(isCheckable("")).toBe(false);
    expect(isCheckable("1999-12-31")).toBe(false);
    expect(isCheckable("2101-01-01")).toBe(false);
    expect(isCheckable("2026-13-40")).toBe(false);
  });

  it("escreve o dia da semana e a data para o botão", () => {
    expect(shortDay("2026-11-06")).toBe("sex 06/11");
    expect(shortDay("2026-11-07")).toBe("sáb 07/11");
    expect(shortDay("2026-11-09")).toBe("seg 09/11");
    expect(shortDay("2030-03-31")).toBe("dom 31/03");
  });
});
