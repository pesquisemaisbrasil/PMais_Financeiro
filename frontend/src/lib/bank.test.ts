import { describe, expect, it } from "vitest";
import {
  MAX_STATEMENT_BYTES,
  accountTypeLabel,
  balanceText,
  bankLine,
  checkReconcile,
  checkStatement,
  importLabel,
  importedText,
  needsInvoice,
  parseBalance,
  reasonsText,
  situationOf,
  type StatementPreview,
  type StatementResult,
} from "./bank";

const preview = (newLines: number, duplicateLines = 0): StatementPreview => ({
  fileFormat: "ofx",
  lines: newLines + duplicateLines,
  newLines,
  duplicateLines,
  periodStart: "2026-11-05",
  periodEnd: "2026-11-09",
  income: "0.00",
  expense: "0.00",
  warnings: [],
  sample: [],
  alreadyImportedAt: null,
});

const result = (newLines: number, duplicateLines: number): StatementResult => ({
  statementId: newLines ? 1 : null,
  newLines,
  duplicateLines,
  periodStart: "2026-11-05",
  periodEnd: "2026-11-09",
});

describe("extrato bancário", () => {
  it("aceita OFX, CSV e TXT, em maiúsculas ou minúsculas", () => {
    for (const name of ["extrato.ofx", "EXTRATO.OFX", "extrato.csv", "extrato.TXT"]) {
      expect(checkStatement({ name, size: 1000 })).toBeNull();
    }
  });

  it("recusa outro tipo de arquivo, arquivo vazio e arquivo grande, dizendo o nome", () => {
    expect(checkStatement({ name: "extrato.pdf", size: 1000 })).toBe("extrato.pdf: envie o extrato em OFX ou CSV");
    expect(checkStatement({ name: "sem-extensao", size: 1000 })).toBe("sem-extensao: envie o extrato em OFX ou CSV");
    expect(checkStatement({ name: "vazio.ofx", size: 0 })).toBe("vazio.ofx: o arquivo está vazio");
    expect(checkStatement({ name: "grande.ofx", size: MAX_STATEMENT_BYTES + 1 })).toBe(
      "grande.ofx: o extrato passa de 5 MB, importe por períodos menores"
    );
    expect(checkStatement({ name: "limite.ofx", size: MAX_STATEMENT_BYTES })).toBeNull();
  });

  it("o botão de importar diz quantas linhas entram", () => {
    expect(importLabel(preview(0, 3))).toBe("Nada novo para importar");
    expect(importLabel(preview(1))).toBe("Importar 1 linha nova");
    expect(importLabel(preview(12))).toBe("Importar 12 linhas novas");
  });

  it("depois de importar, diz o que entrou e o que já estava", () => {
    expect(importedText(result(0, 3))).toBe("Nada foi importado: todas as linhas já estavam na conta.");
    expect(importedText(result(1, 0))).toBe("1 linha importada.");
    expect(importedText(result(5, 1))).toBe("5 linhas importadas, 1 já estava.");
    expect(importedText(result(5, 2))).toBe("5 linhas importadas, 2 já estavam.");
  });

  it("lê o saldo inicial como a pessoa digita, inclusive negativo, e vazio é zero", () => {
    expect(parseBalance("")).toBe("0.00");
    expect(parseBalance("1.234,56")).toBe("1234.56");
    expect(parseBalance("1000")).toBe("1000.00");
    expect(parseBalance("-50,5")).toBe("-50.50");
    expect(parseBalance("-0")).toBe("0.00");
    expect(parseBalance("abc")).toBeNull();
    expect(parseBalance("1,234,56")).toBeNull();
    expect(balanceText("1000.00")).toBe("1000,00");
    expect(balanceText("0.00")).toBe("");
    expect(balanceText(null)).toBe("");
  });

  it("identifica a conta numa linha só, e conta antiga diz que falta o banco", () => {
    expect(bankLine({ bankName: "Itaú", agency: "1234", accountNumber: "12345-6", accountType: "corrente" })).toBe(
      "Itaú · ag. 1234 · conta 12345-6 · Conta corrente"
    );
    expect(bankLine({ bankName: null, agency: null, accountNumber: null, accountType: null })).toBe(
      "banco não informado · Conta corrente"
    );
  });

  it("a situação da linha: pendente sem conciliação, conciliada com lançamento, exceção com motivo", () => {
    const base = { classification: null, classificationLabel: null, label: "x", targetKind: null, targetId: null, nfNumber: null, nfIssuedOn: null, by: null, at: "2026-11-12T10:00:00Z" };
    expect(situationOf({ reconciliation: null })).toBe("pendente");
    expect(situationOf({ reconciliation: { ...base, kind: "lancamento" } })).toBe("conciliada");
    expect(situationOf({ reconciliation: { ...base, kind: "excecao" } })).toBe("excecao");
  });

  it("explica por que o lançamento foi sugerido", () => {
    expect(reasonsText({ reasons: ["valor igual", "mesmo dia", "nome na descrição"] })).toBe(
      "valor igual · mesmo dia · nome na descrição"
    );
  });

  it("só a classificação com NF pede o número e a emissão da nota", () => {
    expect(needsInvoice("nf")).toBe(true);
    expect(needsInvoice("rpa")).toBe(false);
    expect(checkReconcile({ classification: "", nfNumber: "", nfIssuedOn: "" })).toBe("Escolha a classificação da linha.");
    expect(checkReconcile({ classification: "nf", nfNumber: "5521", nfIssuedOn: "" })).toBe(
      "Pagamento com NF pede o número e a data de emissão da nota."
    );
    expect(checkReconcile({ classification: "nf", nfNumber: "  ", nfIssuedOn: "2026-11-02" })).toBe(
      "Pagamento com NF pede o número e a data de emissão da nota."
    );
    expect(checkReconcile({ classification: "nf", nfNumber: "5521", nfIssuedOn: "2026-11-02" })).toBeNull();
    expect(checkReconcile({ classification: "incentivo", nfNumber: "", nfIssuedOn: "" })).toBeNull();
  });

  it("o tipo da conta tem nome em português, e o desconhecido é conta corrente", () => {
    expect(accountTypeLabel("aplicacao")).toBe("Aplicação");
    expect(accountTypeLabel("caixa")).toBe("Caixa");
    expect(accountTypeLabel(null)).toBe("Conta corrente");
  });
});
