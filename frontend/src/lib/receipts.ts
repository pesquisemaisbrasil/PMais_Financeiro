import { PDFDocument } from "pdf-lib";
import { postNoContent, remove, request, send, upload } from "./api";

// ---- Tipos (iguais aos do backend: schemas/receipt.py) ----

export type ReceiptGroup =
  | "no_projeto"
  | "fora_do_projeto"
  | "chave_nao_cadastrada"
  | "erro_leitura"
  | "duplicado";

export interface ReceiptRow {
  id: number;
  page: number;
  group: ReceiptGroup;
  status: "pendente" | "pago" | "descartado";
  name: string | null;
  interviewerId: number | null;
  keyMasked: string | null;
  amount: string | null;
  paidOn: string | null;
  error: string | null;
  reconcileStatus: "bate" | "pago_a_mais" | "nao_fecha" | null;
  itemsToPay: number;
  message: string | null;
  payment: "aguardando_connect" | "aplicada" | "recusada" | null;
  paymentMessage: string | null;
}

export interface BatchProgress {
  id: number;
  status: "enviando" | "pronto" | "confirmado";
  partsExpected: number;
  partsReceived: number;
  receiptsTotal: number;
  createdAt: string;
  confirmedAt: string | null;
}

export interface BatchDetail extends BatchProgress {
  receipts: ReceiptRow[];
  partErrors: { partIndex: number; error: string | null }[];
}

export interface ConfirmResult {
  paidReceipts: number;
  paidItems: number;
  paidTotal: string;
  awaitingConnect: number;
  refused: number;
}

export interface FinanceProject {
  id: number;
  connectProjectId: number;
  title: string;
}

export interface Notice {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Divergence {
  paymentRef: string;
  projectId: number;
  projectTitle: string;
  batchId: number;
  receiptId: number;
  page: number;
  keyMasked: string | null;
  amount: string | null;
  paidOn: string | null;
  code: string | null;
  message: string;
}

export function unreadCount(notices: Notice[]): number {
  return notices.filter((notice) => !notice.readAt).length;
}

// ---- Abas da conferência ----

export type ReceiptTab = "batem" | "divergentes" | "fora" | "sem_chave" | "erros" | "descartados";

export const RECEIPT_TABS: { id: ReceiptTab; label: string }[] = [
  { id: "batem", label: "Batem" },
  { id: "divergentes", label: "Divergentes" },
  { id: "fora", label: "Fora do projeto" },
  { id: "sem_chave", label: "Chave não cadastrada" },
  { id: "erros", label: "Erros" },
  { id: "descartados", label: "Descartados" },
];

/** Em qual aba o comprovante aparece. Quem já foi pago fica em "Batem". */
export function tabOf(row: ReceiptRow): ReceiptTab {
  if (row.status === "descartado") return "descartados";
  if (row.status === "pago") return "batem";
  switch (row.group) {
    case "fora_do_projeto":
      return "fora";
    case "chave_nao_cadastrada":
      return "sem_chave";
    case "erro_leitura":
    case "duplicado":
      return "erros";
    default:
      return row.reconcileStatus === "bate" ? "batem" : "divergentes";
  }
}

export function countByTab(rows: ReceiptRow[]): Record<ReceiptTab, number> {
  const counts: Record<ReceiptTab, number> = {
    batem: 0,
    divergentes: 0,
    fora: 0,
    sem_chave: 0,
    erros: 0,
    descartados: 0,
  };
  for (const row of rows) counts[tabOf(row)] += 1;
  return counts;
}

/** Soma, em centavos, do que vai ser pago se confirmar agora (só os que batem e não foram pagos). */
export function totalToPayCents(rows: ReceiptRow[]): number {
  return rows
    .filter((row) => row.status === "pendente" && tabOf(row) === "batem")
    .reduce((sum, row) => sum + Math.round(Number(row.amount ?? 0) * 100), 0);
}

export const GROUP_LABELS: Record<ReceiptGroup, string> = {
  no_projeto: "No projeto",
  fora_do_projeto: "Fora do projeto",
  chave_nao_cadastrada: "Chave não cadastrada",
  erro_leitura: "Erro de leitura",
  duplicado: "Já pago",
};

export const PAYMENT_LABELS: Record<NonNullable<ReceiptRow["payment"]>, string> = {
  aguardando_connect: "Aguardando o Connect",
  aplicada: "Baixa aplicada",
  recusada: "Recusada pelo Connect",
};

// ---- Dividir o PDF no navegador ----

export const PAGES_PER_PART = 25;
// O servidor aceita 25 MB por parte; passou de 24 MB, divide ao meio de novo.
export const MAX_PART_BYTES = 24 * 1024 * 1024;

export interface PdfPart {
  pageOffset: number;
  bytes: Uint8Array;
}

/** Faixas de páginas (a partir de 0) de cada parte. */
export function planParts(totalPages: number, perPart = PAGES_PER_PART): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (let start = 0; start < totalPages; start += perPart) {
    ranges.push({ start, end: Math.min(start + perPart, totalPages) });
  }
  return ranges;
}

export class UnreadablePdfError extends Error {}

async function cut(source: PDFDocument, start: number, end: number, maxBytes: number): Promise<PdfPart[]> {
  const part = await PDFDocument.create();
  const pages = await part.copyPages(
    source,
    Array.from({ length: end - start }, (_, i) => start + i),
  );
  pages.forEach((page) => part.addPage(page));
  const bytes = await part.save();
  // Nunca recusa por tamanho: uma página sozinha que ainda passa do limite sobe como está.
  if (bytes.length <= maxBytes || end - start === 1) return [{ pageOffset: start, bytes }];
  const middle = start + Math.ceil((end - start) / 2);
  return [...(await cut(source, start, middle, maxBytes)), ...(await cut(source, middle, end, maxBytes))];
}

/** Corta o PDF em partes de até 25 páginas e 24 MB. Arquivo grande nunca é recusado. */
export async function splitPdf(
  content: ArrayBuffer | Uint8Array,
  options: { perPart?: number; maxBytes?: number } = {},
): Promise<PdfPart[]> {
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(content);
  } catch (error) {
    const encrypted = error instanceof Error && /encrypt/i.test(error.message);
    throw new UnreadablePdfError(
      encrypted
        ? "Esse PDF está protegido por senha. Gere o arquivo de comprovantes sem senha no banco e envie de novo."
        : "Não foi possível abrir esse PDF. Confira se é o arquivo de comprovantes do banco.",
    );
  }
  const parts: PdfPart[] = [];
  for (const { start, end } of planParts(source.getPageCount(), options.perPart)) {
    parts.push(...(await cut(source, start, end, options.maxBytes ?? MAX_PART_BYTES)));
  }
  return parts;
}

// ---- API ----

const base = (projectId: number) => `/projects/${projectId}/finance`;

export function listNotices(): Promise<Notice[]> {
  return request<Notice[]>("/notifications");
}

export function readNotice(id: number): Promise<void> {
  return postNoContent(`/notifications/${id}/read`);
}

export function listDivergences(): Promise<Divergence[]> {
  return request<Divergence[]>("/finance/divergences");
}

export function listFinanceProjects(): Promise<FinanceProject[]> {
  return request<FinanceProject[]>("/finance/projects");
}

export function syncFinanceProjects(): Promise<FinanceProject[]> {
  return send<FinanceProject[]>("/finance/connect/sync", "POST", {});
}

export function openBatch(projectId: number, parts: number, payableId: number): Promise<BatchProgress> {
  return send<BatchProgress>(`${base(projectId)}/receipt-batches`, "POST", { parts, payableId });
}

export function uploadPart(
  projectId: number,
  batchId: number,
  index: number,
  part: PdfPart,
): Promise<{ partIndex: number; receiptsCount: number; error: string | null }> {
  const form = new FormData();
  form.set("file", new Blob([part.bytes as BlobPart], { type: "application/pdf" }), "parte.pdf");
  form.set("page_offset", String(part.pageOffset));
  return upload(`${base(projectId)}/receipt-batches/${batchId}/parts/${index}`, "PUT", form);
}

export function getBatch(projectId: number, batchId: number): Promise<BatchDetail> {
  return request<BatchDetail>(`${base(projectId)}/receipt-batches/${batchId}`);
}

export function discardReceipt(
  projectId: number,
  batchId: number,
  receiptId: number,
  discarded: boolean,
): Promise<ReceiptRow> {
  return send<ReceiptRow>(`${base(projectId)}/receipt-batches/${batchId}/receipts/${receiptId}`, "PATCH", {
    discarded,
  });
}

export async function cancelBatch(projectId: number, batchId: number): Promise<void> {
  await remove(`${base(projectId)}/receipt-batches/${batchId}`);
}

export function confirmBatch(
  projectId: number,
  batchId: number,
  body: { code?: string; bankAccountId?: number; paymentMethodId?: number },
): Promise<ConfirmResult> {
  return send<ConfirmResult>(`${base(projectId)}/receipt-batches/${batchId}/confirm`, "POST", body);
}
