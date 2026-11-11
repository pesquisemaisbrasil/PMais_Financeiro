import { describe, expect, it } from "vitest";
import { missingFieldsMessage } from "./forms";

describe("missingFieldsMessage", () => {
  it("lista os campos vazios na ordem da tela", () => {
    expect(
      missingFieldsMessage([
        ["Fornecedor", ""],
        ["Categoria", "3"],
        ["Centro de custo", ""],
        ["Descrição", "   ".trim()],
      ]),
    ).toBe("Preencha os campos obrigatórios: Fornecedor, Centro de custo e Descrição.");
  });

  it("usa o singular quando falta um só", () => {
    expect(missingFieldsMessage([["Vencimento", ""], ["Empresa", "1"]])).toBe("Preencha o campo obrigatório: Vencimento.");
  });

  it("junta dois com 'e' e não devolve nada quando tudo está preenchido", () => {
    expect(missingFieldsMessage([["Cliente", ""], ["Unidade", null]])).toBe(
      "Preencha os campos obrigatórios: Cliente e Unidade.",
    );
    expect(missingFieldsMessage([["Cliente", "7"], ["Fornecedor", true]])).toBeNull();
  });
});
