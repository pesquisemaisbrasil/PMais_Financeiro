"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { login, verifyMfa } from "@/lib/api";
import {
  DEMO,
  demoCode,
  demoCredentials,
  getDemoState,
  resetDemo,
  startDemo,
  subscribeDemo,
  type DemoCredentials,
} from "@/lib/demo/client";
import { useFormAction } from "@/lib/use-form-action";

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
                Na primeira vez pode levar alguns segundos. Todos os dados são fictícios e ficam só neste
                navegador.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

/** Na tela de entrada da demonstração: e-mail, senha e código fictícios, e um botão que entra. */
export function DemoLoginHelp({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [credentials, setCredentials] = useState<DemoCredentials | null>(null);
  const [code, setCode] = useState("");
  const { error, submitting, run } = useFormAction();

  useEffect(() => {
    let alive = true;
    demoCredentials()
      .then((value) => alive && setCredentials(value))
      .catch(() => undefined);
    const refresh = () =>
      demoCode()
        .then((value) => alive && setCode(value))
        .catch(() => undefined);
    refresh();
    // o código do autenticador muda a cada 30 segundos
    const timer = window.setInterval(refresh, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  function enter() {
    if (!credentials) return;
    run(async () => {
      const challenge = await login(credentials.email, credentials.password);
      await verifyMfa(challenge.mfa_token, await demoCode());
      await onSignedIn();
    });
  }

  return (
    <CardContent className="space-y-3 pt-0">
      <Alert>
        <AlertDescription className="space-y-1 text-xs">
          <p className="font-semibold text-brand-cinza-escuro">Versão de demonstração, só com dados fictícios</p>
          <p>
            Para entrar, use o botão abaixo. Ou digite: e-mail <strong>{credentials?.email ?? "…"}</strong>,
            senha <strong>{credentials?.password ?? "…"}</strong> e o código <strong>{code || "…"}</strong>{" "}
            (muda a cada 30 segundos).
          </p>
        </AlertDescription>
      </Alert>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="button" className="w-full" disabled={submitting || !credentials} onClick={enter}>
        {submitting ? "Entrando…" : "Entrar na demonstração"}
      </Button>
    </CardContent>
  );
}

/** No menu da demonstração: apaga o que foi feito e volta aos dados de exemplo. */
export function DemoResetButton({ compact }: { compact: boolean }) {
  const [busy, setBusy] = useState(false);
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mb-2 w-full"
      disabled={busy}
      onClick={restore}
      aria-label="Restaurar dados de exemplo"
      title="Apaga o que você fez e volta aos dados de exemplo"
    >
      <RotateCcw aria-hidden="true" />
      {!compact && <span>Restaurar dados de exemplo</span>}
    </Button>
  );
}
