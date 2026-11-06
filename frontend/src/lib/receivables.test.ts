import { describe, expect, it } from "vitest";
import { expenseCategories, revenueCategories, type Reference } from "./payables";
import {
  bandLabel,
  bandTotals,
  daysLateText,
  effectiveIndicator,
  netCents,
  receivableParams,
  type DelinquentCustomer,
  type ReceivableQuery,
} from "./receivables";

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

describe("faixas de atraso", () => {
  const customer = (id: number, bands: [number, string][]): DelinquentCustomer => ({
    customerId: id,
    customer: `Cliente ${id}`,
    count: bands.reduce((sum, [count]) => sum + count, 0),
    maxDaysLate: 0,
    total: "0",
    bands: ["1-30", "31-60", "61-90", "90+"].map((band, index) => ({
      id: band,
      count: bands[index][0],
      total: bands[index][1],
    })),
    titles: [],
  });

  it("escreve cada faixa por extenso", () => {
    expect(bandLabel("1-30")).toBe("1 a 30 dias");
    expect(bandLabel("90+")).toBe("Mais de 90 dias");
    expect(bandLabel("outra")).toBe("outra");
  });

  it("soma as faixas de todos os clientes em centavos, sem perder a ordem", () => {
    const totals = bandTotals([
      customer(1, [[2, "30.10"], [0, "0.00"], [1, "50.00"], [0, "0.00"]]),
      customer(2, [[1, "0.20"], [3, "70.00"], [0, "0.00"], [1, "9.99"]]),
    ]);
    expect(totals).toEqual([
      { id: "1-30", count: 3, cents: 3030 },
      { id: "31-60", count: 3, cents: 7000 },
      { id: "61-90", count: 1, cents: 5000 },
      { id: "90+", count: 1, cents: 999 },
    ]);
  });

  it("sem clientes, não há faixa", () => {
    expect(bandTotals([])).toEqual([]);
  });
});

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

describe("série", () => {
  it("escreve o número do título na série", async () => {
    const { seriesLabel } = await import("./payables");
    const row = { id: 1, index: 2, count: 3, kind: "parcelado" as const, estimated: false };
    expect(seriesLabel(row)).toBe("2/3");
  });
});
