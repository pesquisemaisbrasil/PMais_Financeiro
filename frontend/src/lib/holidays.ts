/** Cadastro de feriados: os nacionais da BrasilAPI e os locais do financeiro. Contam como dia não útil. */

import { request, send } from "./api";

export type HolidayScope = "nacional" | "estadual" | "municipal";

export interface Holiday {
  id: number;
  date: string;
  name: string;
  scope: HolidayScope;
  uf: string | null;
  city: string | null;
  source: "brasilapi" | "manual" | "feriados.dev";
}

export interface HolidayInput {
  date: string;
  name: string;
  scope: HolidayScope;
  uf: string | null;
  city: string | null;
}

export interface HolidaySync {
  year: number;
  added: number;
  total: number;
  /** Os estaduais e municipais das capitais (feriados.dev, 19/11/2026). */
  addedLocal?: number;
  totalLocal?: number;
}

export const SCOPES: { id: HolidayScope; label: string }[] = [
  { id: "nacional", label: "Nacional" },
  { id: "estadual", label: "Estadual" },
  { id: "municipal", label: "Municipal" },
];

export const SOURCE_LABELS: Record<Holiday["source"], string> = {
  brasilapi: "BrasilAPI",
  manual: "Cadastrado à mão",
  "feriados.dev": "feriados.dev (capitais)",
};

export function listHolidays(): Promise<Holiday[]> {
  return request<Holiday[]>("/holidays");
}

export function createHoliday(body: HolidayInput): Promise<Holiday> {
  return send<Holiday>("/holidays", "POST", body);
}

export function syncHolidays(year: number): Promise<HolidaySync> {
  return request<HolidaySync>(`/holidays/sync?year=${year}`, { method: "POST" });
}

/** Onde o feriado vale: "Nacional", "SP" ou "São Paulo/SP". */
export function holidayPlace(holiday: Pick<Holiday, "scope" | "uf" | "city">): string {
  if (holiday.scope === "nacional") return "Nacional";
  if (holiday.scope === "estadual") return holiday.uf ?? "Estadual";
  return [holiday.city, holiday.uf].filter(Boolean).join("/") || "Municipal";
}

/** O dia da semana por extenso, para quem confere se o feriado cai no fim de semana. */
export function weekday(iso: string): string {
  const names = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  return names[new Date(`${iso}T12:00:00Z`).getUTCDay()];
}

/** Os anos que a busca oferece: o anterior, o atual e os dois seguintes. */
export function syncYears(currentYear: number): number[] {
  return [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
}

/** A mensagem depois de buscar os nacionais: quantos entraram e quantos o ano tem. */
export function syncMessage(result: HolidaySync): string {
  const local = result.addedLocal
    ? result.addedLocal === 1
      ? " Das capitais, 1 feriado estadual ou municipal novo."
      : ` Das capitais, ${result.addedLocal} feriados estaduais e municipais novos.`
    : "";
  if (result.added === 0) return `Os ${result.total} feriados nacionais de ${result.year} já estavam cadastrados.${local}`;
  const added = result.added === 1 ? "1 feriado novo" : `${result.added} feriados novos`;
  return `${added} em ${result.year}. O ano tem ${result.total} feriados nacionais.${local}`;
}
