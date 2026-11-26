/** Recebimentos de projetos × ano (PF-76): o que entrou de cada projeto, mês a mês, no ano. */

import { fetchBlob, request } from "./api";

export interface ProjectReceiptsRow {
  projectId: number | null;
  label: string;
  values: string[];
  total: string;
}

export interface ProjectReceiptsReport {
  year: number;
  months: { month: string; label: string }[];
  rows: ProjectReceiptsRow[];
  total: ProjectReceiptsRow;
}

function params(year: string, company: string): string {
  return new URLSearchParams({ year, ...(company ? { company } : {}) }).toString();
}

export function getProjectReceipts(year: string, company: string): Promise<ProjectReceiptsReport> {
  return request<ProjectReceiptsReport>(`/reports/project-receipts?${params(year, company)}`);
}

export function exportProjectReceipts(year: string, company: string): Promise<Blob> {
  return fetchBlob(`/reports/project-receipts/export?${params(year, company)}`);
}

/** Os anos da lista: cinco para trás e o próximo, do mais novo para o mais antigo. */
export function yearOptions(today: string): string[] {
  const year = Number(today.slice(0, 4));
  return Array.from({ length: 7 }, (_, index) => String(year + 1 - index));
}

/** "novembro/2026" → "nov": o ano já está no filtro. */
export function shortMonth(label: string): string {
  return label.slice(0, 3);
}
