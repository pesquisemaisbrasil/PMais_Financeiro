"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { DEMO, getDemoState, resetDemo, startDemo, subscribeDemo } from "@/lib/demo/client";

/**
 * Na versão de demonstração o backend roda dentro do navegador e leva alguns segundos para ligar:
 * enquanto isso, esta tela. Fora da demonstração, não faz nada.
 */
export function DemoGate({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribeDemo, getDemoState, getDemoState);
  useEffect(() => {
    if (DEMO) startDemo().catch(() => undefined);
  }, []);

  if (!DEMO || state.phase === "ready") return <>{children}</>;

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <h1 className="text-lg font-semibold text-brand-cinza-escuro">
            {state.phase === "error" ? "Não foi possível abrir a demonstração" : "Preparando a demonstração"}
          </h1>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.phase === "error" ? (
            <>
              <Alert variant="destructive">
                <AlertDescription>{state.text}</AlertDescription>
              </Alert>
              <Button onClick={() => window.location.reload()}>Tentar de novo</Button>
            </>
          ) : (
            <>
              <Spinner className="mx-auto size-6 text-brand-azul-deep" />
              <p className="text-sm text-brand-cinza-escuro">{state.text}</p>
              <p className="text-xs text-muted-foreground">
                Na primeira vez pode levar alguns segundos. Todos os dados são fictícios. Recarregar a página
                volta aos dados de exemplo.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

/** No menu da demonstração: apaga o que foi feito e volta aos dados de exemplo (pede confirmação). */
export function DemoResetButton({ compact }: { compact: boolean }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  if (!DEMO) return null;

  async function restore() {
    setBusy(true);
    try {
      await resetDemo();
    } finally {
      // Recarrega a página: some o que está em memória e, sem sessão, a tela volta para o login.
      window.location.reload();
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mb-2 w-full"
        disabled={busy}
        onClick={() => setAsking(true)}
        aria-label="Restaurar dados de exemplo"
        title="Apaga o que você fez e volta aos dados de exemplo"
      >
        <RotateCcw aria-hidden="true" />
        {!compact && <span>Restaurar dados de exemplo</span>}
      </Button>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar os dados de exemplo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tudo o que você lançou, baixou ou conciliou nesta demonstração será apagado, e ela volta ao ponto de
              partida. Os dados são fictícios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restore()}>Restaurar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
