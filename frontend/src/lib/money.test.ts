import { describe, expect, it } from "vitest";
import { MAX_MONEY_DIGITS, maskMoney, maskPastedMoney } from "./money";
import { parseMoney } from "./payables";

/** O que o campo mostra depois de cada tecla: a máscara lê o que já estava mais o número novo. */
function typing(keys: string, allowNegative = false): string[] {
  const shown: string[] = [];
  let value = "";
  for (const key of keys) {
    value = maskMoney(value + key, allowNegative);
    shown.push(value);
  }
  return shown;
}

describe("máscara de valor", () => {
  it("põe o ponto e a vírgula sozinha, com os números entrando pela direita", () => {
    expect(typing("123456")).toEqual(["0,01", "0,12", "1,23", "12,34", "123,45", "1.234,56"]);
  });

  it("separa os milhares e os milhões", () => {
    expect(maskMoney("12345678")).toBe("123.456,78");
    expect(maskMoney("100000000")).toBe("1.000.000,00");
  });

  it("apagar o último número tira o último centavo, até esvaziar o campo", () => {
    expect(maskMoney("1.234,5")).toBe("123,45");
    expect(maskMoney("0,0")).toBe("");
    expect(maskMoney("0,05".slice(0, -1))).toBe("");
  });

  it("campo apagado, sem números ou só com zeros fica vazio, e zero à esquerda não sobra", () => {
    expect(maskMoney("")).toBe("");
    expect(maskMoney("abc")).toBe("");
    expect(maskMoney("0,00")).toBe("");
    expect(maskMoney("0")).toBe("");
    expect(maskMoney("000012")).toBe("0,12");
  });

  it("o texto da máscara é lido por parseMoney sem mudar o valor", () => {
    for (const [digits, expected] of [
      ["26000", "260.00"],
      ["123456", "1234.56"],
      ["5", "0.05"],
      ["100000000", "1000000.00"],
    ] as const) {
      expect(parseMoney(maskMoney(digits))).toBe(expected);
    }
  });

  it("o limite de números cabe no que o banco guarda (10 inteiros e 2 centavos)", () => {
    expect(MAX_MONEY_DIGITS).toBe(12);
    expect(maskMoney("9".repeat(MAX_MONEY_DIGITS))).toBe("9.999.999.999,99");
  });
});

describe("máscara com saldo negativo", () => {
  it("sem a opção, o sinal é ignorado", () => {
    expect(maskMoney("-1234")).toBe("12,34");
  });

  it("com a opção, o sinal fica na frente, e sozinho já vale", () => {
    expect(maskMoney("-", true)).toBe("-");
    expect(typing("-1234", true)).toEqual(["-", "-0,01", "-0,12", "-1,23", "-12,34"]);
    expect(maskMoney("12345", true)).toBe("123,45");
  });
});

describe("valor colado", () => {
  it.each([
    ["1.234,56", "1.234,56"],
    ["1234,5", "1.234,50"],
    ["1500.50", "1.500,50"],
    ["1500.5", "1.500,50"],
    ["R$ 1.234,56", "1.234,56"],
    ["1.234", "1.234,00"],
    ["12", "12,00"],
  ])("cola %s e fica %s", (pasted, expected) => {
    expect(maskPastedMoney(pasted)).toBe(expected);
  });

  it("o que não é valor vira só os números, e texto sem número limpa o campo", () => {
    expect(maskPastedMoney("abc")).toBe("");
    expect(maskPastedMoney("10,999")).toBe("109,99");
  });

  it("mantém o sinal só onde ele é permitido", () => {
    expect(maskPastedMoney("-1.234,56")).toBe("1.234,56");
    expect(maskPastedMoney("-1.234,56", true)).toBe("-1.234,56");
  });
});
