/** Acréscimos, descontos e impostos de uma conta (a pagar ou a receber), lançados linha a linha. */
import { parseMoney, toCents, toField } from "./payables";

export type AdjustmentKind = "acrescimo" | "desconto" | "imposto";

export interface Adjustment {
  id: number;
  kind: AdjustmentKind;
  description: string;
  amount: string;
}

/** Linha em edição: o valor como a pessoa digita ("12,50"). */
export interface AdjustmentDraft {
  kind: AdjustmentKind;
  description: string;
  amount: string;
}

export const ADJUSTMENT_KINDS: {
  kind: AdjustmentKind;
  sign: string;
  total: string;
  button: string;
  help: string;
  example: string;
}[] = [
  {
    kind: "acrescimo",
    sign: "(+)",
    total: "Total de acréscimos",
    button: "Acréscimos",
    help: "Juros, multa ou outro valor que soma ao da conta.",
    example: "Ex.: Multa por atraso",
  },
  {
    kind: "desconto",
    sign: "(−)",
    total: "Total de descontos",
    button: "Descontos",
    help: "Desconto que diminui o valor da conta.",
    example: "Ex.: Desconto combinado",
  },
  {
    kind: "imposto",
    sign: "(−)",
    total: "Total de impostos",
    button: "Impostos",
    help: "Imposto retido, que diminui o valor da conta.",
    example: "Ex.: ISS retido",
  },
];

const ORDER = ADJUSTMENT_KINDS.map((item) => item.kind);

export const NET_ZERO_MESSAGE = "O valor líquido precisa ser maior que zero: os descontos e impostos passam do valor.";

export function draftsFrom(adjustments: Adjustment[]): AdjustmentDraft[] {
  return adjustments.map(({ kind, description, amount }) => ({ kind, description, amount: toField(amount) }));
}

/** Junta as linhas na ordem fixa dos tipos, para não parecer mudança só porque a ordem trocou. */
export function sortDrafts(drafts: AdjustmentDraft[]): AdjustmentDraft[] {
  return ORDER.flatMap((kind) => drafts.filter((draft) => draft.kind === kind));
}

/** "12.30" a partir de centavos. */
export function centsText(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Soma, em centavos, das linhas de um tipo. Linha com valor inválido conta zero: o erro aparece ao salvar. */
export function draftCents(drafts: AdjustmentDraft[], kind: AdjustmentKind): number {
  return drafts
    .filter((draft) => draft.kind === kind)
    .reduce((sum, draft) => {
      const value = parseMoney(draft.amount);
      return sum + (value ? toCents(value) : 0);
    }, 0);
}

/** O líquido ("940.00") a partir do valor principal digitado, ou null se ele ainda não é um valor. */
export function netText(gross: string, drafts: AdjustmentDraft[]): string | null {
  const value = parseMoney(gross);
  if (!value) return null;
  return centsText(
    toCents(value) + draftCents(drafts, "acrescimo") - draftCents(drafts, "desconto") - draftCents(drafts, "imposto")
  );
}

/** Totais de uma lista que já veio da API. */
export function adjustmentTotals(adjustments: { kind: AdjustmentKind; amount: string }[]): Record<AdjustmentKind, string> {
  const sum = (kind: AdjustmentKind) =>
    centsText(adjustments.filter((a) => a.kind === kind).reduce((total, a) => total + toCents(a.amount), 0));
  return { acrescimo: sum("acrescimo"), desconto: sum("desconto"), imposto: sum("imposto") };
}

export interface AdjustmentLine {
  kind: AdjustmentKind;
  description: string;
  amount: string;
}

/**
 * Confere as linhas e devolve o que a API espera. Linha totalmente vazia é ignorada; a primeira linha
 * ruim explica o que falta.
 */
export function parseDrafts(drafts: AdjustmentDraft[]): { lines: AdjustmentLine[]; error: string | null } {
  const lines: AdjustmentLine[] = [];
  for (const draft of drafts) {
    const description = draft.description.trim();
    if (!description && !draft.amount.trim()) continue;
    if (!description) return { lines: [], error: "Escreva a descrição de cada linha." };
    const amount = parseMoney(draft.amount);
    if (!amount || Number(amount) === 0) {
      return { lines: [], error: `Informe o valor de "${description}", como 12,50.` };
    }
    lines.push({ kind: draft.kind, description, amount });
  }
  return { lines, error: null };
}
