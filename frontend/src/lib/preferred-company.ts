/**
 * A empresa em que Contas a pagar e Contas a receber abrem para a pessoa, guardada no navegador (reunião de
 * 26/11/2026: as empresas não se misturam na lista, e cada pessoa abre na sua). Vazio: todas as empresas.
 */
const KEY = "financeiro:empresa-preferida:";

export function readPreferredCompany(userId: number | undefined): string {
  if (!userId) return "";
  try {
    const saved = localStorage.getItem(KEY + userId) ?? "";
    return /^\d+$/.test(saved) ? saved : "";
  } catch {
    return "";
  }
}

export function savePreferredCompany(userId: number | undefined, company: string): void {
  if (!userId) return;
  try {
    if (company) localStorage.setItem(KEY + userId, company);
    else localStorage.removeItem(KEY + userId);
  } catch {
    // janela privada: a escolha vale só até recarregar
  }
}
