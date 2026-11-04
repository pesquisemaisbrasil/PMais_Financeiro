"use client";

import { LayoutDashboard, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const LINKS = [{ href: "/", label: "Início", icon: LayoutDashboard }];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
};

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-shrink-0 flex-col self-start border-r border-border bg-card">
      <div className="flex h-16 items-center border-b border-border px-5">
        <Image src="/logo.png" alt="P+ Financeiro" width={130} height={34} priority />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Menu
        </p>
        {LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-azul-deep text-white shadow-sm"
                  : "text-brand-cinza-escuro/70 hover:bg-muted hover:text-brand-cinza-escuro"
              )}
            >
              <Icon size={17} strokeWidth={2} className={active ? "text-white" : "text-brand-cinza-escuro/45"} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <Avatar className="size-9">
            <AvatarFallback className="bg-brand-azul-deep text-xs font-bold text-white">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-brand-cinza-escuro">{user.name}</p>
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
