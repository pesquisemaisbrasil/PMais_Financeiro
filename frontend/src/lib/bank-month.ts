/** Conferência bancária por mês: extrato × sistema, saldo do mês e fechamento. */

import { fetchBlob, postJsonNoContent, postNoContent, request } from "./api";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** O mês de hoje, "2026-11", no horário de São Paulo. */
export function currentMonth(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

/** "2026-11" vira "novembro/2026". */
export function monthLabel(month: string): string {
  const [year, number] = month.split("-");
  return `${MONTHS[Number(number) - 1]}/${year}`;
}

/** O mês antes (-1) ou depois (+1), virando o ano: "2026-01" com -1 é "2025-12". */
export function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export interface DifferenceDay {
  day: string;
  extract: string;
  system: string;
  difference: string;
}

export interface DifferenceItem {
  on: string;
  description: string;
  amount: string;
  /** Na saída do extrato sem par: "pendente" ou "exceção". */
  note: string | null;
}

export interface DifferenceGroup {
  count: number;
  total: string;
  items: DifferenceItem[];
}

export interface Difference {
  month: string;
  imported: boolean;
  extractTotal: string;
  systemTotal: string;
  difference: string;
  byDay: DifferenceDay[];
  linesWithoutPair: DifferenceGroup;
  paymentsWithoutLine: DifferenceGroup;
  returns: DifferenceGroup;
}

export interface AccountBalance {
  id: number;
  name: string;
  company: string;
  accountType: string | null;
  opening: string;
  income: string;
  expense: string;
  closing: string;
  bySystem: string;
  toCheck: string;
  imported: boolean;
}

export interface Balances {
  month: string;
  accounts: AccountBalance[];
  total: Omit<AccountBalance, "id" | "name" | "company" | "accountType" | "imported">;
}

export interface ClosingCompany {
  id: number;
  name: string;
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  lines: number;
  notImported: string[];
  withoutPair: number;
  withoutClassification: number;
  ready: boolean;
}

export interface ClosingRow {
  companyId: number;
  company: string;
  month: string;
  closedAt: string;
  closedBy: string | null;
}

export interface ClosingStatus {
  month: string;
  companies: ClosingCompany[];
  closings: ClosingRow[];
}

/** O que falta para fechar, em frases curtas; vazio quando está pronto. */
export function closingBlockers(company: ClosingCompany): string[] {
  const blockers: string[] = [];
  if (company.notImported.length) blockers.push(`Extrato não importado: ${company.notImported.join(", ")}`);
  if (company.withoutPair) {
    blockers.push(
      company.withoutPair === 1 ? "1 linha sem conferir" : `${company.withoutPair} linhas sem conferir`
    );
  }
  if (company.withoutClassification) {
    blockers.push(
      company.withoutClassification === 1
        ? "1 linha sem classificação"
        : `${company.withoutClassification} linhas sem classificação`
    );
  }
  return blockers;
}

export function getDifference(accountId: number, month: string): Promise<Difference> {
  return request<Difference>(`/bank-accounts/${accountId}/difference?month=${month}`);
}

export function getBalances(month: string): Promise<Balances> {
  return request<Balances>(`/bank-balances?month=${month}`);
}

export function getClosingStatus(month: string): Promise<ClosingStatus> {
  return request<ClosingStatus>(`/period-closings?month=${month}`);
}

export function closeMonth(companyId: number, month: string): Promise<void> {
  return postNoContent(`/period-closings/${companyId}/${month}/close`);
}

export function reopenMonth(companyId: number, month: string, reason: string): Promise<void> {
  return postJsonNoContent(`/period-closings/${companyId}/${month}/reopen`, { reason });
}

export function downloadAccountingSheet(companyId: number, month: string): Promise<Blob> {
  return fetchBlob(`/period-closings/${companyId}/${month}/sheet`);
}

/** O nome do arquivo da planilha, o mesmo que o servidor sugere: conciliacao-pplus-2026-10.xlsx. */
export function sheetFileName(company: string, month: string): string {
  const slug = company
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `conciliacao-${slug}-${month}.xlsx`;
}
