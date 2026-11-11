"use client";

import { Download, FileText, Pencil, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { SearchSelect as Choice } from "@/components/SearchSelect";
import { Field, FormError, Tag } from "@/components/finance";
import { FilePicker } from "@/components/FilePicker";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api";
import {
  DEFAULT_DOCUMENT_KIND,
  DOCUMENT_ACCEPT,
  DOCUMENT_HINT,
  DOCUMENT_KINDS,
  checkDocument,
  fileSize,
  kindLabel,
  saveBlob,
  type DocumentChange,
} from "@/lib/documents";
import type { Attachment } from "@/lib/payables";
import { useFormAction } from "@/lib/use-form-action";

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** As chamadas da tela dona dos documentos (conta a pagar ou título a receber). `T` é o que ela devolve. */
export interface DocumentsApi<T> {
  attach: (file: File, kind: string) => Promise<T>;
  download: (attachmentId: number) => Promise<Blob>;
  rename: (attachmentId: number, change: DocumentChange) => Promise<T>;
  /** Recarrega o dono: o download fica no histórico, e a aba Histórico precisa mostrar. */
  reload: () => Promise<T>;
}

/**
 * Aba "Documentos": anexar (vários de uma vez, com o tipo), baixar, renomear e tirar.
 * Serve ao Contas a pagar e ao a receber; `from` é o fim de "Tirar nota.pdf da conta" / "do título".
 */
export function DocumentsPanel<T>({
  attachments,
  api,
  from,
  onChanged,
  onRemove,
}: {
  attachments: Attachment[];
  api: DocumentsApi<T>;
  from: string;
  onChanged: (next: T, message?: string) => void;
  onRemove: (attachment: Attachment) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [kind, setKind] = useState<string>(DEFAULT_DOCUMENT_KIND);
  const [renaming, setRenaming] = useState<Attachment | null>(null);

  async function send(files: File[]) {
    setProblems([]);
    const failed: string[] = [];
    let sent = 0;
    let latest: T | null = null;
    for (const file of files) {
      const refusal = checkDocument(file);
      if (refusal) {
        failed.push(refusal);
        continue;
      }
      setBusy(`Enviando ${file.name}…`);
      try {
        latest = await api.attach(file, kind);
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
      saveBlob(await api.download(attachment.id), attachment.name);
      // o download fica no histórico: recarrega para a aba Histórico mostrar
      onChanged(await api.reload());
    } catch (err) {
      setProblems([`${attachment.name}: ${err instanceof ApiError ? err.message : "não foi possível baixar"}`]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid items-start gap-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <Field label="Tipo do documento" id="d-tipo">
          <Choice id="d-tipo" value={kind} onChange={setKind} options={DOCUMENT_KINDS} />
        </Field>
        <Field label="Anexar documentos" id="d-arq" hint={`${DOCUMENT_HINT}. Pode escolher vários de uma vez.`}>
          <FilePicker
            id="d-arq"
            multiple
            accept={DOCUMENT_ACCEPT}
            disabled={busy !== null}
            status={null}
            onPick={(files) => files.length && void send(files)}
          />
        </Field>
      </div>
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
      {attachments.length ? (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-[13px]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <strong className="truncate">{attachment.name}</strong>
                    <Tag color="azul">{kindLabel(attachment.kind)}</Tag>
                  </div>
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
                  aria-label={`Renomear ${attachment.name}`}
                  onClick={() => setRenaming(attachment)}
                >
                  <Pencil size={14} />
                  Renomear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  aria-label={`Tirar ${attachment.name} ${from}`}
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
      {renaming && (
        <RenameDialog
          attachment={renaming}
          rename={(change) => api.rename(renaming.id, change)}
          onClose={() => setRenaming(null)}
          onDone={(next) => {
            setRenaming(null);
            onChanged(next, "Documento atualizado.");
          }}
        />
      )}
    </div>
  );
}

/** Mudar o nome e/ou o tipo. O arquivo guardado não é tocado, e a extensão não muda. */
function RenameDialog<T>({
  attachment,
  rename,
  onClose,
  onDone,
}: {
  attachment: Attachment;
  rename: (change: DocumentChange) => Promise<T>;
  onClose: () => void;
  onDone: (next: T) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [name, setName] = useState(attachment.name);
  const [kind, setKind] = useState(attachment.kind);

  function submit(event: FormEvent) {
    event.preventDefault();
    const change: DocumentChange = {};
    if (name.trim() !== attachment.name) change.name = name.trim();
    if (kind !== attachment.kind) change.kind = kind;
    if (change.name === undefined && change.kind === undefined) return onClose();
    return run(async () => onDone(await rename(change)));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Renomear documento</DialogTitle>
            <DialogDescription>Só o nome e o tipo mudam: o arquivo guardado continua o mesmo.</DialogDescription>
          </DialogHeader>
          <Field label="Nome do documento" id="rn-nome" hint="A extensão do arquivo não muda.">
            <Input id="rn-nome" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Tipo" id="rn-tipo">
            <Choice id="rn-tipo" value={kind} onChange={setKind} options={DOCUMENT_KINDS} />
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
