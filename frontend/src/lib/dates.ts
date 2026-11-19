// Campo de data sempre em dia/mês/ano (Bruno, 18/11/2026: no Edge em inglês o campo do navegador
// mostrava mês/dia/ano). A tela guarda e manda a data no formato do servidor (aaaa-mm-dd); só o que a
// pessoa vê e digita é dd/mm/aaaa.

/** Vai pondo as barras enquanto a pessoa digita: "1811" → "18/11", "18112026" → "18/11/2026". */
export function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** "18/11/2026" → "2026-11-18". Data incompleta ou que não existe (31/02) → null. */
export function isoFromBr(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const valid =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day) &&
    Number(year) >= 1900 &&
    Number(year) <= 2100;
  return valid ? `${year}-${month}-${day}` : null;
}

/** "2026-11-18" → "18/11/2026"; vazio continua vazio. */
export function brFromIso(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/**
 * O que a pessoa digitou ou colou, já no formato da tela. Aceita também a data no formato do servidor
 * ("2026-11-18"), como vem de uma planilha ou de um teste.
 */
export function typedDate(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return brFromIso(raw.trim());
  return maskDate(raw);
}

// Competência (mês e ano) também em mm/aaaa: o campo de mês do navegador mostrava "November 2026".

/** Vai pondo a barra enquanto a pessoa digita: "112026" → "11/2026". */
export function maskMonth(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** "11/2026" → "2026-11". Mês incompleto ou que não existe (13/2026) → null. */
export function isoMonthFromBr(text: string): string | null {
  const match = /^(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, month, year] = match;
  const valid = Number(month) >= 1 && Number(month) <= 12 && Number(year) >= 1900 && Number(year) <= 2100;
  return valid ? `${year}-${month}` : null;
}

/** "2026-11" → "11/2026"; vazio continua vazio. */
export function brFromIsoMonth(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[2]}/${match[1]}` : "";
}

/** O que a pessoa digitou ou colou, já no formato da tela; aceita também "2026-11". */
export function typedMonth(raw: string): string {
  if (/^\d{4}-\d{2}$/.test(raw.trim())) return brFromIsoMonth(raw.trim());
  return maskMonth(raw);
}
