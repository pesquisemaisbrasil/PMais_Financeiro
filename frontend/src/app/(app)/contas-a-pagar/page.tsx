"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Ban,
  Barcode,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Columns3,
  Copy,
  Download,
  Eye,
  FileUp,
  Hourglass,
  PiggyBank,
  Plus,
  Receipt,
  Repeat,
  Replace,
  Search,
  SlidersHorizontal,
  Tags,
  Trash2,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CARD, ErrorBox, NUM, OriginTag, PageHeader, ProvisionTag, SituationTag, TD, TH, Tag } from "@/components/finance";
import { IndicatorCard, type IndicatorTone } from "@/components/IndicatorCard";
import { PeriodPicker } from "@/components/PeriodPicker";
import { MultiSearchSelect } from "@/components/MultiSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ApiError,
  type ExportFormat,
  exportPayables,
  getPayable,
  getReference,
  listPayables,
} from "@/lib/api";
import {
  brl,
  formatDate,
  monthRange,
  notifyPayablesChanged,
  periodLabel,
  plural,
  replacedMessage,
  replacesNote,
  expenseCategories,
  seriesLabel,
  type DateField,
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
  DuplicateDialog,
  ItemsPanel,
  NewPayableDialog,
  PAYABLE_SERIES_API,
  PAYABLE_SERIES_TEXTS,
  PaymentDialog,
  ReclassifyDialog,
  ReplaceProvisionDialog,
} from "./dialogs";
import { ImportDialog } from "./import-dialog";
import { ReceiptsDialog } from "./receipts-dialog";
import { SeriesDialog } from "@/components/SeriesDialog";

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

const INDICATORS: { id: Indicator; label: string; icon: LucideIcon; tone: IndicatorTone }[] = [
  { id: "total", label: "Total", icon: Wallet, tone: "azul" },
  { id: "pagos", label: "Pagos", icon: CircleCheck, tone: "verde" },
  { id: "pendentes", label: "Pendentes", icon: Hourglass, tone: "ceu" },
  { id: "vencidos", label: "Vencidos", icon: TriangleAlert, tone: "vermelho" },
  { id: "hoje", label: "Hoje", icon: CalendarClock, tone: "ambar" },
  { id: "avencer", label: "A vencer", icon: CalendarDays, tone: "neutro" },
  { id: "provisoes", label: "Provisões", icon: PiggyBank, tone: "roxo" },
  { id: "cancelados", label: "Canceladas", icon: Ban, tone: "cinza" },
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

const DATE_FIELDS: { id: DateField; label: string }[] = [
  { id: "vencimento", label: "Vencimento" },
  { id: "competencia", label: "Competência" },
  { id: "baixa", label: "Data da baixa" },
];

const SITUATION_FILTER = [
  { id: "a_vencer", label: "A vencer" },
  { id: "hoje", label: "Vence hoje" },
  { id: "vencido", label: "Vencida" },
  { id: "parcial", label: "Parcial" },
  { id: "pago", label: "Paga" },
  { id: "devolvido", label: "Devolvida" },
  { id: "cancelado", label: "Cancelada" },
  { id: "substituido", label: "Substituída" },
];

const KIND_FILTER = [
  { id: "real", label: "Conta real" },
  { id: "provisao", label: "Provisão" },
];

type Density = "comfortable" | "compact";
const PREFS_KEY = "financeiro:contas-a-pagar:exibicao";

/** Colunas e densidade que a pessoa escolheu; sem isso (ou com lixo no lugar), vale o padrão. */
function readPrefs(): { columns: string[]; density: Density } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const known = new Set(COLUMNS.map((column) => column.id));
    const chosen: unknown[] = Array.isArray(raw.columns) ? raw.columns : DEFAULT_COLUMNS;
    const columns = COLUMNS.filter(
      (column) => column.fixed || (chosen.includes(column.id) && known.has(column.id))
    ).map((column) => column.id);
    return { columns, density: raw.density === "compact" ? "compact" : "comfortable" };
  } catch {
    return null;
  }
}

function savePrefs(prefs: { columns: string[]; density: Density }) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Sem armazenamento (janela privada): a escolha vale só até recarregar.
  }
}

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

/** Cada filtro aceita mais de uma opção: o valor é o texto dos ids separados por vírgula. */
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: number | string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <MultiSearchSelect
        ariaLabel={label}
        value={value}
        options={options}
        onChange={onChange}
        className="h-8 bg-card text-[13px] text-foreground"
      />
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
      <span className="font-medium text-brand-cinza-escuro">{row.payee}</span> <OriginTag origin={row.origin} />
      {row.series && (
        <Tag color="cinza" icon={Repeat}>
          {seriesLabel(row.series)}
        </Tag>
      )}
      <span className="block text-xs font-normal text-muted-foreground">
        {row.description}
        {row.itemCount > 0 && ` · ${plural(row.itemCount, "pessoa", "pessoas")}`}
        {row.replaces && ` · ${replacesNote(row.amount, row.replaces)}`}
        {row.docsLate && <span className="font-semibold text-[#b45309]"> · documentação atrasada</span>}
      </span>
    </>
  );
  // A seta fica na margem da célula: com ou sem ela, o texto começa no mesmo ponto da coluna.
  return (
    <div className="min-w-[160px]">
      {row.itemCount > 0 && (
        <span className="absolute left-2 top-2">
          <IconButton
            icon={open ? ChevronDown : ChevronRight}
            label={open ? "Esconder os itens" : "Mostrar os itens"}
            expanded={open}
            onClick={onToggle}
          />
        </span>
      )}
      {detail}
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
  // Cada código é uma peça só: a linha pode quebrar entre dois projetos, nunca no meio de "PRJ-1804".
  return (
    <span className="font-semibold text-brand-azul-deep">
      {row.allocations.map((a, index) => (
        <Fragment key={a.projectId}>
          {index > 0 && ", "}
          <span className="whitespace-nowrap">PRJ-{a.code}</span>
        </Fragment>
      ))}
    </span>
  );
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
        <TableCell className={cn(TD, "relative whitespace-normal pl-11")}>
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
        <TableCell className={cn(TD, "whitespace-normal")}>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateField, setDateField] = useState<DateField>("vencimento");
  const [indicator, setIndicator] = useState<Indicator>((params.get("indicador") as Indicator) ?? "total");
  const [tab, setTab] = useState<Tab>((params.get("aba") as Tab) ?? "todas");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ column: SortColumn; descending: boolean }>({ column: "vencimento", descending: false });
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [density, setDensity] = useState<Density>("comfortable");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [opened, setOpened] = useState<Record<number, PayableDetail>>({});

  const [data, setData] = useState<PayableList | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState(false);
  const lastRequest = useRef(0);

  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<PayableRow | null>(null);
  const [sendingReceipts, setSendingReceipts] = useState<PayableRow | null>(null);
  const [seriesAction, setSeriesAction] = useState<{ row: PayableRow; mode: "edit" | "cancel" } | null>(null);
  const [batchPaying, setBatchPaying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [replacing, setReplacing] = useState<PayableRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
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

  const query = useMemo(
    () => ({
      mode,
      ref,
      start: rangeStart,
      end: rangeEnd,
      dateField,
      indicator,
      tab,
      filters,
      search,
      sort: sort.column,
      descending: sort.descending,
      page,
    }),
    [mode, ref, rangeStart, rangeEnd, dateField, indicator, tab, filters, search, sort, page]
  );

  useEffect(() => {
    const saved = readPrefs();
    if (!saved) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a escolha salva só existe no navegador, depois da primeira tela
    setColumns(saved.columns);
    setDensity(saved.density);
  }, []);

  const load = useCallback(async () => {
    // Clicar rápido no período dispara vários pedidos: só vale a resposta do último.
    const request = ++lastRequest.current;
    setError(null);
    try {
      const list = await listPayables(query);
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

  async function exportList(format: ExportFormat) {
    setExporting(true);
    try {
      const url = URL.createObjectURL(await exportPayables(query, format));
      const link = document.createElement("a");
      link.href = url;
      link.download = `contas-a-pagar-${data?.today ?? "lista"}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível exportar");
    } finally {
      setExporting(false);
    }
  }

  // Só os filtros da gaveta: busca e indicador ficam à vista e se explicam sozinhos.
  const drawerFilters =
    Object.values(filters).filter(Boolean).length + (dateField !== "vencimento" ? 1 : 0) + (tab !== "todas" ? 1 : 0);
  const activeFilters =
    Object.values(filters).filter(Boolean).length +
    (dateField !== "vencimento" ? 1 : 0) +
    (search ? 1 : 0) +
    (indicator !== "total" ? 1 : 0) +
    (tab !== "todas" ? 1 : 0);
  const rows = data?.items ?? [];
  const visibleColumns = COLUMNS.filter((column) => columns.includes(column.id));
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const selectedRows = rows.filter((row) => selected.has(row.id));

  return (
    <main className="mx-auto w-full max-w-[1920px] px-6 pb-16 pt-8 lg:px-8">
      <PageHeader
        title="Contas a pagar"
        icon={ArrowUpRight}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImporting(true)} disabled={!reference}>
              <FileUp size={16} />
              Importar planilha
            </Button>
            <Button onClick={() => setCreating(true)} disabled={!reference}>
              <Plus size={16} />
              Nova conta a pagar
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
            message="Não foi possível carregar os cadastros. Sem eles, não dá para lançar nem dar baixa."
            onRetry={loadReference}
          />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {INDICATORS.map((option, index) => {
          const value = data?.indicators[option.id];
          return (
            <IndicatorCard
              key={option.id}
              index={index}
              label={option.label}
              icon={option.icon}
              tone={option.tone}
              active={indicator === option.id}
              danger={option.id === "vencidos" && Boolean(value?.count)}
              value={value ? brl(value.value) : "—"}
              count={value ? plural(value.count, "conta", "contas") : "\u00a0"}
              onClick={() => resetPageAnd(() => setIndicator(option.id))}
            />
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
            <Button variant="outline" className="h-9 gap-2 bg-card font-normal" onClick={() => setChoosingColumns(true)}>
              <Columns3 size={16} />
              Colunas
            </Button>
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


        {(selected.size > 0 || activeFilters > 0) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-2.5">
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
                <Button variant="ghost" size="sm" className="h-[30px]" disabled={!reference} onClick={() => setReclassifying(true)}>
                  <Tags size={16} />
                  Reclassificar
                </Button>
                <Button variant="ghost" size="sm" className="h-[30px]" onClick={() => setDuplicating(true)}>
                  <Copy size={16} />
                  Duplicar
                </Button>
                <Button variant="ghost" size="sm" className="h-[30px]" onClick={() => setDeleting(true)}>
                  <Trash2 size={16} />
                  Excluir
                </Button>
              </>
            ) : (
              <>
                {activeFilters > 0 && (
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
            <Table
              className="border-t border-border/60 data-[density=compact]:[&_td:not([colspan])]:py-1.5"
              data-density={density}
            >
              <TableHeader className="[&_tr]:border-border/60">
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
                        className={cn(TH, column.numeric && NUM, column.id === "fornecedor" && "pl-11")}
                        aria-sort={sorted ? (sort.descending ? "descending" : "ascending") : "none"}
                      >
                        {column.sort ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto gap-1 p-0 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-brand-cinza-escuro has-[>svg]:px-0"
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
                  <TableHead className={cn(TH, "px-2")} />
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-border/50">
                {rows.map((row, index) => {
                  const detail = opened[row.id];
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        data-state={selected.has(row.id) ? "selected" : undefined}
                        // Clicar na linha abre a conta (baixas, documentos e edição). Quem clica num botão,
                        // link, caixa de seleção ou campo dentro da linha continua só fazendo o que clicou.
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest("button, a, input, label, [role='checkbox']")) return;
                          setViewing(row.id);
                        }}
                        // Linhas alternadas em cinza: o índice vale só para as contas, e o painel de itens aberto não entra na conta.
                        className={cn(
                          "cursor-pointer",
                          index % 2 === 1 && "bg-[#f1f5f9]",
                          "hover:bg-[#e6ecf4] data-[state=selected]:bg-accent"
                        )}
                      >
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
                        <TableCell className={cn(TD, "whitespace-nowrap px-2 text-left")}>
                          <IconButton icon={Eye} label="Ver detalhes" onClick={() => setViewing(row.id)} />
                          {row.canPayDirectly && (
                            <IconButton icon={Check} label="Dar baixa" onClick={() => setPaying(row)} />
                          )}
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
                              label="Cancelar as contas da série"
                              onClick={() => setSeriesAction({ row, mode: "cancel" })}
                            />
                          )}
                          {row.origin === "connect" && row.type === "real" && Number(row.pending) > 0 && (
                            <IconButton
                              icon={Receipt}
                              label="Enviar comprovantes"
                              onClick={() => setSendingReceipts(row)}
                            />
                          )}
                          {row.canReplace && (
                            <IconButton icon={Replace} label="Substituir pelo valor real" onClick={() => setReplacing(row)} />
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
          onDone={(payable, seriesCount) => {
            setCreating(false);
            toast.success(
              seriesCount
                ? `${seriesCount} contas lançadas, a primeira vence em ${formatDate(payable.dueDate)}.`
                : `Conta lançada: ${brl(payable.amount)}, vence em ${formatDate(payable.dueDate)}.`
            );
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
      {seriesAction && (
        <SeriesDialog
          row={seriesAction.row}
          mode={seriesAction.mode}
          api={PAYABLE_SERIES_API}
          texts={PAYABLE_SERIES_TEXTS}
          onClose={() => setSeriesAction(null)}
          onDone={(message) => {
            setSeriesAction(null);
            toast.success(message);
            changed();
          }}
        />
      )}
      {sendingReceipts && reference && (
        <ReceiptsDialog
          payable={sendingReceipts}
          reference={reference}
          onClose={() => {
            setSendingReceipts(null);
            changed();
          }}
          onDone={changed}
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
      {reclassifying && reference && (
        <ReclassifyDialog
          rows={selectedRows}
          reference={reference}
          onClose={() => setReclassifying(false)}
          onDone={(count) => {
            setReclassifying(false);
            toast.success(`${plural(count, "conta reclassificada", "contas reclassificadas")}.`);
            changed();
          }}
        />
      )}
      {duplicating && (
        <DuplicateDialog
          rows={selectedRows}
          onClose={() => setDuplicating(false)}
          onDone={(count) => {
            setDuplicating(false);
            toast.success(`${plural(count, "conta duplicada", "contas duplicadas")} para o mês seguinte.`);
            changed();
          }}
        />
      )}
      {replacing && reference && (
        <ReplaceProvisionDialog
          row={replacing}
          reference={reference}
          onClose={() => setReplacing(null)}
          onDone={(real) => {
            toast.success(replacedMessage(real.amount, replacing.amount));
            setReplacing(null);
            changed();
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
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Grupo de lançamentos
            <SearchSelect
              ariaLabel="Grupo de lançamentos"
              value={tab}
              options={TABS.map((option) => ({ id: option.id, label: `${option.label} (${data?.tabs[option.id] ?? 0})` }))}
              onChange={(value) => resetPageAnd(() => setTab(value as Tab))}
              className="h-8 bg-card text-[13px] text-foreground"
            />
          </label>
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
            label="Plano de contas"
            value={filters.category ?? ""}
            options={(reference ? expenseCategories(reference) : []).map((c) => ({ id: c.id, label: `${c.code} ${c.name}` }))}
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
            label="Forma"
            value={filters.paymentMethod ?? ""}
            options={(reference?.paymentMethods ?? []).map((m) => ({ id: m.id, label: m.name }))}
            onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, paymentMethod: value })))}
          />
          <FilterSelect
            label="Situação"
            value={filters.situation ?? ""}
            options={SITUATION_FILTER}
            onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, situation: value })))}
          />
          <FilterSelect
            label="Tipo"
            value={filters.kind ?? ""}
            options={KIND_FILTER}
            onChange={(value) => resetPageAnd(() => setFilters((f) => ({ ...f, kind: value })))}
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Período por
            <SearchSelect
              ariaLabel="Período por"
              value={dateField}
              options={DATE_FIELDS}
              onChange={(value) => resetPageAnd(() => setDateField(value as DateField))}
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
                  setTab("todas");
                })
              }
            >
              Limpar filtros
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>
              {data ? `Ver ${plural(data.total, "conta", "contas")}` : "Fechar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {importing && reference && data && (
        <ImportDialog
          reference={reference}
          today={data.today}
          onClose={() => setImporting(false)}
          onDone={(result) => {
            setImporting(false);
            toast.success(
              `${plural(result.count, "lançamento criado", "lançamentos criados")}, ${plural(result.items, "item", "itens")}, ${brl(result.total)}.`
            );
            // A lista passa a mostrar o que acabou de entrar, em qualquer data.
            resetPageAnd(() => {
              setMode("tudo");
              setTab("agrupados");
              setIndicator("total");
              setFilters({});
              setSearchText("");
              setSearch("");
            });
            changed();
          }}
        />
      )}
      {viewing && data && reference && (
        <DetailDialog
          id={viewing}
          today={data.today}
          reference={reference}
          onClose={() => setViewing(null)}
          onChanged={changed}
          onReplace={(payable) => {
            setViewing(null);
            setReplacing(payable);
          }}
        />
      )}
      {choosingColumns && (
        <ColumnsDialog
          columns={COLUMNS}
          selected={columns}
          density={density}
          onClose={() => setChoosingColumns(false)}
          onApply={(next, nextDensity) => {
            setColumns(next);
            setDensity(nextDensity);
            savePrefs({ columns: next, density: nextDensity });
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
