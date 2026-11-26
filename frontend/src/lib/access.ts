/**
 * Os três níveis de acesso, as telas que o admin bloqueia por pessoa e as demandas (Bruno, 19/11/2026).
 * A regra que vale é a do servidor (backend/core/permissions.py); aqui só se esconde o que não abre.
 */

export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super admin",
  admin: "Admin",
  financeiro: "Usuário",
};

export const isAdmin = (role: string | undefined) => role === "admin" || role === "superadmin";
export const isSuperAdmin = (role: string | undefined) => role === "superadmin";

const SCREENS = ["contas-a-pagar", "contas-a-receber", "conferencia-bancaria", "divergencias"];

/** A tela bloqueável de um endereço; null para as que não se bloqueiam (Início, Acessos...). */
export function screenOf(href: string): string | null {
  const path = href.split("?")[0].replace(/\/+$/, "");
  if (path === "/cadastros") return "cadastros";
  if (path === "/relatorios/projeto") return "relatorio-projeto";
  if (path === "/relatorios/fluxo-de-caixa") return "fluxo-de-caixa";
  if (path === "/relatorios/dre") return "dre";
  if (path === "/notas-e-rpa") return "notas-e-rpa";
  if (path === "/relatorios/fluxo-mensal") return "fluxo-mensal";
  if (path === "/relatorios/recebimentos-projetos") return "recebimentos-projetos";
  return SCREENS.find((screen) => path === `/${screen}`) ?? null;
}

export function screenAllowed(user: { blockedScreens?: string[] }, href: string): boolean {
  const screen = screenOf(href);
  return !screen || !(user.blockedScreens ?? []).includes(screen);
}

export const DEMAND_KINDS = [
  { id: "nova", label: "Abrir nova demanda" },
  { id: "bug", label: "Correção de bugs" },
  { id: "regra", label: "Correção de regra" },
] as const;

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const DEMAND_ACCEPT = [...Object.keys(IMAGE_TYPES), "application/pdf"].join(",");
export const MAX_DEMAND_BYTES = 10 * 1024 * 1024;

/** O problema do anexo escolhido ou colado, em palavras; null quando ele serve. */
export function demandFileProblem(file: File): string | null {
  if (!DEMAND_ACCEPT.split(",").includes(file.type)) return "Anexe uma imagem (PNG, JPG ou WEBP) ou um PDF.";
  if (file.size > MAX_DEMAND_BYTES) return "O anexo passa de 10 MB. Envie um arquivo menor.";
  return null;
}

/** O print do Ctrl+V (Windows + Shift + S), se o que foi colado tem uma imagem. */
export function pastedDemandImage(data: Pick<DataTransfer, "files"> | null): File | null {
  const file = [...(data?.files ?? [])].find((item) => item.type in IMAGE_TYPES);
  return file ? new File([file], `print-colado.${IMAGE_TYPES[file.type]}`, { type: file.type }) : null;
}
