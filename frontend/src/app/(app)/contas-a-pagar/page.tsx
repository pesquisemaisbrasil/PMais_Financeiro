"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Barcode,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  Plus,
  Search,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CARD, ErrorBox, NUM, OriginTag, PageHeader, ProvisionTag, SituationTag, TD, TH } from "@/components/finance";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError, getPayable, getReference, listPayables } from "@/lib/api";
import {
  brl,
  formatDate,
  monthRange,
  movePeriod,
  notifyPayablesChanged,
  periodLabel,
  plural,
  type Indicator,
  type PayableDetail,
  type PayableList,
  type PayableRow,
  type PeriodMode,
  type Reference,
  type SortColumn,
  type Tab,
} from "@/lib/payables";
import { cn } from "@/lib/utils";
import {
  BatchPaymentDialog,
  ColumnsDialog,
  ConfirmDeleteDialog,
  DetailDialog,
  ItemsPanel,
  NewPayableDialog,
  PaymentDialog,
} from "./dialogs";

const COLUMNS: { id: string; label: string; sort?: SortColumn; numeric?: boolean; fixed?: boolean }[] = [
  { id: "vencimento", label: "Vencimento", sort: "vencimento", fixed: true },
  { id: "fornecedor", label: "Fornecedor", sort: "fornecedor", fixed: true },
  { id: "documento", label: "Documento", sort: "documento" },
  { id: "projeto", label: "Projeto" },
  { id: "categoria", label: "Categoria", sort: "categoria" },
  { id: "centro", label: "Centro de custo" },
  { id: "forma", label: "Forma" },
  { id: "empresa", label: "Empresa" },
  { id: "situacao", label: "Situação", sort: "situacao" },
  { id: "valor", label: "Valor", sort: "valor", numeric: true },
  { id: "pago", label: "Pago", sort: "pago", numeric: true },
  { id: "pendente", label: "Pendente", sort: "pendente", numeric: true },
];
const DEFAULT_COLUMNS = ["vencimento", "fornecedor", "projeto", "categoria", "situacao", "valor", "pendente"];

const INDICATORS: { id: Indicator; label: string }[] = [
  { id: "total", label: "Total" },
  { id: "pagos", label: "Pagos" },
  { id: "pendentes", label: "Pendentes" },
  { id: "vencidos", label: "Vencidos" },
  { id: "hoje", label: "Hoje" },
  { id: "avencer", label: "A vencer" },
  { id: "provisoes", label: "Provisões" },
  { id: "cancelados", label: "Canceladas" },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "agrupados", label: "Planilhas e agrupados" },
  { id: "provisoes", label: "Provisões" },
  { id: "connect", label: "Do Connect" },
];

const MODES: { id: PeriodMode; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "ano", label: "Ano" },
  { id: "tudo", label: "Tudo" },
  { id: "periodo", label: "Período" },
];

const ALL = "todos";

function IconButton({
  icon: Icon,
  label,
  onClick,
  expanded,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} aria-expanded={expanded} onClick={onClick}>
          <Icon size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: number; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
      {label}
      <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
        <SelectTrigger size="sm" className="w-full bg-card text-[13px] font-normal text-foreground" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={String(option.id)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function PayeeCell({
  row,
  open,
  onToggle,
}: {
  row: PayableRow;
  open: boolean;
  onToggle: () => void;
}) {
  const detail = (
    <>
      <span className="font-semibold text-brand-cinza-escuro">{row.payee}</span> <OriginTag origin={row.origin} />
      <span className="block text-xs font-normal text-muted-foreground">
        {row.description}
        {row.itemCount > 0 && ` · ${plural(row.itemCount, "pessoa", "pessoas")}`}
        {row.docsLate && <span className="font-semibold text-[#b45309]"> · documentação atrasada</span>}
      </span>
    </>
  );
  if (!row.itemCount) return <div>{detail}</div>;
  return (
    <div className="flex min-w-[230px] items-start gap-1">
      <IconButton
        icon={open ? ChevronDown : ChevronRight}
        label={open ? "Esconder os itens" : "Mostrar os itens"}
        expanded={open}
        onClick={onToggle}
      />
      <div>{detail}</div>
    </div>
  );
}

function ProjectCell({ row }: { row: PayableRow }) {
  if (!row.allocations.length) return <span className="text-muted-foreground">—</span>;
  if (row.allocations.length > 3) {
    return (
      <span title={row.allocations.map((a) => `PRJ-${a.code}: ${brl(a.amount)}`).join(", ")}>
        {row.allocations.length} projetos
      </span>
    );
  }
  return <span className="font-semibold text-brand-azul-deep">{row.allocations.map((a) => `PRJ-${a.code}`).join(", ")}</span>;
}

function DocumentCell({ row }: { row: PayableRow }) {
  return <>{row.documentType === "NF" ? `NF ${row.documentNumber ?? ""}` : row.documentType}</>;
}

function Cell({ row, column, open, onToggle }: { row: PayableRow; column: string; open: boolean; onToggle: () => void }) {
  const numeric = cn(TD, NUM);
  switch (column) {
    case "vencimento":
      return <TableCell className={TD}>{formatDate(row.dueDate)}</TableCell>;
    case "fornecedor":
      return (
        <TableCell className={cn(TD, "whitespace-normal")}>
          <PayeeCell row={row} open={open} onToggle={onToggle} />
        </TableCell>
      );
    case "documento":
      return (
        <TableCell className={TD}>
          <DocumentCell row={row} />
        </TableCell>
      );
    case "projeto":
      return (
        <TableCell className={TD}>
          <ProjectCell row={row} />
        </TableCell>
      );
    case "categoria":
      return <TableCell className={cn(TD, "whitespace-normal")}>{row.categoryName}</TableCell>;
    case "centro":
      return <TableCell className={TD}>{row.costCenterName}</TableCell>;
    case "forma":
      return <TableCell className={TD}>{row.paymentMethodName}</TableCell>;
    case "empresa":
      return <TableCell className={TD}>{row.companyName}</TableCell>;
    case "situacao":
      return (
        <TableCell className={TD}>
          <span className="flex flex-wrap gap-1">
            {row.type === "provisao" && <ProvisionTag />}
            <SituationTag situation={row.situation} />
          </span>
        </TableCell>
      );
    case "valor":
      return <TableCell className={numeric}>{brl(row.amount)}</TableCell>;
    case "pago":
      return <TableCell className={cn(numeric, "text-[#047857]")}>{Number(row.paid) ? brl(row.paid) : "—"}</TableCell>;
    default:
      return <TableCell className={cn(numeric, "font-bold")}>{Number(row.pending) ? brl(row.pending) : "—"}</TableCell>;
  }
}

function PayablesContent() {
  const params = useSearchParams();
  const linkedId = Number(params.get("conta")) || null;

  const [mode, setMode] = useState<PeriodMode>((params.get("modo") as PeriodMode) ?? "dia");
  const [ref, setRef] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [indicator, setIndicator] = useState<Indicator>((params.get("indicador") as Indicator) ?? "total");
  const [tab, setTab] = useState<Tab>((params.get("aba") as Tab) ?? "todas");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ column: SortColumn; descending: boolean }>({ column: "vencimento", descending: false });
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [opened, setOpened] = useState<Record<number, PayableDetail>>({});

  const [data, setData] = useState<PayableList | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState(false);
  const lastRequest = useRef(0);

  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<PayableRow | null>(null);
  const [batchPaying, setBatchPaying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [choosingColumns, setChoosingColumns] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchText);
      setPage(1);
      setSelected(new Set());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const load = useCallback(async () => {
    // Clicar rápido no período dispara vários pedidos: só vale a resposta do último.
    const request = ++lastRequest.current;
    setError(null);
    try {
      const list = await listPayables({
        mode,
        ref,
        start: rangeStart,
        end: rangeEnd,
        indicator,
        tab,
        filters,
        search,
        sort: sort.column,
        descending: sort.descending,
        page,
      });
      if (request !== lastRequest.current) return;
      // A última conta da página saiu da lista: volta para a última página que ainda existe.
      if (!list.items.length && list.total > 0 && list.page > 1) {
        setPage(Math.ceil(list.total / list.pageSize));
        return;
      }
      setData(list);
    } catch (err) {
      if (request !== lastRequest.current) return;
      // Sem valores antigos na tela: eles pareceriam ser os do período novo.
      setData(null);
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar as contas");
    }
  }, [mode, ref, rangeStart, rangeEnd, indicator, tab, filters, search, sort, page]);

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

  // Link do Início: vai para o dia da conta e abre os itens, ou o detalhe se ela não tiver itens.
  useEffect(() => {
    if (!linkedId) return;
    getPayable(linkedId).then(
      (payable) => {
        setMode("dia");
        setRef(payable.dueDate);
        if (payable.items.length) setOpened((current) => ({ ...current, [payable.id]: payable }));
        else setViewing(payable.id);
      },
      () => toast.error("Conta não encontrada")
    );
  }, [linkedId]);

  const effectiveRef = ref ?? data?.today ?? "";

  function changed() {
    setSelected(new Set());
    setOpened({});
    notifyPayablesChanged();
    void load();
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

  function resetPageAnd(action: () => void) {
    action();
    setPage(1);
    setSelected(new Set());
  }

  async function toggleItems(row: PayableRow) {
    if (opened[row.id]) {
      setOpened((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      return;
    }
    try {
      const payable = await getPayable(row.id);
      setOpened((current) => ({ ...current, [row.id]: payable }));
    } catch {
      toast.error("Não foi possível abrir os itens");
    }
  }

  function changePage(next: number) {
    setPage(next);
    setSelected(new Set());
  }

  function changeSort(column: SortColumn) {
    setSelected(new Set());
    setSort((current) => ({
      column,
      descending: current.column === column ? !current.descending : false,
    }));
  }

  function toggleSelected(id: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function copyBarcode(barcode: string) {
    try {
      await navigator.clipboard.writeText(barcode);
      toast.success("Código de barras copiado.");
    } catch {
      toast.error("Não foi possível copiar. Abra os detalhes da conta.");
    }
  }

  const activeFilters =
    Object.values(filters).filter(Boolean).length +
    (search ? 1 : 0) +
    (indicator !== "total" ? 1 : 0) +
    (tab !== "todas" ? 1 : 0);
  const rows = data?.items ?? [];
  const visibleColumns = COLUMNS.filter((column) => columns.includes(column.id));
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const selectedRows = rows.filter((row) => selected.has(row.id));

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader
        title="Contas a pagar"
        icon={ArrowUpRight}
        actions={
          <Button onClick={() => setCreating(true)} disabled={!reference}>
            <Plus size={16} />
            Nova conta a pagar
          </Button>
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
            message="Não foi possível carregar os cadastros. Sem eles, não dá para lançar nem dar baixa."
            onRetry={loadReference}
          />
        </div>
      )}

      <div className="mb-4 inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[#f1f5f9] p-[3px]" role="tablist" aria-label="Tipo de lançamento">
        {TABS.map((option) => (
          <Button
            key={option.id}
            role="tab"
            aria-selected={tab === option.id}
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-muted-foreground",
              tab === option.id && "bg-card text-brand-cinza-escuro shadow-sm hover:bg-card"
            )}
            onClick={() => resetPageAnd(() => setTab(option.id))}
          >
            {option.label}
            <span className="rounded-full bg-brand-cinza-claro px-1.5 text-[11px]">{data?.tabs[option.id] ?? 0}</span>
          </Button>
        ))}
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        Lançamento agrupado (planilhas, incentivos e Do Connect) abre os itens aqui mesmo, pela seta ao lado do nome.
      </p>

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
        {INDICATORS.map((option) => {
          const value = data?.indicators[option.id];
          return (
            <Button
              key={option.id}
              variant="outline"
              aria-pressed={indicator === option.id}
              className={cn(
                "h-auto flex-col items-start gap-0.5 rounded-xl bg-card px-3 py-2.5 text-left font-normal whitespace-normal",
                indicator === option.id && "border-brand-azul-deep bg-accent ring-1 ring-brand-azul-deep"
              )}
              onClick={() => resetPageAnd(() => setIndicator(option.id))}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground">{option.label}</span>
              <span
                className={cn(
                  "text-[15px] font-bold tabular-nums",
                  option.id === "vencidos" && value?.count ? "text-[#b91c1c]" : undefined
                )}
              >
                {value ? brl(value.value) : "—"}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {value ? plural(value.count, "conta", "contas") : "\u00a0"}
              </span>
            </Button>
          );
        })}
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
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
            {mode !== "tudo" && mode !== "periodo" && effectiveRef && (
              <IconButton
                icon={ChevronLeft}
                label="Período anterior"
                onClick={() => resetPageAnd(() => setRef(movePeriod(mode, effectiveRef, -1)))}
              />
            )}
            {mode !== "tudo" && mode !== "periodo" && effectiveRef && (
              <IconButton
                icon={ChevronRight}
                label="Próximo período"
                onClick={() => resetPageAnd(() => setRef(movePeriod(mode, effectiveRef, 1)))}
              />
            )}
            <Select
              value={mode}
              onValueChange={(next) => changeMode(next as PeriodMode)}
            >
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
          </div>
          <div className="relative w-full max-w-[300px]">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-cinza-escuro/40" />
            <Input
              className="bg-card pl-8"
              aria-label="Buscar conta, fornecedor ou NF"
              placeholder="Buscar conta, fornecedor ou NF…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 border-b border-border bg-muted/50 px-4 py-3">
          <FilterSelect
            label="Fornecedor"
            value={filters.supplier ?? ""}
            options={(reference?.suppliers ?? []).map((s) => ({ id: s.id, label: s.nickname }))}
            onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, supplier: value })))}
          />
          <FilterSelect
            label="Projeto"
            value={filters.project ?? ""}
            options={(reference?.projects ?? []).map((p) => ({ id: p.id, label: `PRJ-${p.code}` }))}
            onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, project: value })))}
          />
          <FilterSelect
            label="Categoria"
            value={filters.category ?? ""}
            options={(reference?.categories ?? []).map((c) => ({ id: c.id, label: `${c.code} ${c.name}` }))}
            onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, category: value })))}
          />
          <FilterSelect
            label="Empresa"
            value={filters.company ?? ""}
            options={(reference?.companies ?? []).map((c) => ({ id: c.id, label: c.name }))}
            onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, company: value })))}
          />
          <FilterSelect
            label="Centro de custo"
            value={filters.costCenter ?? ""}
            options={(reference?.costCenters ?? []).map((c) => ({ id: c.id, label: c.name }))}
            onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, costCenter: value })))}
          />
          <FilterSelect
            label="Forma"
            value={filters.paymentMethod ?? ""}
            options={(reference?.paymentMethods ?? []).map((m) => ({ id: m.id, label: m.name }))}
            onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, paymentMethod: value })))}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {selected.size ? (
              <>
                <strong>{plural(selected.size, "selecionada", "selecionadas")}</strong>
                <Button
                  size="sm"
                  className="h-[30px] bg-brand-verde text-[#053d27] hover:bg-[#00b56b]"
                  onClick={() => setBatchPaying(true)}
                >
                  <CheckCheck size={16} />
                  Dar baixa
                </Button>
                <Button variant="ghost" size="sm" className="h-[30px]" onClick={() => setDeleting(true)}>
                  <Trash2 size={16} />
                  Excluir
                </Button>
              </>
            ) : (
              <>
                {data && (
                  <span className="text-muted-foreground">
                    {plural(data.total, "conta", "contas")} · pendente {brl(data.filteredPending)}
                  </span>
                )}
                {activeFilters > 0 && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() =>
                      resetPageAnd(() => {
                        setFilters({});
                        setSearchText("");
                        setSearch("");
                        setIndicator("total");
                        setTab("todas");
                      })
                    }
                  >
                    Limpar filtros ({activeFilters})
                  </Button>
                )}
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-[30px]" onClick={() => setChoosingColumns(true)}>
            <Columns3 size={16} />
            Colunas
          </Button>
        </div>

        {!data ? (
          !error && (
            <div className="flex justify-center p-8">
              <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
            </div>
          )
        ) : rows.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(TH, "w-9")}>
                    <Checkbox
                      aria-label="Selecionar todas da página"
                      checked={allSelected}
                      onCheckedChange={(checked) =>
                        setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set())
                      }
                    />
                  </TableHead>
                  {visibleColumns.map((column) => {
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
                            className="h-auto gap-1 p-0 text-[13px] font-semibold text-muted-foreground hover:bg-transparent hover:text-brand-cinza-escuro"
                            onClick={() => changeSort(column.sort as SortColumn)}
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
                  <TableHead className={TH} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const detail = opened[row.id];
                  return (
                    <Fragment key={row.id}>
                      <TableRow data-state={selected.has(row.id) ? "selected" : undefined}>
                        <TableCell className={TD}>
                          <Checkbox
                            aria-label={`Selecionar ${row.description}`}
                            checked={selected.has(row.id)}
                            onCheckedChange={(checked) => toggleSelected(row.id, checked === true)}
                          />
                        </TableCell>
                        {visibleColumns.map((column) => (
                          <Cell
                            key={column.id}
                            row={row}
                            column={column.id}
                            open={Boolean(detail)}
                            onToggle={() => toggleItems(row)}
                          />
                        ))}
                        <TableCell className={cn(TD, "whitespace-nowrap text-right")}>
                          <IconButton icon={Eye} label="Ver detalhes" onClick={() => setViewing(row.id)} />
                          {row.canPayDirectly && (
                            <IconButton icon={Check} label="Dar baixa" onClick={() => setPaying(row)} />
                          )}
                          {row.barcode && Number(row.pending) > 0 && (
                            <IconButton
                              icon={Barcode}
                              label="Copiar código de barras"
                              onClick={() => copyBarcode(row.barcode as string)}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                      {detail && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={visibleColumns.length + 2} className="bg-muted/60 p-4 whitespace-normal">
                            <ItemsPanel payable={detail} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={visibleColumns.length + 2} className={cn(TD, "font-bold")}>
                    Total filtrado: {plural(data.total, "conta", "contas")} · valor {brl(data.filteredAmount)} · pago{" "}
                    {brl(data.filteredPaid)} · pendente {brl(data.filteredPending)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
            {pageCount > 1 && (
              <nav className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground" aria-label="Paginação">
                <span>
                  Mostrando {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} de {data.total}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Página anterior"
                    disabled={data.page === 1}
                    onClick={() => changePage(data.page - 1)}
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
                    onClick={() => changePage(data.page + 1)}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </nav>
            )}
          </>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {activeFilters
              ? "Nenhuma conta com esses filtros."
              : mode === "tudo"
                ? "Nenhuma conta lançada ainda."
                : mode === "periodo"
                  ? `Nenhuma conta de ${formatDate(rangeStart)} a ${formatDate(rangeEnd)}.`
                  : `Nenhuma conta em ${periodLabel(mode, effectiveRef)}. Veja semana ou mês no seletor acima.`}
          </p>
        )}
      </div>

      {creating && reference && data && (
        <NewPayableDialog
          reference={reference}
          today={data.today}
          onClose={() => setCreating(false)}
          onDone={(payable) => {
            setCreating(false);
            toast.success(`Conta lançada: ${brl(payable.amount)}, vence em ${formatDate(payable.dueDate)}.`);
            changed();
          }}
        />
      )}
      {paying && reference && data && (
        <PaymentDialog
          row={paying}
          reference={reference}
          today={data.today}
          onClose={() => setPaying(null)}
          onDone={(payable) => {
            setPaying(null);
            toast.success(
              Number(payable.pending) > 0
                ? `Baixa parcial feita. Ainda faltam ${brl(payable.pending)}.`
                : `Conta paga: ${payable.description}.`
            );
            changed();
          }}
        />
      )}
      {batchPaying && reference && data && (
        <BatchPaymentDialog
          rows={selectedRows}
          reference={reference}
          today={data.today}
          onClose={() => setBatchPaying(false)}
          onDone={(total, count) => {
            setBatchPaying(false);
            toast.success(`Baixa feita em ${plural(count, "conta", "contas")}: ${brl(total)}.`);
            changed();
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          rows={selectedRows}
          onClose={() => setDeleting(false)}
          onDone={(count) => {
            setDeleting(false);
            toast.success(`${plural(count, "conta excluída", "contas excluídas")}.`);
            changed();
          }}
        />
      )}
      {viewing && data && (
        <DetailDialog
          id={viewing}
          today={data.today}
          onClose={() => setViewing(null)}
          onChanged={changed}
        />
      )}
      {choosingColumns && (
        <ColumnsDialog
          columns={COLUMNS}
          selected={columns}
          onClose={() => setChoosingColumns(false)}
          onApply={(next) => {
            setColumns(next);
            setChoosingColumns(false);
          }}
        />
      )}
    </main>
  );
}

export default function PayablesPage() {
  return (
    <Suspense>
      <PayablesContent />
    </Suspense>
  );
}
