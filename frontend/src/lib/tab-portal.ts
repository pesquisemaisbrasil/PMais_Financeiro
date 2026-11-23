import { createContext, useContext } from "react";

/**
 * Onde as janelas (Dialog, AlertDialog, Sheet) de uma aba se abrem: dentro da própria aba, para sumirem e
 * voltarem com ela, com o que a pessoa já tinha digitado (abas, ADR 0025). Fora das abas: o body, como antes.
 */
export const TabPortalContext = createContext<HTMLElement | null>(null);

export function useTabPortal(): HTMLElement | undefined {
  return useContext(TabPortalContext) ?? undefined;
}

/** A fileira de abas: clicar nela com uma janela aberta troca de aba sem fechar a janela. */
export const TAB_BAR_ATTRIBUTE = "data-fileira-de-abas";

export function isInTabBar(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${TAB_BAR_ATTRIBUTE}]`) !== null;
}
