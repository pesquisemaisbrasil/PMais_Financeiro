import { describe, expect, it } from "vitest";
import {
  parsePercent,
  percentField,
  percentText,
  ratesText,
  taxCents,
  taxesUntouched,
  withTaxes,
  type AdjustmentDraft,
} from "./adjustments";
import type { TaxRate } from "./payables";

// Os percentuais pedidos pelo Bruno em 19/11/2026
const RATES: TaxRate[] = [
  { code: "pis", name: "PIS", rate: "0.65" },
  { code: "cofins", name: "COFINS", rate: "3.00" },
  { code: "csll", name: "CSLL", rate: "1.00" },
  { code: "ir", name: "IR", rate: "1.50" },
];

describe("percentuais dos impostos retidos", () => {
  it("mostra como a pessoa escreve: 1,5% e 3%", () => {
    expect(percentField("0.65")).toBe("0,65");
    expect(percentField("3.00")).toBe("3");
    expect(percentText("1.50")).toBe("1,5%");
  });

  it("lê o que a pessoa digita, de 0 a 100 com até 2 casas", () => {
    expect(parsePercent("1,5")).toBe("1.50");
    expect(parsePercent("0,65")).toBe("0.65");
    expect(parsePercent(" 3 ")).toBe("3.00");
    expect(parsePercent("1.5%")).toBe("1.50");
    expect(parsePercent("0")).toBe("0.00");
    expect(parsePercent("100")).toBe("100.00");
    for (const bad of ["", "abc", "-1", "100,01", "1,555", "1.000"]) expect(parsePercent(bad)).toBeNull();
  });

  it("junta os acima de zero numa frase", () => {
    expect(ratesText(RATES)).toBe("PIS 0,65%, COFINS 3%, CSLL 1% e IR 1,5%");
    expect(ratesText(RATES.map((rate) => ({ ...rate, rate: rate.code === "ir" ? "1.50" : "0" })))).toBe("IR 1,5%");
    expect(ratesText(RATES.map((rate) => ({ ...rate, rate: "0.00" })))).toBe("");
  });
});

describe("impostos calculados sobre o valor principal", () => {
  it("arredonda no centavo, sem erro de ponto flutuante", () => {
    expect(taxCents(100000, "0.65")).toBe(650);
    expect(taxCents(123457, "0.65")).toBe(802); // 802,47 centavos
    expect(taxCents(200, "0.25")).toBe(1); // meio centavo sobe
    expect(taxCents(100000, "0")).toBe(0);
  });

  it("conta de R$ 1.000,00 já vem com PIS, COFINS, CSLL e IR, na ordem da janela", () => {
    expect(withTaxes([], "1.000,00", RATES)).toEqual([
      { kind: "imposto", description: "PIS", amount: "6,50" },
      { kind: "imposto", description: "COFINS", amount: "30,00" },
      { kind: "imposto", description: "CSLL", amount: "10,00" },
      { kind: "imposto", description: "IR", amount: "15,00" },
    ]);
  });

  it("troca só as linhas desses impostos e mantém juros e ISS", () => {
    const drafts: AdjustmentDraft[] = [
      { kind: "acrescimo", description: "Juros", amount: "5,00" },
      { kind: "imposto", description: "ISS", amount: "20,00" },
      { kind: "imposto", description: "PIS", amount: "99,00" },
    ];
    const rows = withTaxes(drafts, "100,00", RATES);
    expect(rows.map((row) => `${row.description} ${row.amount}`)).toEqual([
      "Juros 5,00",
      "PIS 0,65",
      "COFINS 3,00",
      "CSLL 1,00",
      "IR 1,50",
      "ISS 20,00",
    ]);
  });

  it("imposto com percentual zero não entra, e sem valor principal os calculados saem", () => {
    const zeroIr = RATES.map((rate) => (rate.code === "ir" ? { ...rate, rate: "0.00" } : rate));
    expect(withTaxes([], "1.000,00", zeroIr).map((row) => row.description)).toEqual(["PIS", "COFINS", "CSLL"]);
    const iss: AdjustmentDraft = { kind: "imposto", description: "ISS", amount: "20,00" };
    expect(withTaxes([...withTaxes([], "1.000,00", RATES), iss], "", RATES)).toEqual([iss]);
  });

  it("mudou um imposto na mão: não recalcula mais", () => {
    const calculated = withTaxes([], "1.000,00", RATES);
    expect(taxesUntouched(calculated, "1.000,00", RATES)).toBe(true);
    expect(taxesUntouched([], "", RATES)).toBe(true);
    const changed = calculated.map((row) => (row.description === "IR" ? { ...row, amount: "10,00" } : row));
    expect(taxesUntouched(changed, "1.000,00", RATES)).toBe(false);
    // zerou tudo (conta sem retenção)
    expect(taxesUntouched([], "1.000,00", RATES)).toBe(false);
  });
});
