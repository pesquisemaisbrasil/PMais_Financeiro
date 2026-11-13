"use client";

import "driver.js/dist/driver.css";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { TOUR_STEPS, availableSteps, markTourSeen, tourFor, tourSeen, tourSelector } from "@/lib/tour";

/**
 * Passeio (Driver.js, licença MIT): destaca partes da tela e conta o que cada uma faz. Com o endereço da
 * tela, mostra o passeio dela; sem ele (ou numa tela sem passeio próprio), o geral, do menu.
 * A biblioteca só é baixada quando o passeio abre. Abrir o geral já marca como visto: recarregar a página
 * ou fechar a aba no meio não o faz voltar sozinho (ele volta pelo botão). O de cada tela só abre pelo botão.
 */
export async function startTour(pathname?: string | null): Promise<void> {
  const { driver } = await import("driver.js");
  const screen = tourFor(pathname);
  const steps = availableSteps((selector) => document.querySelector(selector) !== null, screen);
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tour = driver({
    animate: !calm,
    smoothScroll: !calm,
    allowClose: true,
    showProgress: true,
    progressText: "{{current}} de {{total}}",
    nextBtnText: "Próximo",
    prevBtnText: "Voltar",
    doneBtnText: "Concluir",
    closeBtnLabel: "Fechar o passeio",
    popoverClass: "passeio",
    stagePadding: 6,
    stageRadius: 10,
    skipMissingElement: true,
    steps: steps.map((step) => ({
      element: step.target ? tourSelector(step.target) : undefined,
      popover: { title: step.title, description: step.text, align: "start" },
    })),
  });
  tour.drive();
  if (screen === TOUR_STEPS) markTourSeen();
}

/** Abre o passeio sozinho, uma vez por navegador, na primeira visita ao Início. */
export function TourAutoStart() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname !== "/" || tourSeen()) return;
    // espera o menu e o Início terminarem de aparecer
    const timer = window.setTimeout(() => void startTour(), 800);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return null;
}
