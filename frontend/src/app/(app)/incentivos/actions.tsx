"use client";

import { Download, FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Tag } from "@/components/finance";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, attachDocument, downloadDocument } from "@/lib/api";
import { fileSize, kindLabel, saveBlob } from "@/lib/documents";
import { exportPeople, peopleFileName, receiptProblem, type AgendaRow } from "@/lib/incentives";
import { plural, type PayableDetail } from "@/lib/payables";

/**
 * O que se faz com as pessoas de um lançamento de incentivo: baixar a planilha de controle
 * (com a chave Pix mascarada) e anexar os PDFs de comprovante. Anexar não dá baixa: quem paga
 * e confirma continua sendo o Contas a pagar.
 */
export function IncentiveActions({
  row,
  payable,
  onChanged,
}: {
  row: AgendaRow;
  payable: PayableDetail;
  onChanged: (next: PayableDetail) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const receipts = payable.attachments.filter((attachment) => attachment.kind === "comprovante");

  async function spreadsheet() {
    setProblems([]);
    setBusy("Preparando a planilha…");
    try {
      saveBlob(await exportPeople(row.id), peopleFileName(row));
    } catch (err) {
      setProblems([err instanceof ApiError ? err.message : "Não foi possível baixar a planilha agora"]);
    } finally {
      setBusy(null);
    }
  }

  async function send(files: File[]) {
    setProblems([]);
    const failed: string[] = [];
    let sent = 0;
    let latest: PayableDetail | null = null;
    for (const file of files) {
      const refusal = receiptProblem(file);
      if (refusal) {
        failed.push(refusal);
        continue;
      }
      setBusy(`Enviando ${file.name}…`);
      try {
        latest = await attachDocument(payable.id, file, "comprovante");
        sent += 1;
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof ApiError ? err.message : "não foi possível enviar"}`);
      }
    }
    setBusy(null);
    setProblems(failed);
    if (latest) {
      onChanged(latest);
      toast.success(sent === 1 ? "Comprovante anexado." : `${sent} comprovantes anexados.`);
    }
  }

  async function download(id: number, name: string) {
    setProblems([]);
    setBusy(`Abrindo ${name}…`);
    try {
      saveBlob(await downloadDocument(payable.id, id), name);
    } catch (err) {
      setProblems([`${name}: ${err instanceof ApiError ? err.message : "não foi possível baixar"}`]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void spreadsheet()}>
          <Download size={14} />
          Baixar planilha
        </Button>
        <Input
          ref={input}
          id={`comprovantes-${payable.id}`}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept=".pdf"
          multiple
          disabled={busy !== null}
          aria-label="Escolher os PDFs de comprovante"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = ""; // deixa escolher o mesmo arquivo de novo
            if (files.length) void send(files);
          }}
        />
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => input.current?.click()}>
          <Upload size={14} />
          Enviar PDF de comprovantes
        </Button>
        <span className="text-xs text-muted-foreground">
          A planilha leva a chave Pix mascarada. O comprovante fica anexado ao lançamento; a baixa é feita no Contas a pagar.
        </span>
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

      {receipts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-brand-cinza-escuro">
            {plural(receipts.length, "comprovante anexado", "comprovantes anexados")}
          </span>
          <ul className="flex flex-col gap-1.5">
            {receipts.map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                  <strong className="truncate">{attachment.name}</strong>
                  <Tag color="azul">{kindLabel(attachment.kind)}</Tag>
                  <span className="text-xs text-muted-foreground">{fileSize(attachment.size)}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  aria-label={`Baixar ${attachment.name}`}
                  onClick={() => void download(attachment.id, attachment.name)}
                >
                  <Download size={14} />
                  Baixar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
