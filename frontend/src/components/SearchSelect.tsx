"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterOptions } from "@/lib/payables";
import { cn } from "@/lib/utils";

/** Lista curta dispensa a busca: com poucas opções, ela só atrapalha. */
const SEARCH_FROM = 6;

export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Selecione",
  ariaLabel,
  className,
  searchable = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: number | string; label: string }[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** Mostra a busca mesmo com poucas opções (sem isso, só a partir de 6). */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const shown = filterOptions(options, term);
  const current = options.find((option) => String(option.id) === value);

  function pick(next: number | string) {
    onChange(String(next));
    change(false);
  }

  function change(next: boolean) {
    setOpen(next);
    if (!next) setTerm("");
  }

  return (
    // modal: dentro de um Dialog, sem isso a lista não rola com o mouse.
    <Popover modal open={open} onOpenChange={change}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            "w-full justify-between gap-2 px-3 font-normal hover:bg-transparent",
            !current && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[240px] p-1">
        {(searchable || options.length >= SEARCH_FROM) && (
          <Input
            autoFocus
            aria-label="Buscar na lista"
            placeholder="Buscar…"
            className="mb-1 h-8 text-[13px]"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (shown.length) pick(shown[0].id);
              }
            }}
          />
        )}
        <div role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto">
          {shown.map((option) => {
            const selected = String(option.id) === value;
            return (
              <Button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                variant="ghost"
                size="sm"
                className="h-auto w-full justify-between gap-2 py-1.5 text-left font-normal whitespace-normal"
                onClick={() => pick(option.id)}
              >
                {option.label}
                {selected && <Check className="size-4 shrink-0" />}
              </Button>
            );
          })}
          {!shown.length && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {options.length ? "Nada encontrado." : "Nada para escolher."}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
