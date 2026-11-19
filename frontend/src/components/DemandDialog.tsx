"use client";

import { Send } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/finance";
import { FilePicker } from "@/components/FilePicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DEMAND_ACCEPT, DEMAND_KINDS, demandFileProblem, pastedDemandImage } from "@/lib/access";
import { sendDemand } from "@/lib/api";
import { missingFieldsMessage } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

/**
 * "Abrir demanda" (Bruno, 19/11/2026): qualquer pessoa pede uma mudança no sistema, com tipo, descrição
 * e um anexo obrigatório (print ou PDF). Só o super admin lê, na tela Demandas.
 */
export function DemandDialog({ page, onClose }: { page: string; onClose: () => void }) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const preview = useMemo(() => (file?.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function attach(picked: File | null) {
    if (!picked) return;
    const problem = demandFileProblem(picked);
    setLocalError(problem);
    if (!problem) setFile(picked);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const missing = missingFieldsMessage([
      ["Tipo", kind],
      ["Descrição", description.trim()],
      ["Anexo", file],
    ]);
    if (missing) return setLocalError(missing);
    setLocalError(null);
    await run(async () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("description", description.trim());
      form.set("page", page);
      form.set("file", file!);
      await sendDemand(form);
      toast.success("Demanda enviada. Obrigado!");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]"
        onPaste={(event) => {
          const pasted = pastedDemandImage(event.clipboardData);
          if (!pasted) return;
          event.preventDefault();
          attach(pasted);
        }}
      >
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Abrir demanda</DialogTitle>
            <DialogDescription>
              Conte o que precisa mudar no sistema. A demanda vai para quem cuida do desenvolvimento, junto com o anexo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Field label="Tipo *" id="dm-tipo">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="dm-tipo" className="w-full">
                  <SelectValue placeholder="Escolha o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {DEMAND_KINDS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Descrição *" id="dm-descricao" hint="O que precisa mudar, em qual tela e o que você esperava.">
              <Textarea
                id="dm-descricao"
                rows={5}
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field
              label="Anexo *"
              id="dm-anexo"
              hint="Um print da tela (aperte Windows + Shift + S, recorte e cole aqui com Ctrl + V) ou um PDF, até 10 MB."
            >
              <FilePicker id="dm-anexo" accept={DEMAND_ACCEPT} status={file?.name} onPick={(files) => attach(files[0] ?? null)} />
            </Field>
            {preview && (
              <Image
                src={preview}
                alt="Imagem anexada"
                width={512}
                height={288}
                unoptimized
                className="h-auto max-h-48 w-auto max-w-full rounded-lg border border-border object-contain"
              />
            )}
            <FormError message={localError ?? error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              <Send size={16} />
              {submitting ? "Enviando…" : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
