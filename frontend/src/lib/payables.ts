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

/** O que a impressão mostra: o título com os filtros, as colunas, as linhas e os totais. */
export interface PrintTable {
  title: string;
  headers: string[];
  rows: string[][];
  /** Um por coluna; vazio onde não é dinheiro. */
  totals: string[];
}

/** Uma linha da aba Repetir: a ocorrência da série como está hoje. */
export interface SeriesOccurrence {
  id: number;
  index: number;
  dueDate: string;
  description: string;
  /** O valor líquido: o que de fato se paga ou se recebe. */
  amount: string;
  situation: string;
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

/** Com que vencimento e valor a tabela foi simulada. */
export function simulationKey(dueDate: string, amount: string | null): string {
  return `${dueDate}|${amount}`;
}

/**
 * A tabela simulada só vale com o vencimento e o valor que estão no formulário agora: o servidor
 * refaz a série com os dados de agora, então uma tabela velha mostraria um total diferente do que
 * vai ser lançado.
 */
export function simulationIsCurrent(
  value: { rows: Occurrence[] | null; simulatedFor: string | null },
  dueDate: string,
  amount: string | null
): boolean {
  return value.rows !== null && value.simulatedFor === simulationKey(dueDate, amount);
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
  // o valor líquido: o que de fato se paga. O valor principal vem em grossAmount
  amount: string;
  grossAmount: string;
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

import type { Adjustment } from "./adjustments";

export interface Attachment {
  id: number;
  name: string;
  kind: string;
  size: number;
  contentType: string;
  uploadedBy: string;
  createdAt: string;
}

export interface PayableDetail extends PayableRow {
  company_id: number;
  supplierId: number | null;
  categoryId: number;
  costCenterId: number;
  paymentMethodId: number;
  unitName: string;
  issueDate: string;
  competence: string | null;
  documentDate: string | null;
  docsReceivedOn: string | null;
  /** "Pagar em": o dia previsto para pagar. Só informa. */
  payOn: string | null;
  isTransfer: boolean;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  items: PayableItem[];
  payments: Payment[];
  events: PayableEvent[];
  attachments: Attachment[];
  adjustments: Adjustment[];
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

/** Centro de custo nas escolhas: `label` traz o código e o caminho (001.001 · Administrativo › Adm_Geral). */
export interface CostCenterRef extends Named {
  code: string | null;
  parentId: number | null;
  label: string;
}

export interface Reference {
  companies: Named[];
  units: (Named & { companyId: number })[];
  costCenters: CostCenterRef[];
  categories: (Named & { code: string; kind: "despesa" | "receita" })[];
  paymentMethods: Named[];
  bankAccounts: (Named & { companyId: number })[];
  suppliers: (Named & { nickname: string })[];
  customers: (Named & { nickname: string })[];
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

/** "2026-11" vira "11/2026". */
export function formatCompetence(competence: string | null | undefined): string {
  if (!competence) return "—";
  const [year, month] = competence.split("-");
  return `${month}/${year}`;
}

/** "06/11/2026 09:45:28", no horário de São Paulo. */
export function formatDateTime(iso: string): string {
  return new Date(iso)
    .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false })
    .replace(", ", " ");
}

/** Parte de cada projeto no valor da conta: "60,00%". */
export function shareText(amount: string, total: string): string {
  const whole = toCents(total);
  const share = whole === 0 ? 0 : (toCents(amount) / whole) * 100;
  return `${share.toFixed(2).replace(".", ",")}%`;
}

/** Juros, multa e desconto que as baixas que valem somaram ou tiraram (estornada não conta). */
export function paymentExtras(payments: Pick<Payment, "kind" | "reversed" | "surcharge" | "discount">[]): {
  surcharge: string;
  discount: string;
} {
  const live = payments.filter((p) => p.kind === "pagamento" && !p.reversed);
  const text = (cents: number) => (cents / 100).toFixed(2);
  return {
    surcharge: text(live.reduce((sum, p) => sum + toCents(p.surcharge), 0)),
    discount: text(live.reduce((sum, p) => sum + toCents(p.discount), 0)),
  };
}

/** Dinheiro em centavos inteiros: soma sem o erro de arredondamento do ponto flutuante. */
export function toCents(value: string): number {
  return Number(value.replace(".", ""));
}

/** Quanto de `total` já foi coberto por `part`, de 0 a 100 (nunca passa disso). Valores com duas casas. */
export function percentOf(part: string, total: string): number {
  const whole = toCents(total);
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((toCents(part) * 100) / whole)));
}

/** Para o campo de valor do formulário: "1234.50" vira "1234,50". */
export function toField(value: string): string {
  return value.replace(".", ",");
}

export interface ParsedAllocations {
  allocations: { projectId: number; amount: string }[];
  error: string | null;
}

/** Uma linha da divisão entre projetos, como está nos campos da tela. */
export interface AllocationRow {
  projectId: string;
  amount: string;
}

/**
 * Confere as linhas da divisão entre projetos: projeto escolhido, valor só em números, nenhum projeto
 * repetido e a soma igual ao valor do lançamento. Linha totalmente vazia é ignorada.
 */
export function buildAllocations(rows: AllocationRow[], amount: string): ParsedAllocations {
  const allocations: ParsedAllocations["allocations"] = [];
  for (const [index, row] of rows.entries()) {
    if (!row.projectId && !row.amount.trim()) continue;
    const number = index + 1;
    if (!row.projectId) return { allocations: [], error: `Linha ${number}: escolha o projeto` };
    const parsed = parseMoney(row.amount);
    if (!parsed || toCents(parsed) === 0) {
      return { allocations: [], error: `Linha ${number}: use só números no valor` };
    }
    allocations.push({ projectId: Number(row.projectId), amount: parsed });
  }
  if (new Set(allocations.map((allocation) => allocation.projectId)).size !== allocations.length) {
    return { allocations: [], error: "O mesmo projeto aparece mais de uma vez no rateio" };
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

/** Quanto a divisão soma e quanto falta (ou passou) para fechar com o valor, em centavos. */
export function allocationDiff(rows: AllocationRow[], amount: string): { total: number; diff: number } | null {
  const target = parseMoney(amount);
  if (!target) return null;
  const total = rows.reduce((sum, row) => {
    const value = parseMoney(row.amount);
    return sum + (value ? toCents(value) : 0);
  }, 0);
  return { total, diff: toCents(target) - total };
}

/**
 * Linhas coladas da planilha, uma por projeto: o código e o valor separados por tabulação (como
 * o Excel cola), ponto e vírgula ou espaço. Vira as linhas da tela, sem conferir a soma.
 */
export function parsePastedAllocations(
  text: string,
  projects: Project[]
): { rows: AllocationRow[]; error: string | null } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: AllocationRow[] = [];
  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    const separated = /[;\t]/.test(line);
    const parts = (separated ? line.split(/[;\t]/) : line.split(/\s+/)).map((part) => part.trim());
    const code = parts[0] ?? "";
    // Com ; ou tabulação o valor é a segunda coluna; sem eles, é tudo o que vem depois do código.
    const value = separated ? (parts[1] ?? "") : parts.slice(1).join(" ");
    const digits = code.replace(/\D/g, "");
    const project = projects.find((candidate) => candidate.code === digits);
    if (!project) return { rows: [], error: `Projeto ${code} não encontrado (linha ${number})` };
    if (project.status === "encerrado") {
      return { rows: [], error: `Projeto ${project.code} fechado — peça a reabertura a um administrador` };
    }
    const parsed = parseMoney(value);
    if (!parsed || toCents(parsed) === 0) {
      return { rows: [], error: `Linha ${number}: use só números no valor` };
    }
    rows.push({ projectId: String(project.id), amount: toField(parsed) });
  }
  return { rows, error: null };
}

/** Rateio colado da planilha, já conferido contra o valor do lançamento. */
export function parseAllocations(text: string, projects: Project[], amount: string): ParsedAllocations {
  const pasted = parsePastedAllocations(text, projects);
  if (pasted.error) return { allocations: [], error: pasted.error };
  return buildAllocations(pasted.rows, amount);
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
  projectId: number;
  projectCode: string;
  projectTitle: string;
  /** Empresa · unidade · centro de custo · categoria · forma de pagamento deste lançamento. */
  classification: string;
  payDate: string;
  surveyDates: string[];
  count: number;
  total: string;
  source: string;
  /** Datas da planilha que caíam em dia não útil e foram para o próximo dia útil, e o motivo de cada uma. */
  shifts?: ImportShift[];
}

export interface ImportShift {
  day: string;
  /** "sábado", "domingo", "feriado nacional" ou "feriado: Nome". */
  reason: string;
}

/** O aviso de uma data que mudou: "07/11 caiu em sábado; vai para 09/11". */
export function shiftNote(shift: ImportShift, payDate: string): string {
  return `${formatDate(shift.day).slice(0, 5)} caiu em ${shift.reason}; vai para ${formatDate(payDate).slice(0, 5)}`;
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
  /** O código que a linha traz (ou o do projeto marcado, quando a célula está vazia). */
  projectCode: string | null;
  /** Empresa, unidade, centro de custo, categoria e forma que a planilha disse (só as colunas que vieram). */
  classification: string | null;
  /** De um cadastro que a pessoa não marcou: fica de fora, sem ser erro. */
  skipped: boolean;
  errors: string[];
}

export interface ImportProject {
  id: number;
  code: string;
  title: string;
  projectType: string | null;
  deadlineDays: number | null;
  missingDeadline: boolean;
  count: number;
  total: string;
}

export interface ImportPreview {
  kind: "incentivos" | "folha";
  /** Os campos que a planilha trouxe em coluna: "projeto", "empresa", "unidade"... */
  columns: string[];
  hasProjectColumn: boolean;
  hasClassificationColumns: boolean;
  projects: ImportProject[];
  missingDeadline: boolean;
  alreadyImported: boolean;
  total: string;
  goodCount: number;
  errorCount: number;
  skippedCount: number;
  /** Quantos lançamentos vão ser criados: um por classificação e data (incentivo) ou por classificação (folha). */
  payableCount: number;
  /** Quantas linhas tinham data de pagamento em dia não útil e foram para o próximo dia útil. */
  shiftedCount?: number;
  groups: ImportGroup[];
  lines: ImportLine[];
}

export interface ImportResult {
  count: number;
  items: number;
  total: string;
}

/** O texto que o financeiro devolve a um projeto, hoje calculado à mão (kickoff de 03/11, K6). */
export function scheduleText(preview: ImportPreview, project: ImportProject): string {
  const deadline = project.deadlineDays
    ? `Prazo: ${plural(project.deadlineDays, "dia útil", "dias úteis")} depois da data da pesquisa${
        project.projectType ? ` (${project.projectType})` : ""
      }, quando a planilha não traz a data de pagamento.`
    : "Datas de pagamento informadas na planilha.";
  const groups = preview.groups
    .filter((group) => group.projectId === project.id)
    .map((group) => {
      const days = group.surveyDates.map((day) => formatDate(day).slice(0, 5)).join(" e ");
      const from = days ? `Pesquisas de ${days}` : "Pesquisas";
      const where = preview.hasClassificationColumns ? ` · ${group.classification}` : "";
      const moved = (group.shifts ?? []).map((shift) => ` [${shiftNote(shift, group.payDate)}]`).join("");
      return `- ${from}: ${plural(group.count, "incentivo", "incentivos")} → pagar ${formatDate(group.payDate).slice(0, 5)} · ${brl(group.total)} (data ${group.source})${where}${moved}`;
    });
  return [
    `Cronograma de pagamento dos incentivos · PRJ-${project.code} ${project.title}`,
    deadline,
    "",
    ...groups,
    "",
    `Total: ${plural(project.count, "incentivo", "incentivos")} · ${brl(project.total)}`,
  ].join("\n");
}

/** Um cronograma por projeto, separados por uma linha em branco, para colar de uma vez. */
export function schedulesText(preview: ImportPreview): string {
  return preview.projects.map((project) => scheduleText(preview, project)).join("\n\n");
}

export type RecordKind =
  | "suppliers"
  | "customers"
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
  /** Só no centro de custo: o principal em que ele fica embaixo (nulo = é um principal). */
  parentId: number | null;
  document: string | null;
  /** PF (pessoa física, sem documento) ou PJ (pessoa jurídica, com CNPJ). */
  personType: "PF" | "PJ" | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
  // só no cliente: o resto da ficha (IE, telefones, e-mail alternativo, observações e endereço)
  stateRegistration: string | null;
  phone2: string | null;
  phone3: string | null;
  emailAlt: string | null;
  notes: string | null;
  addressCountry: string | null;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  // só na conta do plano de contas
  kind: "despesa" | "receita" | null;
}

export function expenseCategories(reference: Reference) {
  return reference.categories.filter((c) => c.kind === "despesa");
}

export function revenueCategories(reference: Reference) {
  return reference.categories.filter((c) => c.kind === "receita");
}

/** "11222333000181" vira "11.222.333/0001-81". O CNPJ alfanumérico segue a mesma máscara. */
/** O CNPJ sem pontuação, em maiúsculas (a Receita já emite CNPJ com letras). */
export function cleanCnpj(value: string): string {
  return value.replace(/[\s./-]/g, "").toUpperCase();
}

/** Só a forma: 12 letras ou números e 2 dígitos. Os dígitos verificadores, o servidor confere. */
export function looksLikeCnpj(value: string): boolean {
  return /^[0-9A-Z]{12}\d{2}$/.test(cleanCnpj(value));
}

/** O que a Receita diz do CNPJ, para preencher o cadastro (a pessoa edita antes de salvar). */
export interface CnpjInfo {
  cnpj: string;
  name: string;
  nickname: string;
  /** "ATIVA", "BAIXADA", "INAPTA"... */
  situation: string;
}

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
