"use client";

import type { LucideIcon } from "lucide-react";
import { TONES, type IndicatorTone } from "@/components/IndicatorCard";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface SummaryItem {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: IndicatorTone;
}

/**
 * Os três números que a pessoa procura ao abrir uma conta (valor, pago e pendente) e a barra de
 * quanto já foi pago. Fica acima das abas: continua à vista em qualquer uma delas.
 */
export function AmountSummary({
  items,
  percent,
  progressText,
}: {
  items: SummaryItem[];
  percent: number;
  progressText: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ label, value, hint, icon: Icon, tone }) => (
          <div
            key={label}
            className={cn("flex flex-col gap-0.5 rounded-xl px-3 py-2.5 shadow-[0_1px_2px_rgb(15_23_42/.06)]", TONES[tone].idle)}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", TONES[tone].chip)}>
                <Icon size={13} aria-hidden="true" />
              </span>
            </span>
            <span className="text-[15px] font-semibold tabular-nums">{value}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Progress
          value={percent}
          aria-label={progressText}
          className="h-1.5 bg-brand-cinza-claro [&>[data-slot=progress-indicator]]:bg-brand-verde"
        />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressText}</span>
      </div>
    </div>
  );
}
