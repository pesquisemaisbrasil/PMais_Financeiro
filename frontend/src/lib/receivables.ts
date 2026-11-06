import type { Adjustment } from "./adjustments";
import { fetchBlob, remove, request, send, type ExportFormat } from "./api";
import { toCents, type PeriodMode, type SeriesInfo, type SeriesOccurrence } from "./payables";

// ---- Tipos (iguais aos do backend: schemas/receivable.py) ----

export type ReceivableSituation = "recebido" | "parcial" | "vencido" | "hoje" | "a_vencer" | "cancelado";
export type ReceivableIndicator = "total" | "recebidos" | "pendentes" | "vencidos" | "hoje" | "avencer" | "cancelados";
export type ReceivableSort = "vencimento" | "cliente" | "categoria" | "situacao" | "valor" | "recebido" | "pendente";
export type ReceivableDateField = "vencimento" | "competencia" | "recebimento";
export type ReceivableDocument = "Sem documento" | "NF" | "Fatura" | "Invoice";

export interface ReceivableRow {
  id: number;
  situation: ReceivableSituation;
  dueDate: string;
  customer: string;
  projectCode: string;
  projectTitle: string;
  description: string;
  contract: string | null;
  documentType: string;
  documentNumber: string | null;
  categoryName: string;
  companyName: string;
  amount: string;
  net: string;
  received: string;
  pending: string;
  daysLate: number | null;
  canReceive: boolean;
  series: SeriesInfo | null;
}

export interface ReceivableList {
  today: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  items: ReceivableRow[];
  total: number;
  page: number;
  pageSize: number;
  filteredNet: string;
  filteredReceived: string;
  filteredPending: string;
  indicators: Record<ReceivableIndicator, { value: string; count: number }>;
}

export interface Receipt {
  id: number;
  kind: "recebimento" | "estorno";
  reversesId: number | null;
  reversed: boolean;
  receivedOn: string;
  amount: string;
  bankAccountName: string;
  paymentMethodName: string;
  transactionId: string | null;
  note: string | null;
}

export interface ReceivableDetail extends ReceivableRow {
  company_id: number;
  unitName: string;
  costCenterName: string;
  issueDate: string;
  competence: string;
  documentDate: string | null;
  notes: string | null;
  payments: Receipt[];
  events: { userName: string; text: string; createdAt: string }[];
  adjustments: Adjustment[];
}

export interface DelinquencyBand {
  id: string;
  count: number;
  total: string;
}

export interface DelinquentCustomer {
  customerId: number;
  customer: string;
  count: number;
  maxDaysLate: number;
  total: string;
  /** Todas as faixas, mesmo vazias, na ordem do atraso (limites no backend). */
  bands: DelinquencyBand[];
  titles: { id: number; description: string; dueDate: string; daysLate: number; band: string; pending: string }[];
}

const BAND_LABELS: Record<string, string> = {
  "1-30": "1 a 30 dias",
  "31-60": "31 a 60 dias",
  "61-90": "61 a 90 dias",
  "90+": "Mais de 90 dias",
};

export function bandLabel(id: string): string {
  return BAND_LABELS[id] ?? id;
}

/** O que está em cada faixa somando todos os clientes, em centavos, na ordem que a API mandou. */
export function bandTotals(rows: DelinquentCustomer[]): { id: string; count: number; cents: number }[] {
  const totals = new Map<string, { id: string; count: number; cents: number }>();
  for (const row of rows) {
    for (const band of row.bands) {
      const current = totals.get(band.id) ?? { id: band.id, count: 0, cents: 0 };
      current.count += band.count;
      current.cents += toCents(band.total);
      totals.set(band.id, current);
    }
  }
  return [...totals.values()];
}

export interface ReceivableQuery {
  mode: PeriodMode;
  ref: string | null;
  start: string;
  end: string;
  dateField: ReceivableDateField;
  indicator: ReceivableIndicator;
  filters: Record<string, string>;
  search: string;
  sort: ReceivableSort;
  descending: boolean;
  page: number;
}

// ---- Textos ----

export const INDICATORS: { id: ReceivableIndicator; label: string }[] = [
  { id: "total", label: "Total" },
  { id: "recebidos", label: "Recebidos" },
  { id: "pendentes", label: "Pendentes" },
  { id: "vencidos", label: "Vencidos" },
  { id: "hoje", label: "Hoje" },
  { id: "avencer", label: "A vencer" },
];

export const SITUATION_LABELS: Record<ReceivableSituation, string> = {
  recebido: "Recebida",
  parcial: "Parcial",
  vencido: "Vencida",
  hoje: "Vence hoje",
  a_vencer: "A vencer",
  cancelado: "Cancelada",
};

export const DATE_FIELDS: { id: ReceivableDateField; label: string }[] = [
  { id: "vencimento", label: "Vencimento" },
  { id: "competencia", label: "Competência" },
  { id: "recebimento", label: "Data do recebimento" },
];

export const DOCUMENT_TYPES: ReceivableDocument[] = ["Sem documento", "NF", "Fatura", "Invoice"];

/** "3 dias de atraso", "1 dia de atraso". */
export function daysLateText(days: number | null): string | null {
  if (days === null) return null;
  return `${days} ${days === 1 ? "dia" : "dias"} de atraso`;
}

// ---- API ----

/**
 * Só a situação "cancelada" mostra título cancelado, e ele não conta no Total: nesse caso a
 * lista usa o indicador de cancelados, para a pessoa não ver uma tela vazia sem motivo.
 */
export function effectiveIndicator(query: Pick<ReceivableQuery, "indicator" | "filters">): ReceivableIndicator {
  return query.filters.situation === "cancelado" ? "cancelados" : query.indicator;
}

export function receivableParams(query: ReceivableQuery): URLSearchParams {
  const params = new URLSearchParams({
    mode: query.mode,
    dateField: query.dateField,
    indicator: effectiveIndicator(query),
    sort: query.sort,
    descending: String(query.descending),
    page: String(query.page),
  });
  if (query.ref) params.set("ref", query.ref);
  if (query.mode === "periodo") {
    params.set("start", query.start);
    params.set("end", query.end);
  }
  if (query.search.trim()) params.set("search", query.search.trim());
  for (const [key, value] of Object.entries(query.filters)) {
    if (value) params.set(key, value);
  }
  return params;
}

export function listReceivables(query: ReceivableQuery): Promise<ReceivableList> {
  return request<ReceivableList>(`/receivables?${receivableParams(query)}`);
}

/** Tudo o que os filtros trazem, sem paginar, em Excel ou CSV. */
export function exportReceivables(query: ReceivableQuery, format: ExportFormat = "xlsx"): Promise<Blob> {
  const params = receivableParams(query);
  params.delete("page");
  params.set("format", format);
  return fetchBlob(`/receivables/export?${params}`);
}

export function createReceivableSeries(body: unknown): Promise<{ seriesId: number; ids: number[] }> {
  return send<{ seriesId: number; ids: number[] }>("/receivables/recurrence", "POST", body);
}

/** Os títulos da série, em ordem (aba Repetir). */
export function listReceivableSeries(id: number): Promise<SeriesOccurrence[]> {
  return request<SeriesOccurrence[]>(`/receivables/${id}/series`);
}

export function editReceivableSeries(id: number, body: unknown): Promise<{ count: number }> {
  return send<{ count: number }>(`/receivables/${id}/series`, "PATCH", body);
}

export function cancelReceivableSeries(id: number, body: unknown): Promise<{ count: number }> {
  return send<{ count: number }>(`/receivables/${id}/series/cancel`, "POST", body);
}

export function getReceivable(id: number): Promise<ReceivableDetail> {
  return request<ReceivableDetail>(`/receivables/${id}`);
}

export function createReceivable(body: unknown): Promise<ReceivableDetail> {
  return send<ReceivableDetail>("/receivables", "POST", body);
}

export function updateReceivable(id: number, body: unknown): Promise<ReceivableDetail> {
  return send<ReceivableDetail>(`/receivables/${id}`, "PATCH", body);
}

export function receive(id: number, body: unknown): Promise<ReceivableDetail> {
  return send<ReceivableDetail>(`/receivables/${id}/receipts`, "POST", body);
}

export function reverseReceipt(id: number, receiptId: number, reason: string): Promise<ReceivableDetail> {
  return send<ReceivableDetail>(`/receivables/${id}/receipts/${receiptId}/reverse`, "POST", { reason });
}

export function cancelReceivable(id: number, reason: string): Promise<ReceivableDetail> {
  return send<ReceivableDetail>(`/receivables/${id}/cancel`, "POST", { reason });
}

export function deleteReceivable(id: number): Promise<void> {
  return remove(`/receivables/${id}`);
}

export function listDelinquency(): Promise<DelinquentCustomer[]> {
  return request<DelinquentCustomer[]>("/receivables/delinquency");
}
