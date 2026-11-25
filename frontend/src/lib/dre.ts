/** DRE (PF-76): cada grupo do plano de contas é uma linha, por competência (Bruno, 25/11/2026). */

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

export function getDre(query: DreQuery): Promise<DreReport> {
  return request<DreReport>(`/reports/dre?${params(query)}`);
}

export function exportDre(query: DreQuery): Promise<Blob> {
  return fetchBlob(`/reports/dre/export?${params(query)}`);
}

/** O DRE abre no ano até hoje: de 1º de janeiro ao dia de hoje. */
export function yearToDate(today: string): { start: string; end: string } {
  return { start: `${today.slice(0, 4)}-01-01`, end: today };
}
