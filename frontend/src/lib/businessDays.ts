/** Aviso de dia não útil na hora de lançar: fim de semana ou feriado, com o dia útil anterior e o próximo. */

import { request } from "./api";

export interface BusinessDayCheck {
  date: string;
  isBusinessDay: boolean;
  /** "sábado", "domingo", "feriado nacional" ou "feriado: Nome"; vazio quando o dia é útil. */
  reason: string | null;
  previous: string;
  next: string;
}

export function checkBusinessDay(date: string): Promise<BusinessDayCheck> {
  return request<BusinessDayCheck>(`/business-days/check?date=${date}`);
}

/** Só pergunta ao servidor por uma data completa e dentro do que o sistema aceita (2000 a 2100). */
export function isCheckable(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const year = Number(iso.slice(0, 4));
  return year >= 2000 && year <= 2100 && !Number.isNaN(new Date(`${iso}T12:00:00Z`).getTime());
}

/** "sex 06/11": o dia da semana e o dia e mês, para o botão dizer para onde a data vai. */
export function shortDay(iso: string): string {
  const names = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const day = names[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return `${day} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
