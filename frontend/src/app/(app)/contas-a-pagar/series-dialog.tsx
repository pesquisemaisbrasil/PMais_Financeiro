"use client";

import { useState } from "react";
import { Field, FormError } from "@/components/finance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cancelSeries, editSeries } from "@/lib/api";
import {
  SERIES_SCOPES,
  parseMoney,
  plural,
  seriesLabel,
  type PayableRow,
  type SeriesScope,
} from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";

/** Editar ou cancelar uma ocorrência da série: só esta, esta e as seguintes, ou todas em aberto. */
export function SeriesDialog({
  row,
  mode,
  onClose,
  onDone,
}: {
  row: PayableRow;
  mode: "edit" | "cancel";
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [scope, setScope] = useState<SeriesScope>("only");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const series = row.series;
  if (!series) return null;
  // "Só esta" não cancela: cancelar uma conta avulsa já existe na linha
  const scopes = mode === "cancel" ? SERIES_SCOPES.filter((s) => s.id !== "only") : SERIES_SCOPES;
  const current = scopes.some((s) => s.id === scope) ? scope : scopes[0].id;

  async function submit() {
    setLocalError(null);
    if (mode === "cancel") {
      if (!reason.trim()) return setLocalError("Diga o motivo do cancelamento.");
      return run(async () => {
        const { count } = await cancelSeries(row.id, { scope: current, reason: reason.trim() });
        onDone(`${plural(count, "conta cancelada", "contas canceladas")}. O que já foi pago continua.`);
      });
    }
    const value = amount.trim() ? parseMoney(amount) : null;
    if (amount.trim() && !value) return setLocalError("Valor inválido.");
    if (!value && !description.trim()) return setLocalError("Mude o valor ou a descrição.");
    return run(async () => {
      const { count } = await editSeries(row.id, {
        scope: current,
        amount: value ?? undefined,
        description: description.trim() || undefined,
      });
      onDone(
        count === 0
          ? "Nenhuma conta mudou: todas já têm baixa ou estão canceladas."
          : `${plural(count, "conta alterada", "contas alteradas")}. O que já foi pago não muda.`,
      );
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{mode === "cancel" ? "Cancelar contas da série" : "Alterar contas da série"}</DialogTitle>
          <DialogDescription>
            {row.description} · ocorrência {seriesLabel(series)}
          </DialogDescription>
        </DialogHeader>
        <FormError message={localError ?? error} />
        <RadioGroup value={current} onValueChange={(next) => setScope(next as SeriesScope)} className="gap-2.5">
          {scopes.map((option) => (
            <div key={option.id} className="flex items-start gap-2.5">
              <RadioGroupItem value={option.id} id={`escopo-${option.id}`} className="mt-0.5" />
              <Label htmlFor={`escopo-${option.id}`} className="flex flex-col gap-0.5 font-normal">
                <span className="font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {mode === "edit" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Novo valor (R$)" id="s-valor" hint="Deixe vazio para não mudar.">
              <Input id="s-valor" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Nova descrição" id="s-desc" hint="Deixe vazio para não mudar.">
              <Input id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
        ) : (
          <Field label="Motivo *" id="s-motivo">
            <Input id="s-motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant={mode === "cancel" ? "destructive" : "default"}
            disabled={submitting}
            onClick={submit}
          >
            {mode === "cancel" ? "Cancelar contas" : "Alterar contas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
