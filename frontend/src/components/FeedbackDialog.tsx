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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { sendFeedback } from "@/lib/api";
import { FEEDBACK_TYPES, IMAGE_ACCEPT, imageProblem, pastedImage } from "@/lib/feedback";
import { missingFieldsMessage } from "@/lib/forms";
import { useFormAction } from "@/lib/use-form-action";

/**
 * "Enviar solicitação": correção de bug, correção de regra ou melhoria, com descrição e um print.
 * Vai para o desenvolvimento pela função do Netlify (só na versão de demonstração).
 */
export function FeedbackDialog({ page, sender, onClose }: { page: string; sender: string; onClose: () => void }) {
  const { error, submitting, run } = useFormAction();
  const [localError, setLocalError] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function attach(file: File | null) {
    if (!file) return;
    const problem = imageProblem(file);
    setLocalError(problem);
    if (!problem) setImage(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const missing = missingFieldsMessage([
      ["Tipo", type],
      ["Descrição", description.trim()],
      ["Imagem", image],
    ]);
    if (missing) return setLocalError(missing);
    setLocalError(null);
    await run(async () => {
      const form = new FormData();
      form.set("tipo", type);
      form.set("descricao", description.trim());
      form.set("imagem", image!);
      form.set("pagina", page);
      form.set("quem", sender);
      await sendFeedback(form);
      toast.success("Solicitação enviada. Obrigado!");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]"
        onPaste={(event) => {
          const file = pastedImage(event.clipboardData);
          if (!file) return;
          event.preventDefault();
          attach(file);
        }}
      >
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Enviar solicitação</DialogTitle>
            <DialogDescription>
              Conte o que precisa mudar no sistema. A solicitação vai para o desenvolvimento junto com a imagem. Use só
              dados de exemplo no print.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <span id="fb-tipo" className="text-[13px] font-semibold">
                Tipo <span className="text-[#b91c1c]">*</span>
              </span>
              <RadioGroup value={type} onValueChange={setType} aria-labelledby="fb-tipo" className="gap-2">
                {FEEDBACK_TYPES.map((option) => (
                  <div key={option.id} className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5">
                    <RadioGroupItem value={option.id} id={`fb-${option.id}`} className="mt-0.5" />
                    <Label htmlFor={`fb-${option.id}`} className="flex flex-col items-start gap-0.5 font-normal">
                      <span className="font-semibold">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.hint}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <Field label="Descrição *" id="fb-descricao" hint="O que aconteceu, em qual tela e o que você esperava.">
              <Textarea
                id="fb-descricao"
                rows={5}
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field
              label="Imagem *"
              id="fb-imagem"
              hint="Um print da tela: aperte Windows + Shift + S, recorte e cole aqui com Ctrl + V. Ou escolha o arquivo (PNG, JPG, WEBP ou GIF, até 4 MB)."
            >
              <FilePicker
                id="fb-imagem"
                accept={IMAGE_ACCEPT}
                status={image?.name}
                onPick={(files) => attach(files[0] ?? null)}
              />
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
