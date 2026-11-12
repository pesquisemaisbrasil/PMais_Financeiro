import { describe, expect, it } from "vitest";
import {
  closingBlockers,
  currentMonth,
  monthLabel,
  shiftMonth,
  sheetFileName,
  type ClosingCompany,
} from "./bank-month";

const company = (over: Partial<ClosingCompany> = {}): ClosingCompany => ({
  id: 1,
  name: "PPlus",
  closed: false,
  closedAt: null,
  closedBy: null,
  lines: 10,
  notImported: [],
  withoutPair: 0,
  withoutClassification: 0,
  ready: true,
  ...over,
});

describe("conferência por mês", () => {
  it("escreve o mês por extenso", () => {
    expect(monthLabel("2026-11")).toBe("novembro/2026");
    expect(monthLabel("2026-03")).toBe("março/2026");
  });

  it("anda de mês em mês, virando o ano", () => {
    expect(shiftMonth("2026-11", -1)).toBe("2026-10");
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-05", 12)).toBe("2027-05");
  });

  it("o mês de hoje vem no horário de São Paulo", () => {
    // 03:30 UTC do dia 1º é 00:30 em São Paulo: já é novembro
    expect(currentMonth(new Date("2026-11-01T03:30:00Z"))).toBe("2026-11");
    // 01:00 UTC do dia 1º ainda é 22:00 de 31/10 em São Paulo: é outubro
    expect(currentMonth(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}$/);
  });

  it("diz o que falta para fechar, e nada quando está pronto", () => {
    expect(closingBlockers(company())).toEqual([]);
    expect(
      closingBlockers(
        company({ notImported: ["Itaú · PPlus", "Bradesco"], withoutPair: 3, withoutClassification: 1 })
      )
    ).toEqual(["Extrato não importado: Itaú · PPlus, Bradesco", "3 linhas sem conferir", "1 linha sem classificação"]);
    expect(closingBlockers(company({ withoutPair: 1 }))).toEqual(["1 linha sem conferir"]);
  });

  it("o nome da planilha é o que o servidor sugere", () => {
    expect(sheetFileName("PPlus", "2026-10")).toBe("conciliacao-pplus-2026-10.xlsx");
    expect(sheetFileName("P Plus Log", "2026-10")).toBe("conciliacao-p-plus-log-2026-10.xlsx");
    expect(sheetFileName("Médtrek & Cia", "2026-10")).toBe("conciliacao-medtrek-cia-2026-10.xlsx");
  });
});
