import { describe, expect, it } from "vitest";
import {
  adjustmentTotals,
  draftCents,
  draftsFrom,
  netText,
  parseDrafts,
  sortDrafts,
  type AdjustmentDraft,
} from "./adjustments";

const draft = (kind: AdjustmentDraft["kind"], description: string, amount: string): AdjustmentDraft => ({
  kind,
  description,
  amount,
});

describe("acréscimos, descontos e impostos", () => {
  const drafts = [
    draft("acrescimo", "Multa", "20,00"),
    draft("desconto", "Combinado", "50,00"),
    draft("imposto", "ISS", "30,00"),
    draft("imposto", "INSS", "1.000,50"),
  ];

  it("soma cada tipo em centavos, sem erro de ponto flutuante", () => {
    expect(draftCents(drafts, "acrescimo")).toBe(2000);
    expect(draftCents(drafts, "imposto")).toBe(103050);
    expect(draftCents([draft("desconto", "a", "0,10"), draft("desconto", "b", "0,20")], "desconto")).toBe(30);
  });

  it("linha com valor inválido conta zero na soma", () => {
    expect(draftCents([draft("desconto", "x", "abc")], "desconto")).toBe(0);
  });

  it("calcula o líquido a partir do bruto digitado", () => {
    expect(netText("2.000,00", drafts)).toBe("939.50");
    expect(netText("1.000,00", [])).toBe("1000.00");
    expect(netText("", drafts)).toBeNull();
    expect(netText("abc", drafts)).toBeNull();
  });

  it("devolve as linhas no formato da API e ignora linha vazia", () => {
    expect(parseDrafts([draft("imposto", " ISS retido ", "30,5"), draft("desconto", "", "")])).toEqual({
      lines: [{ kind: "imposto", description: "ISS retido", amount: "30.50" }],
      error: null,
    });
  });

  it("explica a linha incompleta ou sem valor", () => {
    expect(parseDrafts([draft("imposto", "", "10,00")]).error).toBe("Escreva a descrição de cada linha.");
    expect(parseDrafts([draft("imposto", "ISS", "")]).error).toBe('Informe o valor de "ISS", como 12,50.');
    expect(parseDrafts([draft("imposto", "ISS", "0,00")]).error).toBe('Informe o valor de "ISS", como 12,50.');
    expect(parseDrafts([draft("imposto", "ISS", "1,2,3")]).error).toBe('Informe o valor de "ISS", como 12,50.');
  });

  it("ordena por tipo, mantendo a ordem dentro de cada um", () => {
    const sorted = sortDrafts([
      draft("imposto", "b", "1,00"),
      draft("acrescimo", "c", "1,00"),
      draft("imposto", "a", "1,00"),
    ]);
    expect(sorted.map((item) => item.description)).toEqual(["c", "b", "a"]);
  });

  it("passa os valores da API para o campo de digitação", () => {
    expect(draftsFrom([{ id: 1, kind: "desconto", description: "Combinado", amount: "50.00" }])).toEqual([
      draft("desconto", "Combinado", "50,00"),
    ]);
  });

  it("totaliza uma lista que veio da API", () => {
    expect(
      adjustmentTotals([
        { kind: "acrescimo", amount: "10.10" },
        { kind: "acrescimo", amount: "0.20" },
        { kind: "imposto", amount: "5.00" },
      ])
    ).toEqual({ acrescimo: "10.30", desconto: "0.00", imposto: "5.00" });
  });
});
