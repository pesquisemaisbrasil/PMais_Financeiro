"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

function HomeContent() {
  const { user, logout } = useAuth();

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-center text-lg font-semibold text-brand-cinza-escuro">
            Olá, {user?.name}
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted-foreground">
            Você entrou no P+ Financeiro. Os módulos aparecem aqui conforme forem entregues.
          </p>
          <Button variant="outline" className="w-full" onClick={logout}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function HomePage() {
  return (
    <RequireAuth>
      <HomeContent />
    </RequireAuth>
  );
}
