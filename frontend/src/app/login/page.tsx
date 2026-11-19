"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrowserApprovalError, listFeedback, login, startMfaSetup, verifyMfa } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { publicAsset } from "@/lib/basePath";
import { DEMO, demoCode, demoCredentials, type DemoAccess } from "@/lib/demo/client";
import { saveFeedbackKey } from "@/lib/feedback";
import { useFormAction } from "@/lib/use-form-action";
import { MfaSetupStep, MfaVerifyStep, RecoveryCodesStep, WaitingStep } from "./MfaSteps";

type Step =
  | { name: "credentials" }
  | { name: "verify"; mfaToken: string }
  | { name: "setup"; mfaToken: string; secret: string; otpauthUri: string }
  | { name: "recovery"; codes: string[]; then?: Waiting }
  | Waiting;

/** O navegador ainda não foi liberado pelo administrador (ou foi recusado). */
type Waiting = { name: "waiting"; message: string; refused: boolean };

function waitingFrom(error: BrowserApprovalError): Waiting {
  return { name: "waiting", message: error.message, refused: error.browser === "recusado" };
}

const TITLES: Record<Step["name"], string> = {
  credentials: "Entrar na sua conta",
  verify: "Verificação em duas etapas",
  setup: "Cadastre o segundo fator",
  recovery: "Guarde seus códigos de recuperação",
  waiting: "Computador ainda não liberado",
};

// O que o backend manda em ?erro= quando o login por Google ou Microsoft não termina. Os botões saíram
// da tela (Bruno, 17/11/2026), mas o endereço do backend continua: quem chegar por ele lê o aviso.
const SSO_ERRORS: Record<string, string> = {
  sso_indisponivel: "Esse login ainda não está disponível. Use e-mail e senha.",
  sso_conta: "Essa conta não tem acesso ao Financeiro. Fale com o administrador.",
  sso_falhou: "Não foi possível entrar por essa conta. Tente de novo ou use e-mail e senha.",
  navegador_pendente:
    "Este computador ainda não está liberado. O pedido foi para o administrador; quando ele liberar, entre de novo.",
  navegador_recusado: "O administrador não liberou este computador. Fale com ele.",
};

function CredentialsStep({
  onStep,
  onSignedIn,
  ssoError,
}: {
  onStep: (step: Step) => void;
  onSignedIn: () => Promise<void>;
  ssoError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Na demonstração há dois acessos: o do financeiro (as meninas) e o do desenvolvimento, que vê as
  // solicitações e entra com a chave guardada no Netlify (docs/specs/solicitacoes.md).
  const [access, setAccess] = useState<DemoAccess>("financeiro");
  const [devKey, setDevKey] = useState("");
  const { error, submitting, run } = useFormAction();
  const shownError = error ?? ssoError;

  // Na demonstração o login do financeiro é sempre o mesmo (fictício): já vem preenchido.
  useEffect(() => {
    if (!DEMO) return;
    let alive = true;
    demoCredentials("financeiro")
      .then((credentials) => {
        if (!alive) return;
        setEmail(credentials.email);
        setPassword(credentials.password);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /** O código do autenticador da demonstração é fictício e vem do próprio navegador: não se digita. */
  async function demoSignIn(target: DemoAccess, user: string, secret: string) {
    const challenge = await login(user, secret);
    await verifyMfa(challenge.mfa_token, await demoCode(target));
    await onSignedIn();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      if (DEMO && access === "dev") {
        // A chave é conferida pela função do Netlify; a conta do desenvolvimento é fictícia.
        const key = devKey.trim();
        await listFeedback(key);
        saveFeedbackKey(key);
        const dev = await demoCredentials("dev");
        await demoSignIn("dev", dev.email, dev.password);
        return;
      }
      if (DEMO) {
        await demoSignIn("financeiro", email, password);
        return;
      }
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

  const fields = (
    <>
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
    </>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <CardContent className="space-y-4">
        {DEMO ? (
          <Tabs value={access} onValueChange={(value) => setAccess(value as DemoAccess)}>
            <TabsList className="w-full">
              <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
              <TabsTrigger value="dev">Desenvolvimento</TabsTrigger>
            </TabsList>
            <TabsContent value="financeiro" className="space-y-4 pt-2">
              {fields}
            </TabsContent>
            <TabsContent value="dev" className="grid gap-2 pt-2">
              <Label htmlFor="dev-key">Chave de acesso</Label>
              <Input
                id="dev-key"
                type="password"
                value={devKey}
                onChange={(e) => setDevKey(e.target.value)}
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                Só para quem cuida do sistema: abre as solicitações que a equipe envia.
              </p>
            </TabsContent>
          </Tabs>
        ) : (
          fields
        )}

        {shownError && (
          <Alert variant="destructive">
            <AlertDescription>{shownError}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      {/* Só e-mail e senha: sem "Entrar com Google" e "Entrar com Microsoft" (Bruno, 17/11/2026). */}
      <CardFooter className="flex-col gap-3">
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Entrando…" : "Entrar"}
        </Button>
      </CardFooter>
    </form>
  );
}

function LoginContent() {
  const { user, loadUser } = useAuth();
  const router = useRouter();
  const ssoError = SSO_ERRORS[useSearchParams().get("erro") ?? ""] ?? null;
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
            <Image src={publicAsset("/logo.png")} alt="P+ Financeiro" width={180} height={65} priority />
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

        {step.name === "credentials" && (
          <CredentialsStep onStep={setStep} onSignedIn={loadUser} ssoError={ssoError} />
        )}
        {step.name === "verify" && (
          <MfaVerifyStep
            mfaToken={step.mfaToken}
            onVerified={loadUser}
            onWaiting={(error) => setStep(waitingFrom(error))}
            onBack={restart}
          />
        )}
        {step.name === "setup" && (
          <MfaSetupStep
            mfaToken={step.mfaToken}
            secret={step.secret}
            otpauthUri={step.otpauthUri}
            onConfirmed={(codes, waiting) =>
              setStep({ name: "recovery", codes, then: waiting ? waitingFrom(waiting) : undefined })
            }
            onBack={restart}
          />
        )}
        {step.name === "recovery" && (
          <RecoveryCodesStep
            codes={step.codes}
            onDone={async () => {
              // Autenticador cadastrado num navegador que o admin ainda não liberou: depois dos códigos,
              // o aviso, sem sessão.
              if (step.then) setStep(step.then);
              else await loadUser();
            }}
          />
        )}
        {step.name === "waiting" && (
          <WaitingStep message={step.message} refused={step.refused} onBack={restart} />
        )}
      </Card>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams pede Suspense para a página continuar sendo gerada no build
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
