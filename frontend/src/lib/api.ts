const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
    return await fetch(url, init);
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
    const response = await fetch(`${API_URL}/auth/token/refresh`, {
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(path, options);
  return (await response.json()) as T;
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
}

export interface MfaChallenge {
  mfa_token: string;
  token_type: string;
  setup_required: boolean;
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
