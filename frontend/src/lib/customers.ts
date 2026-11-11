/** Ficha do cliente: telefone em três partes (país, DDD e número), CEP e UF. */

export interface PhoneParts {
  country: string;
  ddd: string;
  number: string;
}

export const EMPTY_PHONE: PhoneParts = { country: "55", ddd: "", number: "" };

/** "+55 41 99999-0000" vira as três partes. O servidor só guarda telefone nesse formato. */
export function splitPhone(value: string | null | undefined): PhoneParts {
  const match = /^\+(\d{2}) (\d{2}) ([\d-]{8,10})$/.exec(value ?? "");
  return match ? { country: match[1], ddd: match[2], number: match[3] } : { ...EMPTY_PHONE };
}

/** As três partes viram "+55 41 99999-0000". Sem DDD e sem número, o telefone fica em branco. */
export function joinPhone(parts: PhoneParts): string {
  const ddd = parts.ddd.replace(/\D/g, "");
  const number = parts.number.replace(/[^\d-]/g, "");
  if (!ddd && !number) return "";
  return `+${parts.country.replace(/\D/g, "") || "55"} ${ddd} ${number}`;
}

/** Só os números do CEP, até 8. */
export function zipDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

/** "80010000" vira "80010-000" (enquanto digita, mostra o que já tem). */
export function formatZip(value: string): string {
  const digits = zipDigits(value);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
].map((uf) => ({ id: uf, label: uf }));
