/** Extrato bancário: importar (OFX ou CSV), conferir antes de gravar e consultar as linhas. */

import { request, upload } from "./api";
import { parseMoney } from "./payables";

export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;
export const STATEMENT_ACCEPT = ".ofx,.csv,.txt";
export const STATEMENT_HINT = "OFX ou CSV exportado do banco, até 5 MB";
export const PAGE_SIZE = 50;

export const ACCOUNT_TYPES = [
  { id: "corrente", label: "Conta corrente" },
  { id: "aplicacao", label: "Aplicação" },
  { id: "caixa", label: "Caixa" },
];

export function accountTypeLabel(type: string | null): string {
  return ACCOUNT_TYPES.find((option) => option.id === type)?.label ?? "Conta corrente";
}

/** "Itaú · ag. 1234 · conta 12345-6 · Conta corrente": a linha que identifica a conta nas listas. */
export function bankLine(account: {
  bankName: string | null;
  agency: string | null;
  accountNumber: string | null;
  accountType: string | null;
}): string {
  return [
    account.bankName ?? "banco não informado",
    account.agency ? `ag. ${account.agency}` : null,
    account.accountNumber ? `conta ${account.accountNumber}` : null,
    accountTypeLabel(account.accountType),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** O saldo como a pessoa digita ("1.234,56", "-50", vazio) para o formato da API; null se não for um valor. */
export function parseBalance(text: string): string | null {
  const clean = text.trim();
  if (!clean) return "0.00";
  const negative = clean.startsWith("-");
  const amount = parseMoney(negative ? clean.slice(1) : clean);
  if (amount === null) return null;
  return negative && Number(amount) !== 0 ? `-${amount}` : amount;
}

/** O saldo da API ("1000.00") para o campo da tela ("1000,00"); vazio quando é zero. */
export function balanceText(value: string | null): string {
  if (!value || Number(value) === 0) return "";
  return value.replace(".", ",");
}

export interface StatementSample {
  postedOn: string;
  description: string;
  amount: string;
}

export interface StatementPreview {
  fileFormat: "ofx" | "csv";
  lines: number;
  newLines: number;
  duplicateLines: number;
  periodStart: string;
  periodEnd: string;
  income: string;
  expense: string;
  warnings: string[];
  sample: StatementSample[];
  alreadyImportedAt: string | null;
}

export interface StatementResult {
  statementId: number | null;
  newLines: number;
  duplicateLines: number;
  periodStart: string;
  periodEnd: string;
}

export interface StatementRow {
  id: number;
  filename: string;
  fileFormat: "ofx" | "csv";
  periodStart: string;
  periodEnd: string;
  newLines: number;
  duplicateLines: number;
  importedBy: string | null;
  createdAt: string;
}

export interface Transaction {
  id: number;
  postedOn: string;
  description: string;
  amount: string;
  statementId: number;
}

export interface TransactionList {
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  income: string;
  expense: string;
}

/** Texto de erro do arquivo, ou null se pode seguir. O servidor confere de novo. */
export function checkStatement(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (file.size === 0) return `${file.name}: o arquivo está vazio`;
  if (!STATEMENT_ACCEPT.split(",").includes(extension)) {
    return `${file.name}: envie o extrato em OFX ou CSV`;
  }
  if (file.size > MAX_STATEMENT_BYTES) return `${file.name}: o extrato passa de 5 MB, importe por períodos menores`;
  return null;
}

/** "Nenhuma linha nova" ou "12 linhas novas": o que o botão de importar promete. */
export function importLabel(preview: StatementPreview): string {
  if (preview.newLines === 0) return "Nada novo para importar";
  return preview.newLines === 1 ? "Importar 1 linha nova" : `Importar ${preview.newLines} linhas novas`;
}

/** O que o toast diz depois de importar. */
export function importedText(result: StatementResult): string {
  if (result.newLines === 0) return "Nada foi importado: todas as linhas já estavam na conta.";
  const entered = result.newLines === 1 ? "1 linha importada" : `${result.newLines} linhas importadas`;
  if (result.duplicateLines === 0) return `${entered}.`;
  const repeated = result.duplicateLines === 1 ? "1 já estava" : `${result.duplicateLines} já estavam`;
  return `${entered}, ${repeated}.`;
}

function fileForm(file: File): FormData {
  const form = new FormData();
  form.append("file", file);
  return form;
}

export function previewStatement(accountId: number, file: File): Promise<StatementPreview> {
  return upload<StatementPreview>(`/bank-accounts/${accountId}/statements/preview`, "POST", fileForm(file));
}

export function importStatement(accountId: number, file: File): Promise<StatementResult> {
  return upload<StatementResult>(`/bank-accounts/${accountId}/statements`, "POST", fileForm(file));
}

export function listStatements(accountId: number): Promise<StatementRow[]> {
  return request<StatementRow[]>(`/bank-accounts/${accountId}/statements`);
}

export function listTransactions(
  accountId: number,
  filter: { start: string; end: string; page: number }
): Promise<TransactionList> {
  const params = new URLSearchParams({ page: String(filter.page) });
  if (filter.start) params.set("from", filter.start);
  if (filter.end) params.set("to", filter.end);
  return request<TransactionList>(`/bank-accounts/${accountId}/transactions?${params}`);
}
