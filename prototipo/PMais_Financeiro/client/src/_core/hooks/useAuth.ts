import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";

export type LegacyUser = NonNullable<inferRouterOutputs<AppRouter>["auth"]["me"]>;

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

const AUTH_UNAVAILABLE_MESSAGE =
  "Área protegida indisponível. A autenticação, o MFA e as operações financeiras estão adiados nesta etapa.";

/**
 * Compatibility surface for unused starter components.
 *
 * This phase is intentionally public, informative and read-only. Keeping the
 * hook shape avoids breaking legacy imports, while making it impossible for a
 * component to start OAuth, read browser storage or query an identity.
 */
export function useAuth(_options?: UseAuthOptions) {
  const refresh = async (): Promise<never> => {
    throw new Error(AUTH_UNAVAILABLE_MESSAGE);
  };

  const logout = async (): Promise<never> => {
    throw new Error(AUTH_UNAVAILABLE_MESSAGE);
  };

  return {
    user: null as LegacyUser | null,
    isAuthenticated: false,
    loading: false,
    error: new Error(AUTH_UNAVAILABLE_MESSAGE),
    refresh,
    logout,
  };
}
