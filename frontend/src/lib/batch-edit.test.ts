import { describe, expect, it } from "vitest";
import { batchRows, checkedTotal, draftFromRow, rowLocks } from "./batch-edit";
import type { PayableRow } from "./payables";

// Edição em lote, conta por conta (18/11): só as linhas marcadas vão, com as travas da edição da conta.
const row = (fields: Partial<PayableRow> = {}): PayableRow => ({
  id: 1,
  type: "real",
  origin: "manual",
  situation: "a_vencer",
  dueDate: "2026-11-20",
  payee: "Gráfica Ponto Certo",
  description: "Impressão",
  documentType: "Sem documento",
  documentNumber: null,
  allocations: [{ projectId: 1, code: "1804", amount: "1000.00" }],
  categoryName: "Material",
  costCenterName: "Campo",
  paymentMethodName: "Pix",
  companyName: "PPlus",
  amount: "1000.00",
  grossAmount: "1000.00",
  paid: "0.00",
  pending: "1000.00",
  docsLate: false,
  barcode: null,
  itemCount: 0,
  attachmentCount: 0,
  canPayDirectly: true,
  canReplace: false,
  replaces: null,
  series: null,
  supplierId: 7,
  payOn: null,
  competence: "2026-11",
  notes: null,
  ...fields,
});

describe("o que trava cada linha", () => {
  it("conta paga trava o valor; com pessoas, o valor e o fornecedor; com rateio, o valor", () => {
    expect(rowLocks(row({ situation: "pago" })).amount).toBe("Paga: o valor fica bloqueado");
    expect(rowLocks(row({ itemCount: 5 }))).toEqual({
      row: null,
      amount: "O valor é a soma das pessoas",
      supplier: "Com pessoas: o fornecedor não muda aqui",
    });
    const split = [
      { projectId: 1, code: "1804", amount: "600.00" },
      { projectId: 2, code: "1790", amount: "400.00" },
    ];
    expect(rowLocks(row({ allocations: split })).amount).toBe("Com rateio: mude o valor na conta");
    expect(rowLocks(row())).toEqual({ row: null, amount: null, supplier: null });
  });

  it("do Connect, cancelada ou substituída não se edita aqui", () => {
    expect(rowLocks(row({ origin: "connect" })).row).toBe("Do Connect: não se edita aqui");
    expect(rowLocks(row({ situation: "cancelado" })).row).toBe("Encerrada: não se edita");
  });
});

describe("o que vai para o servidor", () => {
  it("só as marcadas, com o que mudou além de descrição, valor e vencimento", () => {
    const rows = [row(), row({ id: 2, description: "Aluguel" })];
    const drafts = {
      1: { ...draftFromRow(rows[0]), checked: true, amount: "1.250,50", payOn: "2026-11-19", notes: " Nota " },
      2: draftFromRow(rows[1]),
    };
    expect(batchRows(rows, drafts)).toEqual({
      rows: [
        { id: 1, description: "Impressão", amount: "1250.50", dueDate: "2026-11-20", payOn: "2026-11-19", notes: "Nota" },
      ],
      error: null,
    });
    expect(checkedTotal(rows, drafts)).toBe(1250.5);
  });

  it("apagar a competência ou trocar o fornecedor também vai", () => {
    const rows = [row()];
    const drafts = { 1: { ...draftFromRow(rows[0]), checked: true, competence: "", supplierId: "9" } };
    expect(batchRows(rows, drafts).rows[0]).toMatchObject({ competence: null, supplierId: 9 });
  });

  it("recusa linha marcada sem descrição, sem valor ou sem vencimento, e lote sem linha marcada", () => {
    const rows = [row()];
    const base = { ...draftFromRow(rows[0]), checked: true };
    expect(batchRows(rows, { 1: { ...base, description: " " } }).error).toBe("Impressão: falta a descrição.");
    expect(batchRows(rows, { 1: { ...base, amount: "abc" } }).error).toBe("Impressão: confira o valor.");
    expect(batchRows(rows, { 1: { ...base, dueDate: "" } }).error).toBe("Impressão: falta o vencimento.");
    expect(batchRows(rows, { 1: draftFromRow(rows[0]) }).error).toBe("Marque pelo menos uma conta para salvar.");
  });
});
