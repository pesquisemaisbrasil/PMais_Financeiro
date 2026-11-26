/** Notas e RPA (PF-60): a NF pendente, com o registro da nota, e a lista de RPA do mês do pagamento. */

import { fetchBlob, request, send } from "./api";

export interface PendingInvoice {
  itemId: number;
  payableId: number;
  name: string;
  project: string;
  description: string;
  dueDate: string;
  situation: string;
  amount: string;
}

export interface PendingInvoices {
  rows: PendingInvoice[];
  total: string;
}

export interface RpaRow {
  itemId: number;
  payableId: number;
  name: string;
  project: string;
  paidOn: string;
  gross: string;
  inss: string;
  net: string;
}

export interface RpaMonth {
  month: string;
  label: string;
  rows: RpaRow[];
  gross: string;
  inss: string;
  net: string;
}

function query(values: Record<string, string>): string {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value)).toString();
}

export function getPendingInvoices(project: string, search: string): Promise<PendingInvoices> {
  return request<PendingInvoices>(`/fiscal/pending-invoices?${query({ project, search })}`);
}

export function registerInvoice(itemId: number, number: string, issueDate: string): Promise<unknown> {
  return send(`/fiscal/items/${itemId}/invoice`, "PUT", { number, issueDate: issueDate || null });
}

export function getRpa(month: string, company: string): Promise<RpaMonth> {
  return request<RpaMonth>(`/fiscal/rpa?${query({ month, company })}`);
}

export function exportRpa(month: string, company: string): Promise<Blob> {
  return fetchBlob(`/fiscal/rpa/export?${query({ month, company })}`);
}
