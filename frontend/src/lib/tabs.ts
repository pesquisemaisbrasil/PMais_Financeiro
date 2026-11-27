import { NAV, isActive, normalizePath } from "@/lib/nav";

/**
 * Abas de telas, como no VS Code (pedido do Bruno, 23/11/2026; spec visao-geral, Ajustes). O clique simples no menu
 * (ou qualquer link) troca a tela da aba atual; o duplo clique no menu abre outra aba, mesmo de uma tela já aberta
 * (reunião de 26/11: outubro numa aba e novembro na outra). Cada aba guarda o que a pessoa fez (filtros, busca,
 * seleção) até ser fechada: a tela escondida continua montada.
 */
export type ScreenTab = { path: string; query: string };
/**
 * `active` e `waiting` guardam a chave da aba (`tabKey`). `waiting`: a aba que acabou de ficar na frente (ao fechar
 * a atual) enquanto o endereço ainda não chegou nela.
 */
export type TabsState = { tabs: ScreenTab[]; active: string | null; waiting: string | null };

/** A cópia da tela vai no endereço (`?copia=2`): é ela que diz em qual das abas da mesma tela a pessoa está. */
const COPY = "copia";

function copyOf(tab: ScreenTab): number {
  const copy = Number(new URLSearchParams(tab.query).get(COPY));
  return Number.isInteger(copy) && copy >= 2 ? copy : 1;
}

/** Quem é a aba: a tela, e o número da cópia quando a mesma tela está aberta em mais de uma aba. */
export function tabKey(tab: ScreenTab): string {
  const copy = copyOf(tab);
  return copy > 1 ? `${tab.path}#${copy}` : tab.path;
}

/** As telas que viram aba: as páginas de src/app/(app). */
export const SCREENS = [
  "/",
  "/contas-a-pagar",
  "/contas-a-receber",
  "/notas-e-rpa",
  "/conferencia-bancaria",
  "/divergencias",
  "/relatorios/projeto",
  "/relatorios/fluxo-de-caixa",
  "/relatorios/dre",
  "/relatorios/fluxo-mensal",
  "/relatorios/recebimentos-projetos",
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
  const own = tabs.findIndex((item) => tabKey(item) === tabKey(tab));
  const at = own >= 0 ? own : tabs.findIndex((item) => tabKey(item) === active);
  if (at < 0) return [...tabs, tab];
  return tabs.map((item, index) => (index === at ? tab : item));
}

/**
 * Duplo clique no menu: a tela ganha uma aba logo depois da atual. Já aberta, ganha mais uma cópia, com o próximo
 * número livre (reunião de 26/11/2026). Devolve as abas e a que abriu.
 */
export function openBeside(
  tabs: ScreenTab[],
  active: string | null,
  tab: ScreenTab
): { tabs: ScreenTab[]; opened: ScreenTab } {
  let opened = tab;
  const used = new Set(tabs.filter((item) => item.path === tab.path).map(copyOf));
  if (used.size) {
    let copy = 2;
    while (used.has(copy)) copy += 1;
    const query = new URLSearchParams(tab.query);
    query.set(COPY, String(copy));
    opened = { path: tab.path, query: query.toString() };
  }
  const at = tabs.findIndex((item) => tabKey(item) === active);
  const next = [...tabs];
  next.splice(at < 0 ? next.length : at + 1, 0, opened);
  return { tabs: next, opened };
}

/** Fechar uma aba. Se era a da frente, a vizinha da direita (ou da esquerda) passa para a frente. A última fica. */
export function closeTab(state: TabsState, key: string): { state: TabsState; next: ScreenTab | null } {
  const index = state.tabs.findIndex((item) => tabKey(item) === key);
  if (index < 0 || state.tabs.length <= 1) return { state, next: null };
  const tabs = state.tabs.filter((_, i) => i !== index);
  if (key !== state.active) return { state: { ...state, tabs }, next: null };
  const next = tabs[Math.min(index, tabs.length - 1)];
  return { state: { tabs, active: tabKey(next), waiting: tabKey(next) }, next };
}

/** Acerta as abas com o endereço atual (a cada navegação). */
export function sync(state: TabsState, current: ScreenTab | null): TabsState {
  if (!current) return state;
  const key = tabKey(current);
  if (state.waiting) {
    if (key !== state.waiting) return state;
    return { tabs: visit(state.tabs, state.waiting, current), active: key, waiting: null };
  }
  const known = state.tabs.find((item) => tabKey(item) === key);
  if (key === state.active && known?.query === current.query) return state;
  return { tabs: visit(state.tabs, state.active, current), active: key, waiting: null };
}

/** O nome da aba, como no menu: "Contas a pagar", "Fornecedores". */
/** As telas que abrem pelo endereço, fora do menu ou "Em breve" nele: o nome da aba. */
const OFF_MENU: Record<string, string> = {
  "/cadastros": "Cadastros",
  "/incentivos": "Incentivos",
  "/conferencia-bancaria": "Conferência bancária",
  "/divergencias": "Divergências",
  "/relatorios/fluxo-de-caixa": "Fluxo de caixa",
  "/relatorios/fluxo-mensal": "Fluxo mensal",
  "/relatorios/recebimentos-projetos": "Recebimentos × ano",
};

/**
 * O nome da aba. Com a mesma tela em mais de uma aba (`tabs`), cada uma ganha o número da posição dela na fileira:
 * "Contas a pagar (1)" e "Contas a pagar (2)", e o número acompanha quando uma fecha (Bruno, 27/11/2026).
 */
export function tabLabel(tab: ScreenTab, tabs: ScreenTab[] = []): string {
  const label = screenLabel(tab);
  const same = tabs.filter((item) => item.path === tab.path).map(tabKey);
  if (same.length < 2) return label;
  return `${label} (${same.indexOf(tabKey(tab)) + 1})`;
}

function screenLabel(tab: ScreenTab): string {
  const aba = new URLSearchParams(tab.query).get("aba");
  for (const entry of NAV) {
    if (entry.href && isActive(entry.href, tab.path, aba)) return entry.label;
    const leaf = entry.children?.find((child) => isActive(child.href, tab.path, aba));
    if (leaf) return leaf.label;
  }
  return OFF_MENU[tab.path] ?? tab.path;
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
      if (tab && !tabs.some((known) => tabKey(known) === tabKey(tab))) tabs.push(tab);
    }
    const last = tabs.at(-1);
    const active = tabs.map(tabKey).find((key) => key === saved.active) ?? (last ? tabKey(last) : null);
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

/**
 * O que a tela de uma aba lembra depois do F5 (dia, período, filtros, ordem), na aba do navegador: recarregar não
 * volta para hoje (reunião de 26/11/2026). Mesmo prefixo das abas: sai junto ao sair do sistema.
 */
export function tabMemoryKey(userId: number, key: string): string {
  return `${TABS_KEY_PREFIX}tela:${userId}:${key}`;
}

export function readTabMemory(storageKey: string | null): Record<string, unknown> | null {
  if (!storageKey) return null;
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function writeTabMemory(storageKey: string | null, value: Record<string, unknown>): void {
  if (!storageKey) return;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // aba anônima ou armazenamento cheio: a tela só não lembra depois do F5
  }
}

/** Ao sair, a lista de abas não fica no navegador para quem usar depois. */
export function forgetTabs(storage: Storage): void {
  for (const key of Object.keys(storage)) if (key.startsWith(TABS_KEY_PREFIX)) storage.removeItem(key);
}

/** O valor lembrado, se ainda for uma das opções da tela; senão, nada (a tela usa o padrão). */
export function remembered<T extends string>(value: unknown, options: readonly { id: T }[]): T | undefined {
  return options.find((option) => option.id === value)?.id;
}

/** Um dia lembrado (aaaa-mm-dd), ou nada. */
export function rememberedDay(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

/** Os filtros lembrados (nome do filtro → ids separados por vírgula), ou nada se não for isso. */
export function rememberedFilters(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, item]) => typeof item === "string") ? Object.fromEntries(entries) : null;
}
