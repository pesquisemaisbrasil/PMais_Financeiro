"use client";

import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Plus,
  Repeat,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CARD, ErrorBox, NUM, PageHeader, TD, TH, Tag } from "@/components/finance";
import { PeriodPicker } from "@/components/PeriodPicker";
import { MultiSearchSelect } from "@/components/MultiSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { SeriesDialog } from "@/components/SeriesDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, getReference, type ExportFormat } from "@/lib/api";
import {
  brl,
  formatDate,
  monthRange,
  notifyPayablesChanged,
  plural,
  revenueCategories,
  seriesLabel,
  type PeriodMode,
  type Reference,
} from "@/lib/payables";
import {
  DATE_FIELDS,
  INDICATORS,
  SITUATION_LABELS,
  cancelReceivableSeries,
  daysLateText,
  editReceivableSeries,
  exportReceivables,
  listReceivables,
  type ReceivableDateField,
  type ReceivableDetail,
  type ReceivableIndicator,
  type ReceivableList,
  type ReceivableRow,
  type ReceivableSort,
} from "@/lib/receivables";
import { cn } from "@/lib/utils";
import { DelinquencyDialog, DetailDialog, NewReceivableDialog, ReceiveDialog, SituationBadge } from "./dialogs";

const COLUMNS: { id: string; label: string; sort?: ReceivableSort; numeric?: boolean }[] = [
  { id: "vencimento", label: "Vencimento", sort: "vencimento" },
  { id: "cliente", label: "Cliente", sort: "cliente" },
  { id: "projeto", label: "Projeto" },
  { id: "categoria", label: "Conta de receita", sort: "categoria" },
  { id: "situacao", label: "Situação", sort: "situacao" },
  { id: "valor", label: "Líquido", sort: "valor", numeric: true },
  { id: "recebido", label: "Recebido", sort: "recebido", numeric: true },
  { id: "pendente", label: "Pendente", sort: "pendente", numeric: true },
];

const MODES: { id: PeriodMode; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
  { id: "tudo", label: "Tudo" },
  { id: "periodo", label: "Período" },
];

const SITUATION_FILTER = (Object.keys(SITUATION_LABELS) as (keyof typeof SITUATION_LABELS)[]).map((id) => ({
  id,
  label: SITUATION_LABELS[id],
}));

function IconButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          <Icon size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Cada filtro aceita mais de uma opção: o valor é o texto dos ids separados por vírgula. */
function FilterSelect({
  label,
  value,
  options,
  onChange,
  exclusiveIds,
}: {
  label: string;
  value: string;
  options: { id: number | string; label: string }[];
  onChange: (value: string) => void;
  exclusiveIds?: string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <MultiSearchSelect
        ariaLabel={label}
        value={value}
        options={options}
        onChange={onChange}
        exclusiveIds={exclusiveIds}
        className="h-8 bg-card text-[13px] text-foreground"
      />
    </label>
  );
}

function Cell({ row, column }: { row: ReceivableRow; column: string }) {
  const numeric = cn(TD, NUM);
  switch (column) {
    case "vencimento":
      return <TableCell className={cn(TD, "whitespace-nowrap")}>{formatDate(row.dueDate)}</TableCell>;
    case "cliente":
      return (
        <TableCell className={cn(TD, "min-w-[180px] whitespace-normal")}>
          <span className="font-medium text-brand-cinza-escuro">{row.customer}</span>{" "}
          {row.series && (
            <Tag color="cinza" icon={Repeat}>
              {seriesLabel(row.series)}
            </Tag>
          )}
          <span className="block text-xs font-normal text-muted-foreground">
            {row.description}
            {row.contract && ` · contrato ${row.contract}`}
            {row.documentNumber && ` · ${row.documentType} ${row.documentNumber}`}
          </span>
        </TableCell>
      );
    case "projeto":
      return (
        <TableCell className={cn(TD, "whitespace-normal")}>
          <span className="font-semibold text-brand-azul-deep">PRJ-{row.projectCode}</span>
        </TableCell>
      );
    case "categoria":
      return <TableCell className={cn(TD, "whitespace-normal")}>{row.categoryName}</TableCell>;
    case "situacao":
      return (
        <TableCell className={TD}>
          <span className="flex flex-col items-start gap-1">
            <SituationBadge situation={row.situation} />
            {row.daysLate !== null && (
              <span className="text-[11px] font-semibold text-[#b91c1c]">{daysLateText(row.daysLate)}</span>
            )}
          </span>
        </TableCell>
      );
    case "valor":
      return (
        <TableCell className={numeric}>
          {brl(row.net)}
          {Number(row.withheld) > 0 && (
            <span className="block text-[11px] font-normal text-muted-foreground">
              bruto {brl(row.amount)}
            </span>
          )}
        </TableCell>
      );
    case "recebido":
      return (
        <TableCell className={cn(numeric, "text-[#047857]")}>{Number(row.received) ? brl(row.received) : "—"}</TableCell>
      );
    default:
      return (
        <TableCell className={cn(numeric, "font-bold")}>{Number(row.pending) ? brl(row.pending) : "—"}</TableCell>
      );
  }
}

export default function ReceivablesPage() {
  const [mode, setMode] = useState<PeriodMode>("dia");
  const [ref, setRef] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateField, setDateField] = useState<ReceivableDateField>("vencimento");
  const [indicator, setIndicator] = useState<ReceivableIndicator>("total");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ column: ReceivableSort; descending: boolean }>({
    column: "vencimento",
    descending: false,
  });
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReceivableList | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState(false);
  const lastRequest = useRef(0);

  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<ReceivableRow | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [delinquency, setDelinquency] = useState(false);
  const [seriesAction, setSeriesAction] = useState<{ row: ReceivableRow; mode: "edit" | "cancel" } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchText);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const query = useMemo(
    () => ({
      mode,
      ref,
      start: rangeStart,
      end: rangeEnd,
      dateField,
      indicator,
      filters,
      search,
      sort: sort.column,
      descending: sort.descending,
      page,
    }),
    [mode, ref, rangeStart, rangeEnd, dateField, indicator, filters, search, sort, page],
  );

  const load = useCallback(async () => {
    // Clicar rápido no período dispara vários pedidos: só vale a resposta do último.
    const request = ++lastRequest.current;
    setError(null);
    try {
      const list = await listReceivables(query);
      if (request !== lastRequest.current) return;
      // O último título da página saiu da lista: volta para a última página que ainda existe.
      if (!list.items.length && list.total > 0 && list.page > 1) {
        setPage(Math.ceil(list.total / list.pageSize));
        return;
      }
      setData(list);
    } catch (err) {
      if (request !== lastRequest.current) return;
      // Sem valores antigos na tela: eles pareceriam ser os do período novo.
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar os títulos");
    }
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela quando os filtros mudam
    void load();
  }, [load]);

  const loadReference = useCallback(() => {
    setReferenceError(false);
    getReference().then(setReference, () => setReferenceError(true));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial dos cadastros
    loadReference();
  }, [loadReference]);

  const effectiveRef = ref ?? data?.today ?? "";

  function changed() {
    notifyPayablesChanged();
    void load();
  }

  function resetPageAnd(action: () => void) {
    action();
    setPage(1);
  }

  function changeMode(next: PeriodMode) {
    resetPageAnd(() => {
      // O período livre começa no mês que estava à vista, e a pessoa ajusta as duas datas.
      if (next === "periodo" && !rangeStart && effectiveRef) {
        const month = monthRange(effectiveRef);
        setRangeStart(month.start);
        setRangeEnd(month.end);
      }
      setMode(next);
      if (next === "periodo") setCalendarOpen(true);
    });
  }

  function applyDates(start: string, end: string) {
    resetPageAnd(() => {
      if (start === end) {
        setMode("dia");
        setRef(start);
      } else {
        setMode("periodo");
        setRangeStart(start);
        setRangeEnd(end);
      }
    });
  }

  async function exportList(format: ExportFormat) {
    setExporting(true);
    try {
      const url = URL.createObjectURL(await exportReceivables(query, format));
      const link = document.createElement("a");
      link.href = url;
      link.download = `contas-a-receber-${data?.today ?? "lista"}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível exportar");
    } finally {
      setExporting(false);
    }
  }

  function changeSort(column: ReceivableSort) {
    setSort((current) => ({ column, descending: current.column === column ? !current.descending : false }));
  }

  const drawerFilters = Object.values(filters).filter(Boolean).length + (dateField !== "vencimento" ? 1 : 0);
  const activeFilters = drawerFilters + (search ? 1 : 0) + (indicator !== "total" ? 1 : 0);
  const rows = data?.items ?? [];
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="mx-auto w-full max-w-[1920px] px-6 pb-16 pt-8 lg:px-8">
      <PageHeader
        title="Contas a receber"
        icon={Wallet}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDelinquency(true)}>
              <TriangleAlert size={16} />
              Inadimplência
            </Button>
            <Button onClick={() => setCreating(true)} disabled={!reference}>
              <Plus size={16} />
              Nova conta a receber
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}
      {referenceError && (
        <div className="mb-4">
          <ErrorBox
            message="Não foi possível carregar os cadastros. Sem eles, não dá para lançar nem receber."
            onRetry={loadReference}
          />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        {INDICATORS.map((option) => {
          const value = data?.indicators[option.id];
          return (
            <Button
              key={option.id}
              variant="outline"
              aria-pressed={indicator === option.id}
              className={cn(
                "h-auto flex-col items-start gap-1 rounded-xl border-transparent bg-card px-3.5 py-3.5 text-left font-normal whitespace-normal shadow-[0_1px_2px_rgb(15_23_42/.06)] hover:bg-card hover:shadow-[0_2px_6px_rgb(15_23_42/.08)]",
                indicator === option.id && "bg-accent ring-2 ring-brand-azul-deep/70 hover:bg-accent",
              )}
              onClick={() => resetPageAnd(() => setIndicator(option.id))}
            >
              <span className="text-xs font-medium text-muted-foreground">{option.label}</span>
              <span
                className={cn(
                  "text-[15px] font-semibold tabular-nums",
                  option.id === "vencidos" && value?.count ? "text-[#b91c1c]" : undefined,
                )}
              >
                {value ? brl(value.value) : "—"}
              </span>
              <span className="text-xs text-muted-foreground">
                {value ? plural(value.count, "título", "títulos") : " "}
              </span>
            </Button>
          );
        })}
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {data && (
              <PeriodPicker
                label={
                  data.rangeStart && data.rangeEnd
                    ? `${formatDate(data.rangeStart)} até ${formatDate(data.rangeEnd)}`
                    : "Todo o período"
                }
                start={data.rangeStart}
                end={data.rangeEnd}
                today={data.today}
                open={calendarOpen}
                onOpenChange={setCalendarOpen}
                onApply={applyDates}
              />
            )}
            <Select value={mode} onValueChange={(next) => changeMode(next as PeriodMode)}>
              <SelectTrigger className="w-[120px] bg-card" aria-label="Visão por período">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mode !== "tudo" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  resetPageAnd(() => {
                    if (mode === "periodo") setMode("dia");
                    setRef(null);
                  })
                }
              >
                Hoje
              </Button>
            )}
            <Button
              variant="outline"
              className="h-9 gap-2 bg-card font-normal"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={16} />
              Filtros
              {drawerFilters > 0 && (
                <span className="rounded-full bg-brand-azul-deep px-1.5 text-[11px] font-semibold text-white">
                  {drawerFilters}
                </span>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 gap-2 bg-card font-normal" disabled={exporting}>
                  <Download size={16} />
                  {exporting ? "Exportando…" : "Exportar"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => exportList("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportList("csv")}>CSV (para outros sistemas)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="relative w-full max-w-[300px]">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-cinza-escuro/40" />
            <Input
              className="bg-card pl-8"
              aria-label="Buscar título, cliente ou contrato"
              placeholder="Buscar título, cliente ou contrato…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
        </div>

        {activeFilters > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-2.5">
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() =>
                resetPageAnd(() => {
                  setFilters({});
                  setDateField("vencimento");
                  setSearchText("");
                  setSearch("");
                  setIndicator("total");
                })
              }
            >
              Limpar filtros ({activeFilters})
            </Button>
          </div>
        )}

        {!data ? (
          !error && (
            <div className="flex justify-center p-8">
              <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
            </div>
          )
        ) : rows.length ? (
          <>
            <Table className="border-t border-border/60">
              <TableHeader className="[&_tr]:border-border/60">
                <TableRow>
                  {COLUMNS.map((column) => {
                    const sorted = column.sort && sort.column === column.sort;
                    return (
                      <TableHead
                        key={column.id}
                        className={cn(TH, column.numeric && NUM)}
                        aria-sort={sorted ? (sort.descending ? "descending" : "ascending") : "none"}
                      >
                        {column.sort ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto gap-1 p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-brand-cinza-escuro has-[>svg]:px-0"
                            onClick={() => changeSort(column.sort as ReceivableSort)}
                          >
                            {column.label}
                            {sorted && (sort.descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                          </Button>
                        ) : (
                          column.label
                        )}
                      </TableHead>
                    );
                  })}
                  <TableHead className={cn(TH, "px-2")} />
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-border/50">
                {rows.map((row, index) => (
                  <TableRow
                    key={row.id}
                    // Linhas alternadas em cinza, como no Contas a pagar.
                    className={cn(index % 2 === 1 && "bg-[#f1f5f9]", "hover:bg-[#e6ecf4]")}
                  >
                    {COLUMNS.map((column) => (
                      <Cell key={column.id} row={row} column={column.id} />
                    ))}
                    <TableCell className={cn(TD, "whitespace-nowrap px-2 text-left")}>
                      <IconButton icon={Eye} label="Ver detalhes" onClick={() => setViewing(row.id)} />
                      {row.series && (
                        <IconButton
                          icon={Repeat}
                          label="Alterar ou cancelar a série"
                          onClick={() => setSeriesAction({ row, mode: "edit" })}
                        />
                      )}
                      {row.series && (
                        <IconButton
                          icon={Ban}
                          label="Cancelar os títulos da série"
                          onClick={() => setSeriesAction({ row, mode: "cancel" })}
                        />
                      )}
                      {row.canReceive && (
                        <IconButton icon={Check} label="Registrar recebimento" onClick={() => setReceiving(row)} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {pageCount > 1 && (
              <nav
                className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground"
                aria-label="Paginação"
              >
                <span>
                  Mostrando {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} de{" "}
                  {data.total}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Página anterior"
                    disabled={data.page === 1}
                    onClick={() => setPage(data.page - 1)}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span>
                    {data.page} de {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Próxima página"
                    disabled={data.page >= pageCount}
                    onClick={() => setPage(data.page + 1)}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </nav>
            )}
            <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>
                Líquido <strong className="text-foreground">{brl(data.filteredNet)}</strong>
              </span>
              <span>
                Recebido <strong className="text-[#047857]">{brl(data.filteredReceived)}</strong>
              </span>
              <span>
                Pendente <strong className="text-foreground">{brl(data.filteredPending)}</strong>
              </span>
            </div>
          </>
        ) : (
          <p className="border-t border-border/60 px-5 py-10 text-center text-sm text-muted-foreground">
            {activeFilters > 0 || mode !== "tudo"
              ? "Nenhum título neste período e com estes filtros."
              : "Nenhum título ainda. Use \"Nova conta a receber\" para lançar o primeiro."}
          </p>
        )}
      </div>

      {creating && reference && data && (
        <NewReceivableDialog
          reference={reference}
          today={data.today}
          onClose={() => setCreating(false)}
          onDone={(receivable: ReceivableDetail, seriesCount?: number) => {
            setCreating(false);
            toast.success(
              seriesCount
                ? `${seriesCount} títulos lançados, o primeiro vence em ${formatDate(receivable.dueDate)}.`
                : `Conta lançada: ${brl(receivable.net)}, vence em ${formatDate(receivable.dueDate)}.`,
            );
            changed();
          }}
        />
      )}
      {receiving && reference && data && (
        <ReceiveDialog
          row={receiving}
          reference={reference}
          today={data.today}
          onClose={() => setReceiving(null)}
          onDone={(receivable) => {
            setReceiving(null);
            toast.success(
              Number(receivable.pending) > 0
                ? `Recebimento parcial feito. Ainda faltam ${brl(receivable.pending)}.`
                : `Título recebido: ${receivable.description}.`,
            );
            changed();
          }}
        />
      )}
      {viewing && (
        <DetailDialog
          id={viewing}
          onClose={() => setViewing(null)}
          onChanged={changed}
          onReceive={(receivable) => {
            setViewing(null);
            setReceiving(receivable);
          }}
        />
      )}
      {seriesAction && (
        <SeriesDialog
          row={seriesAction.row}
          mode={seriesAction.mode}
          api={{ edit: editReceivableSeries, cancel: cancelReceivableSeries }}
          texts={{
            canceled: ["título cancelado", "títulos cancelados"],
            changed: ["título alterado", "títulos alterados"],
            settled: "O que já foi recebido",
            none: "Nenhum título mudou: todos já têm recebimento ou estão cancelados.",
            many: "títulos",
          }}
          onClose={() => setSeriesAction(null)}
          onDone={(message) => {
            setSeriesAction(null);
            toast.success(message);
            changed();
          }}
        />
      )}
      {delinquency && (
        <DelinquencyDialog
          onClose={() => setDelinquency(false)}
          onOpenTitle={(id) => {
            setDelinquency(false);
            setViewing(id);
          }}
        />
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-[400px]">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>A lista muda enquanto você escolhe.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <FilterSelect
              label="Cliente"
              value={filters.customer ?? ""}
              options={(reference?.customers ?? []).map((c) => ({ id: c.id, label: c.nickname }))}
              onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, customer: value })))}
            />
            <FilterSelect
              label="Projeto"
              value={filters.project ?? ""}
              options={(reference?.projects ?? []).map((p) => ({ id: p.id, label: `PRJ-${p.code}` }))}
              onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, project: value })))}
            />
            <FilterSelect
              label="Plano de contas"
              value={filters.category ?? ""}
              options={(reference ? revenueCategories(reference) : []).map((c) => ({
                id: c.id,
                label: `${c.code} ${c.name}`,
              }))}
              onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, category: value })))}
            />
            <FilterSelect
              label="Empresa"
              value={filters.company ?? ""}
              options={(reference?.companies ?? []).map((c) => ({ id: c.id, label: c.name }))}
              onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, company: value })))}
            />
            <FilterSelect
              label="Unidade"
              value={filters.unit ?? ""}
              options={(reference?.units ?? []).map((u) => ({ id: u.id, label: u.name }))}
              onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, unit: value })))}
            />
            <FilterSelect
              label="Centro de custo"
              value={filters.costCenter ?? ""}
              options={(reference?.costCenters ?? []).map((c) => ({ id: c.id, label: c.name }))}
              onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, costCenter: value })))}
            />
            <FilterSelect
              label="Situação"
              value={filters.situation ?? ""}
              options={SITUATION_FILTER}
              // Título cancelado só aparece no indicador próprio, então "Cancelada" não combina
              exclusiveIds={["cancelado"]}
              onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, situation: value })))}
            />
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Período por
              <SearchSelect
                ariaLabel="Período por"
                value={dateField}
                options={DATE_FIELDS}
                onChange={(value) => resetPageAnd(() => setDateField(value as ReceivableDateField))}
                className="h-8 bg-card text-[13px] text-foreground"
              />
            </label>
          </div>
          <SheetFooter className="border-t border-border/60 sm:flex-row sm:justify-between">
            <Button
              variant="ghost"
              disabled={drawerFilters === 0}
              onClick={() =>
                resetPageAnd(() => {
                  setFilters({});
                  setDateField("vencimento");
                })
              }
            >
              Limpar filtros
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>
              {data ? `Ver ${plural(data.total, "título", "títulos")}` : "Fechar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </main>
  );
}
