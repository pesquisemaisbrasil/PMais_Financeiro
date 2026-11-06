"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Cada indicador tem a sua cor, a mesma das etiquetas da lista (vencida, vence hoje, provisão...). */
export type IndicatorTone = "azul" | "verde" | "ceu" | "vermelho" | "ambar" | "roxo" | "neutro" | "cinza";

// As classes ficam escritas por inteiro: o Tailwind não enxerga nome montado com texto.
export const TONES: Record<IndicatorTone, { chip: string; idle: string; active: string }> = {
  azul: {
    chip: "bg-brand-azul-deep/12 text-brand-azul-deep",
    idle: "bg-[linear-gradient(135deg,#ffffff_55%,rgb(64_99_238/.09))]",
    active:
      "bg-[linear-gradient(135deg,rgb(64_99_238/.07),rgb(64_99_238/.2))] ring-brand-azul-deep/70 shadow-[0_10px_22px_-12px_rgb(64_99_238/.7)]",
  },
  verde: {
    chip: "bg-brand-verde/15 text-[#047857]",
    idle: "bg-[linear-gradient(135deg,#ffffff_55%,rgb(0_201_119/.1))]",
    active:
      "bg-[linear-gradient(135deg,rgb(0_201_119/.08),rgb(0_201_119/.22))] ring-brand-verde/70 shadow-[0_10px_22px_-12px_rgb(0_201_119/.7)]",
  },
  ceu: {
    chip: "bg-brand-azul-claro/12 text-[#0369a1]",
    idle: "bg-[linear-gradient(135deg,#ffffff_55%,rgb(0_156_239/.09))]",
    active:
      "bg-[linear-gradient(135deg,rgb(0_156_239/.07),rgb(0_156_239/.2))] ring-brand-azul-claro/70 shadow-[0_10px_22px_-12px_rgb(0_156_239/.7)]",
  },
  vermelho: {
    chip: "bg-[#fee2e2] text-[#b91c1c]",
    idle: "bg-[linear-gradient(135deg,#ffffff_55%,rgb(239_68_68/.09))]",
    active:
      "bg-[linear-gradient(135deg,rgb(239_68_68/.07),rgb(239_68_68/.2))] ring-[#ef4444]/70 shadow-[0_10px_22px_-12px_rgb(239_68_68/.7)]",
  },
  ambar: {
    chip: "bg-[#fef3c7] text-[#b45309]",
    idle: "bg-[linear-gradient(135deg,#ffffff_55%,rgb(245_158_11/.12))]",
    active:
      "bg-[linear-gradient(135deg,rgb(245_158_11/.09),rgb(245_158_11/.24))] ring-[#f59e0b]/70 shadow-[0_10px_22px_-12px_rgb(245_158_11/.7)]",
  },
  roxo: {
    chip: "bg-brand-roxo/10 text-brand-roxo",
    idle: "bg-[linear-gradient(135deg,#ffffff_55%,rgb(107_54_247/.08))]",
    active:
      "bg-[linear-gradient(135deg,rgb(107_54_247/.06),rgb(107_54_247/.18))] ring-brand-roxo/70 shadow-[0_10px_22px_-12px_rgb(107_54_247/.7)]",
  },
  neutro: {
    chip: "bg-brand-azul-neutro/25 text-[#0e7490]",
    idle: "bg-[linear-gradient(135deg,#ffffff_55%,rgb(110_195_228/.16))]",
    active:
      "bg-[linear-gradient(135deg,rgb(110_195_228/.12),rgb(110_195_228/.3))] ring-brand-azul-neutro/80 shadow-[0_10px_22px_-12px_rgb(14_116_144/.6)]",
  },
  cinza: {
    chip: "bg-brand-cinza-claro text-brand-cinza-escuro",
    idle: "bg-[linear-gradient(135deg,#ffffff_55%,rgb(60_60_60/.06))]",
    active:
      "bg-[linear-gradient(135deg,rgb(60_60_60/.05),rgb(60_60_60/.13))] ring-brand-cinza-escuro/50 shadow-[0_10px_22px_-12px_rgb(60_60_60/.5)]",
  },
};

/**
 * Card de indicador que também é filtro: mostra o total, a contagem e um ícone na cor do indicador.
 * Entra com um leve deslizar (um depois do outro) e sobe um pouco ao passar o mouse; quem pediu menos
 * movimento no sistema não vê nada disso.
 */
export function IndicatorCard({
  label,
  value,
  count,
  icon: Icon,
  tone,
  active,
  danger = false,
  index,
  onClick,
}: {
  label: string;
  value: string;
  count: string;
  icon: LucideIcon;
  tone: IndicatorTone;
  active: boolean;
  /** O valor em vermelho (ex.: tem conta vencida). */
  danger?: boolean;
  /** Posição no conjunto, para a entrada escalonada. */
  index: number;
  onClick: () => void;
}) {
  const look = TONES[tone];
  return (
    <div
      className="h-full animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards motion-reduce:animate-none"
      style={{
        animationDuration: "450ms",
        animationDelay: `${index * 45}ms`,
        animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <Button
        variant="outline"
        aria-pressed={active}
        className={cn(
          "group h-full w-full flex-col items-stretch gap-1 rounded-xl border-transparent bg-card px-3.5 py-3 text-left font-normal whitespace-normal shadow-[0_1px_2px_rgb(15_23_42/.06)] hover:bg-card",
          "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-12px_rgb(15_23_42/.35)] active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          active ? cn("ring-2", look.active) : look.idle
        )}
        onClick={onClick}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
              look.chip
            )}
          >
            <Icon size={15} aria-hidden="true" />
          </span>
        </span>
        <span className={cn("text-[15px] font-semibold tabular-nums", danger && "text-[#b91c1c]")}>{value}</span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </Button>
    </div>
  );
}
