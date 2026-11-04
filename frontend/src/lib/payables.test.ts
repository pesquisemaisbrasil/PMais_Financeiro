import { describe, expect, it } from "vitest";
import {
  addDays,
  brl,
  formatDate,
  greeting,
  movePeriod,
  parseAllocations,
  parseMoney,
  periodLabel,
  toCents,
  type Project,
} from "./payables";

const PROJECTS: Project[] = [
  { id: 1, code: "1804", title: "A", status: "em_andamento" },
  { id: 2, code: "1790", title: "B", status: "em_andamento" },
  { id: 3, code: "1700", title: "C", status: "encerrado" },
];

describe("parseMoney", () => {
  it.each([
    ["1.234,56", "1234.56"],
    ["1234,5", "1234.50"],
    ["1000", "1000.00"],
    [" 12,00 ", "12.00"],
    ["1.000.000,10", "1000000.10"],
  ])("lê %s", (text, expected) => {
    expect(parseMoney(text)).toBe(expected);
  });

  it.each(["", "abc", "R$ 10", "-5", "10,999", "1.23,00", "1,2,3"])("recusa %s", (text) => {
    expect(parseMoney(text)).toBeNull();
  });
});

describe("parseAllocations", () => {
  it("aceita ponto e vírgula, tabulação e o prefixo PRJ", () => {
    const result = parseAllocations("1804;600,00\nPRJ-1790\t400,00\n", PROJECTS, "1000.00");
    expect(result).toEqual({
      allocations: [
        { projectId: 1, amount: "600.00" },
        { projectId: 2, amount: "400.00" },
      ],
      error: null,
    });
  });

  it("não precisa de projeto", () => {
    expect(parseAllocations("  \n", PROJECTS, "10.00")).toEqual({ allocations: [], error: null });
  });

  it("diz a diferença quando a soma não fecha", () => {
    expect(parseAllocations("1804;990,00", PROJECTS, "1000.00").error).toMatch(/somam R\$\s990,00.*R\$\s1\.000,00/);
  });

  it("aponta a linha do projeto que não existe", () => {
    expect(parseAllocations("1804;1,00\n9999;1,00", PROJECTS, "2.00").error).toBe(
      "Projeto 9999 não encontrado (linha 2)"
    );
  });

  it("recusa valor com R$ ou texto", () => {
    expect(parseAllocations("1804;R$ 10", PROJECTS, "10.00").error).toBe("Linha 1: use só números no valor");
  });

  it("recusa projeto encerrado", () => {
    expect(parseAllocations("1700;10,00", PROJECTS, "10.00").error).toMatch(/fechado/);
  });

  it("soma centavos sem erro de ponto flutuante", () => {
    expect(parseAllocations("1804;0,10\n1790;0,20", PROJECTS, "0.30").error).toBeNull();
  });
});

describe("período", () => {
  it("mostra cada visão", () => {
    expect(periodLabel("dia", "2026-11-04")).toBe("04/11/2026");
    expect(periodLabel("semana", "2026-11-04")).toBe("02/11/2026 a 08/11/2026");
    expect(periodLabel("semana", "2026-11-08")).toBe("02/11/2026 a 08/11/2026");
    expect(periodLabel("mes", "2026-11-04")).toBe("novembro/2026");
    expect(periodLabel("ano", "2026-11-04")).toBe("2026");
    expect(periodLabel("tudo", "2026-11-04")).toBe("Todo o período");
  });

  it("navega sem pular mês em dia 31", () => {
    expect(movePeriod("mes", "2026-01-31", 1)).toBe("2026-02-01");
    expect(movePeriod("mes", "2026-01-15", -1)).toBe("2025-12-01");
    expect(movePeriod("ano", "2026-05-20", 1)).toBe("2027-05-01");
    expect(movePeriod("semana", "2026-11-04", -1)).toBe("2026-10-28");
    expect(movePeriod("dia", "2026-12-31", 1)).toBe("2027-01-01");
    expect(movePeriod("tudo", "2026-12-31", 1)).toBe("2026-12-31");
  });

  it("soma dias atravessando o mês", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("formatação", () => {
  it("mostra dinheiro e datas em pt-BR", () => {
    expect(brl("1234.5")).toMatch(/R\$\s1\.234,50/);
    expect(formatDate("2026-11-04")).toBe("04/11/2026");
    expect(formatDate(null)).toBe("—");
    expect(toCents("1234.56")).toBe(123456);
  });

  it("cumprimenta pelo horário de São Paulo, não o da máquina", () => {
    expect(greeting(new Date("2026-11-04T11:00:00Z"))).toBe("Bom dia");
    expect(greeting(new Date("2026-11-04T16:00:00Z"))).toBe("Boa tarde");
    expect(greeting(new Date("2026-11-04T23:00:00Z"))).toBe("Boa noite");
    expect(greeting(new Date("2026-11-05T01:00:00Z"))).toBe("Boa noite");
  });
});
