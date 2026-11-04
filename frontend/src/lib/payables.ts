export type Situation =
  | "pago"
  | "parcial"
  | "vencido"
  | "hoje"
  | "a_vencer"
  | "devolvido"
  | "cancelado";
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

/** O mês inteiro de uma data: de onde parte a escolha de um período livre. */
export function monthRange(ref: string): { start: string; end: string } {
  return { start: `${ref.slice(0, 7)}-01`, end: addDays(addMonths(ref, 1), -1) };
}

export function movePeriod(mode: PeriodMode, ref: string, step: number): string {
  if (mode === "dia") return addDays(ref, step);
  if (mode === "semana") return addDays(ref, 7 * step);
  if (mode === "mes") return addMonths(ref, step);
  if (mode === "ano") return addMonths(ref, 12 * step);
  return ref;
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
