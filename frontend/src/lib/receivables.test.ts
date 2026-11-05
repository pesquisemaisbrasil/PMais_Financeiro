import { describe, expect, it } from "vitest";
import { expenseCategories, revenueCategories, type Reference } from "./payables";
import { daysLateText, effectiveIndicator, netCents, receivableParams, type ReceivableQuery } from "./receivables";

const base: ReceivableQuery = {
  mode: "mes",
  ref: null,
  start: "",
  end: "",
  dateField: "vencimento",
  indicator: "total",
  filters: {},
  search: "",
  sort: "vencimento",
  descending: false,
  page: 1,
};

describe("atraso", () => {
  it("escreve os dias de atraso no singular e no plural", () => {
    expect(daysLateText(1)).toBe("1 dia de atraso");
    expect(daysLateText(30)).toBe("30 dias de atraso");
  });

  it("título que não está vencido não tem texto de atraso", () => {
    expect(daysLateText(null)).toBeNull();
  });
});

describe("líquido", () => {
  it("é o bruto menos os abatimentos, em centavos", () => {
    expect(netCents(100000, 11500)).toBe(88500);
    expect(netCents(100000, 0)).toBe(100000);
  });
});

describe("consulta da lista", () => {
  it("manda período, ordem e página", () => {
    const params = receivableParams({ ...base, sort: "pendente", descending: true, page: 3 });
    expect(Object.fromEntries(params)).toEqual({
      mode: "mes",
      dateField: "vencimento",
      indicator: "total",
      sort: "pendente",
      descending: "true",
      page: "3",
    });
  });

  it("só manda as datas no período livre", () => {
    expect(receivableParams({ ...base, start: "2026-11-01", end: "2026-11-30" }).has("start")).toBe(false);
    const free = receivableParams({ ...base, mode: "periodo", start: "2026-11-01", end: "2026-11-30" });
    expect([free.get("start"), free.get("end")]).toEqual(["2026-11-01", "2026-11-30"]);
  });

  it("manda a busca sem espaço nas pontas e só os filtros preenchidos", () => {
    const params = receivableParams({
      ...base,
      search: "  alfa  ",
      filters: { customer: "3", project: "", situation: "vencido" },
    });
    expect(params.get("search")).toBe("alfa");
    expect(params.get("customer")).toBe("3");
    expect(params.has("project")).toBe(false);
    expect(params.get("situation")).toBe("vencido");
  });

  it("a situação cancelada usa o indicador de cancelados, para a lista não ficar vazia", () => {
    expect(effectiveIndicator({ indicator: "total", filters: { situation: "cancelado" } })).toBe("cancelados");
    expect(effectiveIndicator({ indicator: "vencidos", filters: { situation: "vencido" } })).toBe("vencidos");
    expect(receivableParams({ ...base, filters: { situation: "cancelado" } }).get("indicator")).toBe("cancelados");
  });
});

describe("plano de contas", () => {
  const reference = {
    categories: [
      { id: 1, name: "Material", code: "2.04", kind: "despesa" },
      { id: 2, name: "Receita de pesquisa", code: "1.01", kind: "receita" },
    ],
  } as unknown as Reference;

  it("cada tela vê só as contas do seu tipo", () => {
    expect(expenseCategories(reference).map((c) => c.id)).toEqual([1]);
    expect(revenueCategories(reference).map((c) => c.id)).toEqual([2]);
  });
});
