"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/auth-context";

function HomeContent() {
  const { user } = useAuth();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-xl font-semibold text-brand-cinza-escuro">Olá, {user?.name}</h1>
      <p className="text-sm text-muted-foreground">
        Você entrou no P+ Financeiro. Os módulos aparecem aqui conforme forem entregues.
      </p>
    </main>
  );
}

export default function HomePage() {
  return (
    <RequireAuth>
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex-1 overflow-y-auto">
          <HomeContent />
        </div>
      </div>
    </RequireAuth>
  );
}
