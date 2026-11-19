// Pedidos dos testes com o financeiro de 16/11 (docs/transcricoes/2026-11-16-testes-em-conjunto-com-o-financeiro.md):
// as setas da data (A8), o projeto que traz unidade e centro de custo (A2) e o rateio na edição (A4).
import { describe, expect, it } from "vitest";
import { SHIFT_LABELS, projectDefaults, shiftRef, splitRowsFrom, type Project } from "./payables";

describe("setas da data na lista (A8)", () => {
  it("andam um dia, uma semana, um mês ou um ano", () => {
    expect(shiftRef("dia", "2026-11-16", -1)).toBe("2026-11-15");
    expect(shiftRef("dia", "2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftRef("semana", "2026-11-16", 1)).toBe("2026-11-23");
    expect(shiftRef("mes", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftRef("mes", "2026-01-15", -1)).toBe("2025-12-01");
    expect(shiftRef("ano", "2026-11-16", -1)).toBe("2025-01-01");
  });

  it("não existem em Tudo nem em Período", () => {
    expect(shiftRef("tudo", "2026-11-16", 1)).toBeNull();
    expect(shiftRef("periodo", "2026-11-16", 1)).toBeNull();
    expect(SHIFT_LABELS.tudo).toBeUndefined();
    expect(SHIFT_LABELS.dia).toEqual(["Dia anterior", "Próximo dia"]);
  });
});

const project = (fields: Partial<Project>): Project => ({
  id: 1,
  code: "1804",
  title: "Pesquisa",
  status: "em_andamento",
  projectType: null,
  hasIncentive: false,
  incentiveDays: null,
  ...fields,
});

describe("o projeto traz a unidade e o centro de custo (A2)", () => {
  const reference = {
    projects: [project({ id: 1, unitId: 10, costCenterId: 20 }), project({ id: 2, code: "1790" })],
    units: [{ id: 10, name: "Consumo SP", companyId: 1 }],
    costCenters: [{ id: 20, name: "Campo", code: "001", parentId: null, label: "001 · Campo" }],
  };

  it("preenche os dois quando o projeto tem", () => {
    expect(projectDefaults(reference, "1")).toEqual({ unitId: "10", costCenterId: "20" });
  });

  it("deixa como está o que o projeto não tem, ou o que foi inativado", () => {
    expect(projectDefaults(reference, "2")).toEqual({});
    expect(projectDefaults({ ...reference, units: [] }, "1")).toEqual({ costCenterId: "20" });
    expect(projectDefaults(reference, "")).toEqual({});
  });
});

describe("o rateio da conta na edição (A4)", () => {
  it("vira campos só quando há mais de um projeto", () => {
    expect(splitRowsFrom([{ projectId: 1, code: "1804", amount: "1000.00" }])).toEqual([]);
    expect(
      splitRowsFrom([
        { projectId: 1, code: "1804", amount: "600.00" },
        { projectId: 2, code: "1790", amount: "1400.50" },
      ])
    ).toEqual([
      { projectId: "1", amount: "600,00" },
      { projectId: "2", amount: "1400,50" }, // como o campo de valor da edição
    ]);
  });
});
