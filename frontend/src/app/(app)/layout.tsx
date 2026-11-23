"use client";

import { Suspense } from "react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { RequireAuth } from "@/components/RequireAuth";
import { ScreenTabsBar, ScreenTabsContent, ScreenTabsProvider } from "@/components/ScreenTabs";
import { Sidebar } from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <TooltipProvider>
        <Suspense>
          {/* Abas de telas, como no VS Code: a tela bloqueada pelo admin aparece como "Tela não liberada" */}
          <ScreenTabsProvider>
            <div className="flex min-h-[calc(100vh-var(--faixa,0px))] flex-1 flex-col md:flex-row print:hidden">
              <Suspense>
                <Sidebar />
              </Suspense>
              <div className="min-w-0 flex-1">
                {/* Busca em todo o sistema, no alto de todas as telas (spec busca-geral): só a barra, no centro */}
                <div className="flex justify-center px-6 pt-5">
                  <GlobalSearch />
                </div>
                <ScreenTabsBar />
                <ScreenTabsContent>{children}</ScreenTabsContent>
              </div>
            </div>
          </ScreenTabsProvider>
        </Suspense>
      </TooltipProvider>
    </RequireAuth>
  );
}
