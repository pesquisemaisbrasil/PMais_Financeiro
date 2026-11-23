import { NAV, isActive, normalizePath } from "@/lib/nav";

/**
 * Abas de telas, como no VS Code (pedido do Bruno, 23/11/2026; spec visao-geral, Ajustes). Uma aba por tela. O
 * clique simples no menu (ou qualquer link) troca a tela da aba atual; o duplo clique no menu abre outra aba. Cada
 * aba guarda o que a pessoa fez (filtros, busca, seleção) até ser fechada: a tela escondida continua montada.
 */
export type ScreenTab = { path: string; query: string };
/** `waiting`: a aba que acabou de ficar na frente (ao fechar a atual) enquanto o endereço ainda não chegou nela. */
export type TabsState = { tabs: ScreenTab[]; active: string | null; waiting: string | null };

/** As telas que viram aba: as páginas de src/app/(app). */
export const SCREENS = [
  "/",
  "/contas-a-pagar",
  "/contas-a-receber",
  "/conferencia-bancaria",
  "/divergencias",
  "/relatorios/projeto",
  "/cadastros",
  "/incentivos",
  "/acessos",
  "/demandas",
  "/solicitacoes",
] as const;
export type ScreenPath = (typeof SCREENS)[number];

/** A aba de um endereço; null quando o endereço não é uma das telas. */
export function toTab(pathname: string, query = ""): ScreenTab | null {
  const path = normalizePath(pathname || "/");
  return (SCREENS as readonly string[]).includes(path) ? { path, query: query.replace(/^\?/, "") } : null;
}

export function hrefOf(tab: ScreenTab): string {
  return tab.query ? `${tab.path}?${tab.query}` : tab.path;
}

/** Navegação comum: a tela vai para a aba dela, se já estiver aberta; senão, toma o lugar da aba atual. */
export function visit(tabs: ScreenTab[], active: string | null, tab: ScreenTab): ScreenTab[] {
  const own = tabs.findIndex((item) => item.path === tab.path);
  const at = own >= 0 ? own : tabs.findIndex((item) => item.path === active);
  if (at < 0) return [...tabs, tab];
  return tabs.map((item, index) => (index === at ? tab : item));
}

/** Duplo clique no menu: a tela ganha uma aba logo depois da atual (já aberta: fica onde está). */
export function openBeside(tabs: ScreenTab[], active: string | null, tab: ScreenTab): ScreenTab[] {
  if (tabs.some((item) => item.path === tab.path)) return tabs;
  const at = tabs.findIndex((item) => item.path === active);
  const copy = [...tabs];
  copy.splice(at < 0 ? copy.length : at + 1, 0, tab);
  return copy;
}

/** Fechar uma aba. Se era a da frente, a vizinha da direita (ou da esquerda) passa para a frente. A última fica. */
export function closeTab(state: TabsState, path: string): { state: TabsState; next: ScreenTab | null } {
  const index = state.tabs.findIndex((item) => item.path === path);
  if (index < 0 || state.tabs.length <= 1) return { state, next: null };
  const tabs = state.tabs.filter((_, i) => i !== index);
  if (path !== state.active) return { state: { ...state, tabs }, next: null };
  const next = tabs[Math.min(index, tabs.length - 1)];
  return { state: { tabs, active: next.path, waiting: next.path }, next };
}

/** Acerta as abas com o endereço atual (a cada navegação). */
export function sync(state: TabsState, current: ScreenTab | null): TabsState {
  if (!current) return state;
  if (state.waiting) {
    if (current.path !== state.waiting) return state;
    return { tabs: visit(state.tabs, state.waiting, current), active: current.path, waiting: null };
  }
  const known = state.tabs.find((item) => item.path === current.path);
  if (current.path === state.active && known?.query === current.query) return state;
  return { tabs: visit(state.tabs, state.active, current), active: current.path, waiting: null };
}

/** O nome da aba, como no menu: "Contas a pagar", "Fornecedores". */
export function tabLabel(tab: ScreenTab): string {
  const aba = new URLSearchParams(tab.query).get("aba");
  for (const entry of NAV) {
    if (entry.href && isActive(entry.href, tab.path, aba)) return entry.label;
    const leaf = entry.children?.find((child) => isActive(child.href, tab.path, aba));
    if (leaf) return leaf.label;
  }
  if (tab.path === "/cadastros") return "Cadastros";
  if (tab.path === "/incentivos") return "Incentivos";
  return tab.path;
}

/** As abas guardadas na aba do navegador (sessionStorage): só telas conhecidas, sem repetir. */
export function readTabs(raw: string | null): TabsState {
  const empty: TabsState = { tabs: [], active: null, waiting: null };
  try {
    const saved = JSON.parse(raw ?? "null") as { tabs?: unknown; active?: unknown } | null;
    if (!saved || !Array.isArray(saved.tabs)) return empty;
    const tabs: ScreenTab[] = [];
    for (const item of saved.tabs as { path?: unknown; query?: unknown }[]) {
      const tab =
        typeof item?.path === "string" ? toTab(item.path, typeof item.query === "string" ? item.query : "") : null;
      if (tab && !tabs.some((known) => known.path === tab.path)) tabs.push(tab);
    }
    const active = tabs.find((tab) => tab.path === saved.active)?.path ?? tabs.at(-1)?.path ?? null;
    return { tabs, active, waiting: null };
  } catch {
    return empty;
  }
}

export function writeTabs(state: TabsState): string {
  return JSON.stringify({ tabs: state.tabs, active: state.active });
}

/** A chave das abas guardadas, por pessoa. Guarda só os endereços das telas abertas, nunca token. */
export const TABS_KEY_PREFIX = "financeiro:abas:";

/** Ao sair, a lista de abas não fica no navegador para quem usar depois. */
export function forgetTabs(storage: Storage): void {
  for (const key of Object.keys(storage)) if (key.startsWith(TABS_KEY_PREFIX)) storage.removeItem(key);
}
