"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import { ptBR } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateFromIso, formatDate, isoFromDate, nextRange, type DateRange } from "@/lib/payables";

/** A data da lista: abre um calendário para escolher um dia ou um intervalo entre duas datas. */
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
          className="h-9 min-w-[150px] gap-2 bg-card font-semibold tabular-nums"
        >
          <CalendarDays size={15} className="text-muted-foreground" />
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
          onSelect={(_range, day) => setDraft((current) => nextRange(current, isoFromDate(day)))}
          className="bg-card"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
          <span className="text-[13px] text-muted-foreground" role="status">
            {!draft.from
              ? "Escolha a data inicial e a final."
              : !draft.to
                ? `${formatDate(draft.from)}: escolha a data final, ou aplique só este dia.`
                : `${formatDate(draft.from)} a ${formatDate(draft.to)}`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!draft.from}
              onClick={() => {
                if (!draft.from) return;
                onApply(draft.from, draft.to ?? draft.from);
                onOpenChange(false);
              }}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
