import { describe, expect, it } from "vitest";
import { choiceCount, choiceIds, choiceLabel, toggleChoice } from "./choices";

const options = [
  { id: 1, label: "Alfa" },
  { id: 2, label: "Beta" },
  { id: 3, label: "Gama" },
  { id: "x", label: "Delta" },
];

describe("filtro com mais de uma opção", () => {
  it("lê o texto dos ids, e vazio é todos", () => {
    expect(choiceIds("")).toEqual([]);
    expect(choiceIds("3,5")).toEqual(["3", "5"]);
    expect(choiceIds("3,,5,")).toEqual(["3", "5"]);
    expect(choiceCount("3,5")).toBe(2);
    expect(choiceCount("")).toBe(0);
  });

  it("marca e desmarca, sem repetir", () => {
    expect(toggleChoice("", "1")).toBe("1");
    expect(toggleChoice("1", "2")).toBe("1,2");
    expect(toggleChoice("1,2", "1")).toBe("2");
    expect(toggleChoice("2", "2")).toBe("");
    expect(toggleChoice(toggleChoice("1", "2"), "2")).toBe("1");
  });

  it("uma opção exclusiva limpa as outras, e as outras tiram a exclusiva", () => {
    const exclusive = ["cancelado"];
    expect(toggleChoice("vencido,hoje", "cancelado", exclusive)).toBe("cancelado");
    expect(toggleChoice("cancelado", "vencido", exclusive)).toBe("vencido");
    expect(toggleChoice("vencido", "hoje", exclusive)).toBe("vencido,hoje");
    expect(toggleChoice("cancelado", "cancelado", exclusive)).toBe("");
  });

  it("resume o que está marcado", () => {
    expect(choiceLabel("", options, "Todos")).toBe("Todos");
    expect(choiceLabel("2", options, "Todos")).toBe("Beta");
    expect(choiceLabel("2,1", options, "Todos")).toBe("Beta, Alfa");
    expect(choiceLabel("1,2,3", options, "Todos")).toBe("3 selecionados");
    expect(choiceLabel("x", options, "Todos")).toBe("Delta");
  });

  it("ignora o que não está mais na lista", () => {
    expect(choiceLabel("99", options, "Todos os projetos da planilha")).toBe("Todos os projetos da planilha");
    expect(choiceLabel("99,2", options, "Todos")).toBe("Beta");
  });
});
