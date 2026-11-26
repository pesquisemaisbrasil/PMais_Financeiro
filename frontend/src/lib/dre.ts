/**
 * DRE (PF-76): cada grupo do plano de contas é uma linha, por competência (Bruno, 25/11/2026).
 * O fluxo mensal é o mesmo quadro pelo mês do pagamento (`caixa`).
 */

import { fetchBlob, request } from "./api";

export interface DreAccount {
  label: string;
  values: string[];
  total: string;
}

export interface DreLine extends DreAccount {
  accounts: DreAccount[];
}

export interface DreBlock extends DreAccount {
  kind: "receita" | "despesa";
  lines: DreLine[];
}

export interface DreReport {
  months: { month: string; label: string }[];
  blocks: DreBlock[];
  result: DreAccount;
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

export function getDre(query: DreQuery, basis: DreBasis = "competencia"): Promise<DreReport> {
  return request<DreReport>(`${PATHS[basis]}?${params(query)}`);
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
