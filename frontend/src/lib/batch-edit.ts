// Edição em lote, conta por conta (Bruno, 18/11/2026, com o print "Edição em Lote" do sistema antigo):
// uma linha por conta selecionada, e só as linhas marcadas vão para o servidor.
import { parseMoney, toCents, toField, type PayableRow } from "./payables";

/** O que a pessoa está editando em uma linha (valor como digitado; datas como o servidor manda). */
export interface BatchDraft {
  checked: boolean;
  supplierId: string;
  description: string;
  notes: string;
  amount: string;
  dueDate: string;
  payOn: string;
  competence: string;
}

/** A linha começa com o que a conta tem hoje, desmarcada. */
export function draftFromRow(row: PayableRow): BatchDraft {
  return {
    checked: false,
    supplierId: row.supplierId ? String(row.supplierId) : "",
    description: row.description,
    notes: row.notes ?? "",
    amount: toField(row.grossAmount),
    dueDate: row.dueDate,
    payOn: row.payOn ?? "",
    competence: row.competence ?? "",
  };
}

export interface RowLocks {
  /** A linha inteira não se edita aqui (o motivo aparece no lugar dos campos). */
  row: string | null;
  amount: string | null;
  supplier: string | null;
}

/** As mesmas travas da edição da conta, para a tela já mostrar o que não muda. */
export function rowLocks(row: PayableRow): RowLocks {
  if (row.origin === "connect") return { row: "Do Connect: não se edita aqui", amount: null, supplier: null };
  if (row.situation === "cancelado" || row.situation === "substituido") {
    return { row: "Encerrada: não se edita", amount: null, supplier: null };
  }
  const amount =
    row.situation === "pago"
      ? "Paga: o valor fica bloqueado"
      : row.itemCount > 0
        ? "O valor é a soma das pessoas"
        : row.allocations.length > 1
          ? "Com rateio: mude o valor na conta"
          : null;
  const supplier = row.itemCount > 0 ? "Com pessoas: o fornecedor não muda aqui" : null;
  return { row: null, amount, supplier };
}

export interface BatchEditRowBody {
  id: number;
  description: string;
  amount: string;
  dueDate: string;
  supplierId?: number | null;
  payOn?: string | null;
  competence?: string | null;
  notes?: string | null;
}

/**
 * O que vai para o servidor: só as linhas marcadas (e que se editam), com descrição, valor e
 * vencimento sempre, e fornecedor, pagar em, competência e observação só quando mudaram.
 */
export function batchRows(
  rows: PayableRow[],
  drafts: Record<number, BatchDraft>
): { rows: BatchEditRowBody[]; error: string | null } {
  const body: BatchEditRowBody[] = [];
  for (const row of rows) {
    const draft = drafts[row.id];
    if (!draft?.checked || rowLocks(row).row) continue;
    const description = draft.description.trim();
    if (!description) return { rows: [], error: `${row.description}: falta a descrição.` };
    const amount = parseMoney(draft.amount);
    if (!amount || Number(amount) <= 0) return { rows: [], error: `${row.description}: confira o valor.` };
    if (!draft.dueDate) return { rows: [], error: `${row.description}: falta o vencimento.` };
    const item: BatchEditRowBody = { id: row.id, description, amount, dueDate: draft.dueDate };
    const original = draftFromRow(row);
    if (draft.supplierId !== original.supplierId) item.supplierId = draft.supplierId ? Number(draft.supplierId) : null;
    if (draft.payOn !== original.payOn) item.payOn = draft.payOn || null;
    if (draft.competence !== original.competence) item.competence = draft.competence || null;
    if (draft.notes.trim() !== original.notes) item.notes = draft.notes.trim() || null;
    body.push(item);
  }
  if (!body.length) return { rows: [], error: "Marque pelo menos uma conta para salvar." };
  return { rows: body, error: null };
}

/** Soma do valor das linhas marcadas, como está digitado (em reais). */
export function checkedTotal(rows: PayableRow[], drafts: Record<number, BatchDraft>): number {
  const cents = rows
    .filter((row) => drafts[row.id]?.checked && !rowLocks(row).row)
    .reduce((sum, row) => sum + toCents(parseMoney(drafts[row.id].amount) ?? "0"), 0);
  return cents / 100;
}
