/** Acréscimos, descontos e impostos de uma conta (a pagar ou a receber), lançados linha a linha. */
import { parseMoney, toCents, toField, type TaxRate } from "./payables";
import { fold } from "./search";

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

/**
 * Os campos fixos da janela, na ordem do sistema antigo (Bruno, 19/11/2026, com o print da tela antiga).
 * Cada campo com valor vira uma linha com a descrição dele; a API continua recebendo linhas.
 */
export interface AdjustmentField {
  key: string;
  kind: AdjustmentKind;
  /** O nome ao lado do campo. */
  label: string;
  /** O nome que o leitor de tela lê, quando o rótulo sozinho não basta ("Outros" aparece duas vezes). */
  name: string;
  /** O texto gravado na linha. */
  description: string;
  /** A primeira palavra das descrições que caem neste campo. Vazio = o "Outros" do grupo, que pega o resto. */
  words: string[];
}

export const ADJUSTMENT_FIELDS: AdjustmentField[] = [
  { key: "juros", kind: "acrescimo", label: "Juros", name: "Juros", description: "Juros", words: ["juros", "juro"] },
  { key: "multa", kind: "acrescimo", label: "Multa", name: "Multa", description: "Multa", words: ["multa"] },
  { key: "acrescimo-outros", kind: "acrescimo", label: "Outros", name: "Outros acréscimos", description: "Outros", words: [] },
  { key: "desconto", kind: "desconto", label: "Total", name: "Desconto", description: "Desconto", words: [] },
  { key: "pis", kind: "imposto", label: "PIS", name: "PIS", description: "PIS", words: ["pis"] },
  { key: "cofins", kind: "imposto", label: "COFINS", name: "COFINS", description: "COFINS", words: ["cofins"] },
  { key: "csll", kind: "imposto", label: "CSLL", name: "CSLL", description: "CSLL", words: ["csll"] },
  { key: "ir", kind: "imposto", label: "IR", name: "IR", description: "IR", words: ["ir", "irrf", "irpj"] },
  { key: "iss", kind: "imposto", label: "ISS", name: "ISS", description: "ISS", words: ["iss", "issqn"] },
  { key: "inss", kind: "imposto", label: "INSS", name: "INSS", description: "INSS", words: ["inss"] },
  { key: "imposto-outros", kind: "imposto", label: "Outros", name: "Outros impostos", description: "Outros", words: [] },
];

/** O campo de uma linha já lançada, pela primeira palavra da descrição ("ISS retido" vai para ISS). */
export function fieldOf(line: { kind: AdjustmentKind; description: string }): AdjustmentField {
  const word = fold(line.description).trim().split(/[^a-z0-9]+/)[0] ?? "";
  const group = ADJUSTMENT_FIELDS.filter((field) => field.kind === line.kind);
  return group.find((field) => field.words.includes(word)) ?? group.find((field) => !field.words.length)!;
}

/** O valor de cada campo ("12,50"), somando as linhas que caem nele; campo sem valor fica vazio. */
export function fieldValues(drafts: AdjustmentDraft[]): Record<string, string> {
  const cents: Record<string, number> = {};
  for (const draft of drafts) {
    const value = parseMoney(draft.amount);
    if (!value) continue;
    const key = fieldOf(draft).key;
    cents[key] = (cents[key] ?? 0) + toCents(value);
  }
  return Object.fromEntries(
    ADJUSTMENT_FIELDS.map((field) => [field.key, cents[field.key] ? toField(centsText(cents[field.key])) : ""])
  );
}

/** Soma, em centavos, dos campos de um grupo. Campo com valor inválido conta zero: o erro aparece ao salvar. */
export function fieldsCents(values: Record<string, string>, kind: AdjustmentKind): number {
  return ADJUSTMENT_FIELDS.filter((field) => field.kind === kind).reduce((sum, field) => {
    const value = parseMoney(values[field.key] ?? "");
    return sum + (value ? toCents(value) : 0);
  }, 0);
}

/** As linhas a gravar: uma por campo com valor maior que zero, na ordem dos campos. */
export function draftsFromFields(values: Record<string, string>): { drafts: AdjustmentDraft[]; error: string | null } {
  const drafts: AdjustmentDraft[] = [];
  for (const field of ADJUSTMENT_FIELDS) {
    const text = (values[field.key] ?? "").trim();
    if (!text) continue;
    const amount = parseMoney(text);
    if (!amount) return { drafts: [], error: `Informe o valor de "${field.name}", como 12,50.` };
    if (Number(amount) === 0) continue;
    drafts.push({ kind: field.kind, description: field.description, amount: toField(amount) });
  }
  return { drafts, error: null };
}

/** "1.50" vira "1,5", como a pessoa digita. */
export function percentField(rate: string): string {
  return Number(rate).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** "1.50" vira "1,5%". */
export function percentText(rate: string): string {
  return `${percentField(rate)}%`;
}

/** "1,5" vira "1.50". Devolve null fora de 0 a 100 ou com mais de 2 casas. */
export function parsePercent(text: string): string | null {
  const clean = text.trim().replace(/\s*%$/, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean) || Number(clean) > 100) return null;
  return Number(clean).toFixed(2);
}

/** O imposto em centavos: valor × percentual, arredondado no centavo (meio centavo sobe). */
export function taxCents(grossCents: number, rate: string): number {
  return Math.round((grossCents * Math.round(Number(rate) * 100)) / 10000);
}

/**
 * Os impostos retidos calculados sobre o valor principal (Bruno, 19/11/2026), no lugar das linhas que já
 * havia deles. Imposto que dá zero não entra; sem valor principal, eles saem.
 */
export function withTaxes(drafts: AdjustmentDraft[], gross: string, rates: TaxRate[]): AdjustmentDraft[] {
  const codes = new Set(rates.map((rate) => rate.code));
  const kept = drafts.filter((draft) => draft.kind !== "imposto" || !codes.has(fieldOf(draft).key));
  const value = parseMoney(gross);
  const taxes = value
    ? rates.flatMap((rate) => {
        const cents = taxCents(toCents(value), rate.rate);
        const field = ADJUSTMENT_FIELDS.find((item) => item.key === rate.code);
        return cents && field ? [{ kind: field.kind, description: field.description, amount: toField(centsText(cents)) }] : [];
      })
    : [];
  return sortDrafts([...taxes, ...kept]);
}

/** Os impostos retidos ainda são os calculados para este valor? Se a pessoa mudou algum, não recalcula. */
export function taxesUntouched(drafts: AdjustmentDraft[], gross: string, rates: TaxRate[]): boolean {
  const now = fieldValues(drafts);
  const calculated = fieldValues(withTaxes(drafts, gross, rates));
  return rates.every((rate) => now[rate.code] === calculated[rate.code]);
}

/** "PIS 0,65%, COFINS 3%, CSLL 1% e IR 1,5%": os percentuais acima de zero. */
export function ratesText(rates: TaxRate[]): string {
  const parts = rates.filter((rate) => Number(rate.rate) > 0).map((rate) => `${rate.name} ${percentText(rate.rate)}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}` : (parts[0] ?? "");
}
