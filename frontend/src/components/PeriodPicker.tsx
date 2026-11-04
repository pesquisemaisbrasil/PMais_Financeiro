"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import { ptBR } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateFromIso, formatDate, isoFromDate, nextRange, type DateRange } from "@/lib/payables";

/** A data da lista: dois cliques no calendário escolhem o intervalo, que já vale no segundo clique. */
export function PeriodPicker({
  label,
  start,
  end,
  today,
  open,
  onOpenChange,
  onApply,
}: {
  label: string;
  start: string | null;
  end: string | null;
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (start: string, end: string) => void;
}) {
  const [draft, setDraft] = useState<DateRange>({});

  // Toda vez que abre, parte do período que está à vista.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o rascunho só existe com o calendário aberto
    if (open) setDraft({ from: start ?? undefined, to: end ?? undefined });
  }, [open, start, end]);

  const pendingEnd = Boolean(draft.from && !draft.to);
  const selected = draft.from
    ? { from: dateFromIso(draft.from), to: draft.to ? dateFromIso(draft.to) : undefined }
    : undefined;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Escolher datas: ${label}`}
          className="h-9 gap-2 bg-card px-3 font-normal tabular-nums text-[#047857] hover:text-[#047857]"
        >
          <CalendarDays size={18} strokeWidth={2.25} />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto bg-card p-0">
        <Calendar
          mode="range"
          locale={ptBR}
          numberOfMonths={2}
          defaultMonth={dateFromIso(start ?? today)}
          selected={selected}
          onSelect={(_range, day) => {
            const next = nextRange(draft, isoFromDate(day));
            if (next.from && next.to) {
              onApply(next.from, next.to);
              onOpenChange(false);
            } else {
              setDraft(next);
            }
          }}
          className="bg-card"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
          <span className="text-[13px] text-muted-foreground" role="status">
            {pendingEnd
              ? `De ${formatDate(draft.from)} até: clique na data final.`
              : "Clique na data inicial e depois na final."}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {pendingEnd && draft.from && (
              <Button
                size="sm"
                onClick={() => {
                  onApply(draft.from as string, draft.from as string);
                  onOpenChange(false);
                }}
              >
                Só este dia
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
