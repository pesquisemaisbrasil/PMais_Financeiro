"use client";

import { ArrowUpRight, House, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getHome } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PAYABLES_CHANGED } from "@/lib/payables";
import { cn } from "@/lib/utils";

const GROUPS = [
  { title: "Visão geral", links: [{ href: "/", label: "Início", icon: House, counted: false }] },
  { title: "Dia a dia", links: [{ href: "/contas-a-pagar", label: "Contas a pagar", icon: ArrowUpRight, counted: true }] },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
};

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [badge, setBadge] = useState(0);

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

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-shrink-0 flex-col self-start border-r border-border bg-card">
      <div className="flex items-center gap-2.5 bg-brand-azul-deep px-5 py-[18px]">
        <Image src="/logo-branco.png" alt="P+ Financeiro" width={77} height={28} priority />
        <span className="border-l border-white/40 pl-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-white">
          Financeiro
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3.5" aria-label="Menu principal">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-[.06em] text-muted-foreground">{group.title}</p>
            {group.links.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 whitespace-nowrap rounded-2xl px-3 py-[9px] text-sm font-medium",
                    active
                      ? "bg-brand-azul-deep text-white shadow-sm"
                      : "text-brand-cinza-escuro/75 hover:bg-muted hover:text-brand-cinza-escuro"
                  )}
                >
                  <Icon size={16} strokeWidth={2} />
                  {link.label}
                  {link.counted && badge > 0 && (
                    <span
                      title={`${badge} pendências`}
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
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 p-1">
          <Avatar className="size-[34px]">
            <AvatarFallback className="bg-brand-azul-deep/10 text-xs font-bold text-brand-azul-deep">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-brand-cinza-escuro">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-1 w-full justify-start gap-3 rounded-xl px-3 text-brand-cinza-escuro/70 hover:text-red-600"
          onClick={logout}
        >
          <LogOut size={16} />
          Sair
        </Button>
      </div>
    </aside>
  );
}
