"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { MAX_MONEY_DIGITS, maskMoney, maskPastedMoney, moneyDigits } from "@/lib/money";

/**
 * Campo de valor em reais, no lugar do `Input`: o ponto e a vírgula entram sozinhos (digitar 123456 mostra
 * 1.234,56). Quem usa continua lendo `event.target.value`, que já chega com a máscara, e `parseMoney` lê
 * esse texto como antes. Passa de 12 números, a tecla é ignorada: o valor nunca é cortado em silêncio.
 * `allowNegative` deixa o "-" na frente (saldo de conta).
 */
export function MoneyInput({
  onChange,
  onPaste,
  onFocus,
  allowNegative = false,
  ...props
}: React.ComponentProps<typeof Input> & { allowNegative?: boolean }) {
  const pasted = useRef<string | null>(null);
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      {...props}
      // Entrar no campo seleciona o valor: o primeiro número digitado o troca, em vez de somar aos centavos.
      onFocus={(event) => {
        event.target.select();
        onFocus?.(event);
      }}
      onPaste={(event) => {
        pasted.current = event.clipboardData.getData("text");
        onPaste?.(event);
      }}
      onChange={(event) => {
        const field = event.target;
        const fromPaste = (event.nativeEvent as InputEvent).inputType === "insertFromPaste";
        const text = fromPaste ? pasted.current : null;
        pasted.current = null;
        if (moneyDigits(text ?? field.value).length > MAX_MONEY_DIGITS) {
          field.value = String(props.value ?? ""); // passou do limite: fica como estava
          return;
        }
        field.value = text !== null ? maskPastedMoney(text, allowNegative) : maskMoney(field.value, allowNegative);
        onChange?.(event);
      }}
    />
  );
}
