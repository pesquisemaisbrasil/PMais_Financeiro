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
                {/* A faixa do alto: abas à esquerda e a busca em todo o sistema, recolhida, à direita (Ctrl+K) */}
                <ScreenTabsBar>
                  <GlobalSearch />
                </ScreenTabsBar>
                <ScreenTabsContent>{children}</ScreenTabsContent>
              </div>
            </div>
          </ScreenTabsProvider>
        </Suspense>
      </TooltipProvider>
    </RequireAuth>
  );
}
