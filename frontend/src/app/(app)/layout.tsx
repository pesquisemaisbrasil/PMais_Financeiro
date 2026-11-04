"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { Sidebar } from "@/components/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <TooltipProvider>
        <div className="flex min-h-screen flex-1">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </TooltipProvider>
    </RequireAuth>
  );
}
