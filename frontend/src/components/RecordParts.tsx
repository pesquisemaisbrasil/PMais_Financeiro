"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, type LucideIcon } from "lucide-react";
import { TH } from "@/components/finance";
import { TONES, type IndicatorTone } from "@/components/IndicatorCard";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Peças das telas de Cadastros: o total no alto, o cabeçalho que ordena e o botão de cada linha. */

/** Um total no alto da aba: o que a busca está mostrando e quantos cadastros a aba tem ao todo. */
export function CountCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | null;
  hint: string;
  icon: LucideIcon;
  tone: IndicatorTone;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-4 py-3 shadow-[0_1px_2px_rgb(15_23_42/.06)]",
        TONES[tone].idle
      )}
    >
      <div className="flex flex-col">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums">{value ?? "—"}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", TONES[tone].chip)}>
        <Icon size={18} aria-hidden="true" />
      </span>
    </div>
  );
}

export type SortState<C extends string> = { column: C; descending: boolean } | null;

/** Ordena pelo texto da coluna: número dentro do texto na ordem certa, sem pesar acento nem caixa; vazio vai sempre para o fim. */
export function sortedBy<T>(items: T[], text: (item: T) => string, descending: boolean): T[] {
  return [...items].sort((a, b) => {
    const x = text(a);
    const y = text(b);
    if (!x || !y) return x === y ? 0 : x ? -1 : 1;
    const order = x.localeCompare(y, "pt-BR", { numeric: true, sensitivity: "base" });
    return descending ? -order : order;
  });
}

/** Cabeçalho que ordena a lista: um clique ordena, o seguinte inverte. */
export function SortHead<C extends string>({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: C;
  sort: SortState<C>;
  onSort: (column: C) => void;
}) {
  const mine = sort && sort.column === column ? sort : null;
  return (
    <TableHead className={TH} aria-sort={mine ? (mine.descending ? "descending" : "ascending") : "none"}>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto gap-1 p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-brand-cinza-escuro has-[>svg]:px-0"
        onClick={() => onSort(column)}
      >
        {label}
        {mine ? (
          mine.descending ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />
        ) : (
          <ArrowUpDown size={12} aria-hidden className="opacity-40" />
        )}
      </Button>
    </TableHead>
  );
}

export function RowButton({
  icon: Icon,
  label,
  onClick,
  muted = false,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  /** Esmaecido: o botão está lá, mas a ação vai explicar por que não dá. */
  muted?: boolean;
  /** O texto ao passar o mouse, quando é diferente do nome do botão. */
  hint?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className={cn(muted && "opacity-45")} onClick={onClick}>
          <Icon size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint ?? label}</TooltipContent>
    </Tooltip>
  );
}
