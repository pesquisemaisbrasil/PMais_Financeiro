import { describe, expect, it } from "vitest";
import { filterOptions } from "./payables";
import { highlightParts, matchesSearch, searchable } from "./search";

// A regra de toda busca do sistema (18/11): maiúscula, acento, pedaço e ordem das palavras não importam.
describe("toda busca acha do mesmo jeito", () => {
  it("sem diferença de maiúscula e com ou sem acento", () => {
    for (const typed of ["grafica", "GRÁFICA", "Grafica", "satisfacao", "SATISFAÇÃO", "  ponto  "]) {
      expect(matchesSearch("Gráfica Ponto Certo · Satisfação", typed)).toBe(true);
    }
    expect(matchesSearch("Itaú · PPlus", "itau")).toBe(true);
    expect(matchesSearch("Conceição", "CONCEICAO")).toBe(true);
  });

  it("por pedaço da palavra e com as palavras em qualquer ordem", () => {
    expect(matchesSearch("Gráfica Ponto Certo", "certo PON")).toBe(true);
    expect(matchesSearch("Gráfica Ponto Certo", "grafica itau")).toBe(false);
    expect(matchesSearch("Gráfica Ponto Certo", "")).toBe(true);
  });

  it("vale nas listas de cadastro, nas caixas de seleção e na lista de projetos", () => {
    const options = [
      { id: 1, label: "Ponto Certo · Gráfica Ponto Certo" },
      { id: 2, label: "Exata · Contabilidade Exata" },
    ];
    expect(filterOptions(options, "GRAFICA certo").map((option) => option.id)).toEqual([1]);
    expect(filterOptions(options, "contabilidade").map((option) => option.id)).toEqual([2]);
    expect(filterOptions(options, " ")).toEqual(options);
  });
});

// Busca em todo o sistema (18/11): a palavra buscada aparece marcada nos resultados.
describe("destaque da palavra buscada", () => {
  it("marca sem acento e sem diferença de maiúscula", () => {
    expect(highlightParts("Tarifa do Itaú", "itau")).toEqual([
      { text: "Tarifa do ", match: false },
      { text: "Itaú", match: true },
    ]);
  });

  it("marca cada palavra, em qualquer ordem, e todas as vezes que aparece", () => {
    expect(highlightParts("Gráfica Ponto Certo · gráfica", "certo grafica")).toEqual([
      { text: "Gráfica", match: true },
      { text: " Ponto ", match: false },
      { text: "Certo", match: true },
      { text: " · ", match: false },
      { text: "gráfica", match: true },
    ]);
  });

  it("marca o valor como foi digitado", () => {
    expect(highlightParts("vence 18/11/2026 · R$ 1.250,00", "1.250,00")).toEqual([
      { text: "vence 18/11/2026 · R$ ", match: false },
      { text: "1.250,00", match: true },
    ]);
  });

  it("sem termo ou sem achado, devolve o texto inteiro", () => {
    expect(highlightParts("Projeto", "")).toEqual([{ text: "Projeto", match: false }]);
    expect(highlightParts("Projeto", "xyz")).toEqual([{ text: "Projeto", match: false }]);
  });
});

describe("quando a busca vai ao servidor", () => {
  it("a partir de 2 letras, fora os espaços", () => {
    expect(searchable("i")).toBe(false);
    expect(searchable(" i  ")).toBe(false);
    expect(searchable("it")).toBe(true);
    expect(searchable("i t")).toBe(true);
  });
});
