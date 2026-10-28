import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoStore, demoReducer } from "../client/src/contexts/DemoStore";
import { createSeedDemoState, pendingCents, parseBrlToCents, sumCents } from "../client/src/lib/demoModel";
import { validatedDemoState } from "../client/src/lib/demoValidation";

const today = "2026-10-25";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
function harness() {
  let state = createSeedDemoState(today);
  return {
    get state() { return state; },
    get api() { return createDemoStore(state, action => { state = demoReducer(state, action); }); },
  };
}

describe("Núcleo local dos sete módulos DEMO", () => {
  it("carrega fixtures coerentes e rejeita estado monetário/vínculos corrompidos", () => {
    const state = createSeedDemoState(today);
    expect(validatedDemoState(state)).not.toBeNull();
    const corrupted = structuredClone(state); corrupted.titles[0].amountCents = -10;
    expect(validatedDemoState(corrupted)).toBeNull();
    const orphan = structuredClone(state); orphan.bankTransactions[0].originTitleId = "title-demo-ausente";
    expect(validatedDemoState(orphan)).toBeNull();
    const duplicate = structuredClone(state); duplicate.parties.push(duplicate.parties[0]);
    expect(validatedDemoState(duplicate)).toBeNull();
  });
  it("parseia reais exatamente e rejeita centavos excedentes e separadores inválidos", () => {
    expect(parseBrlToCents("R$ 1.234,56")).toBe(123456);
    expect(parseBrlToCents("0,01")).toBe(1);
    expect(sumCents([10,20])).toBe(30);
    for (const input of ["-10", "1,234", "1.2.3,00", "1e8", "", "0,00"]) expect(parseBrlToCents(input)).toBeNull();
  });
  it("liquidação parcial de Contas cria exatamente uma transação de Conciliação", () => {
    const h = harness(); const before = h.state.bankTransactions.length;
    expect(h.api.settleTitle("title-demo-2", 10000, today).ok).toBe(true);
    expect(pendingCents(h.state.titles.find(t => t.id === "title-demo-2")!)).toBe(54900);
    expect(h.state.bankTransactions).toHaveLength(before + 1);
    expect(h.api.settleTitle("title-demo-2", 54901, today).ok).toBe(false);
    expect(h.api.settleTitle("title-demo-2", 54900, today).ok).toBe(true);
    expect(h.api.settleTitle("title-demo-2", 1, today).ok).toBe(false);
    expect(validatedDemoState(h.state)).not.toBeNull();
  });
  it("provisão é substituída por título sem continuar no previsto", () => {
    const h = harness();
    expect(h.api.convertProvision("provision-demo-1", "party-demo-provider-1").ok).toBe(true);
    expect(h.state.provisions[0].status).toBe("substituida");
    const title = h.state.titles.find(t => t.sourceId === "provision-demo-1")!;
    expect(title.amountCents).toBe(h.state.provisions[0].amountCents);
    expect(h.api.convertProvision("provision-demo-1", "party-demo-provider-1").ok).toBe(false);
    expect(validatedDemoState(h.state)).not.toBeNull();
  });
  it("cadastro e centro inativos não recebem novos títulos mas preservam histórico", () => {
    const h = harness(); const history = h.state.titles.length;
    h.api.toggleParty("party-demo-provider-1"); h.api.toggleCenter("center-demo-1");
    const input = { direction: "pagar" as const, description: "Teste DEMO", partyId: "party-demo-provider-1", projectId: "project-demo-1", categoryId: "cat-demo-field", centerId: "center-demo-1", issueDate: today, competenceDate: today, dueDate: today, amountCents: 100 };
    expect(h.api.addTitle(input).ok).toBe(false);
    h.api.toggleParty("party-demo-provider-1");
    expect(h.api.addTitle(input).ok).toBe(false);
    expect(h.state.titles).toHaveLength(history);
  });
  it("duplicidade de código DEMO é recusada", () => {
    const h = harness();
    expect(h.api.addCategory({name:"Exemplo",code:"X",type:"despesa"}).ok).toBe(true);
    expect(h.api.addCategory({name:"Outra",code:"DEMO-X",type:"despesa"}).ok).toBe(false);
  });
  it("M1 forma lote exato; liquidação via M3 atualiza entrevistadores e extrato", () => {
    const h = harness();
    expect(h.api.createInterviewerBatch("project-demo-1", ["interviewer-demo-1","interviewer-demo-2"], today).ok).toBe(true);
    const title = h.state.titles.find(t => t.source === "interviewer")!;
    expect(title.amountCents).toBe(17000);
    expect(h.api.createInterviewerBatch("project-demo-1", ["interviewer-demo-1"], today).ok).toBe(false);
    expect(h.api.settleTitle(title.id, 10000, today).ok).toBe(false);
    expect(h.api.settleTitle(title.id, 17000, today).ok).toBe(true);
    expect(h.state.interviewerItems.filter(i => i.batchTitleId === title.id).every(i => i.status === "paga_simulada")).toBe(true);
    expect(h.api.payInterviewerBatch(title.id, today).ok).toBe(false);
    expect(validatedDemoState(h.state)).not.toBeNull();
  });
  it("M5 aprova uma única folha e M3 sincroniza a folha ao liquidar o título", () => {
    const h = harness();
    expect(h.api.createFieldSheet("project-demo-1", today).ok).toBe(true);
    const sheetId = h.state.fieldSheets[0].id;
    expect(h.api.createFieldSheet("project-demo-1", today).ok).toBe(false);
    expect(h.api.approveFieldSheet(sheetId).ok).toBe(true);
    expect(h.api.approveFieldSheet(sheetId).ok).toBe(false);
    const sheet = h.state.fieldSheets[0];
    expect(h.api.settleTitle(sheet.titleId!, sheet.amountCents, today).ok).toBe(true);
    expect(h.state.fieldSheets[0].status).toBe("paga_simulada");
    expect(h.state.fieldItems.filter(i => sheet.itemIds.includes(i.id)).every(i => i.status === "paga_simulada")).toBe(true);
    expect(validatedDemoState(h.state)).not.toBeNull();
  });
  it("pendência documental DEMO impede baixa até resolução local explícita", () => {
    const h = harness();
    expect(h.api.settleTitle("title-demo-5",92500,today).ok).toBe(false);
    expect(h.api.resolveDemoDocument("title-demo-5").ok).toBe(true);
    expect(h.api.settleTitle("title-demo-5",92500,today).ok).toBe(true);
  });
  it("conciliação não duplica e período fechado bloqueia novas liquidações", () => {
    const h = harness();
    expect(h.api.closePeriod("2026-10").ok).toBe(false);
    for (const tx of h.state.bankTransactions) expect(h.api.reconcileTransaction(tx.id,"pagamento DEMO").ok).toBe(true);
    expect(h.api.reconcileTransaction(h.state.bankTransactions[0].id,"pagamento DEMO").ok).toBe(false);
    expect(h.api.closePeriod("2026-10").ok).toBe(true);
    expect(h.api.settleTitle("title-demo-2",64900,today).ok).toBe(false);
    expect(h.api.reopenPeriod("2026-10","").ok).toBe(false);
    expect(h.api.reopenPeriod("2026-10","Reabrir demonstração").ok).toBe(true);
    expect(h.api.settleTitle("title-demo-2",64900,today).ok).toBe(true);
  });
  it("rejeita datas inexistentes e período inválido", () => {
    const h = harness();
    expect(h.api.settleTitle("title-demo-2",100,"2026-02-30").ok).toBe(false);
    expect(h.api.closePeriod("2026-13").ok).toBe(false);
    expect(h.api.createFieldSheet("project-demo-1","").ok).toBe(false);
  });
  it("rejeita referência duplicada de liquidação mesmo com saldo suficiente", () => {
    const state = createSeedDemoState(today);
    state.titles[0].settlements.push(structuredClone(state.titles[0].settlements[0]));
    expect(validatedDemoState(state)).toBeNull();
  });
  it("período fechado bloqueia títulos gerados por provisão, entrevistador e folha", () => {
    const h = harness();
    expect(h.api.createFieldSheet("project-demo-1", "2026-11-02").ok).toBe(true);
    const sheetId = h.state.fieldSheets[0].id;
    for (const tx of h.state.bankTransactions) h.api.reconcileTransaction(tx.id, "DEMO");
    expect(h.api.closePeriod("2026-10").ok).toBe(true);
    expect(h.api.convertProvision("provision-demo-1", "party-demo-provider-1").ok).toBe(false);
    expect(h.api.createInterviewerBatch("project-demo-1", ["interviewer-demo-1"], "2026-11-02").ok).toBe(false);
    expect(h.api.approveFieldSheet(sheetId).ok).toBe(false);
    const title = { ...h.state.titles[1], id: "title-demo-blocked", settlements: [], competenceDate: today, dueDate: "2026-11-02" };
    expect(demoReducer(h.state, {type: "ADD_TITLE", title}).titles).toHaveLength(h.state.titles.length);
  });
  it("edição cadastral preserva ID e referências históricas", () => {
    const h = harness();
    expect(h.api.renameParty("party-demo-provider-1", "Fornecedor exemplo").ok).toBe(true);
    expect(h.state.parties[0].name).toContain("DEMO");
    expect(h.state.titles[0].partyId).toBe("party-demo-provider-1");
    expect(validatedDemoState(h.state)).not.toBeNull();
  });
});
