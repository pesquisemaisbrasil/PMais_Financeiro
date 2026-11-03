"use client";

import { Check, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmMfaSetup, verifyMfa } from "@/lib/api";
import { useFormAction } from "@/lib/use-form-action";

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

export function MfaVerifyStep({
  mfaToken,
  onVerified,
  onBack,
}: {
  mfaToken: string;
  onVerified: () => Promise<void>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [usingRecovery, setUsingRecovery] = useState(false);
  const { error, submitting, run } = useFormAction();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      try {
        await verifyMfa(mfaToken, code);
      } catch (err) {
        setCode("");
        throw err;
      }
      await onVerified();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <CardContent className="space-y-4">
        <p className="text-center text-sm text-muted-foreground">
          {usingRecovery
            ? "Digite um dos códigos de recuperação que você guardou. Cada um vale uma vez."
            : "Digite o código de 6 dígitos do seu app autenticador."}
        </p>
        <div className="grid gap-2">
          <Label htmlFor="code">{usingRecovery ? "Código de recuperação" : "Código"}</Label>
          <Input
            id="code"
            key={usingRecovery ? "recovery" : "totp"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={usingRecovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={32}
            autoFocus
            required
          />
        </div>
        <FormError error={error} />
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Verificando…" : "Entrar"}
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setUsingRecovery((value) => !value);
            setCode("");
          }}
        >
          {usingRecovery ? "Usar o código do app" : "Usar um código de recuperação"}
        </Button>
        <Button type="button" variant="link" onClick={onBack}>
          Voltar ao início
        </Button>
      </CardFooter>
    </form>
  );
}

export function MfaSetupStep({
  mfaToken,
  secret,
  otpauthUri,
  onConfirmed,
  onBack,
}: {
  mfaToken: string;
  secret: string;
  otpauthUri: string;
  onConfirmed: (recoveryCodes: string[]) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const { error, submitting, run } = useFormAction();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      try {
        onConfirmed(await confirmMfaSetup(mfaToken, code));
      } catch (err) {
        setCode("");
        throw err;
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <CardContent className="space-y-4">
        <p className="text-center text-sm text-muted-foreground">
          O acesso ao Financeiro pede um segundo fator. Leia o QR code com um app autenticador,
          como Google Authenticator ou Microsoft Authenticator.
        </p>
        <div className="flex justify-center">
          <QRCodeSVG value={otpauthUri} size={168} title="QR code para cadastrar o autenticador" />
        </div>
        <div className="grid gap-1 text-center">
          <p className="text-xs text-muted-foreground">Não consegue ler? Digite esta chave no app:</p>
          <code className="break-all text-xs font-medium text-brand-cinza-escuro">{secret}</code>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="code">Código que o app mostrar</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={32}
            required
          />
        </div>
        <FormError error={error} />
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Confirmando…" : "Confirmar"}
        </Button>
        <Button type="button" variant="link" onClick={onBack}>
          Voltar ao início
        </Button>
      </CardFooter>
    </form>
  );
}

export function RecoveryCodesStep({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const { error, submitting, run } = useFormAction();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      // sem permissão de área de transferência: os códigos seguem na tela para anotar
    }
  }

  return (
    <>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            Guarde estes códigos em um lugar seguro. Eles só aparecem agora, cada um vale uma vez e
            são a saída se você perder o celular.
          </AlertDescription>
        </Alert>
        <ul className="grid grid-cols-1 gap-1 text-center font-mono text-sm text-brand-cinza-escuro">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <FormError error={error} />
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <Button type="button" variant="outline" className="w-full" onClick={handleCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Códigos copiados" : "Copiar códigos"}
        </Button>
        <Button
          type="button"
          disabled={submitting}
          className="w-full"
          onClick={() => run(onDone)}
        >
          {submitting ? "Entrando…" : "Já guardei, continuar"}
        </Button>
      </CardFooter>
    </>
  );
}
