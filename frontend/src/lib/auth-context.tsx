"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  clearAccessToken,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
  type UserPublic,
} from "./api";

interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
    setUser(await getMe());
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // sem rede a sessão não é revogada no servidor; a tela sai mesmo assim e o cookie vence sozinho
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
