"use client";

import { Suspense } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Sidebar } from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <TooltipProvider>
        <div className="flex min-h-screen flex-1 flex-col md:flex-row">
          <Suspense>
            <Sidebar />
          </Suspense>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </TooltipProvider>
    </RequireAuth>
  );
}
