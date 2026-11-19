"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { ptBR } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { brFromIso, brFromIsoMonth, isoFromBr, isoMonthFromBr, typedDate, typedMonth } from "@/lib/dates";
import { dateFromIso, isoFromDate } from "@/lib/payables";
import { cn } from "@/lib/utils";

/**
 * Campo de data sempre em dia/mês/ano, com o calendário em português (Bruno, 18/11/2026: o campo do
 * navegador seguia o idioma dele e mostrava mês/dia/ano). Por fora funciona como o campo de antes:
 * recebe e devolve a data no formato do servidor ("2026-11-18"), e "" quando a pessoa apaga.
 */
export function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(brFromIso(value));
  const [seen, setSeen] = useState(value);
  const [open, setOpen] = useState(false);
  // a data mudou por fora (o botão "Postergar", outra tela): o campo mostra a nova
  if (value !== seen) {
    setSeen(value);
    if (isoFromBr(text) !== value) setText(brFromIso(value));
  }

  function emit(iso: string) {
    setSeen(iso);
    onChange({ target: { value: iso } });
  }

  function type(raw: string) {
    const next = typedDate(raw);
    setText(next);
    const iso = isoFromBr(next);
    if (iso) emit(iso);
    else if (!next) emit("");
  }

  const selected = isoFromBr(text) ?? (value || null);
  const outside = [
    ...(min ? [{ before: dateFromIso(min) }] : []),
    ...(max ? [{ after: dateFromIso(max) }] : []),
  ];

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        disabled={disabled}
        className="pr-9 tabular-nums"
        value={text}
        onChange={(event) => type(event.target.value)}
        // data pela metade ao sair do campo: volta para a última data completa
        onBlur={() => {
          if (text && !isoFromBr(text)) setText(brFromIso(value));
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            // sem o nome do campo: "Vencimento" no rótulo do botão confundiria o campo com ele
            aria-label="Escolher no calendário"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-brand-cinza-escuro/60"
          >
            <CalendarDays size={16} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" collisionPadding={16} className="w-auto bg-card p-0">
          <Calendar
            mode="single"
            locale={ptBR}
            defaultMonth={selected ? dateFromIso(selected) : undefined}
            selected={selected ? dateFromIso(selected) : undefined}
            disabled={outside}
            onSelect={(day) => {
              if (!day) return;
              const iso = isoFromDate(day);
              setText(brFromIso(iso));
              emit(iso);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Competência (mês e ano) sempre em mm/aaaa (18/11/2026): o campo de mês do navegador mostrava
 * "November 2026" no Edge em inglês. Recebe e devolve "2026-11", como o campo de antes.
 */
export function MonthInput({
  id,
  value,
  onChange,
  className,
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(brFromIsoMonth(value));
  const [seen, setSeen] = useState(value);
  // o mês mudou por fora: o campo mostra o novo
  if (value !== seen) {
    setSeen(value);
    if (isoMonthFromBr(text) !== value) setText(brFromIsoMonth(value));
  }

  function emit(iso: string) {
    setSeen(iso);
    onChange({ target: { value: iso } });
  }

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      inputMode="numeric"
      autoComplete="off"
      placeholder="mm/aaaa"
      maxLength={7}
      disabled={disabled}
      className={cn("tabular-nums", className)}
      value={text}
      onChange={(event) => {
        const next = typedMonth(event.target.value);
        setText(next);
        const iso = isoMonthFromBr(next);
        if (iso) emit(iso);
        else if (!next) emit("");
      }}
      // mês pela metade ao sair do campo: volta para o último mês completo
      onBlur={() => {
        if (text && !isoMonthFromBr(text)) setText(brFromIsoMonth(value));
      }}
    />
  );
}
