"use client";

import { BookUser, ArrowUpRight, House, LogOut, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getHome } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PAYABLES_CHANGED } from "@/lib/payables";
import { cn } from "@/lib/utils";

const GROUPS: {
  title: string;
  links: { href: string; label: string; icon: LucideIcon; counted: boolean }[];
}[] = [
  { title: "Visão geral", links: [{ href: "/", label: "Início", icon: House, counted: false }] },
  { title: "Dia a dia", links: [{ href: "/contas-a-pagar", label: "Contas a pagar", icon: ArrowUpRight, counted: true }] },
  { title: "Configuração", links: [{ href: "/cadastros", label: "Cadastros", icon: BookUser, counted: false }] },
];

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
  const [badge, setBadge] = useState(0);
  // Só existe depois do login, sempre no navegador: ler aqui não diverge do servidor.
  const [collapsed, setCollapsed] = useState(readCollapsed);

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

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // sem armazenamento o menu só não lembra da escolha
    }
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
        "flex w-full flex-shrink-0 flex-col self-start border-b border-border bg-card transition-[width] duration-150 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r",
        collapsed ? "md:w-16" : "md:w-64"
      )}
    >
      <div
        className={cn(
          "flex min-h-16 items-center gap-2.5 bg-brand-azul-deep px-5 py-[18px]",
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
            onClick={toggle}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </Button>
        </Hint>
      </div>

      <nav
        className={cn("flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3.5", collapsed && "md:px-2")}
        aria-label="Menu principal"
      >
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <p
              className={cn(
                "px-3 pb-1 pt-3 text-[11px] uppercase tracking-[.06em] text-muted-foreground",
                collapsed && "md:hidden"
              )}
            >
              {group.title}
            </p>
            {group.links.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Hint key={link.href} show={collapsed} label={link.label}>
                  <Link
                    href={link.href}
                    aria-label={link.label}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 whitespace-nowrap rounded-2xl px-3 py-[9px] text-sm font-medium",
                      collapsed && "md:justify-center md:px-0",
                      active
                        ? "bg-brand-azul-deep text-white shadow-sm"
                        : "text-brand-cinza-escuro/75 hover:bg-muted hover:text-brand-cinza-escuro"
                    )}
                  >
                    <Icon size={16} strokeWidth={2} />
                    <span className={cn(collapsed && "md:hidden")}>{link.label}</span>
                    {link.counted && badge > 0 && (
                      <span
                        title={badge === 1 ? "1 pendência" : `${badge} pendências`}
                        className={cn(
                          "ml-auto rounded-full px-[7px] text-[11px] font-bold leading-[18px]",
                          collapsed && "md:absolute md:-right-0.5 md:-top-0.5 md:ml-0 md:px-[5px] md:leading-4",
                          active && !collapsed ? "bg-white/25 text-white" : "bg-[#fef3c7] text-[#b45309]"
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                </Hint>
              );
            })}
          </div>
        ))}
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
        </div>
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
    </aside>
  );
}
