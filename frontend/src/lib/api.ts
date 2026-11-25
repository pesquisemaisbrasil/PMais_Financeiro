import type {
  HomeSummary,
  Indicator,
  PayableDetail,
  PayableList,
  PeriodMode,
  Reference,
  SortColumn,
  Tab,
  DateField,
  ReplacementCandidate,
  ImportPreview,
  ImportResult,
  ReportPreview,
  ReportResult,
  Occurrence,
  Project,
  RecordKind,
  RecordRow,
  PrintTable,
  SeriesOccurrence,
  CnpjInfo,
  Attachment,
  TaxRate,
} from "./payables";

import { DEMO, demoFetch } from "./demo/client";
import type { DocumentChange } from "./documents";
import type { FeedbackItem } from "./feedback";
import type { SearchResult } from "./search";
import type { BatchEditRowBody } from "./batch-edit";

export const DEFAULT_API_URL = "http://localhost:8010";

/**
 * O `fetch` do app. Na versão de demonstração, o backend roda dentro do navegador; só as
 * solicitações da equipe (sendFeedback, mais abaixo) vão à rede, para a função do Netlify.
 */
const apiFetch = (url: string, init?: RequestInit): Promise<Response> =>
  DEMO ? demoFetch(url, init) : fetch(url, init);
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Senha e código certos, mas este navegador ainda não foi liberado pelo administrador (ou foi
 * recusado): não há sessão. No cadastro do autenticador, os códigos de recuperação vêm junto, porque
 * só aparecem uma vez.
 */
export class BrowserApprovalError extends ApiError {
  browser: "pendente" | "recusado";
  recoveryCodes: string[];
  constructor(message: string, browser: "pendente" | "recusado", recoveryCodes: string[] = []) {
    super(403, message);
    this.browser = browser;
    this.recoveryCodes = recoveryCodes;
  }
}

// Só em memória, nunca no localStorage: recarregar a página passa pelo refresh,
// que mora em cookie HttpOnly (spec acesso-e-auditoria).
let accessToken: string | null = null;

export function clearAccessToken() {
  accessToken = null;
}

/** Texto em pt-BR para respostas sem `detail` legível (corpo vazio, HTML de proxy etc.).
 * Nunca mostra texto técnico em inglês como "Bad Gateway". */
export function statusMessage(status: number): string {
  if (status === 401) return "Sua sessão expirou. Entre de novo.";
  if (status === 403) return "Você não tem permissão para isso.";
  if (status === 404) return "Não encontrado.";
  if (status === 422 || status === 400) return "Confira os dados e tente de novo.";
  if (status === 429) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.";
  if (status >= 500) return "O serviço está indisponível agora. Tente de novo em instantes.";
  return "Não foi possível concluir. Tente de novo.";
}

export const NETWORK_ERROR_MESSAGE = "Sem conexão com o servidor. Confira a internet e tente de novo.";

/** fetch que troca a falha de rede do navegador ("Failed to fetch") por texto em pt-BR. */
async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await apiFetch(url, init);
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // corpo que não é JSON: cai no texto padrão do status
  }
  return statusMessage(response.status);
}

async function requestRefresh(): Promise<boolean> {
  try {
    const response = await apiFetch(`${API_URL}/auth/token/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return false;
    accessToken = ((await response.json()) as Token).access_token;
    return true;
  } catch {
    return false;
  }
}

// Duas abas mandando o mesmo cookie contariam como reuso de token e o backend derrubaria a sessão.
async function refreshAcrossTabs(): Promise<boolean> {
  if (!navigator.locks) return requestRefresh();
  return navigator.locks.request("financeiro-auth-refresh", requestRefresh);
}

let refreshPromise: Promise<boolean> | null = null;

/** Troca o cookie de refresh por um access token novo, uma renovação por vez. */
export function refreshSession(): Promise<boolean> {
  refreshPromise ??= refreshAcrossTabs().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** fetch autenticado com renovação de token; lança ApiError se a resposta não for ok. */
async function fetchWithAuth(path: string, options: RequestInit = {}, retried = false): Promise<Response> {
  const headers = new Headers(options.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await safeFetch(`${API_URL}${path}`, { ...options, headers });

  if (response.status === 401 && !retried) {
    if (await refreshSession()) return fetchWithAuth(path, options, true);
    clearAccessToken();
  }

  if (!response.ok) {
    throw new ApiError(response.status, await extractErrorMessage(response));
  }

  return response;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(path, options);
  return (await response.json()) as T;
}

// ---- Busca em todo o sistema (spec busca-geral) ----

export function searchAll(term: string, signal?: AbortSignal): Promise<SearchResult> {
  return request<SearchResult>(`/search?${new URLSearchParams({ q: term })}`, { signal });
}

// ---- Autenticação ----

interface Token {
  access_token: string;
  token_type: string;
}

export interface UserPublic {
  id: number;
  name: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
  /** As telas que o admin bloqueou: somem do menu e não abrem (lib/access.ts). */
  blockedScreens?: string[];
}

export interface MfaChallenge {
  mfa_token: string;
  token_type: string;
  setup_required: boolean;
  /** Senha inicial de primeiro acesso: a senha nova vem antes do autenticador (25/11). */
  password_change_required?: boolean;
}

export interface MfaSetup {
  secret: string;
  otpauth_uri: string;
}

/** Sem a renovação de `fetchWithAuth`: aqui 401 é senha ou código errado, não sessão vencida. */
async function postAuth<T>(path: string, init: RequestInit): Promise<T> {
  const response = await safeFetch(`${API_URL}${path}`, {
    ...init,
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    if (response.status === 403) {
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      if (body && (body.browser === "pendente" || body.browser === "recusado")) {
        throw new BrowserApprovalError(String(body.detail ?? ""), body.browser, body.recovery_codes ?? []);
      }
    }
    throw new ApiError(response.status, await extractErrorMessage(response));
  }
  return (await response.json()) as T;
}

function postWithMfaToken<T>(path: string, mfaToken: string, body?: unknown): Promise<T> {
  return postAuth<T>(path, {
    headers: { Authorization: `Bearer ${mfaToken}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Senha certa ainda não é login: devolve o token parcial para o segundo fator. */
export function login(email: string, password: string): Promise<MfaChallenge> {
  return postAuth<MfaChallenge>("/auth/token", {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }),
  });
}

export async function verifyMfa(mfaToken: string, code: string): Promise<void> {
  const token = await postWithMfaToken<Token>("/auth/token/mfa", mfaToken, { code });
  accessToken = token.access_token;
}

/** Primeiro acesso: troca a senha inicial pela da pessoa. Devolve um token parcial novo. */
export function setInitialPassword(mfaToken: string, password: string): Promise<MfaChallenge> {
  return postWithMfaToken<MfaChallenge>("/auth/password/initial", mfaToken, { password });
}

export function startMfaSetup(mfaToken: string): Promise<MfaSetup> {
  return postWithMfaToken<MfaSetup>("/auth/mfa/setup", mfaToken);
}

/** Termina o cadastro e abre a sessão. Devolve os códigos de recuperação, que só aparecem aqui. */
export async function confirmMfaSetup(mfaToken: string, code: string): Promise<string[]> {
  const token = await postWithMfaToken<Token & { recovery_codes: string[] }>(
    "/auth/mfa/setup/confirm",
    mfaToken,
    { code }
  );
  accessToken = token.access_token;
  return token.recovery_codes;
}

export async function logout(): Promise<void> {
  try {
    await safeFetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
  } finally {
    clearAccessToken();
  }
}

export function getMe(): Promise<UserPublic> {
  return request<UserPublic>("/auth/me");
}

// ---- Contas a pagar ----

export function send<T>(path: string, method: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Envio de arquivo (multipart): o navegador define o Content-Type com o limite. */
export function upload<T>(path: string, method: string, form: FormData): Promise<T> {
  return request<T>(path, { method, body: form });
}

/** GET que devolve um arquivo (CSV). */
export async function fetchBlob(path: string): Promise<Blob> {
  const response = await fetchWithAuth(path);
  return response.blob();
}

/** POST com corpo JSON que responde 204, sem corpo. */
export async function postJsonNoContent(path: string, body: unknown): Promise<void> {
  await fetchWithAuth(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** POST que responde 204, sem corpo. */
export async function postNoContent(path: string): Promise<void> {
  await fetchWithAuth(path, { method: "POST" });
}

/** DELETE que responde 204, sem corpo. */
export async function remove(path: string): Promise<void> {
  await fetchWithAuth(path, { method: "DELETE" });
}

export function getHome(): Promise<HomeSummary> {
  return request<HomeSummary>("/home");
}

export function getReference(): Promise<Reference> {
  return request<Reference>("/reference");
}

export interface PayableQuery {
  mode: PeriodMode;
  ref: string | null;
  start: string;
  end: string;
  dateField: DateField;
  indicator: Indicator;
  tab: Tab;
  filters: Record<string, string>;
  search: string;
  sort: SortColumn;
  descending: boolean;
  page: number;
}

function payableParams(query: PayableQuery): URLSearchParams {
  const params = new URLSearchParams({
    mode: query.mode,
    dateField: query.dateField,
    indicator: query.indicator,
    tab: query.tab,
    sort: query.sort,
    descending: String(query.descending),
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

export function listPayables(query: PayableQuery): Promise<PayableList> {
  const params = payableParams(query);
  params.set("page", String(query.page));
  return request<PayableList>(`/payables?${params}`);
}

/** Os dois formatos da exportação das listas: Excel e CSV (para outros sistemas). */
export type ExportFormat = "xlsx" | "csv";

/** Tudo o que os filtros trazem, sem paginar, em Excel ou CSV. */
export async function exportPayables(query: PayableQuery, format: ExportFormat = "xlsx"): Promise<Blob> {
  const params = payableParams(query);
  params.set("format", format);
  const response = await fetchWithAuth(`/payables/export?${params}`);
  return response.blob();
}

/** Tudo o que os filtros trazem, sem paginar, nas colunas que cabem numa folha. */
export function printPayables(query: PayableQuery): Promise<PrintTable> {
  return request<PrintTable>(`/payables/print?${payableParams(query)}`);
}

export function getPayable(id: number): Promise<PayableDetail> {
  return request<PayableDetail>(`/payables/${id}`);
}

export function createPayable(body: unknown): Promise<PayableDetail> {
  return send<PayableDetail>("/payables", "POST", body);
}

export function simulateRecurrence(body: unknown): Promise<Occurrence[]> {
  return send<Occurrence[]>("/payables/recurrence/simulate", "POST", body);
}

export function createSeries(body: unknown): Promise<{ seriesId: number; ids: number[] }> {
  return send<{ seriesId: number; ids: number[] }>("/payables/recurrence", "POST", body);
}

/** As ocorrências da série da conta, em ordem (aba Repetir). */
export function listSeries(id: number): Promise<SeriesOccurrence[]> {
  return request<SeriesOccurrence[]>(`/payables/${id}/series`);
}

export function editSeries(id: number, body: unknown): Promise<{ count: number }> {
  return send<{ count: number }>(`/payables/${id}/series`, "PATCH", body);
}

export function cancelSeries(id: number, body: unknown): Promise<{ count: number }> {
  return send<{ count: number }>(`/payables/${id}/series/cancel`, "POST", body);
}

export function updatePayable(id: number, body: unknown): Promise<PayableDetail> {
  return send<PayableDetail>(`/payables/${id}`, "PATCH", body);
}

export function cancelPayable(id: number, reason: string): Promise<PayableDetail> {
  return send<PayableDetail>(`/payables/${id}/cancel`, "POST", { reason });
}

/** Anexa um documento à conta. Devolve a conta já com ele na lista. */
export function attachDocument(id: number, file: File, kind: string): Promise<PayableDetail> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return upload<PayableDetail>(`/payables/${id}/attachments`, "POST", form);
}

export function downloadDocument(id: number, attachmentId: number): Promise<Blob> {
  return fetchBlob(`/payables/${id}/attachments/${attachmentId}/download`);
}

/** Muda o nome e/ou o tipo do documento; o arquivo guardado não é tocado. */
export function renameDocument(id: number, attachmentId: number, change: DocumentChange): Promise<PayableDetail> {
  return send<PayableDetail>(`/payables/${id}/attachments/${attachmentId}`, "PATCH", change);
}

export function removeDocument(id: number, attachmentId: number, reason: string): Promise<PayableDetail> {
  return send<PayableDetail>(`/payables/${id}/attachments/${attachmentId}/remove`, "POST", { reason });
}

export function payPayable(id: number, body: unknown): Promise<PayableDetail> {
  return send<PayableDetail>(`/payables/${id}/payments`, "POST", body);
}

export function reversePayment(id: number, paymentId: number, body: unknown): Promise<PayableDetail> {
  return send<PayableDetail>(`/payables/${id}/payments/${paymentId}/reverse`, "POST", body);
}

export function payBatch(body: unknown): Promise<{ total: string; count: number }> {
  return send<{ total: string; count: number }>("/payables/batch/payments", "POST", body);
}

export function deleteBatch(ids: number[]): Promise<{ count: number }> {
  return send<{ count: number }>("/payables/batch/delete", "POST", { ids });
}

/** Edição em lote, conta por conta: só as linhas marcadas; uma recusada não grava nenhuma. */
export function editBatch(rows: BatchEditRowBody[]): Promise<{ count: number }> {
  return send<{ count: number }>("/payables/batch/edit", "POST", { rows });
}

export function reclassifyBatch(body: unknown): Promise<{ count: number }> {
  return send<{ count: number }>("/payables/batch/reclassify", "POST", body);
}

/** O mesmo documento em várias contas. Devolve quantas receberam e quantas já tinham o arquivo. */
export function attachBatch(ids: number[], file: File, kind: string): Promise<{ count: number; skipped: number }> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  for (const id of ids) form.append("ids", String(id));
  return upload<{ count: number; skipped: number }>("/payables/batch/attachments", "POST", form);
}

export function duplicateBatch(ids: number[]): Promise<{ count: number }> {
  return send<{ count: number }>("/payables/batch/duplicate", "POST", { ids });
}

export function getReplacementCandidates(id: number): Promise<ReplacementCandidate[]> {
  return request<ReplacementCandidate[]>(`/payables/${id}/replacement-candidates`);
}

export function replaceProvision(id: number, body: unknown): Promise<PayableDetail> {
  return send<PayableDetail>(`/payables/${id}/replace`, "POST", body);
}

export function previewImport(form: FormData): Promise<ImportPreview> {
  return request<ImportPreview>("/payables/import/preview", { method: "POST", body: form });
}

export function importPayables(form: FormData): Promise<ImportResult> {
  return request<ImportResult>("/payables/import", { method: "POST", body: form });
}

/** A planilha modelo do Carregar incentivos. */
export function downloadIncentiveTemplate(): Promise<Blob> {
  return fetchBlob("/payables/import/incentives-template");
}

/** O relatório "Lançamentos a Pagar" do sistema antigo: conferir antes e depois criar as contas. */
export function previewReport(form: FormData): Promise<ReportPreview> {
  return request<ReportPreview>("/payables/import-report/preview", { method: "POST", body: form });
}

export function importReport(form: FormData): Promise<ReportResult> {
  return request<ReportResult>("/payables/import-report", { method: "POST", body: form });
}

// ---- Cadastros ----

export function listRecords(kind: RecordKind): Promise<RecordRow[]> {
  return request<RecordRow[]>(`/records/${kind}`);
}

/** Dados públicos do CNPJ (BrasilAPI, pelo nosso servidor). Não grava nada. */
export function lookupCnpj(cnpj: string): Promise<CnpjInfo> {
  return request<CnpjInfo>(`/lookups/cnpj/${encodeURIComponent(cnpj)}`);
}

export function createRecord(kind: RecordKind, body: unknown): Promise<RecordRow> {
  return send<RecordRow>(`/records/${kind}`, "POST", body);
}

export function updateRecord(kind: RecordKind, id: number, body: unknown): Promise<RecordRow> {
  return send<RecordRow>(`/records/${kind}/${id}`, "PATCH", body);
}

export function setRecordActive(kind: RecordKind, id: number, active: boolean): Promise<RecordRow> {
  return send<RecordRow>(`/records/${kind}/${id}/active`, "POST", { active });
}

export async function deleteRecord(kind: RecordKind, id: number): Promise<void> {
  await fetchWithAuth(`/records/${kind}/${id}`, { method: "DELETE" });
}

// ---- Níveis de acesso e demandas (19/11/2026)

export interface PersonRow {
  id: number;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  blockedScreens: string[];
  canEdit: boolean;
}

export interface PeopleList {
  screens: { id: string; label: string }[];
  people: PersonRow[];
}

export interface DemandRow {
  id: number;
  kind: string;
  kindLabel: string;
  description: string;
  page: string;
  sender: string;
  createdAt: string;
  fileName: string;
  contentType: string;
  size: number;
  /** Concluída pelo super admin: quando e por quem (quem abriu recebe o aviso no sino). */
  doneAt: string | null;
  doneBy: string | null;
}

export function listPeople(): Promise<PeopleList> {
  return request<PeopleList>("/admin/pessoas");
}

export function setPersonScreens(id: number, blocked: string[]): Promise<PersonRow> {
  return send<PersonRow>(`/admin/pessoas/${id}/telas`, "PUT", { blocked });
}

export function sendDemand(form: FormData): Promise<DemandRow> {
  return upload<DemandRow>("/demands", "POST", form);
}

export function listDemands(): Promise<DemandRow[]> {
  return request<DemandRow[]>("/demands");
}

export function concludeDemand(id: number): Promise<DemandRow> {
  return send<DemandRow>(`/demands/${id}/concluir`, "POST", {});
}

export function downloadDemandAttachment(id: number): Promise<Blob> {
  return fetchBlob(`/demands/${id}/anexo`);
}

/** Os percentuais dos impostos retidos (Cadastros › Impostos retidos). */
export function getTaxRates(): Promise<TaxRate[]> {
  return request<TaxRate[]>("/tax-rates");
}

export function saveTaxRates(rates: { code: string; rate: string }[]): Promise<TaxRate[]> {
  return send<TaxRate[]>("/tax-rates", "PUT", { rates });
}

/** Exclui um feriado cadastrado (a resposta é 204, sem corpo). */
export async function deleteHoliday(id: number): Promise<void> {
  await fetchWithAuth(`/holidays/${id}`, { method: "DELETE" });
}

// Documentos do cliente (contrato, ficha...): voltam sempre a lista que está valendo.
export function listCustomerDocuments(id: number): Promise<Attachment[]> {
  return request<Attachment[]>(`/records/customers/${id}/attachments`);
}

export function attachCustomerDocument(id: number, file: File, kind: string): Promise<Attachment[]> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return upload<Attachment[]>(`/records/customers/${id}/attachments`, "POST", form);
}

export function downloadCustomerDocument(id: number, attachmentId: number): Promise<Blob> {
  return fetchBlob(`/records/customers/${id}/attachments/${attachmentId}/download`);
}

export function renameCustomerDocument(id: number, attachmentId: number, change: DocumentChange): Promise<Attachment[]> {
  return send<Attachment[]>(`/records/customers/${id}/attachments/${attachmentId}`, "PATCH", change);
}

export function removeCustomerDocument(id: number, attachmentId: number, reason: string): Promise<Attachment[]> {
  return send<Attachment[]>(`/records/customers/${id}/attachments/${attachmentId}/remove`, "POST", { reason });
}

/** Traz os projetos do Connect: cada um vira projeto de Contas a pagar. Devolve quantos o Connect tem. */
export async function syncConnectProjects(): Promise<number> {
  const projects = await request<unknown[]>("/finance/connect/sync", { method: "POST" });
  return projects.length;
}

// ---- Acessos: os navegadores liberados (só admin) ----

export type BrowserStatus = "pendente" | "liberado" | "recusado" | "revogado";

export interface TrustedBrowserRow {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  /** "Chrome no Windows" */
  label: string;
  /** o IP já mascarado (192.168.0.0); nunca o completo */
  ipMasked: string | null;
  status: BrowserStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  lastSeenAt: string | null;
}

export function listBrowsers(): Promise<TrustedBrowserRow[]> {
  return request<TrustedBrowserRow[]>("/admin/navegadores");
}

/** Liberar, recusar ou revogar. Devolve o navegador como ficou. */
export function decideBrowser(id: number, action: "liberar" | "recusar" | "revogar"): Promise<TrustedBrowserRow> {
  return send<TrustedBrowserRow>(`/admin/navegadores/${id}/${action}`, "POST", {});
}

/** Projeto cadastrado no Financeiro, por enquanto (ADR 0021): número, nome e o padrão do lançamento. */
export function createProject(body: unknown): Promise<Project> {
  return send<Project>("/projects", "POST", body);
}

export function editProject(id: number, body: unknown): Promise<Project> {
  return send<Project>(`/projects/${id}`, "PATCH", body);
}

/** Só o projeto sem lançamento; com lançamento, a API recusa e pede para inativar. */
export async function deleteProject(id: number): Promise<void> {
  await fetchWithAuth(`/projects/${id}`, { method: "DELETE" });
}

export function updateProjectIncentive(id: number, body: unknown): Promise<Project> {
  return send<Project>(`/projects/${id}/incentive`, "PATCH", body);
}

// ---- Solicitações da equipe (só na demonstração) ----
// Vão para a função do Netlify do próprio site (netlify/functions/solicitacoes.mts), e não para o
// backend do navegador: assim chegam ao desenvolvimento. Ler pede a chave do desenvolvimento.

const FEEDBACK_URL = "/api/solicitacoes";

async function feedbackRequest(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${FEEDBACK_URL}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }
  if (!response.ok) throw new ApiError(response.status, await extractErrorMessage(response));
  return response;
}

const withKey = (key: string): RequestInit => ({ headers: { Authorization: `Bearer ${key}` } });

/** Envia tipo, descrição e imagem (FormData com tipo, descricao, imagem, pagina e quem). */
export async function sendFeedback(form: FormData): Promise<void> {
  await feedbackRequest("", { method: "POST", body: form });
}

export async function listFeedback(key: string): Promise<FeedbackItem[]> {
  const response = await feedbackRequest("", withKey(key));
  return ((await response.json()) as { items: FeedbackItem[] }).items;
}

export async function getFeedbackImage(id: string, key: string): Promise<Blob> {
  return (await feedbackRequest(`/${encodeURIComponent(id)}/imagem`, withKey(key))).blob();
}
