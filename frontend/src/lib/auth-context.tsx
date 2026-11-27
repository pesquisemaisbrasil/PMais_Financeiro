"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  clearAccessToken,
  getMe,
  logout as apiLogout,
  refreshSession,
  type UserPublic,
} from "./api";
import { forgetTabs } from "./tabs";

interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  /** Chamado no fim do login, depois do segundo fator: é o que libera as telas. */
  loadUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const RENEW_EVERY_MS = 10 * 60 * 1000;
const ACTIVITY = ["pointerdown", "keydown", "wheel"] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // o access token não sobrevive ao recarregar: a sessão volta pelo cookie de refresh
    async function restoreSession() {
      try {
        if (await refreshSession()) setUser(await getMe());
      } catch {
        clearAccessToken();
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, []);

  // A sessão cai depois de 2 horas sem uso (SESSION_IDLE_MINUTES no backend; reunião de 26/11/2026). Enquanto a
  // pessoa mexe na tela, ela é renovada a cada 10 minutos, mesmo sem pedido ao servidor; já caída, volta ao login.
  useEffect(() => {
    if (!user) return;
    let renewed = Date.now();
    function active() {
      if (Date.now() - renewed < RENEW_EVERY_MS) return;
      renewed = Date.now();
      void refreshSession().then((alive) => {
        if (alive || !navigator.onLine) return;
        clearAccessToken();
        setUser(null);
      });
    }
    for (const name of ACTIVITY) window.addEventListener(name, active, { passive: true });
    return () => {
      for (const name of ACTIVITY) window.removeEventListener(name, active);
    };
  }, [user]);

  const loadUser = useCallback(async () => {
    setUser(await getMe());
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // sem rede a sessão não é revogada no servidor; a tela sai mesmo assim e o cookie vence sozinho
    } finally {
      try {
        forgetTabs(sessionStorage);
      } catch {
        // sem armazenamento não há abas guardadas
      }
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loadUser, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
