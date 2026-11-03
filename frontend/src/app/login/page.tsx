"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, startMfaSetup } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useFormAction } from "@/lib/use-form-action";
import { MfaSetupStep, MfaVerifyStep, RecoveryCodesStep } from "./MfaSteps";

type Step =
  | { name: "credentials" }
  | { name: "verify"; mfaToken: string }
  | { name: "setup"; mfaToken: string; secret: string; otpauthUri: string }
  | { name: "recovery"; codes: string[] };

const TITLES: Record<Step["name"], string> = {
  credentials: "Entrar na sua conta",
  verify: "Verificação em duas etapas",
  setup: "Cadastre o segundo fator",
  recovery: "Guarde seus códigos de recuperação",
};

function CredentialsStep({ onStep }: { onStep: (step: Step) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { error, submitting, run } = useFormAction();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      const challenge = await login(email, password);
      if (!challenge.setup_required) {
        onStep({ name: "verify", mfaToken: challenge.mfa_token });
        return;
      }
      const setup = await startMfaSetup(challenge.mfa_token);
      onStep({
        name: "setup",
        mfaToken: challenge.mfa_token,
        secret: setup.secret,
        otpauthUri: setup.otpauth_uri,
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Lock
              size={15}
              strokeWidth={2}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-cinza-escuro/40"
            />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="pl-9 pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              aria-controls="password"
              className="absolute right-0 top-0 text-muted-foreground"
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Entrando…" : "Entrar"}
        </Button>
      </CardFooter>
    </form>
  );
}

export default function LoginPage() {
  const { user, loadUser } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ name: "credentials" });

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  const restart = () => setStep({ name: "credentials" });

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-6 flex justify-center">
            <Image src="/logo.png" alt="P+ Financeiro" width={180} height={65} priority />
          </div>

          <div className="mb-6 flex justify-center">
            <span className="rounded-full bg-brand-azul-neutro/20 px-3 py-1 text-xs font-semibold text-brand-azul-deep">
              P+ FINANCEIRO · ACESSO INTERNO
            </span>
          </div>

          <h1 className="text-center text-lg font-semibold text-brand-cinza-escuro">
            {TITLES[step.name]}
          </h1>
        </CardHeader>

        {step.name === "credentials" && <CredentialsStep onStep={setStep} />}
        {step.name === "verify" && (
          <MfaVerifyStep mfaToken={step.mfaToken} onVerified={loadUser} onBack={restart} />
        )}
        {step.name === "setup" && (
          <MfaSetupStep
            mfaToken={step.mfaToken}
            secret={step.secret}
            otpauthUri={step.otpauthUri}
            onConfirmed={(codes) => setStep({ name: "recovery", codes })}
            onBack={restart}
          />
        )}
        {step.name === "recovery" && <RecoveryCodesStep codes={step.codes} onDone={loadUser} />}
      </Card>
    </main>
  );
}
