"use client";

import { Lock, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  Suspense,
  createContext,
  lazy,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { PageHeader } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { screenAllowed } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import {
  TABS_KEY_PREFIX,
  closeTab,
  hrefOf,
  openBeside,
  readTabs,
  sync,
  tabLabel,
  toTab,
  writeTabs,
  type ScreenPath,
  type ScreenTab,
  type TabsState,
} from "@/lib/tabs";
import { cn } from "@/lib/utils";

/**
 * Abas de telas, como no VS Code (pedido do Bruno, 23/11/2026; regra em lib/tabs.ts, ADR 0025). Cada tela aberta
 * fica montada dentro de um <Activity>: escondida, ela guarda filtros, busca, seleção e o que foi digitado, e os
 * efeitos dela (buscas, avisos) param até voltar para a frente.
 */

// Cada tela é carregada só quando a aba dela abre.
const PAGES: Record<ScreenPath, ComponentType> = {
  "/": lazy(() => import("@/app/(app)/page")),
  "/contas-a-pagar": lazy(() => import("@/app/(app)/contas-a-pagar/page")),
  "/contas-a-receber": lazy(() => import("@/app/(app)/contas-a-receber/page")),
  "/conferencia-bancaria": lazy(() => import("@/app/(app)/conferencia-bancaria/page")),
  "/divergencias": lazy(() => import("@/app/(app)/divergencias/page")),
  "/relatorios/projeto": lazy(() => import("@/app/(app)/relatorios/projeto/page")),
  "/cadastros": lazy(() => import("@/app/(app)/cadastros/page")),
  "/incentivos": lazy(() => import("@/app/(app)/incentivos/page")),
  "/acessos": lazy(() => import("@/app/(app)/acessos/page")),
  "/demandas": lazy(() => import("@/app/(app)/demandas/page")),
  "/solicitacoes": lazy(() => import("@/app/(app)/solicitacoes/page")),
};

type TabsApi = {
  state: TabsState;
  current: ScreenTab | null;
  select: (tab: ScreenTab) => void;
  close: (tab: ScreenTab) => void;
  /** Duplo clique no menu: abre a tela numa aba nova (ou vai para a dela). */
  openInNewTab: (href: string) => void;
};

const TabsContext = createContext<TabsApi | null>(null);
// O endereço (?...) da própria aba. Null fora das abas.
const OwnQuery = createContext<string | null>(null);

export function useScreenTabs(): TabsApi | null {
  return useContext(TabsContext);
}

/**
 * Os filtros do endereço da própria aba. Use no lugar do useSearchParams nas telas: escondida, a tela continua
 * vendo os dela, e não os da aba da frente (senão a chave de reinício da tela mudaria e o que a pessoa fez se perderia).
 */
export function useScreenSearchParams(): URLSearchParams {
  const global = useSearchParams();
  const own = useContext(OwnQuery);
  return useMemo(() => new URLSearchParams(own ?? global.toString()), [own, global]);
}

function storageKey(userId: number) {
  return `${TABS_KEY_PREFIX}${userId}`;
}

export function ScreenTabsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const current = toTab(usePathname(), useSearchParams().toString());
  const key = user ? storageKey(user.id) : null;
  const [state, setState] = useState<TabsState>(() => {
    try {
      return readTabs(key ? sessionStorage.getItem(key) : null);
    } catch {
      return readTabs(null);
    }
  });
  // A cada navegação, as abas acompanham o endereço (ainda na mesma renderização, sem piscar).
  const synced = sync(state, current);
  if (synced !== state) setState(synced);

  useEffect(() => {
    if (!key) return;
    try {
      sessionStorage.setItem(key, writeTabs(state));
    } catch {
      // aba anônima ou armazenamento cheio: as abas só não voltam depois do F5
    }
  }, [key, state]);

  // A posição da rolagem de cada aba: guardada ao sair, devolvida ao voltar (a rolagem é da janela, não da tela).
  const scrolls = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    if (state.active) window.scrollTo(0, scrolls.current.get(state.active) ?? 0);
  }, [state.active]);

  function select(tab: ScreenTab) {
    if (state.active) scrolls.current.set(state.active, window.scrollY);
    router.push(hrefOf(tab), { scroll: false });
  }
  function close(tab: ScreenTab) {
    const result = closeTab(state, tab.path);
    scrolls.current.delete(tab.path);
    setState(result.state);
    if (result.next) router.push(hrefOf(result.next), { scroll: false });
  }
  function openInNewTab(href: string) {
    const [path, query] = href.split("?");
    const tab = toTab(path, query);
    if (!tab) {
      router.push(href);
      return;
    }
    if (state.active) scrolls.current.set(state.active, window.scrollY);
    setState((prev) => ({ ...prev, tabs: openBeside(prev.tabs, prev.active, tab) }));
    router.push(hrefOf(tab), { scroll: false });
  }

  return (
    <TabsContext.Provider value={{ state, current, select, close, openInNewTab }}>{children}</TabsContext.Provider>
  );
}

/** A fileira de abas, entre a busca geral e o título da tela. */
export function ScreenTabsBar() {
  const api = useScreenTabs();
  // com uma tela só, a fileira não aparece (pedido do Bruno, 23/11)
  if (!api?.current || api.state.tabs.length < 2) return null;
  const { state, select, close } = api;
  return (
    // de ponta a ponta da área da tela (pedido do Bruno, 23/11); sem rolagem vertical, só a de lado com muitas abas
    <div className="w-full border-b border-border pt-4">
      <nav aria-label="Abas abertas" className="flex items-end gap-1 overflow-x-auto overflow-y-hidden px-4">
        {state.tabs.map((tab) => {
          const front = tab.path === state.active;
          const label = tabLabel(tab);
          return (
            <div
              key={tab.path}
              className={cn(
                "group flex shrink-0 items-center rounded-t-lg border border-b-0",
                front
                  ? "border-border bg-white shadow-[inset_0_2px_0_var(--brand-azul-deep)]"
                  : "border-transparent hover:bg-muted"
              )}
            >
              <Button
                variant="ghost"
                size="sm"
                aria-current={front ? "page" : undefined}
                onClick={() => select(tab)}
                // botão do meio do mouse fecha, como no VS Code
                onAuxClick={(event) => event.button === 1 && close(tab)}
                className={cn(
                  "rounded-b-none hover:bg-transparent",
                  front ? "font-semibold text-brand-azul-deep" : "text-muted-foreground"
                )}
              >
                {label}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Fechar a aba ${label}`}
                onClick={() => close(tab)}
                className="mr-1 text-muted-foreground"
              >
                <X />
              </Button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function Blocked() {
  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader title="Tela não liberada" icon={Lock} />
      <p className="text-sm text-muted-foreground">Esta tela não está liberada para você. Fale com o administrador.</p>
    </main>
  );
}

/** As telas abertas: a da frente aparece, as outras ficam escondidas e vivas até a aba fechar. */
export function ScreenTabsContent({ children }: { children: React.ReactNode }) {
  const api = useScreenTabs();
  const { user } = useAuth();
  // Endereço que não é uma das telas: a página do Next, como antes.
  if (!api?.current) return children;
  return api.state.tabs.map((tab) => {
    const Page = PAGES[tab.path as ScreenPath];
    return (
      <Activity key={tab.path} mode={tab.path === api.state.active ? "visible" : "hidden"}>
        <OwnQuery.Provider value={tab.query}>
          <Suspense>{user && !screenAllowed(user, tab.path) ? <Blocked /> : <Page />}</Suspense>
        </OwnQuery.Provider>
      </Activity>
    );
  });
}
