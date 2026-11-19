import { describe, expect, it } from "vitest";
import { brFromIso, brFromIsoMonth, isoFromBr, isoMonthFromBr, maskDate, maskMonth, typedDate, typedMonth } from "./dates";

// Campo de data sempre em dia/mês/ano, qualquer que seja o idioma do navegador (18/11).
describe("campo de data em dia/mês/ano", () => {
  it("põe as barras enquanto digita e ignora o que não é número", () => {
    expect(maskDate("18")).toBe("18");
    expect(maskDate("1811")).toBe("18/11");
    expect(maskDate("181120")).toBe("18/11/20");
    expect(maskDate("18112026")).toBe("18/11/2026");
    expect(maskDate("18/11/2026 9")).toBe("18/11/2026");
    expect(maskDate("ab")).toBe("");
  });

  it("só aceita data completa e que existe", () => {
    expect(isoFromBr("18/11/2026")).toBe("2026-11-18");
    expect(isoFromBr("29/02/2028")).toBe("2028-02-29");
    expect(isoFromBr("31/02/2026")).toBeNull();
    expect(isoFromBr("18/11/26")).toBeNull();
    expect(isoFromBr("")).toBeNull();
  });

  it("mostra a data do servidor em dia/mês/ano", () => {
    expect(brFromIso("2026-11-25")).toBe("25/11/2026");
    expect(brFromIso("")).toBe("");
    expect(brFromIso(null)).toBe("");
  });

  it("aceita colar no formato do servidor", () => {
    expect(typedDate("2026-11-25")).toBe("25/11/2026");
    expect(typedDate("25112026")).toBe("25/11/2026");
  });
});

describe("competência em mm/aaaa", () => {
  it("põe a barra enquanto digita e só aceita mês que existe", () => {
    expect(maskMonth("11")).toBe("11");
    expect(maskMonth("112026")).toBe("11/2026");
    expect(isoMonthFromBr("11/2026")).toBe("2026-11");
    expect(isoMonthFromBr("13/2026")).toBeNull();
    expect(isoMonthFromBr("11/26")).toBeNull();
  });

  it("mostra o mês do servidor e aceita colar no formato dele", () => {
    expect(brFromIsoMonth("2026-11")).toBe("11/2026");
    expect(brFromIsoMonth(null)).toBe("");
    expect(typedMonth("2026-11")).toBe("11/2026");
  });
});
