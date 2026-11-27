/**
 * DRE (PF-76): linhas fixas com subtotais, por competência (Bruno, 27/11/2026). O plano de contas
 * diz em que linha cada grupo, ou conta, entra. O fluxo mensal mostra o dinheiro por grupo, pelo mês
 * do pagamento (`caixa`).
 */

import { fetchBlob, request } from "./api";

/** As linhas a que o plano de contas se liga (schemas/dre.DreLineKey), na ordem do quadro. */
export const DRE_LINES = [
  { id: "receita", label: "Receita operacional" },
  { id: "impostos", label: "Impostos" },
  { id: "custos", label: "Custos dos serviços" },
  { id: "pessoal", label: "Despesas com pessoal" },
  { id: "administrativas", label: "Despesas administrativas" },
  { id: "bancarias", label: "Despesas bancárias" },
  { id: "outras_receitas", label: "Outras receitas" },
  { id: "fora", label: "Fora do resultado" },
] as const;

export function dreLineLabel(key: string | null | undefined): string | null {
  return DRE_LINES.find((line) => line.id === key)?.label ?? null;
}

export const SIGNS = { "+": "(+)", "-": "(−)", "±": "(±)", "=": "(=)" } as const;

export interface DreAccount {
  label: string;
  values: string[];
  total: string;
}

/** Um grupo do plano de contas, com as contas dele. */
export interface DreLine extends DreAccount {
  accounts: DreAccount[];
}

export interface DreBlock extends DreAccount {
  kind: "receita" | "despesa";
  lines: DreLine[];
}

/** O fluxo mensal: receitas e despesas por grupo, e o resultado. */
export interface DreReport {
  months: { month: string; label: string }[];
  blocks: DreBlock[];
  result: DreAccount;
}

/** Uma linha do DRE (com os grupos dela) ou um subtotal. */
export interface DreRow extends DreAccount {
  key: string;
  kind: "linha" | "subtotal" | "resultado";
  sign: keyof typeof SIGNS;
  groups: DreLine[];
}

export interface DreStatement {
  months: { month: string; label: string }[];
  rows: DreRow[];
  outside: DreRow | null;
  /** Contas com lançamento no período que ainda não têm linha. */
  unmapped: number;
}

export interface DreQuery {
  start: string;
  end: string;
  company: string;
  unit: string;
  project: string;
  costCenter: string;
}

function params(query: DreQuery): string {
  return new URLSearchParams(Object.entries(query).filter(([, value]) => value)).toString();
}

export type DreBasis = "competencia" | "caixa";

const PATHS: Record<DreBasis, string> = { competencia: "/reports/dre", caixa: "/reports/monthly-flow" };

export function getDre(query: DreQuery, basis: DreBasis = "competencia"): Promise<DreStatement | DreReport> {
  return request<DreStatement | DreReport>(`${PATHS[basis]}?${params(query)}`);
}

/** O quadro não tem nada no período: nenhum grupo em linha nenhuma. */
export function isEmpty(data: DreStatement | DreReport): boolean {
  return "rows" in data
    ? !data.outside && data.rows.every((row) => !row.groups.length)
    : data.blocks.every((block) => !block.lines.length);
}

export function exportDre(query: DreQuery, basis: DreBasis = "competencia"): Promise<Blob> {
  return fetchBlob(`${PATHS[basis]}/export?${params(query)}`);
}

/** "janeiro/2026" → "jan/26": cabem mais meses na largura da tela. */
export function shortMonthYear(label: string): string {
  const [month, year = ""] = label.split("/");
  return `${month.slice(0, 3)}/${year.slice(-2)}`;
}

/** O DRE abre no ano até hoje: de 1º de janeiro ao dia de hoje. */
export function yearToDate(today: string): { start: string; end: string } {
  return { start: `${today.slice(0, 4)}-01-01`, end: today };
}
