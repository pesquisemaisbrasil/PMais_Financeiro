"use client";

import { useState } from "react";
import { Field, FormError } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/lib/use-form-action";

/** Pede o motivo antes de uma ação que fica no histórico (estorno, cancelamento, tirar documento). */
export function ReasonDialog({
  title,
  description,
  confirm,
  destructive,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirm: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const { error, submitting, run } = useFormAction();
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field label="Motivo *" id="rs-motivo">
          <Input id="rs-motivo" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <FormError message={localError ?? error} />
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Voltar
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={submitting}
            onClick={() => {
              if (!reason.trim()) return setLocalError("Diga o motivo.");
              setLocalError(null);
              void run(() => onConfirm(reason.trim()));
            }}
          >
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
