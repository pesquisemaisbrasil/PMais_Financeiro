export type Situation =
  | "pago"
  | "parcial"
  | "vencido"
  | "hoje"
  | "a_vencer"
  | "devolvido"
  | "cancelado"
  | "substituido";
export type DateField = "vencimento" | "competencia" | "baixa";
export type PeriodMode = "dia" | "semana" | "mes" | "ano" | "tudo" | "periodo";
export type Indicator =
  | "total"
  | "pagos"
  | "pendentes"
  | "vencidos"
  | "hoje"
  | "avencer"
  | "provisoes"
  | "cancelados";
export type Tab = "todas" | "agrupados" | "provisoes" | "connect";
export type SortColumn =
  | "vencimento"
  | "fornecedor"
  | "documento"
  | "categoria"
  | "situacao"
  | "valor"
  | "pago"
  | "pendente";

export interface ValueCount {
  value: string;
  count: number;
}

export interface Allocation {
  projectId: number;
  code: string;
  amount: string;
}

export type RecurrenceKind = "mensal" | "semanal" | "parcelado";
export type SeriesScope = "only" | "following" | "open";

export interface SeriesInfo {
  id: number;
  index: number;
  count: number;
  kind: RecurrenceKind;
  estimated: boolean;
}

export interface Occurrence {
  index: number;
  dueDate: string;
  amount: string;
}

export const RECURRENCE_KINDS: { id: RecurrenceKind; label: string }[] = [
  { id: "mensal", label: "Todo mês" },
  { id: "semanal", label: "Toda semana" },
  { id: "parcelado", label: "Parcelado (divide o valor)" },
];

export const SERIES_SCOPES: { id: SeriesScope; label: string; hint: string }[] = [
  { id: "only", label: "Só esta", hint: "As outras ocorrências ficam como estão." },
  { id: "following", label: "Esta e as seguintes", hint: "Muda a partir desta, só o que está em aberto." },
  { id: "open", label: "Todas em aberto", hint: "Muda a série inteira, menos o que já tem baixa." },
];

/** Só as linhas que a pessoa mexeu na tabela simulada: é o que o servidor precisa receber. */
export function occurrenceEdits(simulated: Occurrence[], edited: Occurrence[]) {
  return edited.flatMap((row, i) => {
    const before = simulated[i];
    const dueDate = row.dueDate !== before.dueDate ? row.dueDate : undefined;
    const amount = Number(row.amount) !== Number(before.amount) ? row.amount : undefined;
    return dueDate || amount ? [{ index: row.index, dueDate, amount }] : [];
  });
}

/** "3/12", ou "3/12 · estimada" para conta de valor variável. */
export function seriesLabel(series: SeriesInfo): string {
  return `${series.index}/${series.count}${series.estimated ? " · estimada" : ""}`;
}

export interface PayableRow {
  id: number;
  type: string;
  origin: string;
  situation: Situation;
  dueDate: string;
  payee: string;
  description: string;
  documentType: string;
  documentNumber: string | null;
  allocations: Allocation[];
  categoryName: string;
  costCenterName: string;
  paymentMethodName: string;
  companyName: string;
  amount: string;
  paid: string;
  pending: string;
  docsLate: boolean;
  barcode: string | null;
  itemCount: number;
  canPayDirectly: boolean;
  canReplace: boolean;
  replaces: string | null;
  series: SeriesInfo | null;
}

export interface ReplacementCandidate {
  id: number;
  description: string;
  payee: string;
  amount: string;
}

export interface PayableList {
  today: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  items: PayableRow[];
  total: number;
  page: number;
  pageSize: number;
  filteredAmount: string;
  filteredPaid: string;
  filteredPending: string;
  indicators: Record<Indicator, ValueCount>;
  tabs: Record<Tab, number>;
}

export interface PayableItem {
  id: number;
  name: string;
  documentType: string;
  amount: string;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceDate: string | null;
  grossAmount: string | null;
  surveyDate: string | null;
  // dia do Pix que pagou esta pessoa (baixa por comprovante)
  paidOn: string | null;
}

export interface Payment {
  id: number;
  kind: "pagamento" | "estorno" | "devolucao";
  reversesId: number | null;
  reversed: boolean;
  paidOn: string;
  amount: string;
  surcharge: string;
  discount: string;
  bankAccountName: string;
  paymentMethodName: string;
  transactionId: string | null;
  note: string | null;
}

export interface PayableEvent {
  userName: string;
  text: string;
  createdAt: string;
}

export interface PayableDetail extends PayableRow {
  company_id: number;
  unitName: string;
  issueDate: string;
  competence: string | null;
  documentDate: string | null;
  docsReceivedOn: string | null;
  isTransfer: boolean;
  notes: string | null;
  items: PayableItem[];
  payments: Payment[];
  events: PayableEvent[];
}

interface Named {
  id: number;
  name: string;
}

export interface Project {
  id: number;
  code: string;
  title: string;
  status: string;
  projectType: string | null;
  hasIncentive: boolean;
  incentiveDays: number | null;
}

export interface Reference {
  companies: Named[];
  units: (Named & { companyId: number })[];
  costCenters: Named[];
  categories: (Named & { code: string })[];
  paymentMethods: Named[];
  bankAccounts: (Named & { companyId: number })[];
  suppliers: (Named & { nickname: string })[];
  projects: Project[];
}

export interface AttentionItem {
  kind: "vencidas" | "hoje" | "devolvida" | "connect" | "provisoes";
  title: string;
  text: string;
  link: string;
  action: string;
}

export interface HomeSummary {
  today: string;
  overdue: ValueCount;
  nextSevenDays: ValueCount;
  payablesBadge: number;
  attention: AttentionItem[];
  cashflow: { label: string; outflow: string; provision: string }[];
  upcoming: {
    id: number;
    type: string;
    payee: string;
    description: string;
    dueDate: string;
    situation: Situation;
    pending: string;
  }[];
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function brl(value: string | number): string {
  return BRL.format(Number(value));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** Aviso que a tela e a API dão com a mesma contagem: "1 conta", "2 contas". */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// Datas ao meio-dia em UTC: somar dias nunca muda de data por causa do fuso da máquina.
function toDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string {
  const date = toDate(`${iso.slice(0, 7)}-01`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function weekday(iso: string): string {
  return WEEKDAYS[toDate(iso).getUTCDay()];
}

export function periodLabel(mode: PeriodMode, ref: string): string {
  if (mode === "dia") return formatDate(ref);
  if (mode === "semana") {
    const start = addDays(ref, -((toDate(ref).getUTCDay() + 6) % 7));
    return `${formatDate(start)} a ${formatDate(addDays(start, 6))}`;
  }
  if (mode === "mes") return `${MONTHS[Number(ref.slice(5, 7)) - 1]}/${ref.slice(0, 4)}`;
  if (mode === "ano") return ref.slice(0, 4);
  return "Todo o período";
}

export interface DateRange {
  from?: string;
  to?: string;
}

/** Clique no calendário: o primeiro marca o início, o segundo fecha o intervalo, o terceiro recomeça. */
export function nextRange(current: DateRange, day: string): DateRange {
  if (!current.from || current.to) return { from: day };
  return day < current.from ? { from: day, to: current.from } : { from: current.from, to: day };
}

/** O calendário trabalha com a data local, e a API com "aaaa-mm-dd": sem passar por UTC, para o dia não mudar. */
export function isoFromDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** O mês inteiro de uma data: de onde parte a escolha de um período livre. */
export function monthRange(ref: string): { start: string; end: string } {
  return { start: `${ref.slice(0, 7)}-01`, end: addDays(addMonths(ref, 1), -1) };
}

/** "1.234,56" ou "1234,56" vira "1234.56". Devolve null se não for um valor em reais. */
export function parseMoney(text: string): string | null {
  const clean = text.trim().replace(/\s/g, "");
  if (/^\d+\.\d{1,2}$/.test(clean)) return `${clean.split(".")[0]}.${clean.split(".")[1].padEnd(2, "0")}`;
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(clean)) return null;
  const [whole, cents = ""] = clean.replaceAll(".", "").split(",");
  return `${whole}.${cents.padEnd(2, "0")}`;
}

/** Dinheiro em centavos inteiros: soma sem o erro de arredondamento do ponto flutuante. */
export function toCents(value: string): number {
  return Number(value.replace(".", ""));
}

/** Para o campo de valor do formulário: "1234.50" vira "1234,50". */
export function toField(value: string): string {
  return value.replace(".", ",");
}

export interface ParsedAllocations {
  allocations: { projectId: number; amount: string }[];
  error: string | null;
}

/** Rateio colado da planilha: uma linha por projeto, com "código;valor" ou separado por tabulação. */
export function parseAllocations(text: string, projects: Project[], amount: string): ParsedAllocations {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const allocations: ParsedAllocations["allocations"] = [];
  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    const [code = "", value = ""] = line.split(/[;\t]/).map((part) => part.trim());
    const digits = code.replace(/\D/g, "");
    const project = projects.find((candidate) => candidate.code === digits);
    if (!project) return { allocations: [], error: `Projeto ${code} não encontrado (linha ${number})` };
    if (project.status === "encerrado") {
      return { allocations: [], error: `Projeto ${project.code} fechado — peça a reabertura a um administrador` };
    }
    const parsed = parseMoney(value);
    if (!parsed || toCents(parsed) === 0) {
      return { allocations: [], error: `Linha ${number}: use só números no valor` };
    }
    allocations.push({ projectId: project.id, amount: parsed });
  }
  const total = allocations.reduce((sum, allocation) => sum + toCents(allocation.amount), 0);
  if (allocations.length && total !== toCents(amount)) {
    return {
      allocations: [],
      error: `As partes do rateio somam ${brl(total / 100)}, mas o lançamento é de ${brl(amount)}`,
    };
  }
  return { allocations, error: null };
}

export function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(now)
  );
  if (hour < 12) return "Bom dia";
  return hour < 18 ? "Boa tarde" : "Boa noite";
}

/** Avisa o menu lateral de que o contador de contas pode ter mudado. */
export const PAYABLES_CHANGED = "payables:changed";

export function notifyPayablesChanged(): void {
  window.dispatchEvent(new Event(PAYABLES_CHANGED));
}

function folded(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Busca da lista de opções: sem diferença entre maiúscula e acento, como a pessoa digita. */
export function filterOptions<T extends { label: string }>(options: T[], term: string): T[] {
  const clean = folded(term.trim());
  return clean ? options.filter((option) => folded(option.label).includes(clean)) : options;
}

/** Quanto o real ficou acima ou abaixo da provisão, em centavos para não errar a conta. */
function difference(real: string, provision: string): number {
  return toCents(real) - toCents(provision);
}

export function replacesNote(amount: string, provision: string): string {
  const diff = difference(amount, provision);
  const shown = diff ? ` (${diff > 0 ? "+" : "−"}${brl(Math.abs(diff) / 100)})` : "";
  return `substitui a provisão de ${brl(provision)}${shown}`;
}

export function replacedMessage(real: string, provision: string): string {
  const diff = difference(real, provision);
  const shown = diff ? ` (${brl(Math.abs(diff) / 100)} ${diff > 0 ? "acima" : "abaixo"})` : "";
  return `Provisão de ${brl(provision)} substituída pelo real de ${brl(real)}${shown}. Saiu do previsto.`;
}

export interface ImportGroup {
  payDate: string;
  surveyDates: string[];
  count: number;
  total: string;
  source: string;
}

export interface ImportLine {
  line: number;
  name: string;
  documentType: string;
  invoiceNumber: string | null;
  gross: string | null;
  amount: string | null;
  surveyDate: string | null;
  payDate: string | null;
  payDateGiven: boolean;
  errors: string[];
}

export interface ImportPreview {
  kind: "incentivos" | "folha";
  projectType: string | null;
  deadlineDays: number | null;
  missingDeadline: boolean;
  alreadyImported: boolean;
  total: string;
  goodCount: number;
  errorCount: number;
  groups: ImportGroup[];
  lines: ImportLine[];
}

export interface ImportResult {
  count: number;
  items: number;
  total: string;
}

/** O texto que o financeiro devolve ao projeto, hoje calculado à mão (kickoff de 03/11, K6). */
export function scheduleText(preview: ImportPreview, code: string, title: string): string {
  const deadline = preview.deadlineDays
    ? `Prazo: ${plural(preview.deadlineDays, "dia útil", "dias úteis")} depois da data da pesquisa${
        preview.projectType ? ` (${preview.projectType})` : ""
      }, quando a planilha não traz a data de pagamento.`
    : "Datas de pagamento informadas na planilha.";
  const groups = preview.groups.map((group) => {
    const days = group.surveyDates.map((day) => formatDate(day).slice(0, 5)).join(" e ");
    const from = days ? `Pesquisas de ${days}` : "Pesquisas";
    return `- ${from}: ${plural(group.count, "incentivo", "incentivos")} → pagar ${formatDate(group.payDate).slice(0, 5)} · ${brl(group.total)} (data ${group.source})`;
  });
  return [
    `Cronograma de pagamento dos incentivos · PRJ-${code} ${title}`,
    deadline,
    "",
    ...groups,
    "",
    `Total: ${plural(preview.goodCount, "incentivo", "incentivos")} · ${brl(preview.total)}`,
  ].join("\n");
}

export type RecordKind =
  | "suppliers"
  | "categories"
  | "companies"
  | "units"
  | "costCenters"
  | "bankAccounts"
  | "paymentMethods";

export interface RecordRow {
  id: number;
  name: string;
  active: boolean;
  inUse: boolean;
  nickname: string | null;
  code: string | null;
  companyId: number | null;
  document: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
}

/** "11222333000181" vira "11.222.333/0001-81". O CNPJ alfanumérico segue a mesma máscara. */
export function formatCnpj(document: string): string {
  return document.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
}

/**
 * Como a pessoa está de pagamento. O sistema ainda não registra o pagamento por pessoa: vale o do
 * lançamento inteiro, e baixa parcial não diz quem já foi paga.
 */
export function itemPaymentLabel(
  payable: Pick<PayableDetail, "situation" | "paid" | "pending" | "payments">,
  item?: Pick<PayableItem, "paidOn">
): string {
  if (payable.situation === "cancelado") return "Cancelada";
  // a pessoa paga pelo comprovante sabe o próprio dia, mesmo com o lançamento em baixa parcial
  if (item?.paidOn) return `Paga em ${formatDate(item.paidOn)}`;
  const paid = toCents(payable.paid);
  if (paid === 0) return "A pagar";
  if (toCents(payable.pending) > 0) return "Baixa parcial do lançamento";
  const days = payable.payments
    .filter((payment) => payment.kind === "pagamento" && !payment.reversed)
    .map((payment) => payment.paidOn)
    .sort();
  return days.length ? `Paga em ${formatDate(days[days.length - 1])}` : "Paga";
}

/** Quanto o INSS descontou do bruto do RPA, em reais. */
export function inssAmount(gross: string, net: string): string {
  return ((toCents(gross) - toCents(net)) / 100).toFixed(2);
}
