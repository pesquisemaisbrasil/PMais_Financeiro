import { validatedDemoState } from "./demoValidation";

export type DemoPartyType = "fornecedor" | "cliente";
export type DemoDirection = "pagar" | "receber";
export type DemoFlow = "saida" | "entrada";
export type DemoProjectStatus = "ativo" | "fechado";
export type DemoProvisionStatus = "prevista" | "substituida" | "cancelada";
export type DemoBatchStatus = "pendente" | "em_lote" | "paga_simulada";
export type DemoTitleStatus = "em_aberto" | "parcial" | "vencido" | "vence_hoje" | "a_vencer" | "liquidado_simulado";

export type DemoParty = { id: string; name: string; type: DemoPartyType; active: boolean };
export type DemoCategory = { id: string; name: string; type: "despesa" | "receita"; code: string; active: boolean };
export type DemoCostCenter = { id: string; name: string; code: string; active: boolean };
export type DemoProject = {
  id: string; code: string; name: string; clientId: string; budgetCents: number;
  progressPercent: number; status: DemoProjectStatus;
};
export type DemoSettlement = { id: string; date: string; amountCents: number; bankTransactionId: string };
export type DemoTitle = {
  id: string; direction: DemoDirection; description: string; partyId: string; projectId: string | null;
  categoryId: string; centerId?: string | null; issueDate: string; competenceDate: string; dueDate: string; amountCents: number;
  settlements: DemoSettlement[]; source: "manual" | "provision" | "interviewer" | "field";
  sourceId: string | null; fiscalDocument: "nao_aplicavel" | "aguardando_demo" | "demo_ok";
};
export type DemoProvision = {
  id: string; projectId: string; categoryId: string; description: string; amountCents: number;
  dueDate: string; status: DemoProvisionStatus; titleId: string | null; cancelReason: string | null;
};
export type DemoInterviewerItem = {
  id: string; label: string; projectId: string; amountCents: number; dueDate: string;
  status: DemoBatchStatus; batchTitleId: string | null;
};
export type DemoFieldItem = {
  id: string; projectId: string; description: string; categoryId: string;
  quantityHundredths: number; unitCents: number; amountCents: number;
  status: "pendente" | "em_lote" | "paga_simulada";
};
export type DemoFieldSheet = {
  id: string; projectId: string; date: string; itemIds: string[]; amountCents: number;
  status: "aberta" | "aprovada_demo" | "paga_simulada"; titleId: string | null;
};
export type DemoBankTransaction = {
  id: string; date: string; description: string; flow: DemoFlow; amountCents: number;
  originTitleId: string; originSettlementId: string; reconciled: boolean;
  classification: string | null; exceptionReason: string | null; source: "simulado";
};
export type DemoState = {
  version: 1;
  parties: DemoParty[];
  categories: DemoCategory[];
  centers: DemoCostCenter[];
  projects: DemoProject[];
  titles: DemoTitle[];
  provisions: DemoProvision[];
  interviewerItems: DemoInterviewerItem[];
  fieldItems: DemoFieldItem[];
  fieldSheets: DemoFieldSheet[];
  bankTransactions: DemoBankTransaction[];
  closedPeriods: string[];
};

const two = (n: number) => String(n).padStart(2, "0");
export function todayInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? "1970";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftDate(date: string, deltaDays: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + deltaDays, 12));
  return `${result.getUTCFullYear()}-${two(result.getUTCMonth() + 1)}-${two(result.getUTCDate())}`;
}
export function formatDemoDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}
export function formatBrl(cents: number): string {
  const safeCents = Number.isSafeInteger(cents) ? cents : 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(safeCents / 100);
}
export function parseBrlToCents(input: string): number | null {
  const text = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!text) return null;
  let whole = "";
  let fraction = "";
  if (text.includes(",")) {
    const parts = text.split(",");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return null;
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(parts[0])) return null;
    whole = parts[0].replace(/\./g, ""); fraction = parts[1].padEnd(2, "0");
  } else if (/^\d{1,3}(?:\.\d{3})+\.\d{1,2}$/.test(text)) {
    const lastDot = text.lastIndexOf("."); whole = text.slice(0, lastDot).replace(/\./g, ""); fraction = text.slice(lastDot + 1).padEnd(2, "0");
  } else if (/^\d+$/.test(text)) {
    whole = text;
  } else if (/^\d+\.\d{1,2}$/.test(text)) {
    const [amount, decimals = ""] = text.split("."); whole = amount; fraction = decimals.padEnd(2, "0");
  } else {
    return null;
  }
  if (!/^\d+$/.test(whole || "0")) return null;
  const cents = Number(whole || "0") * 100 + Number(fraction || "0");
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw new Error("Valor sintético fora do intervalo seguro.");
    total += value;
    if (!Number.isSafeInteger(total)) throw new Error("Total sintético fora do intervalo seguro.");
  }
  return total;
}
export function newDemoId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-demo-${suffix}`;
}
export function settledCents(title: DemoTitle): number {
  return sumCents(title.settlements.map(settlement => settlement.amountCents));
}
export function pendingCents(title: DemoTitle): number {
  return Math.max(0, title.amountCents - settledCents(title));
}
export function titleStatus(title: DemoTitle, today = todayInSaoPaulo()): DemoTitleStatus {
  if (pendingCents(title) === 0) return "liquidado_simulado";
  if (settledCents(title) > 0) return "parcial";
  if (title.dueDate < today) return "vencido";
  if (title.dueDate === today) return "vence_hoje";
  return "a_vencer";
}
export function projectById(state: DemoState, id: string | null | undefined): DemoProject | undefined {
  return id ? state.projects.find(item => item.id === id) : undefined;
}
export function partyById(state: DemoState, id: string | null | undefined): DemoParty | undefined {
  return id ? state.parties.find(item => item.id === id) : undefined;
}
export function categoryById(state: DemoState, id: string | null | undefined): DemoCategory | undefined {
  return id ? state.categories.find(item => item.id === id) : undefined;
}
export function createSeedDemoState(today = todayInSaoPaulo()): DemoState {
  const parties: DemoParty[] = [
    { id: "party-demo-provider-1", name: "DEMO — Serviços de Campo", type: "fornecedor", active: true },
    { id: "party-demo-provider-2", name: "DEMO — Tecnologia de Pesquisa", type: "fornecedor", active: true },
    { id: "party-demo-client-1", name: "DEMO — Cliente Horizonte", type: "cliente", active: true },
    { id: "party-demo-client-2", name: "DEMO — Cliente Varejo", type: "cliente", active: true },
  ];
  const categories: DemoCategory[] = [
    { id: "cat-demo-field", name: "DEMO — Equipe de campo", type: "despesa", code: "D-001", active: true },
    { id: "cat-demo-tech", name: "DEMO — Tecnologia", type: "despesa", code: "D-002", active: true },
    { id: "cat-demo-admin", name: "DEMO — Administração", type: "despesa", code: "D-003", active: true },
    { id: "cat-demo-revenue", name: "DEMO — Pesquisa de mercado", type: "receita", code: "R-001", active: true },
  ];
  const projects: DemoProject[] = [
    { id: "project-demo-1", code: "DEMO-001", name: "DEMO — Estudo Horizonte", clientId: "party-demo-client-1", budgetCents: 2_400_000, progressPercent: 64, status: "ativo" },
    { id: "project-demo-2", code: "DEMO-002", name: "DEMO — Pesquisa Varejo", clientId: "party-demo-client-2", budgetCents: 1_200_000, progressPercent: 32, status: "ativo" },
  ];
  const paidOutId = "bank-demo-initial-1";
  const paidInId = "bank-demo-initial-2";
  const titles: DemoTitle[] = [
    { id: "title-demo-1", direction: "pagar", description: "DEMO — Serviços de campo (parcial)", partyId: parties[0].id, projectId: projects[0].id, categoryId: categories[0].id, issueDate: shiftDate(today, -14), competenceDate: shiftDate(today, -8), dueDate: shiftDate(today, -3), amountCents: 185_000, settlements: [{ id: "settle-demo-1", date: shiftDate(today, -2), amountCents: 85_000, bankTransactionId: paidOutId }], source: "manual", sourceId: null, fiscalDocument: "nao_aplicavel" },
    { id: "title-demo-2", direction: "pagar", description: "DEMO — Licença de pesquisa", partyId: parties[1].id, projectId: projects[0].id, categoryId: categories[1].id, issueDate: shiftDate(today, -3), competenceDate: shiftDate(today, -2), dueDate: shiftDate(today, 5), amountCents: 64_900, settlements: [], source: "manual", sourceId: null, fiscalDocument: "demo_ok" },
    { id: "title-demo-3", direction: "receber", description: "DEMO — Projeto de pesquisa", partyId: parties[2].id, projectId: projects[0].id, categoryId: categories[3].id, issueDate: shiftDate(today, -20), competenceDate: shiftDate(today, -12), dueDate: shiftDate(today, 12), amountCents: 450_000, settlements: [{ id: "settle-demo-2", date: shiftDate(today, -4), amountCents: 120_000, bankTransactionId: paidInId }], source: "manual", sourceId: null, fiscalDocument: "nao_aplicavel" },
    { id: "title-demo-4", direction: "receber", description: "DEMO — Entrega fase 1", partyId: parties[3].id, projectId: projects[1].id, categoryId: categories[3].id, issueDate: shiftDate(today, -5), competenceDate: shiftDate(today, -4), dueDate: shiftDate(today, 8), amountCents: 240_000, settlements: [], source: "manual", sourceId: null, fiscalDocument: "nao_aplicavel" },
    { id: "title-demo-5", direction: "pagar", description: "DEMO — Material de campo", partyId: parties[0].id, projectId: projects[1].id, categoryId: categories[0].id, issueDate: shiftDate(today, -11), competenceDate: shiftDate(today, -9), dueDate: shiftDate(today, 2), amountCents: 92_500, settlements: [], source: "manual", sourceId: null, fiscalDocument: "aguardando_demo" },
  ];
  const bankTransactions: DemoBankTransaction[] = [
    { id: paidOutId, date: shiftDate(today, -2), description: "DEMO — Liquidação parcial de título", flow: "saida", amountCents: 85_000, originTitleId: titles[0].id, originSettlementId: "settle-demo-1", reconciled: false, classification: "pagamento", exceptionReason: null, source: "simulado" },
    { id: paidInId, date: shiftDate(today, -4), description: "DEMO — Recebimento parcial de título", flow: "entrada", amountCents: 120_000, originTitleId: titles[2].id, originSettlementId: "settle-demo-2", reconciled: false, classification: "recebimento", exceptionReason: null, source: "simulado" },
  ];
  return {
    version: 1,
    parties, categories, projects, titles,
    centers: [
      { id: "center-demo-1", name: "DEMO — Operações de campo", code: "DEMO-CC01", active: true },
      { id: "center-demo-2", name: "DEMO — Tecnologia", code: "DEMO-CC02", active: true },
    ],
    provisions: [
      { id: "provision-demo-1", projectId: projects[0].id, categoryId: categories[0].id, description: "DEMO — Próximo ciclo de campo", amountCents: 280_000, dueDate: shiftDate(today, 18), status: "prevista", titleId: null, cancelReason: null },
      { id: "provision-demo-2", projectId: projects[1].id, categoryId: categories[1].id, description: "DEMO — Ferramenta do estudo", amountCents: 75_000, dueDate: shiftDate(today, 22), status: "prevista", titleId: null, cancelReason: null },
    ],
    interviewerItems: [
      { id: "interviewer-demo-1", label: "Entrevistador DEMO 01", projectId: projects[0].id, amountCents: 8_500, dueDate: shiftDate(today, 2), status: "pendente", batchTitleId: null },
      { id: "interviewer-demo-2", label: "Entrevistador DEMO 02", projectId: projects[0].id, amountCents: 8_500, dueDate: shiftDate(today, 2), status: "pendente", batchTitleId: null },
      { id: "interviewer-demo-3", label: "Entrevistador DEMO 03", projectId: projects[1].id, amountCents: 10_000, dueDate: shiftDate(today, 4), status: "pendente", batchTitleId: null },
    ],
    fieldItems: [
      { id: "field-demo-1", projectId: projects[0].id, description: "DEMO — Entrevista de campo", categoryId: categories[0].id, quantityHundredths: 2_000, unitCents: 3_000, amountCents: 60_000, status: "pendente" },
      { id: "field-demo-2", projectId: projects[0].id, description: "DEMO — Revisão de qualidade", categoryId: categories[0].id, quantityHundredths: 500, unitCents: 4_000, amountCents: 20_000, status: "pendente" },
      { id: "field-demo-3", projectId: projects[1].id, description: "DEMO — Recrutamento", categoryId: categories[0].id, quantityHundredths: 1_000, unitCents: 2_500, amountCents: 25_000, status: "pendente" },
    ],
    fieldSheets: [], bankTransactions, closedPeriods: [],
  };
}

export function isDemoState(value: unknown): value is DemoState {
  return validatedDemoState(value) !== null;
}

export function titleDemoAmount(title: DemoTitle): number {
  return title.amountCents;
}
