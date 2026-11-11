import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  NETWORK_ERROR_MESSAGE,
  clearAccessToken,
  confirmMfaSetup,
  getMe,
  login,
  logout,
  refreshSession,
  startMfaSetup,
  verifyMfa,
} from "./api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ME = { id: 1, name: "Ana", email: "ana@pesquisemais.com.br", role: "financeiro" };

function urlsCalled(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([url]) => new URL(url as string).pathname);
}

describe("sessão", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    clearAccessToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login manda o e-mail como username e devolve só o token parcial, que não vira sessão", async () => {
    const challenge = { mfa_token: "parcial", token_type: "bearer", setup_required: false };
    fetchMock.mockResolvedValueOnce(json(200, challenge));
    fetchMock.mockResolvedValueOnce(json(401, { detail: "sem token" }));
    fetchMock.mockResolvedValueOnce(json(401, { detail: "sem cookie" }));

    await expect(login("ana@pesquisemais.com.br", "Str0ng!Pass")).resolves.toEqual(challenge);
    await getMe().catch(() => undefined);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
    expect((init.body as URLSearchParams).get("username")).toBe("ana@pesquisemais.com.br");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).has("Authorization")).toBe(false);
  });

  it("o código certo abre a sessão, com o token parcial no cabeçalho e o token novo só em memória", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { access_token: "acesso-1", token_type: "bearer" }));
    fetchMock.mockResolvedValueOnce(json(200, ME));

    await verifyMfa("parcial", "123456");
    await getMe();

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url as string).pathname).toBe("/auth/token/mfa");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer parcial");
    expect(JSON.parse(init.body as string)).toEqual({ code: "123456" });
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer acesso-1");
  });

  it("código errado mostra a mensagem do backend e não tenta renovar a sessão", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: "Código de verificação inválido" }));

    await expect(verifyMfa("parcial", "000000")).rejects.toThrow("Código de verificação inválido");
    expect(urlsCalled(fetchMock)).toEqual(["/auth/token/mfa"]);
  });

  it("o cadastro devolve a chave e, na confirmação, os códigos de recuperação e a sessão", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { secret: "ABC", otpauth_uri: "otpauth://x" }));
    fetchMock.mockResolvedValueOnce(
      json(200, { access_token: "acesso-2", token_type: "bearer", recovery_codes: ["AAAA-BBBB"] })
    );
    fetchMock.mockResolvedValueOnce(json(200, ME));

    await expect(startMfaSetup("parcial")).resolves.toEqual({ secret: "ABC", otpauth_uri: "otpauth://x" });
    await expect(confirmMfaSetup("parcial", "123456")).resolves.toEqual(["AAAA-BBBB"]);
    await getMe();

    expect(urlsCalled(fetchMock)).toEqual(["/auth/mfa/setup", "/auth/mfa/setup/confirm", "/auth/me"]);
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get("Authorization")).toBe("Bearer acesso-2");
  });

  it("login recusado mostra a mensagem do backend e não tenta renovar", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: "E-mail ou senha incorretos" }));

    await expect(login("ana@pesquisemais.com.br", "errada")).rejects.toThrow("E-mail ou senha incorretos");
    expect(urlsCalled(fetchMock)).toEqual(["/auth/token"]);
  });

  it("em 401 renova uma vez e repete a chamada com o token novo", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: "expirado" }));
    fetchMock.mockResolvedValueOnce(json(200, { access_token: "acesso-2", token_type: "bearer" }));
    fetchMock.mockResolvedValueOnce(json(200, ME));

    await expect(getMe()).resolves.toEqual(ME);

    expect(urlsCalled(fetchMock)).toEqual(["/auth/me", "/auth/token/refresh", "/auth/me"]);
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get("Authorization")).toBe("Bearer acesso-2");
  });

  it("refresh recusado vira 401 e não entra em loop", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { detail: "expirado" }));
    fetchMock.mockResolvedValueOnce(json(401, { detail: "Sua sessão expirou. Entre de novo" }));
    fetchMock.mockResolvedValueOnce(json(401, { detail: "expirado" }));

    const error = await getMe().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("renovações ao mesmo tempo na aba viram uma só chamada", async () => {
    fetchMock.mockResolvedValue(json(200, { access_token: "acesso-3", token_type: "bearer" }));

    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(results).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("com a Web Locks API, a renovação roda dentro do lock entre abas", async () => {
    const request = vi.fn((_name: string, callback: () => Promise<boolean>) => callback());
    vi.stubGlobal("navigator", { locks: { request } });
    fetchMock.mockResolvedValue(json(200, { access_token: "acesso-4", token_type: "bearer" }));

    await expect(refreshSession()).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith("financeiro-auth-refresh", expect.any(Function));
  });

  it("logout limpa o token mesmo se o servidor estiver fora", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { access_token: "acesso-5", token_type: "bearer" }));
    await verifyMfa("parcial", "123456");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(logout()).rejects.toThrow(NETWORK_ERROR_MESSAGE);

    fetchMock.mockResolvedValueOnce(json(401, { detail: "sem token" }));
    fetchMock.mockResolvedValueOnce(json(401, { detail: "sem cookie" }));
    await getMe().catch(() => undefined);
    const lastMeCall = fetchMock.mock.calls[2];
    expect(new Headers(lastMeCall[1].headers).has("Authorization")).toBe(false);
  });

  it("falha de rede vira mensagem em pt-BR, sem texto técnico", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(login("ana@pesquisemais.com.br", "x")).rejects.toThrow(NETWORK_ERROR_MESSAGE);
  });
});
