/** Relatório do projeto: o que foi lançado, pago e falta pagar, e os documentos dos lançamentos. */

import { request } from "./api";
import type { Project, Situation } from "./payables";

export interface ProjectSummary {
  id: number;
  code: string;
  title: string;
  status: string;
  launched: string;
  paid: string;
  pending: string;
  payableCount: number;
}

/** Uma conta, com só a parte deste projeto nos valores. */
export interface ReportLine {
  id: number;
  type: string;
  situation: Situation;
  dueDate: string;
  payee: string;
  description: string;
  categoryName: string;
  amount: string;
  paid: string;
  pending: string;
  documentCount: number;
}

export interface ReportDocument {
  id: number;
  payableId: number;
  payableDescription: string;
  name: string;
  kind: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
}

export interface ProjectReport {
  project: Project;
  /** Do Connect: ainda não chega, e o saldo também fica vazio. */
  budget: string | null;
  launched: string;
  paid: string;
  pending: string;
  provisioned: string;
  totalSpent: string;
  balance: string | null;
  lines: ReportLine[];
  provisions: ReportLine[];
  documents: ReportDocument[];
}

export function listProjectReports(): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>("/reports/projects");
}

export function getProjectReport(code: string): Promise<ProjectReport> {
  return request<ProjectReport>(`/reports/projects/${encodeURIComponent(code)}`);
}

/** Endereço do relatório de um projeto. */
export function projectReportHref(code: string): string {
  return `/relatorios/projeto?codigo=${encodeURIComponent(code)}`;
}

/** "42%" do lançado que já foi pago; sem lançado, nada a dizer. */
export function paidShare(launched: string, paid: string): string | null {
  const total = Number(launched);
  if (!(total > 0)) return null;
  return `${Math.round((Number(paid) / total) * 100)}%`;
}
