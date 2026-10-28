import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createAccessQueue } from "@/lib/accessQueue";

type Status = "loading" | "authenticated" | "anonymous" | "error" | "unconfigured";
type Result = { ok: boolean; message?: string; code?: string };
type Access = {
  status: Status; expired: boolean;
  login(username: string, password: string): Promise<Result>;
  logout(): Promise<Result>;
  retry(): Promise<void>;
};
const Context = createContext<Access | null>(null);

export function DemoAccessProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [expired, setExpired] = useState(false);
  const csrf = useRef("");
  const wasAuthenticated = useRef(false);
  const mounted = useRef(true);
  const queue = useRef(createAccessQueue());

  // Only called within the queue, including reads surrounding login/logout.
  const readSession = useCallback(async () => {
    try {
      const response = await fetch("/api/demo-access/session", { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!mounted.current) return false;
      if (!response.ok) {
        csrf.current = "";
        setStatus(data.code === "demo_access_not_configured" ? "unconfigured" : "error");
        return false;
      }
      if (typeof data.csrf !== "string" || typeof data.authenticated !== "boolean") throw new Error("Invalid access response");
      csrf.current = data.csrf;
      setStatus(data.authenticated ? "authenticated" : "anonymous");
      setExpired(wasAuthenticated.current && !data.authenticated);
      wasAuthenticated.current = data.authenticated;
      return data.authenticated;
    } catch {
      if (mounted.current) { csrf.current = ""; setStatus("error"); }
      return false;
    }
  }, []);
  const refresh = useCallback(() => queue.current(readSession), [readSession]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [refresh]);

  async function post(path: string, body: Record<string, string>): Promise<Result> {
    try {
      const response = await fetch(path, {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Pmais-CSRF": csrf.current },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) return { ok: false, code: data.code, message: data.message || "Não foi possível concluir o acesso." };
      return { ok: true };
    } catch { return { ok: false, message: "Sem conexão com o servidor. Tente novamente." }; }
  }
  async function action(path: string, body: Record<string, string>): Promise<Result> {
    let result = await post(path, body);
    // A rejected CSRF challenge caused no mutation. Recover once (e.g. another tab rotated it).
    // Never retry an uncertain/network-failed POST or invalid password automatically.
    if (!result.ok && result.code === "invalid_challenge") {
      await readSession();
      if (csrf.current) result = await post(path, body);
      if (!result.ok && result.code === "invalid_challenge") {
        return { ok: false, message: "Desafio de acesso desatualizado ou cookies indisponíveis. Atualize a página e verifique os cookies do Preview." };
      }
    }
    return result;
  }
  const value: Access = {
    status, expired,
    retry: async () => { await refresh(); },
    login: (username, password) => queue.current(async () => {
      await readSession();
      if (!mounted.current || !csrf.current) return { ok: false, message: "Não foi possível iniciar o acesso. Recarregue a página." };
      const result = await action("/api/demo-access/login", { username: username.trim(), password });
      if (!result.ok) return result;
      const authenticated = await readSession();
      return authenticated ? { ok: true } : { ok: false, message: "O navegador não confirmou a sessão. Verifique as permissões de cookies do Preview e tente novamente. Nenhum acesso foi liberado." };
    }),
    logout: () => queue.current(async () => {
      await readSession();
      if (!mounted.current || !csrf.current) return { ok: false, message: "Não foi possível confirmar a saída. Tente novamente." };
      const result = await action("/api/demo-access/logout", {});
      if (result.ok) {
        csrf.current = ""; wasAuthenticated.current = false;
        if (mounted.current) { setExpired(false); setStatus("anonymous"); }
        await readSession();
      }
      return result;
    }),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDemoAccess(): Access {
  const value = useContext(Context);
  if (!value) throw new Error("Demo access provider required");
  return value;
}
