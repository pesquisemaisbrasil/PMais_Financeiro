/** Agenda dos incentivos: um vencimento por data de pagamento, com as pessoas e a situação. */

import { request } from "./api";
import type { PeriodMode, Situation } from "./payables";

export interface AgendaRow {
  id: number;
  dueDate: string;
  description: string;
  projectCodes: string[];
  people: number;
  amount: string;
  paid: string;
  pending: string;
  situation: Situation;
}

export interface Bucket {
  count: number;
  people: number;
  total: string;
}

export interface Agenda {
  today: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  summary: { a_vencer: Bucket; hoje: Bucket; vencido: Bucket; pago: Bucket };
  /** O que está vencido em qualquer data, mesmo fora do período à vista. */
  overdueAll: Bucket;
  rows: AgendaRow[];
}

export interface AgendaQuery {
  mode: PeriodMode;
  ref: string | null;
  start: string;
  end: string;
}

export function getIncentiveAgenda(query: AgendaQuery): Promise<Agenda> {
  const params = new URLSearchParams({ mode: query.mode });
  if (query.ref) params.set("ref", query.ref);
  if (query.mode === "periodo") {
    params.set("start", query.start);
    params.set("end", query.end);
  }
  return request<Agenda>(`/incentives/agenda?${params}`);
}

/** As linhas de uma mesma data de vencimento, com o que a data soma. */
export interface AgendaDay {
  date: string;
  rows: AgendaRow[];
  people: number;
  pending: number;
  late: boolean;
}

/** Agrupa as linhas por data, na ordem das datas. O "vencido" é a data que já passou e ainda tem a pagar. */
export function groupByDay(rows: AgendaRow[], today: string): AgendaDay[] {
  const days = new Map<string, AgendaRow[]>();
  for (const row of rows) days.set(row.dueDate, [...(days.get(row.dueDate) ?? []), row]);
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const pending = list.reduce((sum, row) => sum + Math.round(Number(row.pending) * 100), 0) / 100;
      return {
        date,
        rows: list,
        people: list.reduce((sum, row) => sum + row.people, 0),
        pending,
        late: date < today && pending > 0,
      };
    });
}

/** "3 pessoas", "1 pessoa". */
export function peopleText(count: number): string {
  return count === 1 ? "1 pessoa" : `${count} pessoas`;
}

/** O aviso do topo quando há incentivo vencido fora do período que está à vista. */
export function overdueNotice(overdueAll: Bucket, inView: Bucket): string | null {
  if (overdueAll.count === 0 || overdueAll.count === inView.count) return null;
  const outside = overdueAll.count - inView.count;
  return outside === 1
    ? "Há 1 lançamento de incentivo vencido fora deste período."
    : `Há ${outside} lançamentos de incentivo vencidos fora deste período.`;
}
