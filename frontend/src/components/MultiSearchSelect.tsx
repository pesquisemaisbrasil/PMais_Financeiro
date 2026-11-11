"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { choiceIds, choiceLabel, toggleChoice, type ChoiceOption } from "@/lib/choices";
import { filterOptions } from "@/lib/payables";
import { cn } from "@/lib/utils";

/** Lista curta dispensa a busca: com poucas opções, ela só atrapalha. */
const SEARCH_FROM = 6;

/**
 * Como o `SearchSelect`, mas com mais de uma opção marcada. O valor é o texto dos ids separados
 * por vírgula, e vazio é "todos" (a primeira linha da lista, que limpa a marcação). A lista fica
 * aberta enquanto a pessoa marca; Esc ou um clique fora fecha.
 */
export function MultiSearchSelect({
  id,
  value,
  onChange,
  options,
  allLabel = "Todos",
  ariaLabel,
  className,
  exclusiveIds,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ChoiceOption[];
  allLabel?: string;
  ariaLabel?: string;
  className?: string;
  /** Opções que não combinam com as outras (ex.: Cancelada). */
  exclusiveIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const shown = filterOptions(options, term);
  const marked = new Set(choiceIds(value));
  const nothing = marked.size === 0;

  function change(next: boolean) {
    setOpen(next);
    if (!next) setTerm("");
  }

  function toggle(optionId: number | string) {
    onChange(toggleChoice(value, String(optionId), exclusiveIds));
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
          className={cn("w-full justify-between gap-2 px-3 font-normal hover:bg-transparent", className)}
        >
          <span className="truncate">{choiceLabel(value, options, allLabel)}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[240px] p-1">
        {options.length >= SEARCH_FROM && (
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
                if (shown.length) toggle(shown[0].id);
              }
            }}
          />
        )}
        <div role="listbox" aria-multiselectable="true" aria-label={ariaLabel} className="max-h-60 overflow-y-auto">
          {!term && (
            <Row selected={nothing} onClick={() => onChange("")}>
              {allLabel}
            </Row>
          )}
          {shown.map((option) => (
            <Row key={option.id} selected={marked.has(String(option.id))} onClick={() => toggle(option.id)}>
              {option.label}
            </Row>
          ))}
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

function Row({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      role="option"
      aria-selected={selected}
      variant="ghost"
      size="sm"
      className="h-auto w-full justify-start gap-2 py-1.5 text-left font-normal whitespace-normal"
      onClick={onClick}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border",
          selected && "border-primary bg-primary text-primary-foreground"
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
      {children}
    </Button>
  );
}
