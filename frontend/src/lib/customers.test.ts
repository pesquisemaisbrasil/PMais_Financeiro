import { describe, expect, it } from "vitest";
import { EMPTY_PHONE, UFS, formatZip, joinPhone, splitPhone, zipDigits } from "./customers";

describe("telefone do cliente", () => {
  it("separa o telefone do servidor em país, DDD e número", () => {
    expect(splitPhone("+55 41 99999-0000")).toEqual({ country: "55", ddd: "41", number: "99999-0000" });
    expect(splitPhone("+55 41 3333-4444")).toEqual({ country: "55", ddd: "41", number: "3333-4444" });
  });

  it("sem telefone, ou fora do formato, volta o país padrão e o resto em branco", () => {
    expect(splitPhone(null)).toEqual(EMPTY_PHONE);
    expect(splitPhone("")).toEqual(EMPTY_PHONE);
    expect(splitPhone("(41) 99999-0000")).toEqual(EMPTY_PHONE);
  });

  it("junta as três partes no formato que o servidor aceita", () => {
    expect(joinPhone({ country: "55", ddd: "41", number: "99999-0000" })).toBe("+55 41 99999-0000");
    expect(joinPhone({ country: "", ddd: "(41)", number: "99999 0000" })).toBe("+55 41 999990000");
  });

  it("sem DDD e sem número, o telefone é vazio (o país sozinho não conta)", () => {
    expect(joinPhone(EMPTY_PHONE)).toBe("");
    expect(joinPhone({ country: "55", ddd: " ", number: "" })).toBe("");
  });

  it("ida e volta não muda o telefone", () => {
    const phone = "+55 11 98888-7777";
    expect(joinPhone(splitPhone(phone))).toBe(phone);
  });
});

describe("CEP e UF", () => {
  it("guarda só os números, até 8", () => {
    expect(zipDigits("80.010-000")).toBe("80010000");
    expect(zipDigits("800100001234")).toBe("80010000");
  });

  it("mostra o traço depois do quinto número", () => {
    expect(formatZip("80010")).toBe("80010");
    expect(formatZip("800100")).toBe("80010-0");
    expect(formatZip("80010000")).toBe("80010-000");
  });

  it("tem as 27 unidades da federação", () => {
    expect(UFS).toHaveLength(27);
    expect(UFS.map((uf) => uf.id)).toContain("PR");
  });
});
