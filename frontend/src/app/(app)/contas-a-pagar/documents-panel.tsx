"use client";

import { Download, FileText, X } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/finance";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, attachDocument, downloadDocument, getPayable } from "@/lib/api";
import { DOCUMENT_ACCEPT, DOCUMENT_HINT, checkDocument, fileSize, saveBlob } from "@/lib/documents";
import type { Attachment, PayableDetail } from "@/lib/payables";

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Aba "Documentos" da conta: anexar (vários de uma vez), baixar e tirar da conta. */
export function DocumentsPanel({
  payable,
  onChanged,
  onRemove,
}: {
  payable: PayableDetail;
  onChanged: (next: PayableDetail, message?: string) => void;
  onRemove: (attachment: Attachment) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  async function send(files: File[]) {
    setProblems([]);
    const failed: string[] = [];
    let sent = 0;
    let latest: PayableDetail | null = null;
    for (const file of files) {
      const refusal = checkDocument(file);
      if (refusal) {
        failed.push(refusal);
        continue;
      }
      setBusy(`Enviando ${file.name}…`);
      try {
        latest = await attachDocument(payable.id, file);
        sent += 1;
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof ApiError ? err.message : "não foi possível enviar"}`);
      }
    }
    setBusy(null);
    setProblems(failed);
    if (latest) onChanged(latest, sent === 1 ? "Documento anexado." : `${sent} documentos anexados.`);
  }

  async function download(attachment: Attachment) {
    setProblems([]);
    setBusy(`Abrindo ${attachment.name}…`);
    try {
      saveBlob(await downloadDocument(payable.id, attachment.id), attachment.name);
      // o download fica no histórico da conta: recarrega para a aba Histórico mostrar
      onChanged(await getPayable(payable.id));
    } catch (err) {
      setProblems([`${attachment.name}: ${err instanceof ApiError ? err.message : "não foi possível baixar"}`]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Anexar documentos" id="d-arq" hint={`${DOCUMENT_HINT}. Pode escolher vários de uma vez.`}>
        <Input
          id="d-arq"
          type="file"
          multiple
          accept={DOCUMENT_ACCEPT}
          disabled={busy !== null}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = ""; // deixa escolher o mesmo arquivo de novo
            if (files.length) void send(files);
          }}
        />
      </Field>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner aria-label="Aguarde" className="size-4" />
          {busy}
        </p>
      )}
      {problems.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {payable.attachments.length ? (
        <ul className="flex flex-col gap-2">
          {payable.attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-[13px]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <strong className="block truncate">{attachment.name}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {fileSize(attachment.size)} · {attachment.uploadedBy} · {when(attachment.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  aria-label={`Baixar ${attachment.name}`}
                  onClick={() => void download(attachment)}
                >
                  <Download size={14} />
                  Baixar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  aria-label={`Tirar ${attachment.name} da conta`}
                  onClick={() => onRemove(attachment)}
                >
                  <X size={14} />
                  Tirar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhum documento anexado ainda.</p>
      )}
    </div>
  );
}
