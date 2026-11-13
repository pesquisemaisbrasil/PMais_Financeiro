import { describe, expect, it } from "vitest";
import { holidayPlace, syncMessage, syncYears, weekday } from "./holidays";

describe("feriados", () => {
  it("diz onde o feriado vale", () => {
    expect(holidayPlace({ scope: "nacional", uf: null, city: null })).toBe("Nacional");
    expect(holidayPlace({ scope: "estadual", uf: "SP", city: null })).toBe("SP");
    expect(holidayPlace({ scope: "municipal", uf: "SP", city: "São Paulo" })).toBe("São Paulo/SP");
    expect(holidayPlace({ scope: "municipal", uf: null, city: null })).toBe("Municipal");
  });

  it("acha o dia da semana, sem escorregar por causa do fuso", () => {
    expect(weekday("2026-11-07")).toBe("sábado");
    expect(weekday("2026-11-15")).toBe("domingo");
    expect(weekday("2027-01-25")).toBe("segunda-feira");
  });

  it("oferece o ano anterior, o atual e os dois seguintes", () => {
    expect(syncYears(2026)).toEqual([2025, 2026, 2027, 2028]);
  });

  it("conta quantos feriados a busca trouxe", () => {
    expect(syncMessage({ year: 2027, added: 0, total: 11 })).toBe("Os 11 feriados nacionais de 2027 já estavam cadastrados.");
    expect(syncMessage({ year: 2027, added: 1, total: 11 })).toBe("1 feriado novo em 2027. O ano tem 11 feriados nacionais.");
    expect(syncMessage({ year: 2027, added: 14, total: 14 })).toBe("14 feriados novos em 2027. O ano tem 14 feriados nacionais.");
  });
});
