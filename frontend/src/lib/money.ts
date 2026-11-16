import { parseMoney } from "./payables";

/** Até onde vai um valor: 12 dígitos, os 2 últimos são os centavos (o limite que o banco de dados guarda). */
export const MAX_MONEY_DIGITS = 12;

/** Só os números do que foi digitado: a máscara refaz os pontos e a vírgula a cada tecla. */
export function moneyDigits(text: string): string {
  return text.replace(/\D/g, "");
}

/**
 * A máscara de valor em reais: os números entram pela direita, como nos apps de banco. Digitar
 * 1, 2, 3, 4, 5, 6 mostra 0,01 → 0,12 → 1,23 → 12,34 → 123,45 → 1.234,56, e apagar o último número
 * tira o último centavo. Campo vazio, ou só com zeros, fica vazio: apagando tudo o campo esvazia em vez
 * de ficar preso em 0,00. Com `allowNegative`, um "-" na frente é mantido.
 */
export function maskMoney(text: string, allowNegative = false): string {
  const negative = allowNegative && text.trim().startsWith("-");
  const digits = moneyDigits(text).replace(/^0+(?=\d)/, "");
  if (digits === "" || digits === "0") return negative ? "-" : "";
  const padded = digits.padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${whole},${padded.slice(-2)}`;
}

/**
 * Valor colado: "1.234,56", "1234,5", "1500.50" e "R$ 1.234,56" mantêm o valor que a pessoa copiou.
 * Digitar "1500.5" tecla a tecla é outra coisa (centavos), mas colar é um valor inteiro.
 */
export function maskPastedMoney(text: string, allowNegative = false): string {
  const negative = allowNegative && text.trim().startsWith("-");
  const cleaned = text.replace(/R\$/g, "").replace(/^\s*-/, "");
  const parsed = parseMoney(cleaned);
  const masked = maskMoney(parsed ? parsed.replace(".", "") : cleaned);
  return negative && masked ? `-${masked}` : masked;
}
