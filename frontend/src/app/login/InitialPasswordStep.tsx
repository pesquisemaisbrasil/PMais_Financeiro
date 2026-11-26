"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type MfaChallenge, setInitialPassword } from "@/lib/api";
import { useFormAction } from "@/lib/use-form-action";

const MISMATCH = "As duas senhas não são iguais. Digite de novo.";

/**
 * Primeiro acesso com a senha inicial, ou senha provisória depois do `make redefinir-senha`: a pessoa
 * cria a senha dela antes do autenticador (pedido do Bruno, 25/11/2026; spec acesso-e-auditoria). A
 * regra de força é a do servidor, que diz o que falta.
 */
export function InitialPasswordStep({
  mfaToken,
  firstAccess,
  onChanged,
  onBack,
}: {
  mfaToken: string;
  /** Primeiro acesso: o autenticador ainda vai ser cadastrado. Senão, a senha foi redefinida. */
  firstAccess: boolean;
  /** A senha nova foi salva: segue para o autenticador com o token parcial novo. */
  onChanged: (challenge: MfaChallenge) => Promise<void>;
  onBack: () => void;
}) {
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [visible, setVisible] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const { error, submitting, run } = useFormAction();
  const shownError = mismatch ? MISMATCH : error;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repeated) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    run(async () => onChanged(await setInitialPassword(mfaToken, password)));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <CardContent className="space-y-4">
        <p className="text-center text-sm text-muted-foreground">
          {firstAccess
            ? "Este é o seu primeiro acesso. Troque a senha inicial por uma senha só sua."
            : "Sua senha foi redefinida. Troque a senha provisória por uma senha só sua."}
        </p>
        <Alert>
          <AlertDescription>
            {firstAccess
              ? "Anote a senha nova num lugar seguro. Depois dela, você cadastra o app autenticador."
              : "Anote a senha nova num lugar seguro. Depois dela, digite o código do app autenticador, como sempre."}
          </AlertDescription>
        </Alert>
        <div className="grid gap-2">
          <Label htmlFor="new-password">Senha nova</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={visible ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              required
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setVisible((shown) => !shown)}
              aria-label={visible ? "Ocultar as senhas" : "Mostrar as senhas"}
              aria-pressed={visible}
              aria-controls="new-password repeat-password"
              className="absolute right-0 top-0 text-muted-foreground"
            >
              {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            De 8 a 72 caracteres, com letra maiúscula, letra minúscula, número e um caractere especial
            (como ! @ #). Sem espaços.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="repeat-password">Repita a senha nova</Label>
          <Input
            id="repeat-password"
            type={visible ? "text" : "password"}
            value={repeated}
            onChange={(e) => setRepeated(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {shownError && (
          <Alert variant="destructive">
            <AlertDescription>{shownError}</AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Salvando…" : "Salvar e continuar"}
        </Button>
        <Button type="button" variant="link" onClick={onBack}>
          Voltar ao início
        </Button>
      </CardFooter>
    </form>
  );
}
