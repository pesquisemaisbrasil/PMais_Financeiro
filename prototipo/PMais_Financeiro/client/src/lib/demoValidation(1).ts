import { z } from "zod";
import type { DemoState } from "./demoModel";

export function isDemoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return y >= 2000 && y <= 2100 && date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}
const id = z.string().max(100).regex(/^[a-z]+-demo-[A-Za-z0-9-]+$/);
const label = z.string().min(1).max(180).refine(value => /demo/i.test(value));
const date = z.string().refine(isDemoDate);
const cents = z.number().int().min(1).max(900_000_000_000);
const code = z.string().min(1).max(50);
const rows = <T extends z.ZodTypeAny>(schema: T) => z.array(schema).max(2500);
const schema = z.object({
  version: z.literal(1),
  parties: rows(z.object({ id, name: label, type: z.enum(["fornecedor", "cliente"]), active: z.boolean() })),
  categories: rows(z.object({ id, name: label, type: z.enum(["despesa", "receita"]), code, active: z.boolean() })),
  centers: rows(z.object({ id, name: label, code, active: z.boolean() })).default([]),
  projects: rows(z.object({ id, code, name: label, clientId: id, budgetCents: cents, progressPercent: z.number().min(0).max(100), status: z.enum(["ativo", "fechado"]) })),
  titles: rows(z.object({
    id, direction: z.enum(["pagar", "receber"]), description: label, partyId: id, projectId: id.nullable(), categoryId: id,
    centerId: id.nullable().optional(), issueDate: date, competenceDate: date, dueDate: date, amountCents: cents,
    settlements: rows(z.object({ id, date, amountCents: cents, bankTransactionId: id })),
    source: z.enum(["manual", "provision", "interviewer", "field"]), sourceId: id.nullable(),
    fiscalDocument: z.enum(["nao_aplicavel", "aguardando_demo", "demo_ok"]),
  })),
  provisions: rows(z.object({ id, projectId: id, categoryId: id, description: label, amountCents: cents, dueDate: date, status: z.enum(["prevista", "substituida", "cancelada"]), titleId: id.nullable(), cancelReason: z.string().max(300).nullable() })),
  interviewerItems: rows(z.object({ id, label, projectId: id, amountCents: cents, dueDate: date, status: z.enum(["pendente", "em_lote", "paga_simulada"]), batchTitleId: id.nullable() })),
  fieldItems: rows(z.object({ id, projectId: id, description: label, categoryId: id, quantityHundredths: z.number().int().positive().max(1_000_000), unitCents: cents, amountCents: cents, status: z.enum(["pendente", "em_lote", "paga_simulada"]) })),
  fieldSheets: rows(z.object({ id, projectId: id, date, itemIds: rows(id), amountCents: cents, status: z.enum(["aberta", "aprovada_demo", "paga_simulada"]), titleId: id.nullable() })),
  bankTransactions: rows(z.object({ id, date, description: label, flow: z.enum(["saida", "entrada"]), amountCents: cents, originTitleId: id, originSettlementId: id, reconciled: z.boolean(), classification: z.string().max(100).nullable(), exceptionReason: z.string().max(300).nullable(), source: z.literal("simulado") })),
  closedPeriods: z.array(z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)).max(1200),
});

export function validatedDemoState(value: unknown): DemoState | null {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return null;
  const state = parsed.data;
  for (const items of [state.parties, state.categories, state.centers, state.projects, state.titles, state.provisions, state.interviewerItems, state.fieldItems, state.fieldSheets, state.bankTransactions]) {
    if (new Set(items.map(item => item.id)).size !== items.length) return null;
  }
  const projects = new Set(state.projects.map(item => item.id));
  const categories = new Set(state.categories.map(item => item.id));
  const centers = new Set(state.centers.map(item => item.id));
  const settlementIds = new Set<string>();
  const settlementTransactionIds = new Set<string>();
  if (state.projects.some(project => !state.parties.some(party => party.id === project.clientId && party.type === "cliente"))) return null;
  for (const title of state.titles) {
    if (!state.parties.some(party => party.id === title.partyId && party.type === (title.direction === "pagar" ? "fornecedor" : "cliente"))) return null;
    if (!categories.has(title.categoryId) || (title.projectId && !projects.has(title.projectId)) || (title.centerId && !centers.has(title.centerId))) return null;
    if (title.settlements.reduce((sum, item) => sum + item.amountCents, 0) > title.amountCents) return null;
    for (const settlement of title.settlements) {
      if (settlementIds.has(settlement.id) || settlementTransactionIds.has(settlement.bankTransactionId)) return null;
      settlementIds.add(settlement.id);
      settlementTransactionIds.add(settlement.bankTransactionId);
      const transaction = state.bankTransactions.find(item => item.id === settlement.bankTransactionId);
      if (!transaction || transaction.originTitleId !== title.id || transaction.originSettlementId !== settlement.id || transaction.amountCents !== settlement.amountCents || transaction.date !== settlement.date || transaction.flow !== (title.direction === "pagar" ? "saida" : "entrada")) return null;
    }
  }
  for (const tx of state.bankTransactions) {
    if (!state.titles.some(title => title.id === tx.originTitleId && title.settlements.some(settlement => settlement.id === tx.originSettlementId && settlement.bankTransactionId === tx.id))) return null;
  }
  for (const provision of state.provisions) {
    if (!projects.has(provision.projectId) || !categories.has(provision.categoryId) || (provision.titleId && !state.titles.some(title => title.id === provision.titleId))) return null;
  }
  if (state.interviewerItems.some(item => !projects.has(item.projectId) || (item.batchTitleId && !state.titles.some(title => title.id === item.batchTitleId)))) return null;
  for (const item of state.fieldItems) {
    const product = BigInt(item.quantityHundredths) * BigInt(item.unitCents);
    if (!projects.has(item.projectId) || !categories.has(item.categoryId) || Number((product + 50n) / 100n) !== item.amountCents) return null;
  }
  for (const sheet of state.fieldSheets) {
    if (!projects.has(sheet.projectId) || !sheet.itemIds.length || new Set(sheet.itemIds).size !== sheet.itemIds.length || (sheet.titleId && !state.titles.some(title => title.id === sheet.titleId))) return null;
    const items = sheet.itemIds.map(id => state.fieldItems.find(item => item.id === id && item.projectId === sheet.projectId));
    if (items.some(item => !item) || items.reduce((sum, item) => sum + (item?.amountCents ?? 0), 0) !== sheet.amountCents) return null;
  }
  return state;
}
