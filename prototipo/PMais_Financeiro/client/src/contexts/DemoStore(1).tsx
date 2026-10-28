import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import {
  categoryById, createSeedDemoState, isDemoState, newDemoId, pendingCents, projectById,
  settledCents, sumCents, todayInSaoPaulo,
  type DemoBankTransaction, type DemoCategory, type DemoCostCenter, type DemoDirection, type DemoFieldSheet, type DemoParty, type DemoProject,
  type DemoProvision, type DemoState, type DemoTitle,
} from "@/lib/demoModel";
import { isDemoDate, validatedDemoState } from "@/lib/demoValidation";

const STORAGE_KEY = "pmaisfinanceiro:demo:v1";
type Result = { ok: true } | { ok: false; message: string };
const ok: Result = { ok: true };
const fail = (message: string): Result => ({ ok: false, message });

export type PartyInput = { name: string; type: DemoParty["type"] };
export type CategoryInput = { name: string; type: DemoCategory["type"]; code: string };
export type ProjectInput = { code: string; name: string; clientId: string; budgetCents: number };
export type TitleInput = {
  direction: DemoDirection; description: string; partyId: string; projectId: string | null;
  categoryId: string; centerId?: string | null; issueDate: string; competenceDate: string; dueDate: string;
  amountCents: number; source?: DemoTitle["source"]; sourceId?: string | null;
};
export type ProvisionInput = { projectId: string; categoryId: string; description: string; amountCents: number; dueDate: string };
export type FieldItemInput = { projectId: string; categoryId: string; description: string; quantityHundredths: number; unitCents: number };

function getStoredDemo(): DemoState {
  if (typeof window === "undefined") return createSeedDemoState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const validated = validatedDemoState(parsed);
      if (validated) return validated;
    }
  } catch { /* Browser storage may be unavailable; the demonstration remains usable in memory. */ }
  return createSeedDemoState();
}
function withDemoLabel(value: string): string {
  const cleaned = value.trim().replace(/^DEMO\s*[—:-]\s*/i, "").slice(0, 160);
  return cleaned ? `DEMO — ${cleaned}` : "DEMO — Registro demonstrativo";
}
function isSafeCents(value: number): boolean { return Number.isSafeInteger(value) && value > 0 && value <= 900_000_000_000; }
function titleDatesOpen(state: DemoState, title: DemoTitle): boolean {
  return [title.issueDate, title.competenceDate, title.dueDate].every(date => isDemoDate(date) && !state.closedPeriods.includes(date.slice(0, 7)));
}
function appendSettlement(state: DemoState, titleId: string, amountCents: number, date: string, settlementId: string, transactionId: string): DemoState {
  const title = state.titles.find(item => item.id === titleId);
  if (!title || !isDemoDate(date) || title.fiscalDocument === "aguardando_demo" || !isSafeCents(amountCents) || amountCents > pendingCents(title) || state.closedPeriods.includes(date.slice(0, 7))) return state;
  if ((title.source === "field" || title.source === "interviewer") && amountCents !== pendingCents(title)) return state;
  const settlement = { id: settlementId, date, amountCents, bankTransactionId: transactionId };
  const transaction: DemoBankTransaction = {
    id: transactionId, date,
    description: withDemoLabel(`${title.direction === "pagar" ? "Pagamento" : "Recebimento"} simulado • ${title.description.replace(/^DEMO\s*[—:-]\s*/i, "")}`),
    flow: title.direction === "pagar" ? "saida" : "entrada",
    amountCents, originTitleId: title.id, originSettlementId: settlement.id,
    reconciled: false, classification: title.direction === "pagar" ? "pagamento" : "recebimento",
    exceptionReason: null, source: "simulado" as const,
  };
  const fullySettled = settledCents(title) + amountCents === title.amountCents;
  const sheet = state.fieldSheets.find(item => item.titleId === titleId);
  return {
    ...state,
    titles: state.titles.map(item => item.id === titleId ? { ...item, settlements: [...item.settlements, settlement] } : item),
    bankTransactions: [...state.bankTransactions, transaction],
    interviewerItems: fullySettled ? state.interviewerItems.map(item => item.batchTitleId === titleId ? { ...item, status: "paga_simulada" } : item) : state.interviewerItems,
    fieldSheets: fullySettled ? state.fieldSheets.map(item => item.titleId === titleId ? { ...item, status: "paga_simulada" } : item) : state.fieldSheets,
    fieldItems: fullySettled && sheet ? state.fieldItems.map(item => sheet.itemIds.includes(item.id) ? { ...item, status: "paga_simulada" } : item) : state.fieldItems,
  };
}

type Action =
  | { type: "RESET"; state: DemoState }
  | { type: "ADD_PARTY"; party: DemoParty }
  | { type: "TOGGLE_PARTY"; id: string }
  | { type: "RENAME_PARTY"; id: string; name: string }
  | { type: "ADD_CATEGORY"; category: DemoCategory }
  | { type: "ADD_CENTER"; center: DemoCostCenter }
  | { type: "TOGGLE_CENTER"; id: string }
  | { type: "ADD_PROJECT"; project: DemoProject }
  | { type: "PROJECT_STATUS"; id: string; status: DemoProject["status"] }
  | { type: "PROJECT_BUDGET"; id: string; budgetCents: number }
  | { type: "ADD_TITLE"; title: DemoTitle }
  | { type: "RESOLVE_DOCUMENT"; titleId: string }
  | { type: "SETTLE_TITLE"; titleId: string; amountCents: number; date: string; settlementId: string; transactionId: string }
  | { type: "ADD_PROVISION"; provision: DemoProvision }
  | { type: "CONVERT_PROVISION"; provisionId: string; title: DemoTitle }
  | { type: "CANCEL_PROVISION"; provisionId: string; reason: string }
  | { type: "CREATE_INTERVIEW_BATCH"; title: DemoTitle; itemIds: string[] }
  | { type: "PAY_INTERVIEW_BATCH"; titleId: string; date: string; settlementId: string; transactionId: string }
  | { type: "ADD_FIELD_ITEM"; item: DemoState["fieldItems"][number] }
  | { type: "CREATE_FIELD_SHEET"; sheet: DemoFieldSheet }
  | { type: "APPROVE_FIELD_SHEET"; sheetId: string; title: DemoTitle }
  | { type: "PAY_FIELD_SHEET"; sheetId: string; date: string; settlementId: string; transactionId: string }
  | { type: "CANCEL_FIELD_SHEET"; sheetId: string }
  | { type: "RECONCILE"; transactionId: string; classification: string }
  | { type: "EXCEPTION"; transactionId: string; classification: string; reason: string }
  | { type: "CLOSE_PERIOD"; period: string }
  | { type: "REOPEN_PERIOD"; period: string };

export function demoReducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "RESET": return action.state;
    case "ADD_PARTY": return { ...state, parties: [...state.parties, action.party] };
    case "TOGGLE_PARTY": return { ...state, parties: state.parties.map(item => item.id === action.id ? { ...item, active: !item.active } : item) };
    case "RENAME_PARTY": return { ...state, parties: state.parties.map(item => item.id === action.id ? { ...item, name: action.name } : item) };
    case "ADD_CATEGORY": return { ...state, categories: [...state.categories, action.category] };
    case "ADD_CENTER": return { ...state, centers: [...state.centers, action.center] };
    case "TOGGLE_CENTER": return { ...state, centers: state.centers.map(item => item.id === action.id ? { ...item, active: !item.active } : item) };
    case "ADD_PROJECT": return { ...state, projects: [...state.projects, action.project] };
    case "PROJECT_STATUS": return { ...state, projects: state.projects.map(project => project.id === action.id ? { ...project, status: action.status } : project) };
    case "PROJECT_BUDGET": return { ...state, projects: state.projects.map(project => project.id === action.id ? { ...project, budgetCents: action.budgetCents } : project) };
    case "ADD_TITLE": return !titleDatesOpen(state, action.title) ? state : { ...state, titles: [...state.titles, action.title] };
    case "RESOLVE_DOCUMENT": return { ...state, titles: state.titles.map(item => item.id === action.titleId ? { ...item, fiscalDocument: "demo_ok" } : item) };
    case "SETTLE_TITLE": return appendSettlement(state, action.titleId, action.amountCents, action.date, action.settlementId, action.transactionId);
    case "ADD_PROVISION": return state.closedPeriods.includes(action.provision.dueDate.slice(0, 7)) ? state : { ...state, provisions: [...state.provisions, action.provision] };
    case "CONVERT_PROVISION": {
      const provision = state.provisions.find(item => item.id === action.provisionId);
      if (!provision || provision.status !== "prevista" || !titleDatesOpen(state, action.title)) return state;
      return { ...state, provisions: state.provisions.map(item => item.id === provision.id ? { ...item, status: "substituida", titleId: action.title.id } : item), titles: [...state.titles, action.title] };
    }
    case "CANCEL_PROVISION": return { ...state, provisions: state.provisions.map(item => item.id === action.provisionId && item.status === "prevista" && !state.closedPeriods.includes(item.dueDate.slice(0, 7)) ? { ...item, status: "cancelada", cancelReason: action.reason.trim() } : item) };
    case "CREATE_INTERVIEW_BATCH": {
      const pending = state.interviewerItems.filter(item => action.itemIds.includes(item.id) && item.status === "pendente");
      if (!pending.length || pending.length !== action.itemIds.length || !titleDatesOpen(state, action.title)) return state;
      return {
        ...state, titles: [...state.titles, action.title],
        interviewerItems: state.interviewerItems.map(item => action.itemIds.includes(item.id) ? { ...item, status: "em_lote", batchTitleId: action.title.id } : item),
      };
    }
    case "PAY_INTERVIEW_BATCH": {
      const settled = appendSettlement(state, action.titleId, state.titles.find(t => t.id === action.titleId)?.amountCents ?? 0, action.date, action.settlementId, action.transactionId);
      if (settled === state) return state;
      return { ...settled, interviewerItems: settled.interviewerItems.map(item => item.batchTitleId === action.titleId ? { ...item, status: "paga_simulada" } : item) };
    }
    case "ADD_FIELD_ITEM": return { ...state, fieldItems: [...state.fieldItems, action.item] };
    case "CREATE_FIELD_SHEET": {
      const eligible = action.sheet.itemIds.every(id => state.fieldItems.some(item => item.id === id && item.status === "pendente"));
      if (!eligible || !action.sheet.itemIds.length || state.closedPeriods.includes(action.sheet.date.slice(0, 7))) return state;
      return {
        ...state,
        fieldSheets: [...state.fieldSheets, action.sheet],
        fieldItems: state.fieldItems.map(item => action.sheet.itemIds.includes(item.id) ? { ...item, status: "em_lote" } : item),
      };
    }
    case "APPROVE_FIELD_SHEET": {
      const sheet = state.fieldSheets.find(item => item.id === action.sheetId);
      if (!sheet || sheet.status !== "aberta" || !titleDatesOpen(state, action.title)) return state;
      return { ...state, fieldSheets: state.fieldSheets.map(item => item.id === action.sheetId ? { ...item, status: "aprovada_demo", titleId: action.title.id } : item), titles: [...state.titles, action.title] };
    }
    case "PAY_FIELD_SHEET": {
      const sheet = state.fieldSheets.find(item => item.id === action.sheetId);
      if (!sheet?.titleId || sheet.status !== "aprovada_demo") return state;
      const settled = appendSettlement(state, sheet.titleId, state.titles.find(t => t.id === sheet.titleId)?.amountCents ?? 0, action.date, action.settlementId, action.transactionId);
      if (settled === state) return state;
      return {
        ...settled,
        fieldSheets: settled.fieldSheets.map(item => item.id === action.sheetId ? { ...item, status: "paga_simulada" } : item),
        fieldItems: settled.fieldItems.map(item => sheet.itemIds.includes(item.id) ? { ...item, status: "paga_simulada" } : item),
      };
    }
    case "CANCEL_FIELD_SHEET": {
      const sheet = state.fieldSheets.find(item => item.id === action.sheetId);
      if (!sheet || sheet.status !== "aberta" || state.closedPeriods.includes(sheet.date.slice(0, 7))) return state;
      return {
        ...state,
        fieldSheets: state.fieldSheets.filter(item => item.id !== action.sheetId),
        fieldItems: state.fieldItems.map(item => sheet.itemIds.includes(item.id) ? { ...item, status: "pendente" } : item),
      };
    }
    case "RECONCILE": return { ...state, bankTransactions: state.bankTransactions.map(item => item.id === action.transactionId && !item.reconciled && !state.closedPeriods.includes(item.date.slice(0, 7)) ? { ...item, reconciled: true, classification: action.classification, exceptionReason: null } : item) };
    case "EXCEPTION": return { ...state, bankTransactions: state.bankTransactions.map(item => item.id === action.transactionId && !item.reconciled && !state.closedPeriods.includes(item.date.slice(0, 7)) ? { ...item, reconciled: true, classification: action.classification, exceptionReason: action.reason.trim() } : item) };
    case "CLOSE_PERIOD": {
      const pending = state.bankTransactions.some(item => item.date.startsWith(action.period) && (!item.reconciled || !item.classification));
      if (pending || state.closedPeriods.includes(action.period)) return state;
      return { ...state, closedPeriods: [...state.closedPeriods, action.period].sort() };
    }
    case "REOPEN_PERIOD": return { ...state, closedPeriods: state.closedPeriods.filter(period => period !== action.period) };
  }
}

export type DemoStore = {
  state: DemoState;
  persistenceError: string | null;
  resetDemo(): void;
  addParty(input: PartyInput): Result;
  toggleParty(id: string): void;
  renameParty(id: string, name: string): Result;
  addCategory(input: CategoryInput): Result;
  addCenter(input: { name: string; code: string }): Result;
  toggleCenter(id: string): void;
  addProject(input: ProjectInput): Result;
  setProjectStatus(id: string, status: DemoProject["status"]): void;
  setProjectBudget(id: string, budgetCents: number): Result;
  addTitle(input: TitleInput): Result;
  resolveDemoDocument(id: string): Result;
  settleTitle(id: string, amountCents: number, date: string): Result;
  addProvision(input: ProvisionInput): Result;
  convertProvision(id: string, partyId: string): Result;
  cancelProvision(id: string, reason: string): Result;
  createInterviewerBatch(projectId: string, itemIds: string[], dueDate: string): Result;
  payInterviewerBatch(titleId: string, date: string): Result;
  addFieldItem(input: FieldItemInput): Result;
  createFieldSheet(projectId: string, date: string): Result;
  approveFieldSheet(sheetId: string): Result;
  payFieldSheet(sheetId: string, date: string): Result;
  cancelFieldSheet(sheetId: string): Result;
  reconcileTransaction(id: string, classification: string): Result;
  markTransactionException(id: string, classification: string, reason: string): Result;
  closePeriod(period: string): Result;
  reopenPeriod(period: string, reason: string): Result;
};

const DemoContext = createContext<DemoStore | null>(null);
export function createDemoStore(state: DemoState, dispatch: (action: Action) => void, persistenceError: string | null = null): DemoStore {
    const commit = (action: Action, validation?: string): Result => {
      if (validation) return fail(validation);
      dispatch(action); return ok;
    };
    const activeParty = (id: string, type: DemoParty["type"]) => state.parties.some(p => p.id === id && p.active && p.type === type);
    const activeCategory = (id: string, type: DemoCategory["type"]) => state.categories.some(c => c.id === id && c.active && c.type === type);
    const activeProject = (id: string | null) => !id || state.projects.some(p => p.id === id && p.status === "ativo");
    return {
      state, persistenceError,
      resetDemo: () => dispatch({ type: "RESET", state: createSeedDemoState() }),
      addParty: input => {
        if (!input.name.trim()) return fail("Informe um nome demonstrativo.");
        dispatch({ type: "ADD_PARTY", party: { id: newDemoId("party"), name: withDemoLabel(input.name), type: input.type, active: true } }); return ok;
      },
      toggleParty: id => dispatch({ type: "TOGGLE_PARTY", id }),
      renameParty: (id, name) => {
        if (!state.parties.some(item => item.id === id) || !name.trim() || name.trim().length > 160) return fail("Selecione um cadastro DEMO e informe nome de até 160 caracteres.");
        dispatch({ type: "RENAME_PARTY", id, name: withDemoLabel(name) }); return ok;
      },
      addCategory: input => {
        if (!input.name.trim() || !input.code.trim()) return fail("Informe nome e código sintéticos.");
        const code = `DEMO-${input.code.trim().replace(/^DEMO-/i, "").toUpperCase()}`;
        if (state.categories.some(c => c.code.toLowerCase() === code.toLowerCase())) return fail("Já existe uma categoria demo com esse código.");
        dispatch({ type: "ADD_CATEGORY", category: { id: newDemoId("category"), name: withDemoLabel(input.name), type: input.type, code, active: true } }); return ok;
      },
      addCenter: input => {
        if (!input.name.trim() || !input.code.trim()) return fail("Informe nome e código do centro DEMO.");
        const code = `DEMO-${input.code.trim().replace(/^DEMO-/i, "").toUpperCase()}`;
        if (state.centers.some(c => c.code.toLowerCase() === code.toLowerCase())) return fail("Já existe um centro DEMO com esse código.");
        dispatch({ type: "ADD_CENTER", center: { id: newDemoId("center"), name: withDemoLabel(input.name), code, active: true } }); return ok;
      },
      toggleCenter: id => dispatch({ type: "TOGGLE_CENTER", id }),
      addProject: input => {
        if (!input.name.trim() || !input.code.trim() || !activeParty(input.clientId, "cliente")) return fail("Selecione um cliente DEMO ativo e informe nome/código.");
        if (!isSafeCents(input.budgetCents)) return fail("Informe um orçamento sintético maior que zero.");
        const code = `DEMO-${input.code.trim().replace(/^DEMO-/i, "").toUpperCase()}`;
        if (state.projects.some(p => p.code.toLowerCase() === code.toLowerCase())) return fail("Já existe um projeto DEMO com esse código.");
        dispatch({ type: "ADD_PROJECT", project: { id: newDemoId("project"), code, name: withDemoLabel(input.name), clientId: input.clientId, budgetCents: input.budgetCents, progressPercent: 0, status: "ativo" } }); return ok;
      },
      setProjectStatus: (id, status) => dispatch({ type: "PROJECT_STATUS", id, status }),
      setProjectBudget: (id, budgetCents) => {
        if (!isSafeCents(budgetCents) || !projectById(state, id)) return fail("Informe um valor DEMO válido para um projeto ativo.");
        dispatch({ type: "PROJECT_BUDGET", id, budgetCents }); return ok;
      },
      addTitle: input => {
        if (![input.issueDate, input.competenceDate, input.dueDate].every(isDemoDate)) return fail("Informe datas válidas para o título DEMO.");
        if ([input.issueDate, input.competenceDate, input.dueDate].some(date => state.closedPeriods.includes(date.slice(0, 7)))) return fail("Uma das datas pertence a período DEMO fechado.");
        const expectedPartyType = input.direction === "pagar" ? "fornecedor" : "cliente";
        const expectedCategoryType = input.direction === "pagar" ? "despesa" : "receita";
        if (!input.description.trim() || !activeParty(input.partyId, expectedPartyType) || !activeCategory(input.categoryId, expectedCategoryType)) return fail("Selecione contraparte e categoria DEMO ativos e preencha a descrição.");
        if (!activeProject(input.projectId)) return fail("O projeto DEMO precisa estar ativo.");
        if (!isSafeCents(input.amountCents)) return fail("Informe um valor sintético maior que zero.");
        if (input.dueDate.slice(0, 7) && state.closedPeriods.includes(input.dueDate.slice(0, 7))) return fail("O período demo está fechado; reabra-o primeiro.");
        const centerId = input.centerId ?? state.centers.find(item => item.active)?.id ?? null;
        if (centerId && !state.centers.some(item => item.id === centerId && item.active)) return fail("Selecione um centro de custo DEMO ativo.");
        const title: DemoTitle = { ...input, centerId, id: newDemoId("title"), description: withDemoLabel(input.description), source: input.source ?? "manual", sourceId: input.sourceId ?? null, fiscalDocument: "nao_aplicavel", settlements: [] };
        dispatch({ type: "ADD_TITLE", title }); return ok;
      },
      resolveDemoDocument: id => {
        if (!state.titles.some(item => item.id === id && item.fiscalDocument === "aguardando_demo")) return fail("Este título não tem pendência documental DEMO.");
        dispatch({ type: "RESOLVE_DOCUMENT", titleId: id }); return ok;
      },
      settleTitle: (id, amountCents, date) => {
        const title = state.titles.find(item => item.id === id);
        if (!isDemoDate(date)) return fail("Informe uma data válida para a simulação.");
        if (title?.fiscalDocument === "aguardando_demo") return fail("Resolva a pendência documental sintética antes de liquidar o título DEMO.");
        if (title && (title.source === "field" || title.source === "interviewer") && amountCents !== pendingCents(title)) return fail("Um lote/folha DEMO só pode ser liquidado pela soma exata total.");
        if (!title || !isSafeCents(amountCents) || amountCents > pendingCents(title)) return fail("O valor deve ser positivo e não pode exceder o saldo demo pendente.");
        if (state.closedPeriods.includes(date.slice(0, 7))) return fail("O período demo está fechado; reabra-o primeiro.");
        dispatch({ type: "SETTLE_TITLE", titleId: id, amountCents, date, settlementId: newDemoId("settlement"), transactionId: newDemoId("bank") }); return ok;
      },
      addProvision: input => {
        if (!isDemoDate(input.dueDate)) return fail("Informe uma data válida para a provisão DEMO.");
        if (!projectById(state, input.projectId) || !activeProject(input.projectId) || !activeCategory(input.categoryId, "despesa")) return fail("Selecione projeto e categoria DEMO ativos.");
        if (!input.description.trim() || !isSafeCents(input.amountCents)) return fail("Informe descrição e valor sintético positivo.");
        if (state.closedPeriods.includes(input.dueDate.slice(0, 7))) return fail("O período demo está fechado.");
        const provision: DemoProvision = { id: newDemoId("provision"), projectId: input.projectId, categoryId: input.categoryId, description: withDemoLabel(input.description), amountCents: input.amountCents, dueDate: input.dueDate, status: "prevista", titleId: null, cancelReason: null };
        dispatch({ type: "ADD_PROVISION", provision }); return ok;
      },
      convertProvision: (id, partyId) => {
        if (state.closedPeriods.includes(todayInSaoPaulo().slice(0, 7))) return fail("A competência de hoje pertence a período DEMO fechado.");
        const provision = state.provisions.find(item => item.id === id && item.status === "prevista");
        if (provision && !activeProject(provision.projectId)) return fail("Projeto DEMO fechado não aceita conversão monetária.");
        if (!provision || !activeParty(partyId, "fornecedor")) return fail("Selecione uma provisão prevista e um fornecedor DEMO ativo.");
        if (state.closedPeriods.includes(provision.dueDate.slice(0, 7))) return fail("O período demo está fechado.");
        const date = todayInSaoPaulo();
        const title: DemoTitle = { id: newDemoId("title"), direction: "pagar", description: provision.description, partyId, projectId: provision.projectId, categoryId: provision.categoryId, issueDate: date, competenceDate: date, dueDate: provision.dueDate, amountCents: provision.amountCents, settlements: [], source: "provision", sourceId: provision.id, fiscalDocument: "nao_aplicavel" };
        dispatch({ type: "CONVERT_PROVISION", provisionId: id, title }); return ok;
      },
      cancelProvision: (id, reason) => {
        const item = state.provisions.find(p => p.id === id);
        if (item && state.closedPeriods.includes(item.dueDate.slice(0, 7))) return fail("O período da provisão DEMO está fechado.");
        if (!reason.trim()) return fail("Registre um motivo demonstrativo para cancelar.");
        if (!state.provisions.some(item => item.id === id && item.status === "prevista")) return fail("Somente provisão ainda prevista pode ser cancelada.");
        dispatch({ type: "CANCEL_PROVISION", provisionId: id, reason: reason.trim() }); return ok;
      },
      createInterviewerBatch: (projectId, itemIds, dueDate) => {
        if (state.closedPeriods.includes(todayInSaoPaulo().slice(0, 7))) return fail("A competência de hoje pertence a período DEMO fechado.");
        if (!isDemoDate(dueDate) || new Set(itemIds).size !== itemIds.length) return fail("Data inválida ou itens repetidos no lote DEMO.");
        const selected = state.interviewerItems.filter(item => itemIds.includes(item.id) && item.status === "pendente" && item.projectId === projectId);
        if (!selected.length || selected.length !== itemIds.length) return fail("Selecione apenas itens demo pendentes do mesmo projeto.");
        if (!activeProject(projectId)) return fail("Projeto DEMO inativo não recebe novo lote.");
        if (state.closedPeriods.includes(dueDate.slice(0, 7))) return fail("O período demo está fechado.");
        const party = state.parties.find(p => p.type === "fornecedor" && p.active);
        const category = state.categories.find(c => c.id === "cat-demo-field" && c.active) ?? state.categories.find(c => c.type === "despesa" && c.active);
        if (!party || !category) return fail("Cadastre uma contraparte e categoria de despesa DEMO antes de criar o lote.");
        const amountCents = sumCents(selected.map(item => item.amountCents));
        const id = newDemoId("title");
        const title: DemoTitle = { id, direction: "pagar", description: withDemoLabel("Lote de entrevistadores"), partyId: party.id, projectId, categoryId: category.id, issueDate: todayInSaoPaulo(), competenceDate: todayInSaoPaulo(), dueDate, amountCents, settlements: [], source: "interviewer", sourceId: id, fiscalDocument: "nao_aplicavel" };
        dispatch({ type: "CREATE_INTERVIEW_BATCH", title, itemIds }); return ok;
      },
      payInterviewerBatch: (titleId, date) => {
        if (!isDemoDate(date)) return fail("Informe uma data válida para o pagamento simulado.");
        const title = state.titles.find(item => item.id === titleId && item.source === "interviewer");
        const items = state.interviewerItems.filter(item => item.batchTitleId === titleId && item.status === "em_lote");
        if (!title || !items.length || pendingCents(title) !== title.amountCents || sumCents(items.map(item => item.amountCents)) !== title.amountCents) return fail("O lote precisa fechar exatamente com a soma dos itens demo e não pode ter sido liquidado.");
        if (state.closedPeriods.includes(date.slice(0, 7))) return fail("O período demo está fechado.");
        dispatch({ type: "PAY_INTERVIEW_BATCH", titleId, date, settlementId: newDemoId("settlement"), transactionId: newDemoId("bank") }); return ok;
      },
      addFieldItem: input => {
        if (!activeProject(input.projectId) || !activeCategory(input.categoryId, "despesa")) return fail("Selecione projeto e categoria de despesa DEMO ativos.");
        if (!input.description.trim() || !Number.isSafeInteger(input.quantityHundredths) || input.quantityHundredths <= 0 || !isSafeCents(input.unitCents)) return fail("Informe item DEMO, quantidade e valor unitário válidos.");
        const scaledProduct = BigInt(input.quantityHundredths) * BigInt(input.unitCents);
        const amountCents = Number((scaledProduct + 50n) / 100n);
        if (!isSafeCents(amountCents)) return fail("Total do item DEMO fora do intervalo válido.");
        dispatch({ type: "ADD_FIELD_ITEM", item: { id: newDemoId("field"), projectId: input.projectId, description: withDemoLabel(input.description), categoryId: input.categoryId, quantityHundredths: input.quantityHundredths, unitCents: input.unitCents, amountCents, status: "pendente" } }); return ok;
      },
      createFieldSheet: (projectId, date) => {
        if (!isDemoDate(date)) return fail("Informe uma data válida para o ciclo DEMO.");
        if (!activeProject(projectId)) return fail("Projeto DEMO inativo não aceita nova folha.");
        if (state.closedPeriods.includes(date.slice(0, 7))) return fail("O período demo está fechado.");
        const items = state.fieldItems.filter(item => item.projectId === projectId && item.status === "pendente");
        if (!items.length) return fail("Não há itens DEMO pendentes para este projeto.");
        const sheet: DemoFieldSheet = { id: newDemoId("sheet"), projectId, date, itemIds: items.map(item => item.id), amountCents: sumCents(items.map(item => item.amountCents)), status: "aberta", titleId: null };
        dispatch({ type: "CREATE_FIELD_SHEET", sheet }); return ok;
      },
      approveFieldSheet: sheetId => {
        if (state.closedPeriods.includes(todayInSaoPaulo().slice(0, 7))) return fail("A competência de hoje pertence a período DEMO fechado.");
        const sheet = state.fieldSheets.find(item => item.id === sheetId && item.status === "aberta");
        if (!sheet) return fail("Somente uma folha demo aberta pode ser aprovada.");
        if (state.closedPeriods.includes(sheet.date.slice(0, 7))) return fail("O período da folha DEMO está fechado.");
        const project = projectById(state, sheet.projectId);
        const party = state.parties.find(p => p.type === "fornecedor" && p.active);
        const category = state.categories.find(c => c.id === "cat-demo-field" && c.active) ?? state.categories.find(c => c.type === "despesa" && c.active);
        if (!project || project.status !== "ativo" || !party || !category) return fail("Projeto, fornecedor ou categoria demo está indisponível.");
        if (!sheet.amountCents || sumCents(sheet.itemIds.map(id => state.fieldItems.find(item => item.id === id)?.amountCents ?? 0)) !== sheet.amountCents) return fail("A soma dos itens não fecha com a folha DEMO.");
        const titleId = newDemoId("title");
        const title: DemoTitle = { id: titleId, direction: "pagar", description: withDemoLabel(`Folha de campo ${project.code}`), partyId: party.id, projectId: sheet.projectId, categoryId: category.id, issueDate: todayInSaoPaulo(), competenceDate: todayInSaoPaulo(), dueDate: sheet.date, amountCents: sheet.amountCents, settlements: [], source: "field", sourceId: sheet.id, fiscalDocument: "nao_aplicavel" };
        dispatch({ type: "APPROVE_FIELD_SHEET", sheetId, title }); return ok;
      },
      payFieldSheet: (sheetId, date) => {
        if (!isDemoDate(date)) return fail("Informe uma data válida para o pagamento simulado.");
        const sheet = state.fieldSheets.find(item => item.id === sheetId && item.status === "aprovada_demo");
        const title = sheet?.titleId ? state.titles.find(item => item.id === sheet.titleId) : null;
        if (!sheet || !title || !sheet.itemIds.length || sumCents(sheet.itemIds.map(id => state.fieldItems.find(item => item.id === id)?.amountCents ?? 0)) !== title.amountCents) return fail("Folha demo não aprovada ou soma de itens divergente.");
        if (state.closedPeriods.includes(date.slice(0, 7))) return fail("O período demo está fechado.");
        dispatch({ type: "PAY_FIELD_SHEET", sheetId, date, settlementId: newDemoId("settlement"), transactionId: newDemoId("bank") }); return ok;
      },
      cancelFieldSheet: sheetId => {
        const sheet = state.fieldSheets.find(item => item.id === sheetId);
        if (sheet && state.closedPeriods.includes(sheet.date.slice(0, 7))) return fail("O período da folha DEMO está fechado.");
        if (!state.fieldSheets.some(sheet => sheet.id === sheetId && sheet.status === "aberta")) return fail("Somente uma folha aberta pode ser cancelada.");
        dispatch({ type: "CANCEL_FIELD_SHEET", sheetId }); return ok;
      },
      reconcileTransaction: (id, classification) => {
        const tx = state.bankTransactions.find(item => item.id === id);
        if (tx && state.closedPeriods.includes(tx.date.slice(0, 7))) return fail("O período do movimento DEMO está fechado.");
        if (!tx || tx.reconciled || !classification.trim()) return fail("Selecione uma transação aberta e sua classificação.");
        dispatch({ type: "RECONCILE", transactionId: id, classification: withDemoLabel(classification) }); return ok;
      },
      markTransactionException: (id, classification, reason) => {
        const tx = state.bankTransactions.find(item => item.id === id);
        if (tx && state.closedPeriods.includes(tx.date.slice(0, 7))) return fail("O período do movimento DEMO está fechado.");
        if (!tx || tx.reconciled || !classification.trim() || !reason.trim()) return fail("Exceção DEMO exige transação aberta, classificação e motivo.");
        dispatch({ type: "EXCEPTION", transactionId: id, classification: withDemoLabel(classification), reason: withDemoLabel(reason) }); return ok;
      },
      closePeriod: period => {
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) return fail("Selecione um mês DEMO válido.");
        const pending = state.bankTransactions.some(item => item.date.startsWith(period) && (!item.reconciled || !item.classification));
        if (pending) return fail("Classifique ou concilie todas as linhas DEMO do mês antes de fechar.");
        if (state.closedPeriods.includes(period)) return fail("Esse período DEMO já está fechado.");
        dispatch({ type: "CLOSE_PERIOD", period }); return ok;
      },
      reopenPeriod: (period, reason) => {
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) return fail("Selecione um mês DEMO válido.");
        if (!state.closedPeriods.includes(period)) return fail("O período DEMO selecionado não está fechado.");
        if (!reason.trim()) return fail("Informe o motivo demonstrativo da reabertura.");
        dispatch({ type: "REOPEN_PERIOD", period }); return ok;
      },
    };

}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, undefined, getStoredDemo);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setPersistenceError(null);
    } catch {
      setPersistenceError("O navegador não conseguiu guardar este estado de demonstração. O uso atual permanece local e temporário.");
    }
  }, [state]);
  useEffect(() => {
    const syncDemo = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        const validated = validatedDemoState(parsed);
        if (validated) dispatch({ type: "RESET", state: validated });
      } catch { /* Keep this tab's validated state. */ }
    };
    window.addEventListener("storage", syncDemo);
    return () => window.removeEventListener("storage", syncDemo);
  }, []);
  const result = useMemo(() => createDemoStore(state, dispatch, persistenceError), [state, persistenceError]);
  return <DemoContext.Provider value={result}>{children}</DemoContext.Provider>;
}


export function useDemoStore(): DemoStore {
  const value = useContext(DemoContext);
  if (!value) throw new Error("DemoProvider ausente.");
  return value;
}

export function createDemoTitleDefaults(direction: DemoDirection): Pick<TitleInput, "direction" | "issueDate" | "competenceDate" | "dueDate"> {
  const today = todayInSaoPaulo();
  return { direction, issueDate: today, competenceDate: today, dueDate: today };
}
