"use client";

import { Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/finance";
import { GlobalSearch } from "@/components/GlobalSearch";
import { RequireAuth } from "@/components/RequireAuth";
import { Sidebar } from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { screenAllowed } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";

/** Tela que o admin bloqueou para a pessoa não abre nem pelo endereço (o servidor também recusa). */
function ScreenGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  if (user && !screenAllowed(user, pathname)) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
        <PageHeader title="Tela não liberada" icon={Lock} />
        <p className="text-sm text-muted-foreground">Esta tela não está liberada para você. Fale com o administrador.</p>
      </main>
    );
  }
  return children;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <TooltipProvider>
        <div className="flex min-h-[calc(100vh-var(--faixa,0px))] flex-1 flex-col md:flex-row print:hidden">
          <Suspense>
            <Sidebar />
          </Suspense>
          <div className="min-w-0 flex-1">
            {/* Busca em todo o sistema, no alto de todas as telas (spec busca-geral): só a barra, no centro */}
            <div className="flex justify-center px-6 pt-5">
              <GlobalSearch />
            </div>
            <ScreenGate>{children}</ScreenGate>
          </div>
        </div>
      </TooltipProvider>
    </RequireAuth>
  );
}
