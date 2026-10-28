export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * Compatibility export for starter imports. Authentication is intentionally
 * unavailable in the read-only deployment frontend; no OAuth redirect is
 * started from the browser.
 */
export const startLogin = (): never => {
  throw new Error(
    "Área protegida indisponível. A autenticação, o MFA e as operações financeiras estão adiados nesta etapa.",
  );
};
