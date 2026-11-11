"use client";

import {
  BookUser,
  ChartColumn,
  ChevronDown,
  Compass,
  House,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { TourAutoStart, startTour } from "@/components/ProductTour";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getHome } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PAYABLES_CHANGED } from "@/lib/payables";
import { cn } from "@/lib/utils";

type Leaf = {
  label: string;
  /** Sem endereço = tela que ainda não existe: aparece como "Em breve", sem link. */
  href?: string;
  counted?: boolean;
};
type Entry = { id: string; label: string; icon: LucideIcon; href?: string; children?: Leaf[] };

const NAV: Entry[] = [
  { id: "inicio", label: "Início", icon: House, href: "/" },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: Wallet,
    children: [
      { href: "/contas-a-pagar", label: "Contas a pagar", counted: true },
      { href: "/incentivos", label: "Incentivos" },
      { href: "/contas-a-receber", label: "Contas a receber" },
      { label: "Notas e RPA" },
      { label: "Conferência bancária" },
      { href: "/divergencias", label: "Divergências" },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icon: ChartColumn,
    children: [
      { href: "/relatorios/projeto", label: "Relatório do projeto" },
      { href: "/incentivos", label: "Incentivos" },
      { label: "Fluxo de caixa" },
      { label: "DRE" },
      { label: "Resultado por projeto" },
      { label: "Extrato × despesas" },
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    icon: BookUser,
    children: [
      { href: "/cadastros?aba=companies", label: "Empresas" },
      { href: "/cadastros?aba=units", label: "Unidades" },
      { href: "/cadastros?aba=costCenters", label: "Centros de custo" },
      { href: "/cadastros?aba=customers", label: "Clientes" },
      { href: "/cadastros?aba=suppliers", label: "Fornecedores" },
      { href: "/cadastros?aba=categories", label: "Plano de contas" },
      { href: "/cadastros?aba=projects", label: "Projetos" },
      { href: "/cadastros?aba=bankAccounts", label: "Contas bancárias" },
      { href: "/cadastros?aba=paymentMethods", label: "Formas de pagamento" },
      { href: "/cadastros?aba=holidays", label: "Feriados" },
    ],
  },
];

const ROW =
  "relative flex items-center gap-2.5 whitespace-nowrap rounded-2xl px-3 py-[9px] text-sm font-medium transition-colors duration-150";
const ROW_ACTIVE =
  "bg-[linear-gradient(135deg,#4063ee,#5a52f0)] text-white shadow-[0_8px_16px_-8px_rgb(64_99_238/.75)]";
const ROW_IDLE = "text-brand-cinza-escuro/75 hover:bg-accent hover:text-brand-azul-deep";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
};

const COLLAPSED_KEY = "financeiro:menu-recolhido";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** A aba do Cadastros vem do endereço (?aba=); sem ela, vale a primeira. */
function isActive(href: string | undefined, pathname: string, aba: string | null): boolean {
  if (!href) return false;
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  return !query || (aba ?? "companies") === new URLSearchParams(query).get("aba");
}

/** Menu recolhido só tem o ícone: o nome aparece ao passar o mouse e ao focar pelo teclado. */
function Hint({ show, label, children }: { show: boolean; label: string; children: React.ReactElement }) {
  if (!show) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const aba = useSearchParams().get("aba");
  const [badge, setBadge] = useState(0);
  // Só existe depois do login, sempre no navegador: ler aqui não diverge do servidor.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // Começa com o grupo da tela atual aberto; na primeira visita, o Financeiro.
  const [open, setOpen] = useState<string[]>(() => {
    const current = NAV.find((entry) => entry.children?.some((leaf) => isActive(leaf.href, pathname, aba)));
    return [current?.id ?? "financeiro"];
  });

  useEffect(() => {
    function load() {
      getHome().then(
        (home) => setBadge(home.payablesBadge),
        () => {
          // sem o contador o menu continua funcionando
        }
      );
    }
    load();
    window.addEventListener(PAYABLES_CHANGED, load);
    return () => window.removeEventListener(PAYABLES_CHANGED, load);
  }, []);

  function setCollapsedTo(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // sem armazenamento o menu só não lembra da escolha
    }
  }

  /** Menu recolhido: clicar num grupo expande o menu já com o grupo aberto. */
  function clickGroup(id: string) {
    if (collapsed) {
      setCollapsedTo(false);
      setOpen((ids) => (ids.includes(id) ? ids : [...ids, id]));
      return;
    }
    setOpen((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const toggleLabel = collapsed ? "Expandir menu" : "Recolher menu";

  return (
    <aside
      className={cn(
        "flex w-full flex-shrink-0 flex-col self-start border-b border-border bg-card transition-[width] duration-150 md:sticky md:top-[var(--faixa,0px)] md:h-[calc(100vh-var(--faixa,0px))] md:border-b-0 md:border-r",
        collapsed ? "md:w-16" : "md:w-64"
      )}
    >
      <div
        className={cn(
          "flex min-h-16 items-center gap-2.5 bg-[linear-gradient(135deg,#4063ee_0%,#5a52f0_100%)] px-5 py-[18px]",
          collapsed && "md:justify-center md:px-0"
        )}
      >
        <div className={cn("flex items-center gap-2.5", collapsed && "md:hidden")}>
          <Image src="/logo-branco.png" alt="P+ Financeiro" width={77} height={28} priority />
          <span className="border-l border-white/40 pl-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-white">
            Financeiro
          </span>
        </div>
        <Hint show={collapsed} label={toggleLabel}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            className={cn("hidden text-white hover:bg-white/15 hover:text-white md:inline-flex", !collapsed && "ml-auto")}
            onClick={() => setCollapsedTo(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </Button>
        </Hint>
      </div>

      <nav
        className={cn("flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3.5", collapsed && "md:px-2")}
        aria-label="Menu principal"
        data-tour="menu"
      >
        {NAV.map((entry) => {
          const Icon = entry.icon;
          if (!entry.children) {
            const active = isActive(entry.href, pathname, aba);
            return (
              <Hint key={entry.id} show={collapsed} label={entry.label}>
                <Link
                  href={entry.href ?? "/"}
                  data-tour={`menu-${entry.id}`}
                  aria-label={entry.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(ROW, collapsed && "md:justify-center md:px-0", active ? ROW_ACTIVE : ROW_IDLE)}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span className={cn(collapsed && "md:hidden")}>{entry.label}</span>
                </Link>
              </Hint>
            );
          }
          const expanded = open.includes(entry.id) && !collapsed;
          const hasCurrent = entry.children.some((leaf) => isActive(leaf.href, pathname, aba));
          const pending = !expanded && !collapsed && badge > 0 && entry.children.some((leaf) => leaf.counted);
          return (
            <Collapsible key={entry.id} open={expanded} onOpenChange={() => clickGroup(entry.id)}>
              <Hint show={collapsed} label={entry.label}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    aria-label={entry.label}
                    data-tour={`menu-${entry.id}`}
                    className={cn(
                      ROW,
                      "h-auto w-full justify-start hover:bg-accent",
                      collapsed && "md:justify-center md:px-0",
                      hasCurrent ? "text-brand-azul-deep" : "text-brand-cinza-escuro/75 hover:text-brand-azul-deep"
                    )}
                  >
                    <Icon size={16} strokeWidth={2} />
                    <span className={cn(collapsed && "md:hidden")}>{entry.label}</span>
                    {pending && (
                      <span
                        title={badge === 1 ? "1 pendência" : `${badge} pendências`}
                        className="ml-auto size-2 rounded-full bg-[#f59e0b]"
                      />
                    )}
                    <ChevronDown
                      size={14}
                      className={cn(
                        pending ? "ml-1" : "ml-auto",
                        "transition-transform",
                        expanded && "rotate-180",
                        collapsed && "md:hidden"
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
              </Hint>
              <CollapsibleContent className="flex flex-col gap-0.5 pb-1 pt-0.5">
                {entry.children.map((leaf) => {
                  if (!leaf.href) {
                    return (
                      <span
                        key={leaf.label}
                        aria-disabled="true"
                        className="flex items-center gap-2.5 whitespace-nowrap rounded-2xl py-[7px] pl-9 pr-2 text-[13px] text-muted-foreground/70"
                      >
                        {leaf.label}
                        <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] leading-4">Em breve</span>
                      </span>
                    );
                  }
                  const active = isActive(leaf.href, pathname, aba);
                  return (
                    <Link
                      key={leaf.href}
                      href={leaf.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(ROW, "py-[7px] pl-9 text-[13px]", active ? ROW_ACTIVE : ROW_IDLE)}
                    >
                      {leaf.label}
                      {leaf.counted && badge > 0 && (
                        <span
                          title={badge === 1 ? "1 pendência" : `${badge} pendências`}
                          className={cn(
                            "ml-auto rounded-full px-[7px] text-[11px] font-bold leading-[18px]",
                            active ? "bg-white/25 text-white" : "bg-[#fef3c7] text-[#b45309]"
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </nav>

      <div className={cn("border-t border-border p-3", collapsed && "md:px-2")}>
        <div className={cn("flex items-center gap-2.5 p-1", collapsed && "md:justify-center md:px-0")}>
          <Hint show={collapsed} label={user.name}>
            <Avatar className="size-[34px]">
              <AvatarFallback className="bg-brand-azul-deep/10 text-xs font-bold text-brand-azul-deep">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Hint>
          <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
            <p className="truncate text-[13px] font-semibold text-brand-cinza-escuro">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
          <span data-tour="avisos">
            <NotificationsBell />
          </span>
        </div>
        <Hint show={collapsed} label="Conhecer o sistema">
          <Button
            variant="ghost"
            aria-label="Conhecer o sistema"
            data-tour="passeio"
            className={cn(
              "mt-1 w-full justify-start gap-3 rounded-xl px-3 text-brand-cinza-escuro/70 hover:text-brand-azul-deep",
              collapsed && "md:justify-center md:px-0"
            )}
            onClick={() => void startTour()}
          >
            <Compass size={16} />
            <span className={cn(collapsed && "md:hidden")}>Conhecer o sistema</span>
          </Button>
        </Hint>
        <Hint show={collapsed} label="Sair">
          <Button
            variant="ghost"
            aria-label="Sair"
            className={cn(
              "mt-1 w-full justify-start gap-3 rounded-xl px-3 text-brand-cinza-escuro/70 hover:text-red-600",
              collapsed && "md:justify-center md:px-0"
            )}
            onClick={logout}
          >
            <LogOut size={16} />
            <span className={cn(collapsed && "md:hidden")}>Sair</span>
          </Button>
        </Hint>
      </div>
      <TourAutoStart />
    </aside>
  );
}
