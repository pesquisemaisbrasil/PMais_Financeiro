import { describe, expect, it } from "vitest";
import { draftsFromFields, fieldOf, fieldValues, fieldsCents, type AdjustmentDraft } from "./adjustments";

const draft = (kind: AdjustmentDraft["kind"], description: string, amount: string): AdjustmentDraft => ({
  kind,
  description,
  amount,
});

describe("campos fixos de acréscimos, descontos e impostos", () => {
  it("põe cada linha antiga no campo pela primeira palavra, sem ligar para acento e caixa", () => {
    expect(fieldOf(draft("imposto", "ISS retido", "1")).key).toBe("iss");
    expect(fieldOf(draft("imposto", "IRRF", "1")).key).toBe("ir");
    expect(fieldOf(draft("acrescimo", "Multa por atraso", "1")).key).toBe("multa");
    expect(fieldOf(draft("acrescimo", "juros de mora", "1")).key).toBe("juros");
  });

  it("o que não é de nenhum campo vai para o Outros do grupo", () => {
    expect(fieldOf(draft("imposto", "Retenção na nota", "1")).key).toBe("imposto-outros");
    expect(fieldOf(draft("acrescimo", "Correção monetária", "1")).key).toBe("acrescimo-outros");
    expect(fieldOf(draft("desconto", "Desconto combinado", "1")).key).toBe("desconto");
  });

  it("soma as linhas que caem no mesmo campo e deixa vazio o que não tem valor", () => {
    const values = fieldValues([
      draft("imposto", "ISS retido", "30,00"),
      draft("imposto", "ISS complementar", "2,50"),
      draft("acrescimo", "Juros", "5,00"),
    ]);
    expect(values.iss).toBe("32,50");
    expect(values.juros).toBe("5,00");
    expect(values.multa).toBe("");
  });

  it("totaliza cada grupo em centavos", () => {
    const values = { juros: "5,00", multa: "20,00", "acrescimo-outros": "", iss: "1.000,00" };
    expect(fieldsCents(values, "acrescimo")).toBe(2500);
    expect(fieldsCents(values, "imposto")).toBe(100000);
    expect(fieldsCents(values, "desconto")).toBe(0);
  });

  it("devolve uma linha por campo com valor, com o nome do campo, e ignora vazio e zero", () => {
    expect(draftsFromFields({ multa: "20,00", juros: "5,00", desconto: "0,00", iss: "", ir: "1.234,56" })).toEqual({
      drafts: [
        draft("acrescimo", "Juros", "5,00"),
        draft("acrescimo", "Multa", "20,00"),
        draft("imposto", "IR", "1234,56"),
      ],
      error: null,
    });
  });

  it("explica o campo com valor que não dá para ler", () => {
    expect(draftsFromFields({ "imposto-outros": "abc" }).error).toBe('Informe o valor de "Outros impostos", como 12,50.');
  });

  it("abrir e salvar sem mexer mantém os totais", () => {
    const before = [draft("imposto", "Retenção na nota", "115,00"), draft("desconto", "Desconto comercial", "100,00")];
    const after = draftsFromFields(fieldValues(before)).drafts;
    expect(after).toEqual([draft("desconto", "Desconto", "100,00"), draft("imposto", "Outros", "115,00")]);
  });
});
