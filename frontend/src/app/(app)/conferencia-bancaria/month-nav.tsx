"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthLabel, shiftMonth } from "@/lib/bank-month";

/** Escolhe o mês de uma visão da conferência: anterior, o mês por extenso e próximo. */
export function MonthNav({ month, onChange }: { month: string; onChange: (next: string) => void }) {
  return (
    <div role="group" aria-label="Mês" className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft size={16} />
      </Button>
      <span className="min-w-[132px] text-center text-sm font-semibold capitalize text-brand-cinza-escuro" aria-live="polite">
        {monthLabel(month)}
      </span>
      <Button variant="outline" size="icon-sm" aria-label="Próximo mês" onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
