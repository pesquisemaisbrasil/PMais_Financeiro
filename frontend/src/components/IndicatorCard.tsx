"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Cada indicador tem a sua cor, a mesma das etiquetas da lista (vencida, vence hoje, provisão...). */
export type IndicatorTone = "azul" | "verde" | "ceu" | "vermelho" | "ambar" | "roxo" | "neutro" | "cinza";

// As classes ficam escritas por inteiro: o Tailwind não enxerga nome montado com texto. Como no Connect,
// o card é branco com borda fina e a cor fica só no quadradinho do ícone (`chip`).
const CARD_IDLE = "border border-border bg-card";
const CARD_ACTIVE = "border border-brand-azul-deep bg-card ring-1 ring-brand-azul-deep";
export const TONES: Record<IndicatorTone, { chip: string; idle: string; active: string }> = {
  azul: { chip: "bg-brand-azul-deep/12 text-brand-azul-deep", idle: CARD_IDLE, active: CARD_ACTIVE },
  verde: { chip: "bg-brand-verde/15 text-[#047857]", idle: CARD_IDLE, active: CARD_ACTIVE },
  ceu: { chip: "bg-brand-azul-claro/12 text-[#0369a1]", idle: CARD_IDLE, active: CARD_ACTIVE },
  vermelho: { chip: "bg-[#fee2e2] text-[#b91c1c]", idle: CARD_IDLE, active: CARD_ACTIVE },
  ambar: { chip: "bg-[#fef3c7] text-[#b45309]", idle: CARD_IDLE, active: CARD_ACTIVE },
  roxo: { chip: "bg-brand-roxo/10 text-brand-roxo", idle: CARD_IDLE, active: CARD_ACTIVE },
  neutro: { chip: "bg-brand-azul-neutro/25 text-[#0e7490]", idle: CARD_IDLE, active: CARD_ACTIVE },
  cinza: { chip: "bg-brand-cinza-claro text-brand-cinza-escuro", idle: CARD_IDLE, active: CARD_ACTIVE },
};

/** Card de indicador que também é filtro: mostra o total, a contagem e um ícone na cor do indicador. */
export function IndicatorCard({
  label,
  value,
  count,
  icon: Icon,
  tone,
  active,
  danger = false,
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
  /** Posição no conjunto (sem uso no visual de agora; fica para quem chama não mudar). */
  index?: number;
  onClick: () => void;
}) {
  const look = TONES[tone];
  return (
    <div className="h-full">
      <Button
        variant="outline"
        aria-pressed={active}
        className={cn(
          "h-full w-full flex-col items-stretch gap-1 rounded-xl px-3.5 py-3 text-left font-normal whitespace-normal shadow-none hover:border-brand-azul-deep/50 hover:bg-card",
          active ? look.active : look.idle
        )}
        onClick={onClick}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", look.chip)}>
            <Icon size={15} aria-hidden="true" />
          </span>
        </span>
        <span className={cn("text-[15px] font-semibold tabular-nums", danger && "text-[#b91c1c]")}>{value}</span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </Button>
    </div>
  );
}
