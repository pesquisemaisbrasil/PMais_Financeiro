"use client";

import "driver.js/dist/driver.css";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { availableSteps, markTourSeen, tourSeen, tourSelector } from "@/lib/tour";

/**
 * Passeio de introdução (Driver.js, licença MIT): destaca o menu e conta o que cada parte faz.
 * A biblioteca só é baixada quando o passeio abre. Fechar ou concluir marca como visto.
 */
export async function startTour(): Promise<void> {
  const { driver } = await import("driver.js");
  const steps = availableSteps((selector) => document.querySelector(selector) !== null);
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
    onDestroyed: () => markTourSeen(),
  });
  tour.drive();
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
