/** Fluxo de caixa (PF-74): previsto × realizado por dia, semana ou mês, e o saldo projetado. */

import { fetchBlob, request } from "./api";
import { addDays } from "./payables";

export type CashFlowGroup = "dia" | "semana" | "mes";

export const GROUPS: { id: CashFlowGroup; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
];

export interface CashFlowPeriod {
  start: string;
  end: string;
  label: string;
  forecastIn: string;
  forecastOut: string;
  actualIn: string;
  actualOut: string;
  balance: string;
}

export interface CashFlowAccount {
  id: number;
  name: string;
  opening: string;
  inflow: string;
  outflow: string;
  closing: string;
}

export interface CashFlowReport {
  start: string;
  end: string;
  group: CashFlowGroup;
  opening: string;
  lateIn: string;
  lateOut: string;
  closing: string;
  periods: CashFlowPeriod[];
  accounts: CashFlowAccount[];
}

export interface CashFlowLine {
  kind: "pagar" | "receber";
  titleId: number;
  date: string;
  name: string;
  description: string;
  amount: string;
  provision?: boolean;
  account?: string;
}

export interface CashFlowDetail {
  forecast: CashFlowLine[];
  actual: CashFlowLine[];
}

export interface CashFlowQuery {
  start: string;
  end: string;
  group: CashFlowGroup;
}

function params(query: Partial<CashFlowQuery>): string {
  return new URLSearchParams(Object.entries(query).filter(([, value]) => value) as [string, string][]).toString();
}

export function getCashFlow(query: CashFlowQuery): Promise<CashFlowReport> {
  return request<CashFlowReport>(`/reports/cash-flow?${params(query)}`);
}

export function getCashFlowDetail(start: string, end: string): Promise<CashFlowDetail> {
  return request<CashFlowDetail>(`/reports/cash-flow/detail?${params({ start, end })}`);
}

export function exportCashFlow(query: CashFlowQuery): Promise<Blob> {
  return fetchBlob(`/reports/cash-flow/export?${params(query)}`);
}

/** Hoje, "2026-11-25", no horário de São Paulo. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** O período que a tela abre: desta semana (de segunda) até o domingo de 4 semanas depois. */
export function defaultRange(today: string): { start: string; end: string } {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // segunda = 0
  const start = addDays(today, -weekday);
  return { start, end: addDays(start, 34) };
}

/** Endereço do título em Contas a pagar ou a receber, aberto pela busca da lista. */
export function titleHref(line: Pick<CashFlowLine, "kind" | "titleId">): string {
  const screen = line.kind === "pagar" ? "contas-a-pagar" : "contas-a-receber";
  return `/${screen}?modo=tudo&conta=${line.titleId}`;
}
